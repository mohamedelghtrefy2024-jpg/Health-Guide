/**
 * ============================================================================
 * Decision Engine — Core
 * ============================================================================
 * النقطة المركزية الوحيدة المسموح لها باتخاذ القرار النهائي بشأن أي صنف
 * طعام. تجمع القيود من الأربع Engines الفرعية (Medical, Allergy, Religious,
 * Diet)، تُطبّقها كلها على Food Library في نفس الوقت (تقاطع حقيقي، لا
 * تطبيق تسلسلي معزول يُخفي مصدر المشكلة)، وتُرجع:
 *   1) الأصناف الناجية فعليًا من كل القيود مجتمعة
 *   2) سجل استبعاد كامل: كل صنف مرفوض + كل القيود اللي رفضته
 *   3) عند عدم كفاية النتائج: تشخيص دقيق لأكثر القيود مسؤولية عن الرفض
 *      (وليس مجرد "لا توجد نتائج" — هذا بالتحديد ما كان ناقصًا سابقًا
 *      وسبَّب مشكلة التعارضات في المشروع القديم، حسب مستند الرؤية).
 * ============================================================================
 */

'use strict';

import { getAllFoods } from '../food-library/food-library.js';
import { CONSTRAINT_KIND, readNutrientValue } from './constraint-schema.js';
import { buildMedicalConstraints } from './medical-engine.js';
import { buildAllergyConstraints } from './allergy-engine.js';
import { buildReligiousConstraints } from './religious-engine.js';
import { buildDietConstraints, resolveEffectiveDietStyle } from './diet-engine.js';
import { buildCuisineConstraints } from './cuisine-engine.js';

// -----------------------------------------------------------------------
// تجميع القيود من كل Engine فرعي
// -----------------------------------------------------------------------

/**
 * @typedef {Object} ConstraintProfile
 * @property {string[]} [medicalConditions]
 * @property {Array<{allergen: string, severity: string}>} [allergies]
 * @property {string|null} [fastingTag]
 * @property {string} [dietStyle]
 * @property {string} [pregnancyStatus] - 'none'|'pregnant'|'breastfeeding'
 * @property {string|null} [cuisinePreference] - أحد قيم CUISINE_PREFERENCE (افتراضي: مصري فقط)
 */

/**
 * يجمع كل القيود من كل الـEngines الفرعية في مصفوفة واحدة مسطّحة.
 * هذه هي نقطة الدخول الوحيدة المفترض أن يستخدمها أي كود خارجي لجمع القيود
 * — لا يُسمح باستدعاء الـEngines الفرعية مباشرة من خارج هذا الملف.
 *
 * قيد أمان إلزامي: لو المستخدمة حامل/مرضعة ونمط الحمية المختار عالي
 * الخطورة (كيتو/صيام متقطع)، يُستبدل تلقائيًا بالنمط العادي عبر
 * `resolveEffectiveDietStyle()` قبل بناء قيود التوافق — غير قابل للتجاوز
 * بغض النظر عن اختيار المستخدمة (بند 1.1 من برومبت استكمال البنود الناقصة).
 * @param {ConstraintProfile} profile
 * @returns {import('./constraint-schema.js').Constraint[]}
 */
export function collectConstraints(profile = {}) {
  const effectiveDiet = resolveEffectiveDietStyle(profile.dietStyle ?? null, profile.pregnancyStatus ?? 'none');
  return [
    ...buildMedicalConstraints(profile.medicalConditions ?? []),
    ...buildAllergyConstraints(profile.allergies ?? []),
    ...buildReligiousConstraints(profile.fastingTag ?? null),
    ...buildDietConstraints(effectiveDiet.dietStyle),
    ...buildCuisineConstraints(profile.cuisinePreference ?? null),
  ];
}

// -----------------------------------------------------------------------
// تقييم صنف واحد ضد قيد واحد
// -----------------------------------------------------------------------

