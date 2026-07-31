/**
 * ============================================================================
 * Decision Engine — Constraint Schema
 * ============================================================================
 * الصيغة الموحّدة الإلزامية لأي قيد يخرج من أي Engine قيدي (Medical, Allergy,
 * Religious, Diet). كل الـEngines دي تُنتج مصفوفة من نفس شكل الكائن هنا،
 * ولا تُطبَّق نتيجتها مباشرة على الطعام — تُغذَّى فقط لـ Decision Engine.
 *
 * هذا هو المبدأ المعماري الأهم في المشروع (راجع مستند الرؤية، قسم 1):
 * "لا Engine يُطبَّق نتيجته مباشرة على الطعام بمعزل عن الباقي".
 * ============================================================================
 */

'use strict';

/** أنواع القيود المدعومة */
export const CONSTRAINT_KIND = Object.freeze({
  EXCLUDE_MEDICAL_CONDITION: 'exclude_medical_condition', // food.unsuitable_for_conditions يحتوي القيمة
  EXCLUDE_ALLERGEN: 'exclude_allergen',                   // food.allergens يحتوي القيمة
  REQUIRE_DIET_COMPATIBLE: 'require_diet_compatible',     // food.unsuitable_for_diets يجب ألا يحتوي القيمة
  REQUIRE_RELIGIOUS_TAG: 'require_religious_tag',         // food.religious_tags يجب أن يحتوي القيمة
  NUTRIENT_MAX: 'nutrient_max',                           // قيمة العنصر الغذائي <= limit_value
  NUTRIENT_MIN: 'nutrient_min',                           // قيمة العنصر الغذائي >= limit_value
});

/** المصادر الأربعة المسموحة لأي قيد */
export const CONSTRAINT_SOURCE = Object.freeze({
  MEDICAL: 'medical',
  ALLERGY: 'allergy',
  RELIGIOUS: 'religious',
  DIET: 'diet',
});

/**
 * @typedef {Object} Constraint
 * @property {string} id             - معرّف فريد (مثال: "medical:ckd:exclude", "medical:ckd:sodium_max")
 * @property {string} source         - أحد قيم CONSTRAINT_SOURCE
 * @property {string} source_detail  - القيمة الأصلية اللي ولّدت القيد (مثال: "ckd", "gluten", "keto")
 * @property {string} kind           - أحد قيم CONSTRAINT_KIND
 * @property {string} [nutrient_path]   - مطلوب فقط لـ NUTRIENT_MAX/NUTRIENT_MIN (مثال: "micros.sodium_mg")
 * @property {number} [limit_value]     - مطلوب فقط لـ NUTRIENT_MAX/NUTRIENT_MIN
 * @property {string} [severity]        - للحساسيات فقط: mild/moderate/severe
 * @property {string} message_ar        - نص تشخيصي بشري يُستخدم عند فشل التوليد
 */

let _autoCounter = 0;

/**
 * يبني كائن قيد صالح بالصيغة الموحّدة. كل الـEngines القيدية تستخدم هذه
 * الدالة فقط لبناء قيودها — بدل كتابة الكائن يدويًا في كل مكان — لضمان
 * عدم انحراف الشكل بين Engine وآخر بمرور الوقت.
 * @param {Partial<Constraint>} fields
 * @returns {Constraint}
 */
export function createConstraint(fields) {
  if (!fields || !fields.source || !fields.source_detail || !fields.kind || !fields.message_ar) {
    throw new Error('createConstraint: source, source_detail, kind, message_ar كلها إلزامية');
  }
  if (!Object.values(CONSTRAINT_SOURCE).includes(fields.source)) {
    throw new Error(`createConstraint: source غير معروف: ${fields.source}`);
  }
  if (!Object.values(CONSTRAINT_KIND).includes(fields.kind)) {
    throw new Error(`createConstraint: kind غير معروف: ${fields.kind}`);
  }
  const needsNutrient = fields.kind === CONSTRAINT_KIND.NUTRIENT_MAX || fields.kind === CONSTRAINT_KIND.NUTRIENT_MIN;
  if (needsNutrient && (!fields.nutrient_path || typeof fields.limit_value !== 'number')) {
    throw new Error(`createConstraint: القيد من نوع ${fields.kind} يتطلب nutrient_path و limit_value`);
  }
  // BUG-S24-02: كل القيم الغذائية الحقيقية في Food Library >= 0 (لا يوجد
  // "سالب جرام/ملجم" فعليًا). limit_value سالب لقيد NUTRIENT_MAX/MIN غير
  // منطقي بالتعريف — كان يمر بصمت (ولـNUTRIENT_MAX تحديدًا يستبعد كل
  // المكتبة بصمت لأي صنف له قيمة رقمية معرَّفة، فيفشل توليد الوجبات بلا
  // رسالة واضحة عن سبب الفشل الحقيقي: خطأ إعداد وليس نقص أصناف). صفر منطقي
  // وصالح (مثلًا "يجب ألا يحتوي إضافة سكر إطلاقًا")، فلا يُرفَض.
  if (needsNutrient && fields.limit_value < 0) {
    throw new Error(`createConstraint: limit_value لا يمكن أن يكون سالبًا لقيد ${fields.kind} (القيمة: ${fields.limit_value})`);
  }

  _autoCounter += 1;
  return {
    id: fields.id ?? `${fields.source}:${fields.source_detail}:${fields.kind}:${_autoCounter}`,
    source: fields.source,
    source_detail: fields.source_detail,
    kind: fields.kind,
    nutrient_path: fields.nutrient_path ?? null,
    limit_value: fields.limit_value ?? null,
    severity: fields.severity ?? null,
    message_ar: fields.message_ar,
  };
}

/** يقرأ قيمة متداخلة من الصنف بمسار نصي مثل "micros.sodium_mg" */
export function readNutrientValue(food, path) {
  const parts = path.split('.');
  let value = food;
  for (const p of parts) {
    if (value == null) return undefined;
    value = value[p];
  }
  return value;
}
