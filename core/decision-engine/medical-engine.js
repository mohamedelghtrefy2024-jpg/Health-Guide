/**
 * ============================================================================
 * Medical (Disease) Engine
 * ============================================================================
 * يحوّل قائمة الحالات المرضية المختارة في البروفايل إلى قيود بالصيغة
 * الموحّدة. كل حالة تُنتج على الأقل قيد استبعاد عام (يعتمد على تصنيف
 * كل صنف في Food Library عبر `unsuitable_for_conditions`)، وبعض الحالات
 * الحرجة (كلى، ضغط) تُضيف قيود دقيقة إضافية على مستوى العناصر الغذائية
 * (صوديوم، بوتاسيوم) بدل الاعتماد فقط على تصنيف الصنف الثنائي.
 *
 * عند اختيار أكثر من مرض، الدالة الرئيسية تُنتج قائمة قيود مجمّعة من كل
 * الأمراض معًا — التقاطع الفعلي بينها مسؤولية Decision Engine، وليس هنا.
 * ============================================================================
 */

'use strict';

import { createConstraint, CONSTRAINT_KIND, CONSTRAINT_SOURCE } from './constraint-schema.js';
import { MEDICAL_CONDITION } from '../food-library/schema.js';

/**
 * قواعد إضافية دقيقة على مستوى العناصر الغذائية لبعض الحالات الحرجة.
 * ليست كل الحالات محتاجة قواعد إضافية — الحالات غير المذكورة هنا تعتمد
 * فقط على تصنيف `unsuitable_for_conditions` في الصنف نفسه.
 */
const EXTRA_NUTRIENT_RULES = {
  [MEDICAL_CONDITION.CKD]: [
    { nutrient_path: 'micros.sodium_mg', limit_value: 400, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الصوديوم لكل حصة لمرضى الكلى (400mg)' },
    { nutrient_path: 'micros.potassium_mg', limit_value: 300, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد البوتاسيوم لكل حصة لمرضى الكلى (300mg)' },
    // KDOQI: يُقيَّد الفوسفور الغذائي إلى 800-1000mg/يوم لمرضى الكلى مرحلة 3-5
    // مع ارتفاع الفوسفور بالدم. مقسّمة تقريبيًا على ~5-6 حصص يوميًا (نفس منطق
    // تقسيم حد الصوديوم/البوتاسيوم أعلاه) → ~150-180mg/حصة. القيمة هنا تقديرية
    // وليست رقمًا حرفيًا من الإرشادية (التي تحدد حدًا يوميًا لا حدًا لكل حصة) —
    // مراجعة اختصاصي تغذية كلوية موصى بها قبل الاعتماد الطبي الكامل.
    { nutrient_path: 'micros.phosphorus_mg', limit_value: 180, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الفوسفور التقديري لكل حصة لمرضى الكلى (~180mg، مبني على حد يومي KDOQI 800-1000mg)' },
  ],
  [MEDICAL_CONDITION.CKD_DIALYSIS]: [
    { nutrient_path: 'micros.sodium_mg', limit_value: 350, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الصوديوم لكل حصة لمرضى الغسيل الكلوي (350mg)' },
    { nutrient_path: 'micros.potassium_mg', limit_value: 250, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد البوتاسيوم لكل حصة لمرضى الغسيل الكلوي (250mg)' },
    // نفس حد KDOQI اليومي (800-1000mg) لكن أشد قليلًا هنا لأن فعالية مثبّطات
    // الفوسفور (binders) تقل بوضوح فوق 1000mg/يوم، وفوسفور الإضافات الصناعية
    // في الأطعمة المصنّعة غالبًا غير موسوم/مُقاس بدقة في هذا المصدر.
    { nutrient_path: 'micros.phosphorus_mg', limit_value: 150, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الفوسفور التقديري لكل حصة لمرضى الغسيل الكلوي (~150mg، مبني على حد يومي KDOQI 800-1000mg)' },
  ],
  [MEDICAL_CONDITION.HYPERTENSION]: [
    { nutrient_path: 'micros.sodium_mg', limit_value: 500, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الصوديوم لكل حصة لمرضى ضغط الدم (500mg)' },
  ],
  [MEDICAL_CONDITION.DYSLIPIDEMIA]: [
    { nutrient_path: 'macros.saturated_fat_g', limit_value: 5, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الدهون المشبعة لكل حصة لمرضى ارتفاع الدهون (5g)' },
  ],
};

/** نصوص عرض عربية لكل حالة (تُستخدم في رسائل التشخيص والواجهة) */
export const CONDITION_LABEL_AR = {
  [MEDICAL_CONDITION.DIABETES_T1]: 'السكري النوع الأول',
  [MEDICAL_CONDITION.DIABETES_T2]: 'السكري النوع الثاني',
  [MEDICAL_CONDITION.HYPERTENSION]: 'ضغط الدم المرتفع',
  [MEDICAL_CONDITION.CKD]: 'أمراض الكلى المزمنة',
  [MEDICAL_CONDITION.CKD_DIALYSIS]: 'الغسيل الكلوي',
  [MEDICAL_CONDITION.LIVER_DISEASE]: 'أمراض الكبد',
  [MEDICAL_CONDITION.GOUT]: 'النقرس',
  [MEDICAL_CONDITION.CELIAC]: 'حساسية القمح (السيلياك)',
  [MEDICAL_CONDITION.IBS_FODMAP]: 'القولون العصبي',
  [MEDICAL_CONDITION.GERD]: 'ارتجاع المريء',
  [MEDICAL_CONDITION.DYSLIPIDEMIA]: 'ارتفاع الدهون بالدم',
  [MEDICAL_CONDITION.HEART_DISEASE]: 'أمراض القلب',
  [MEDICAL_CONDITION.PCOS]: 'تكيس المبايض',
  [MEDICAL_CONDITION.HYPOTHYROIDISM]: 'قصور الغدة الدرقية',
  [MEDICAL_CONDITION.ANEMIA]: 'الأنيميا',
  [MEDICAL_CONDITION.OSTEOPOROSIS]: 'هشاشة العظام',
};

/**
 * يبني قائمة القيود الكاملة من كل الحالات المرضية المختارة.
 * @param {string[]} conditions - قيم من MEDICAL_CONDITION
 * @returns {import('./constraint-schema.js').Constraint[]}
 */
export function buildMedicalConstraints(conditions = []) {
  const constraints = [];

  for (const condition of conditions) {
    const label = CONDITION_LABEL_AR[condition] ?? condition;

    // 1) قيد الاستبعاد العام المعتمد على تصنيف الصنف نفسه
    constraints.push(
      createConstraint({
        source: CONSTRAINT_SOURCE.MEDICAL,
        source_detail: condition,
        kind: CONSTRAINT_KIND.EXCLUDE_MEDICAL_CONDITION,
        message_ar: `أصناف مصنَّفة غير مناسبة لحالة "${label}"`,
      })
    );

    // 2) القواعد الدقيقة الإضافية إن وُجدت لهذه الحالة تحديدًا
    const extraRules = EXTRA_NUTRIENT_RULES[condition] ?? [];
    for (const rule of extraRules) {
      constraints.push(
        createConstraint({
          source: CONSTRAINT_SOURCE.MEDICAL,
          source_detail: condition,
          kind: rule.kind,
          nutrient_path: rule.nutrient_path,
          limit_value: rule.limit_value,
          message_ar: `${rule.message_ar} — بسبب حالة "${label}"`,
        })
      );
    }
  }

  return constraints;
}