/**
 * يُرجع true إن كان الصنف "ناجيًا" من هذا القيد (أي مسموح)، false إن استُبعد.
 * @param {import('../food-library/schema.js').FoodItem} food
 * @param {import('./constraint-schema.js').Constraint} constraint
 */
export function evaluateFoodAgainstConstraint(food, constraint) {
  switch (constraint.kind) {
    case CONSTRAINT_KIND.EXCLUDE_MEDICAL_CONDITION:
      return !food.unsuitable_for_conditions.includes(constraint.source_detail);

    case CONSTRAINT_KIND.EXCLUDE_ALLERGEN:
      return !food.allergens.includes(constraint.source_detail);

    case CONSTRAINT_KIND.REQUIRE_DIET_COMPATIBLE:
      return !food.unsuitable_for_diets.includes(constraint.source_detail);

    case CONSTRAINT_KIND.REQUIRE_RELIGIOUS_TAG:
      return food.religious_tags.includes(constraint.source_detail);

    case CONSTRAINT_KIND.REQUIRE_CUISINE:
      return constraint.allowed_values.includes(food.cuisine);

    case CONSTRAINT_KIND.NUTRIENT_MAX: {
      // ملاحظة تدقيق S24: فُحص احتمال اعتبار nutrient_path=undefined "خطأ
      // برمجي يجب أن يُرمى" (مسارات مكتوبة غلط تمر بصمت)، لكن اختبار
      // LIMIT-07 القائم (Food Library) يثبت إن ده استخدام مقصود فعلي:
      // أصناف لسه ما اتحولتش من المصدر (مثال: phosphorus_mg قبل إعادة
      // التحويل) بتفتقد الحقل عمدًا، والسلوك الآمن الموثَّق هو "لا تُستبعد
      // بالخطأ" — مفيش طريقة موثوقة وقت التشغيل للتفريق بين "مسار غلط
      // فعلًا" و"حقل لسه غير مُهاجَر" بنفس الشكل (undefined في الحالتين)،
      // فالتغيير هنا كان سيكسر عقد سلوك موجود ومُختبَر مسبقًا. تُرك كما هو.
      const value = readNutrientValue(food, constraint.nutrient_path);
      return typeof value === 'number' ? value <= constraint.limit_value : true;
    }

    case CONSTRAINT_KIND.NUTRIENT_MIN: {
      const value = readNutrientValue(food, constraint.nutrient_path);
      return typeof value === 'number' ? value >= constraint.limit_value : true;
    }

    default:
      // قيد غير معروف: لا نستبعد بصمت — هذا خطأ برمجي يجب أن يظهر بوضوح
      throw new Error(`evaluateFoodAgainstConstraint: نوع قيد غير مدعوم: ${constraint.kind}`);
  }
}

// -----------------------------------------------------------------------
// تطبيق كل القيود دفعة واحدة (التقاطع الفعلي)
// -----------------------------------------------------------------------

/**
 * @typedef {Object} ConstraintApplicationResult
 * @property {import('../food-library/schema.js').FoodItem[]} survivors
 * @property {Map<string, import('./constraint-schema.js').Constraint[]>} exclusionLog - foodId -> القيود اللي رفضته
 * @property {import('./constraint-schema.js').Constraint[]} constraintsApplied
 */

/**
 * يطبّق كل القيود على قائمة أصناف، ويُرجع الناجين + سجل استبعاد كامل لكل
 * صنف مرفوض (بكل القيود اللي رفضته، مش أول قيد بس — مهم للتشخيص الدقيق).
 * @param {import('../food-library/schema.js').FoodItem[]} foods
 * @param {import('./constraint-schema.js').Constraint[]} constraints
 * @returns {ConstraintApplicationResult}
 */
export function applyConstraints(foods, constraints) {
  const survivors = [];
  const exclusionLog = new Map();

  for (const food of foods) {
    const failedConstraints = constraints.filter((c) => !evaluateFoodAgainstConstraint(food, c));
    if (failedConstraints.length === 0) {
      survivors.push(food);
    } else {
      exclusionLog.set(food.id, failedConstraints);
    }
  }

  return { survivors, exclusionLog, constraintsApplied: constraints };
}

