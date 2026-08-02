/**
 * ============================================================================
 * Cuisine Engine — تفضيل المطبخ
 * ============================================================================
 * بند مطلوب صراحة من المستخدم بعد مراجعة فعلية: الأصناف المولَّدة فيها
 * أصناف "غريبة" مش بتاعة الأكل المصري (رغم إن أغلب المكتبة أصلًا مُوسَّمة
 * `cuisine: "egyptian"` — لكن الوسم نفسه ما كانش مستخدَم في أي فلترة فعلية
 * قبل كده). الملف ده بيحوّل تفضيل المطبخ لقيد حقيقي في Decision Engine.
 *
 * ملاحظة دقة مهمة (لازم تتعرض للمستخدم): وسم `cuisine` جزء من دمج قاعدة
 * البيانات الأصلي (راجع docs/FOOD_DB_CONVERSION_REPORT.md) — أغلبيته
 * "egyptian" فعلًا (2993 من 3055)، لكن مفيش ضمان 100% إن كل صنف موسوم
 * "egyptian" هو فعلًا صنف تقليدي مصري شائع (بعض الأصناف الخام العامة
 * اتوسّمت "egyptian" افتراضيًا وقت الدمج). الفلترة هنا بتعتمد على الوسم
 * الموجود فعليًا في البيانات — مش تدقيق يدوي لكل صنف من الأساس.
 * ============================================================================
 */

'use strict';

import { createConstraint, CONSTRAINT_KIND, CONSTRAINT_SOURCE } from './constraint-schema.js';

/** قيم تفضيل المطبخ المدعومة */
export const CUISINE_PREFERENCE = Object.freeze({
  EGYPTIAN_ONLY: 'egyptian_only',           // مصري بس (الافتراضي — الطلب الصريح)
  EGYPTIAN_AND_LEVANTINE: 'egyptian_and_levantine', // + شامي (حمص/زعتر/طرشي.. منتشرين بكتير في مصر كمان)
  ALL: 'all',                               // بدون أي قيد مطبخ (السلوك القديم قبل هذا البند)
});

const ALLOWED_CUISINES_BY_PREFERENCE = {
  [CUISINE_PREFERENCE.EGYPTIAN_ONLY]: ['egyptian'],
  [CUISINE_PREFERENCE.EGYPTIAN_AND_LEVANTINE]: ['egyptian', 'levantine'],
  [CUISINE_PREFERENCE.ALL]: null, // null = بدون قيد
};

const PREFERENCE_LABEL_AR = {
  [CUISINE_PREFERENCE.EGYPTIAN_ONLY]: 'المطبخ المصري فقط',
  [CUISINE_PREFERENCE.EGYPTIAN_AND_LEVANTINE]: 'المطبخ المصري + الشامي',
  [CUISINE_PREFERENCE.ALL]: 'كل المطابخ',
};

/**
 * @param {string|null} cuisinePreference - أحد قيم CUISINE_PREFERENCE. لو مفقود
 *   (null/undefined)، الافتراضي هنا "بدون قيد" (نفس فلسفة `buildDietConstraints`
 *   مع نمط "عادي" — الـEngine نفسه مايفرضش قرار منتج). قرار "مصري فقط
 *   افتراضيًا للمستخدم الجديد" مطبَّق في طبقة الواجهة (`ui/app.js` وقيمة
 *   `<select>` المختارة افتراضيًا)، مش هنا، حتى تفضل استدعاءات الـEngine
 *   المباشرة (اختبارات، استخدام مستقبلي بره الواجهة) بسلوكها الأصلي بدون
 *   قيد ضمني غير متوقَّع.
 * @returns {import('./constraint-schema.js').Constraint[]}
 */
export function buildCuisineConstraints(cuisinePreference) {
  const effective = cuisinePreference ?? CUISINE_PREFERENCE.ALL;
  const allowedValues = ALLOWED_CUISINES_BY_PREFERENCE[effective] ?? null;

  if (allowedValues === null) return []; // "كل المطابخ" (أو قيمة غير معروفة) — بدون قيد

  return [
    createConstraint({
      source: CONSTRAINT_SOURCE.CUISINE,
      source_detail: effective,
      kind: CONSTRAINT_KIND.REQUIRE_CUISINE,
      allowed_values: allowedValues,
      message_ar: `أصناف خارج نطاق "${PREFERENCE_LABEL_AR[effective] ?? effective}"`,
    }),
  ];
}
