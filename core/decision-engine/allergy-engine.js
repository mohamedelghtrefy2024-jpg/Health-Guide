/**
 * ============================================================================
 * Allergy Engine
 * ============================================================================
 * يحوّل قائمة الحساسيات المختارة (بدرجة شدة) إلى قيود استبعاد صارمة.
 * في هذا الإصدار: كل درجة شدة (خفيفة/متوسطة/شديدة) تُنتج استبعادًا كاملًا
 * للمسبب — لا يوجد "سماح جزئي" لأن مكتبة الطعام الحالية لا تحمل بيانات
 * كمية الأثر التحسسي (trace amounts) لكل صنف. الشدة تُحفَظ في القيد نفسه
 * فقط لأغراض العرض/الرسائل، وتصبح قابلة للاستخدام لاحقًا إذا أُضيفت بيانات
 * "نسبة احتمال تلوث تقاطعي" للأصناف.
 * ============================================================================
 */

'use strict';

import { createConstraint, CONSTRAINT_KIND, CONSTRAINT_SOURCE } from './constraint-schema.js';

export const ALLERGEN_LABEL_AR = {
  gluten: 'الجلوتين',
  lactose: 'اللاكتوز',
  nuts: 'المكسرات',
  shellfish: 'المحار/القشريات',
  egg: 'البيض',
  soy: 'الصويا',
  fish: 'السمك',
  sesame: 'السمسم',
};

/**
 * @param {Array<{allergen: string, severity: string}>} allergies
 * @returns {import('./constraint-schema.js').Constraint[]}
 */
export function buildAllergyConstraints(allergies = []) {
  return allergies.map(({ allergen, severity }) => {
    const label = ALLERGEN_LABEL_AR[allergen] ?? allergen;
    return createConstraint({
      source: CONSTRAINT_SOURCE.ALLERGY,
      source_detail: allergen,
      kind: CONSTRAINT_KIND.EXCLUDE_ALLERGEN,
      severity,
      message_ar: `أصناف تحتوي "${label}" (حساسية بدرجة: ${severity})`,
    });
  });
}