// -----------------------------------------------------------------------
// التشخيص عند نتيجة غير كافية
// -----------------------------------------------------------------------

/**
 * @typedef {Object} ConstraintDiagnosis
 * @property {string} constraintId
 * @property {string} message_ar
 * @property {number} soloExcludedCount     - كم صنف استبعده هذا القيد بمفرده (لو كان القيد الوحيد المطبَّق)
 * @property {number} rescueIfRemovedCount  - كم صنف إضافي كان سينجو لو أُزيل هذا القيد فقط (وباقي القيود ثابتة)
 */

/**
 * يُستدعى فقط لما تكون نتيجة `applyConstraints` غير كافية (فارغة أو أقل من
 * حد أدنى مطلوب). يحسب "الأثر الهامشي" لكل قيد على حدة: لو أزلنا القيد ده
 * بس (وسبنا الباقي)، كام صنف كان هيرجع يبقى متاح؟ القيود الأعلى في
 * rescueIfRemovedCount هي الأكثر مسؤولية عن فشل التوليد، وترتيبها تنازليًا
 * هو أساس رسالة التشخيص للمستخدم (بدل "لا توجد نتائج" العامة).
 *
 * @param {import('../food-library/schema.js').FoodItem[]} allFoods
 * @param {import('./constraint-schema.js').Constraint[]} constraints
 * @returns {ConstraintDiagnosis[]} مرتّبة تنازليًا حسب rescueIfRemovedCount
 */
export function diagnoseInsufficientResults(allFoods, constraints) {
  const baseline = applyConstraints(allFoods, constraints).survivors.length;

  return constraints
    .map((constraint) => {
      const withoutThisOne = constraints.filter((c) => c.id !== constraint.id);
      const survivorsWithoutIt = applyConstraints(allFoods, withoutThisOne).survivors.length;

      const soloResult = applyConstraints(allFoods, [constraint]);
      const soloExcludedCount = allFoods.length - soloResult.survivors.length;

      return {
        constraintId: constraint.id,
        message_ar: constraint.message_ar,
        soloExcludedCount,
        rescueIfRemovedCount: survivorsWithoutIt - baseline,
      };
    })
    .sort((a, b) => b.rescueIfRemovedCount - a.rescueIfRemovedCount);
}

// -----------------------------------------------------------------------
// نقطة الدخول الموحّدة الكاملة
// -----------------------------------------------------------------------

/**
 * @typedef {Object} DecisionResult
 * @property {import('../food-library/schema.js').FoodItem[]} availableFoods
 * @property {import('./constraint-schema.js').Constraint[]} constraintsApplied
 * @property {Map<string, import('./constraint-schema.js').Constraint[]>} exclusionLog
 * @property {boolean} sufficient
 * @property {ConstraintDiagnosis[]|null} diagnosis - null إلا لو sufficient=false
 */

/**
 * نقطة الدخول الكاملة الموصى بها: من بروفايل المستخدم مباشرة إلى قائمة
 * الأصناف المتاحة فعليًا + تشخيص تلقائي لو النتيجة غير كافية.
 * @param {ConstraintProfile} profile
 * @param {Object} [options]
 * @param {number} [options.minimumRequired=1] - أقل عدد أصناف يُعتبر معه الناتج "كافيًا"
 * @returns {DecisionResult}
 */
export function resolveAvailableFoods(profile, options = {}) {
  const minimumRequired = options.minimumRequired ?? 1;
  const allFoods = getAllFoods();
  const constraints = collectConstraints(profile);
  const { survivors, exclusionLog } = applyConstraints(allFoods, constraints);

  const sufficient = survivors.length >= minimumRequired;

  return {
    availableFoods: survivors,
    constraintsApplied: constraints,
    exclusionLog,
    sufficient,
    diagnosis: sufficient ? null : diagnoseInsufficientResults(allFoods, constraints),
  };
}
