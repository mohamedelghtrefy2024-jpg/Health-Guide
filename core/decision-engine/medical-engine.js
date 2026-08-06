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
  // S68: أول شبكة أمان رقمية حقيقية لـheart_disease — كانت من ضمن الـ8 حالات
  // اللي مفيش صنف واحد موسوم بيها عبر المكتبة كلها (راجع S67). القيم هنا
  // مبنية على إرشادات AHA لمرضى القلب: دهون مشبعة <6% من السعرات، صوديوم
  // ≤1500-2000mg/يوم، كوليسترول غذائي ≤200-300mg/يوم (الإرشادية الأقدم، لسه
  // مستخدمة سريريًا في كتير من البروتوكولات رغم تخفيف تركيز إرشادية 2013
  // عليها). مقسّمة تقريبيًا على ~4 حصص/يوم زي نفس منطق hypertension/CKD فوق.
  // ملحوظة: ده مكمّل رقمي عام، مش بديل عن مراجعة إكلينيكية لكل حالة فردية.
  [MEDICAL_CONDITION.HEART_DISEASE]: [
    { nutrient_path: 'macros.saturated_fat_g', limit_value: 5, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الدهون المشبعة لكل حصة لمرضى القلب (5g)' },
    { nutrient_path: 'micros.sodium_mg', limit_value: 500, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الصوديوم لكل حصة لمرضى القلب (500mg)' },
    { nutrient_path: 'macros.cholesterol_mg', limit_value: 60, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الكوليسترول الغذائي لكل حصة لمرضى القلب (60mg، مبني على حد يومي ~200-250mg)' },
  ],
  // S68: pcos — التوجيه الإكلينيكي الأساسي هو نظام منخفض المؤشر/الحمل
  // الجلايسيمي وتقليل السكريات المضافة (مقاومة الأنسولين هي محور المتلازمة).
  // نستخدم حقل `gi` الموجود فعليًا بالمكتبة (Glycemic Index)، مع تجاهل آمن
  // للأصناف اللي gi=-1 (لا ينطبق، زي اللحوم/الدهون الخالية من الكارب) لأن
  // readNutrientValue بيرجّع -1 وهي تلقائيًا ≤ أي حد فتُقبل بلا استبعاد خاطئ.
  [MEDICAL_CONDITION.PCOS]: [
    { nutrient_path: 'gi', limit_value: 55, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد المؤشر الجلايسيمي لكل صنف لمرضى تكيّس المبايض (GI ≤ 55)' },
    { nutrient_path: 'macros.added_sugar_g', limit_value: 5, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد السكريات المضافة لكل حصة لمرضى تكيّس المبايض (5g)' },
  ],
  // S68: gerd — أهم المحفّزات الموثَّقة سريريًا (كافيين، غازات، حمضيات،
  // نعناع، توابل حريفة) مش متتبَّعة كحقول رقمية بالمخطط الحالي، فمفيش طريقة
  // دقيقة لاستنتاجها هنا. الدهون العالية محفّز موثَّق كمان (بتأخّر إفراغ
  // المعدة وترخي العضلة العاصرة السفلى للمريء) وهي الحقل الوحيد المتاح فعليًا
  // كبروكسي جزئي — لذلك القيد ده أضعف من باقي القيود (تغطية جزئية بس، مش
  // بديل عن مراجعة/توسيم مبني على المكوّنات في جلسة مخصّصة).
  [MEDICAL_CONDITION.GERD]: [
    { nutrient_path: 'macros.fat_g', limit_value: 20, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الدهون الكلية لكل حصة لمرضى ارتجاع المريء (20g — تغطية جزئية، محفّزات تانية زي الكافيين والحمضيات مش متتبَّعة بعد)' },
  ],
  // S68: osteoporosis — الصوديوم الزائد بيرفع إفراز الكالسيوم بالبول، وهو
  // أوضح محفّز رقمي متاح فعليًا بالمخطط الحالي (الكافيين محفّز موثَّق كمان
  // لكن غير متتبَّع). حد أخف من hypertension/heart_disease عمدًا لأنه محفّز
  // ثانوي (تسريع فقدان الكالسيوم) مش خطر مباشر زي ضغط الدم/القلب.
  [MEDICAL_CONDITION.OSTEOPOROSIS]: [
    { nutrient_path: 'micros.sodium_mg', limit_value: 700, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الصوديوم لكل حصة لمرضى هشاشة العظام (700mg — تغطية جزئية عبر تقليل فقدان الكالسيوم)' },
  ],
  // S69: liver_disease — المشكلة الموثَّقة في S68 كانت تحديدًا حول البروتين
  // (يتناقض حسب المرحلة: دهون كبد بسيطة محتاجة بروتين كافي، تليّف متقدّم
  // تاريخيًا كان بيتقيّد فيه البروتين، لكن إرشادات الكبد الحديثة (AASLD/EASL)
  // فعليًا بطّلت توصي بتقييد البروتين حتى مع اعتلال دماغي كبدي — فالتناقض
  // الحقيقي أضعف مما كان متصوَّر). فبدل تأجيل الحالة كلها، ده حل جزئي آمن:
  // قيدين ما بيمسّوش البروتين خالص وموافقين عليهم بغض النظر عن المرحلة —
  // صوديوم (أساسي لإدارة الاستسقاء بمرحلة متقدّمة، وتقليله عمومًا غير ضار
  // لمرحلة مبكّرة) وسكريات مضافة/دهون مشبعة (توصية NAFLD قياسية لدهون الكبد
  // المبكّرة، وغير ضارة لمرحلة متقدّمة برضه). البروتين نفسه اتسيب تمامًا —
  // عمدًا، لحين قرار منتج بتقسيم الحالة لمراحل فرعية (زي CKD/CKD_DIALYSIS).
  [MEDICAL_CONDITION.LIVER_DISEASE]: [
    { nutrient_path: 'micros.sodium_mg', limit_value: 500, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الصوديوم لكل حصة لمرضى الكبد (500mg — إدارة الاستسقاء بمراحل متقدّمة)' },
    { nutrient_path: 'macros.added_sugar_g', limit_value: 5, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد السكريات المضافة لكل حصة لمرضى الكبد (5g — توصية NAFLD قياسية)' },
    { nutrient_path: 'macros.saturated_fat_g', limit_value: 5, kind: CONSTRAINT_KIND.NUTRIENT_MAX, message_ar: 'حد الدهون المشبعة لكل حصة لمرضى الكبد (5g)' },
  ],
  // hypothyroidism, anemia: لسه مؤجّلة (نفس تحليل S68، لسه صحيح).
  // hypothyroidism: المحفّز الأساسي (خضروات صليبية نيّة بكمية كبيرة، صويا)
  // مش حقل رقمي بالمخطط (لا macro ولا micro يعبّر عنه) — يحتاج توسيم فئة/
  // مكوّنات صريح، مش قيد رقمي.
  // anemia: عكس باقي الحالات — التوصية هنا "زوّد" (حديد) مش "استبعد"، فمش
  // مناسب لنموذج EXCLUDE_MEDICAL_CONDITION/NUTRIENT_MAX أصلًا، والمنطقي
  // إنها تتحل عبر Recommendation Engine الموجود مش Decision Engine.
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
