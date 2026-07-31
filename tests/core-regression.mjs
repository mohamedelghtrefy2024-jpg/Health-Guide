/**
 * ============================================================================
 * Regression Test — كل المحركات (بدون واجهة)
 * ============================================================================
 * شغّله بعد أي تعديل على Food Library أو أي محرك: `node tests/core-regression.mjs`
 * لازم يفضل 100% PASS. لو أي اختبار فشل بعد دمج بيانات جديدة، ده معناه
 * إن البيانات الجديدة كسرت افتراضًا كان قائم عليه المحرك — راجع رسالة
 * الفشل تحديدًا قبل أي حاجة تانية.
 * ============================================================================
 */

import 'fake-indexeddb/auto';
import { getAllFoods, getLibraryStats } from '../core/food-library/food-library.js';
import { resolveAvailableFoods, evaluateFoodAgainstConstraint, collectConstraints, applyConstraints } from '../core/decision-engine/decision-engine.js';
import { buildMedicalConstraints } from '../core/decision-engine/medical-engine.js';
import { createConstraint, CONSTRAINT_KIND, CONSTRAINT_SOURCE } from '../core/decision-engine/constraint-schema.js';
import { resolveEffectiveDietStyle } from '../core/decision-engine/diet-engine.js';
import { calculateFullNutritionProfile, calculateWaterTargetMl, calculateBMR, ACTIVITY_LEVEL, GOAL, calculateBMI, classifyBMI, calculateIdealWeightRange } from '../core/nutrition-engine/nutrition-engine.js';
import { generateMeal, replaceMealItem, updateMealItemPortion } from '../core/meal-engine/meal-generation-engine.js';
import { computeMealQualityScore } from '../core/meal-engine/meal-quality.js';
import { MEDICAL_CONDITION, ALLERGEN, ALLERGY_SEVERITY, DIET_STYLE, createEmptyMacros, createEmptyMicros } from '../core/food-library/schema.js';
import { STORE, putRecord, getRecord, exportAllData, importAllData } from '../core/storage/storage-engine.js';
import { getAllExercises, filterExercisesForConditions, calculateCaloriesBurned } from '../core/exercise-engine/exercise-engine.js';
import { logMeal, logExercise, computeDailyTotals, logDailyMetrics, getDailyMetrics, logEatingOutMeal } from '../core/tracking-engine/tracking-engine.js';
import { startChallenge, updateChallengeProgress, calculateStreak } from '../core/gamification-engine/gamification-engine.js';
import { getCalorieTrend, compareBestWorstWeek, getWeightTrend, getWaterTrend, getBodyCompositionTrend, detectWeightTrendPattern } from '../core/analytics-engine/analytics-engine.js';
import { getFoodById, filterFoods, searchFoodsByName } from '../core/food-library/food-library.js';
import { getInstantRecommendations, getGeneralTips, getAdherenceTip, getWeightStabilityRecommendation, RECOMMENDATION_SEVERITY } from '../core/recommendation-engine/recommendation-engine.js';
import {
  estimateBodyFatPercentNavy, resolveBodyFatPercent, calculateRemainingMealBudget,
} from '../core/nutrition-engine/nutrition-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

console.log('=== Food Library ===');
const stats = getLibraryStats();
check(`كل الأصناف صالحة (${stats.total_valid} صنف، 0 مرفوض)`, stats.total_invalid === 0);
check('يوجد أصناف كافية للاختبار (>=10)', stats.total_valid >= 10);

// فخ لوز/الوز (نفس فئة فخ بيض/أبيض): "الوز" (إوز) و"الوزغة" (سحلية) بيحتويوا
// "لوز" كسلسلة فرعية بس مش حساسية مكسرات فعليًا — راجع FOOD_DB_CONVERSION_REPORT.md
{
  const goose = getFoodById('food_3371'); // لحم الوز البلدي
  const gecko = getFoodById('food_4763'); // لحم الوزغة
  check('صنف "لحم الوز البلدي" مش موسوم غلط بحساسية المكسرات', !!goose && !goose.allergens.includes('nuts'));
  check('صنف "لحم الوزغة" مش موسوم غلط بحساسية المكسرات', !!gecko && !gecko.allergens.includes('nuts'));
}

console.log('\n=== Decision Engine ===');
{
  const r = resolveAvailableFoods({ medicalConditions: [MEDICAL_CONDITION.DIABETES_T2] });
  check('فلترة مرض واحد تعمل وتُرجع نتيجة جزئية', r.availableFoods.length > 0 && r.availableFoods.length <= getAllFoods().length);

  const conflictR = resolveAvailableFoods({
    medicalConditions: [MEDICAL_CONDITION.CKD_DIALYSIS, MEDICAL_CONDITION.GOUT],
    allergies: [{ allergen: ALLERGEN.GLUTEN, severity: 'severe' }, { allergen: ALLERGEN.LACTOSE, severity: 'severe' }],
    dietStyle: DIET_STYLE.VEGAN,
  }, { minimumRequired: 999999 }); // عتبة أكبر من أي مكتبة ممكنة عمدًا — الهدف اختبار مسار التشخيص نفسه، مش حجم المكتبة
  check('تشخيص التعارض الشديد يعمل ويُرجع تفاصيل', !conflictR.sufficient && Array.isArray(conflictR.diagnosis) && conflictR.diagnosis.length > 0);

  // LIMIT-07: قيد الفوسفور الجديد لمرضى الكلى/الغسيل الكلوي
  const ckdConstraints = buildMedicalConstraints([MEDICAL_CONDITION.CKD]);
  const phosphorusConstraint = ckdConstraints.find(c => c.nutrient_path === 'micros.phosphorus_mg');
  check('قيد الفوسفور موجود لمرضى الكلى (CKD)', !!phosphorusConstraint && phosphorusConstraint.limit_value === 180);

  const highPhosphorusFood = { unsuitable_for_conditions: [], macros: createEmptyMacros(), micros: { ...createEmptyMicros(), phosphorus_mg: 500 } };
  const lowPhosphorusFood = { unsuitable_for_conditions: [], macros: createEmptyMacros(), micros: { ...createEmptyMicros(), phosphorus_mg: 50 } };
  const legacyMicros = createEmptyMicros();
  delete legacyMicros.phosphorus_mg; // يحاكي الأصناف الـ3055 الحالية قبل إعادة التحويل من مصدر فيه فوسفور فعلي
  const legacyFoodNoPhosphorusField = { unsuitable_for_conditions: [], macros: createEmptyMacros(), micros: legacyMicros };
  check('صنف عالي الفوسفور يُستبعد لمرضى الكلى', evaluateFoodAgainstConstraint(highPhosphorusFood, phosphorusConstraint) === false);
  check('صنف منخفض الفوسفور ينجو لمرضى الكلى', evaluateFoodAgainstConstraint(lowPhosphorusFood, phosphorusConstraint) === true);
  check('صنف بدون قيمة فوسفور معروفة لا يُستبعد بالخطأ (fallback آمن)', evaluateFoodAgainstConstraint(legacyFoodNoPhosphorusField, phosphorusConstraint) === true);
}

console.log('\n=== Nutrition Engine ===');
{
  const n = calculateFullNutritionProfile({
    gender: 'female', age: 28, heightCm: 165, weightKg: 70, targetWeightKg: 60,
    activityLevel: ACTIVITY_LEVEL.LIGHT, goal: GOAL.LOSE, timeframeDays: 120, dietStyle: 'normal',
  });
  check('BMR منطقي', n.bmr.value > 1000 && n.bmr.value < 2500);
  check('TDEE = مجموع مكوّناته بالظبط', n.tdeeBreakdown.tdee === n.tdeeBreakdown.bmr + n.tdeeBreakdown.neat + n.tdeeBreakdown.eat + n.tdeeBreakdown.tef);
  check('السعرات المستهدفة لا تقل عن الحد الآمن للإناث (1200)', n.calorieTarget.targetCalories >= 1200);
}

console.log('\n=== Meal Generation Engine ===');
{
  const n = calculateFullNutritionProfile({
    gender: 'male', age: 30, heightCm: 178, weightKg: 85, targetWeightKg: 78,
    activityLevel: ACTIVITY_LEVEL.MODERATE, goal: GOAL.LOSE, timeframeDays: 120, dietStyle: 'normal',
  });
  const share = 0.35;
  const result = generateMeal({
    constraintProfile: {},
    mealType: 'lunch',
    targetKcal: n.calorieTarget.targetCalories * share,
    macroTargets: { protein_g: n.macroTargets.protein_g * share, carb_g: n.macroTargets.carb_g * share, fat_g: n.macroTargets.fat_g * share },
    microTargets: n.microTargets,
    minFoodQualityScore: 30,
  });
  check('توليد وجبة عادية بدون قيود ينجح', result.success && result.candidates.length > 0);
  if (result.success) {
    check('أفضل تركيبة Quality Score معقول', result.candidates[0].qualityScore >= 40);
    const replaced = replaceMealItem(result.candidates[0], 0, {});
    check('استبدال صنف واحد يعمل أو يرجع تشخيص واضح', typeof replaced.success === 'boolean');

    // تعديل يدوي لحجم حصة (بند 11 — LIMIT-05)
    const original = result.candidates[0];
    const originalGrams = original.items[0].grams;
    const doubled = updateMealItemPortion(original, 0, originalGrams * 2, n.microTargets);
    check('تعديل حصة يدويًا ينجح ويعيد حساب الإجمالي', doubled.success && doubled.candidate.items[0].grams === originalGrams * 2);
    check('تعديل حصة يدويًا يغيّر السعرات الإجمالية فعليًا', doubled.candidate.totals.kcal !== original.totals.kcal);
    check('تعديل حصة يدويًا لا يغيّر باقي الأصناف', doubled.candidate.items[1]?.grams === original.items[1]?.grams);

    const invalidPortion = updateMealItemPortion(original, 0, -5, n.microTargets);
    check('تعديل حصة بقيمة سالبة يُرفض بتشخيص واضح', invalidPortion.success === false && !!invalidPortion.diagnosis_ar);

    const invalidIndex = updateMealItemPortion(original, 999, 100, n.microTargets);
    check('تعديل حصة بـindex غير موجود يُرفض بأمان', invalidIndex.success === false);
  }
}

console.log('\n=== دعم تركيبات 3+ أصناف بمحسّن حقيقي (آخر فجوة وظيفية موثَّقة) ===');
{
  const n = calculateFullNutritionProfile({
    gender: 'female', age: 28, heightCm: 165, weightKg: 70, targetWeightKg: 62,
    activityLevel: ACTIVITY_LEVEL.LIGHT, goal: GOAL.LOSE, timeframeDays: 150, dietStyle: 'normal',
  });
  const share = 0.35;
  const request = {
    constraintProfile: {},
    mealType: 'lunch',
    targetKcal: n.calorieTarget.targetCalories * share,
    macroTargets: { protein_g: n.macroTargets.protein_g * share, carb_g: n.macroTargets.carb_g * share, fat_g: n.macroTargets.fat_g * share },
    microTargets: n.microTargets,
    minFoodQualityScore: 30,
  };

  const t0 = Date.now();
  const result = generateMeal(request);
  const elapsedMs = Date.now() - t0;

  check('توليد وجبة (سيناريو المحسّن) ينجح', result.success && result.candidates.length > 0);
  check('زمن التوليد مقبول رغم توسيع مساحة البحث (< 3 ثانية) — لا انفجار أداء (نفس فئة BUG-S8-01)', elapsedMs < 3000);

  if (result.success) {
    const has3PlusItemCandidate = result.candidates.some((c) => c.items.length >= 3);
    check('توجد تركيبة واحدة على الأقل من 3 أصناف فعلية أو أكثر ضمن المرشَّحين', has3PlusItemCandidate);

    const has2VegCombo = result.candidates.some((c) => {
      const vegCount = c.items.filter((it) => it.food.category === 'vegetable').length;
      return vegCount >= 2;
    });
    check('توجد تركيبة واحدة على الأقل بصنفي خضار معًا (تنويع ألوان/ألياف حقيقي)', has2VegCombo);

    const hasMultipleVegPortionSizes = new Set(
      result.candidates
        .filter((c) => c.items.length === 3 && c.items[2].food.category === 'vegetable')
        .map((c) => c.items[2].grams),
    ).size > 1;
    check('حجم حصة الخضار متغيّر فعليًا بين المرشَّحين (مش حصة ثابتة 100 جم دايمًا)', hasMultipleVegPortionSizes);

    // النظام يختار فعليًا أفضل تركيبة بالجودة الحقيقية من بين كل الاحتمالات المولَّدة،
    // مش مجرد أول احتمال — نتحقق إن الترتيب تنازلي فعلاً بالـQuality Score
    const sortedDescending = result.candidates.every(
      (c, i) => i === 0 || result.candidates[i - 1].qualityScore >= c.qualityScore,
    );
    check('التركيبات مرتَّبة تنازليًا بالجودة الحقيقية (اختيار فعلي للأفضل لا عشوائي)', sortedDescending);
  }

  // نفس السيناريو بمستوى التزام "صارم" (مجمّع ترشيح أضيق) — يجب أن يفضل يشتغل
  // من غير كسر أو انفجار أداء رغم إضافة تركيبات الخضار المتعددة
  const strictResult = generateMeal({ ...request, adherenceLevel: 'strict' });
  check('المحسّن الجديد يعمل صح مع مجمّع الترشيح الأضيق (صارم) من غير كسر', typeof strictResult.success === 'boolean');
}

console.log('\n=== Storage Engine ===');
{
  await putRecord(STORE.PROFILE, { id: 'test-user', name: 'اختبار' });
  const read = await getRecord(STORE.PROFILE, 'test-user');
  check('حفظ وقراءة سجل', read?.name === 'اختبار');
  const exported = await exportAllData();
  const imported = await importAllData(exported);
  check('تصدير واستيراد كامل البيانات', imported.success === true);
}

console.log('\n=== Exercise Engine ===');
{
  const exercises = getAllExercises();
  check('مكتبة التمارين محمَّلة', exercises.length > 0);
  const safe = filterExercisesForConditions([MEDICAL_CONDITION.HEART_DISEASE]);
  check('استبعاد تمارين لمرضى القلب يعمل', safe.length < exercises.length);
  const kcal = calculateCaloriesBurned(exercises[0], 80, 30);
  check('حساب سعرات محروقة منطقي', kcal > 0 && kcal < 2000);
}

console.log('\n=== Tracking Engine ===');
{
  const proteinFood = getAllFoods().find((f) => f.category === 'protein');
  if (proteinFood) {
    await logMeal('2026-08-01', 'lunch', [{ food: proteinFood, grams: 150 }]);
    const daily = await computeDailyTotals('2026-08-01', getFoodById);
    check('تسجيل وتجميع وجبة يعمل', daily.nutrition !== null && daily.mealCount === 1);
  } else {
    check('يوجد أصناف بروتين في المكتبة لاختبار التسجيل', false);
  }
}

console.log('\n=== Tracking Engine — الوزن والماء اليومي (LIMIT-08) ===');
{
  // 1) تسجيل وزن فقط
  const r1 = await logDailyMetrics('2026-08-05', { weightKg: 82.5 });
  check('تسجيل وزن يوم جديد يعمل', r1.weightKg === 82.5 && r1.id === '2026-08-05');

  // 2) تسجيل ماء لاحقًا لنفس اليوم — لازم يدمج مع الوزن المسجَّل قبل كده، مش يمسحه
  const r2 = await logDailyMetrics('2026-08-05', { waterMl: 1500 });
  check('تسجيل ماء لاحق يدمج مع وزن مسجَّل سابقًا لنفس اليوم (لا يُفقَد)', r2.weightKg === 82.5 && r2.waterMl === 1500);

  // 3) تحديث القيمتين مع بعض في نفس اليوم يستبدل بس القيم الجديدة
  const r3 = await logDailyMetrics('2026-08-05', { weightKg: 82.0, waterMl: 2000 });
  check('تحديث وزن وماء مع بعض لنفس اليوم يعمل صح', r3.weightKg === 82.0 && r3.waterMl === 2000);

  // 4) القراءة المباشرة
  const read = await getDailyMetrics('2026-08-05');
  check('قراءة مقاييس يوم مسجَّل ترجع نفس القيم', read?.weightKg === 82.0 && read?.waterMl === 2000);

  // 5) يوم بدون أي تسجيل يرجع null (مش استثناء أو كائن فاضي مضلِّل)
  const noRecord = await getDailyMetrics('2026-08-06');
  check('يوم بدون تسجيل يرجع null بأمان', noRecord === null);

  // 6) تكامل فعلي مع Analytics Engine (getWeightTrend) — كان بيرجع فاضي دايمًا قبل الميزة دي
  const trend = await getWeightTrend(['2026-08-05', '2026-08-06']);
  check('اتجاه الوزن (Analytics Engine) بيقرأ فعليًا من daily_tracking بعد الميزة', trend.length === 1 && trend[0].date === '2026-08-05' && trend[0].weightKg === 82.0);

  // 7) هدف الماء الإرشادي (35 مل × كجم)
  check('حساب هدف الماء اليومي صحيح (مثال 82 كجم → 2850 مل)', calculateWaterTargetMl(82) === 2850);

  // 8) الحقول الإضافية (محيط الخصر/الرقبة/الأرداف + نسبة دهون مقاسة) — بند 13
  const r4 = await logDailyMetrics('2026-08-07', { weightKg: 81.5, waistCm: 92, neckCm: 40 });
  check('تسجيل محيط الخصر/الرقبة يوميًا يعمل من غير ما يمسح الحقول التانية', r4.weightKg === 81.5 && r4.waistCm === 92 && r4.neckCm === 40);
  const r5 = await logDailyMetrics('2026-08-07', { bodyFatPercent: 22.5 });
  check('إضافة نسبة دهون مقاسة لاحقًا لنفس اليوم تدمج مع القياسات السابقة', r5.waistCm === 92 && r5.bodyFatPercent === 22.5);
}

console.log('\n=== ميزة "معزوم برة" — تقدير سعرات + إعادة توازن باقي اليوم (بند 11) ===');
{
  // 1) تسجيل "معزوم برة" بيتحسب في إجمالي اليوم حتى بدون أي وجبة حقيقية
  const eatOutOnly = await logEatingOutMeal('2026-08-10', 'lunch', 900);
  check('تسجيل معزوم برة ينجح ويُخزَّن كـisEatingOut', eatOutOnly.isEatingOut === true && eatOutOnly.estimatedKcal === 900);

  const totalsEatOutOnly = await computeDailyTotals('2026-08-10', getFoodById);
  check('يوم فيه معزوم برة بس (بدون أي وجبة حقيقية) يظهر في الإجمالي', totalsEatOutOnly.nutrition !== null && totalsEatOutOnly.nutrition.kcal === 900);
  check('حقل eatingOutKcal يعكس القيمة المسجَّلة', totalsEatOutOnly.eatingOutKcal === 900);

  // 2) دمج معزوم برة مع وجبة حقيقية مسجَّلة لنفس اليوم
  const proteinFood = getAllFoods().find((f) => f.category === 'protein');
  await logMeal('2026-08-10', 'breakfast', [{ food: proteinFood, grams: 100 }]);
  const totalsMixed = await computeDailyTotals('2026-08-10', getFoodById);
  const expectedKcal = totalsMixed.nutrition.kcal;
  check('دمج معزوم برة مع وجبة حقيقية يجمع السعرات صح', Math.abs(expectedKcal - (900 + proteinFood.macros.kcal)) < 1.5);

  // 3) إعادة توازن الميزانية المتبقية بعد استهلاك جزء من هدف اليوم
  const budget = calculateRemainingMealBudget({
    dailyCalorieTarget: 2200,
    dailyMacroTargets: { protein_g: 150, carb_g: 220, fat_g: 70 },
    consumedKcal: 900,
    consumedMacros: { protein_g: 30, carb_g: 40, fat_g: 25 },
    remainingMealTypes: ['dinner', 'snack'],
  });
  check('الميزانية المتبقية تخصم الاستهلاك الفعلي من هدف اليوم', budget.remainingKcal === 1300);
  check('الميزانية المتبقية موزَّعة على كل الوجبات المتبقية فقط', Object.keys(budget.perMeal).sort().join(',') === 'dinner,snack');
  const dinnerShare = budget.perMeal.dinner.targetKcal;
  const snackShare = budget.perMeal.snack.targetKcal;
  check('توزيع الميزانية يحترم النسب الافتراضية (عشاء > سناك)', dinnerShare > snackShare);
  check('مجموع توزيع الميزانية المتبقية قريب من الإجمالي المتبقي', Math.abs((dinnerShare + snackShare) - 1300) <= 2);

  // 4) استهلاك يتخطى الهدف بالكامل — الميزانية المتبقية لا تكون سالبة، وهناك حد أدنى واقعي لكل وجبة
  const overBudget = calculateRemainingMealBudget({
    dailyCalorieTarget: 1800,
    dailyMacroTargets: { protein_g: 120, carb_g: 200, fat_g: 60 },
    consumedKcal: 2500, // معزوم برة بسعرات عالية تجاوزت الهدف بالكامل
    consumedMacros: { protein_g: 100, carb_g: 300, fat_g: 90 },
    remainingMealTypes: ['dinner'],
  });
  check('استهلاك يتخطى هدف اليوم بالكامل لا يُنتج ميزانية سالبة', overBudget.remainingKcal === 0);
  check('يوجد حد أدنى واقعي لهدف الوجبة حتى مع ميزانية صفرية', overBudget.perMeal.dinner.targetKcal >= 100);
}

console.log('\n=== تقدير نسبة الدهون بمعادلة Navy (بند 11) ===');
{
  // 1) صيغة الذكور — تحتاج فقط خصر/رقبة/طول
  const maleNavy = estimateBodyFatPercentNavy({ gender: 'male', waistCm: 90, neckCm: 38, heightCm: 178 });
  check('تقدير Navy للذكور ينجح بمحيط خصر/رقبة/طول فقط', maleNavy.value !== null && maleNavy.value > 5 && maleNavy.value < 40);

  // 2) صيغة الإناث — تحتاج محيط الأرداف كمان، وترفض بأمان لو ناقص
  const femaleNoHip = estimateBodyFatPercentNavy({ gender: 'female', waistCm: 80, neckCm: 32, heightCm: 165 });
  check('تقدير Navy للإناث بدون محيط الأرداف يُرفض بتشخيص واضح', femaleNoHip.value === null && !!femaleNoHip.reason_ar);

  const femaleWithHip = estimateBodyFatPercentNavy({ gender: 'female', waistCm: 80, neckCm: 32, heightCm: 165, hipCm: 100 });
  check('تقدير Navy للإناث بمحيط الأرداف كامل ينجح', femaleWithHip.value !== null && femaleWithHip.value > 5 && femaleWithHip.value < 55);

  // 3) قياسات غير منطقية (محيط خصر أصغر من الرقبة) تُرفض بدل نتيجة سالبة/خاطئة
  const impossible = estimateBodyFatPercentNavy({ gender: 'male', waistCm: 30, neckCm: 38, heightCm: 178 });
  check('محيط خصر أصغر من الرقبة يُرفض بأمان (بدل رقم سالب مضلِّل)', impossible.value === null);

  // 4) resolveBodyFatPercent — الأولوية للنسبة المُدخلة مباشرة، ثم Navy، ثم null
  const measured = resolveBodyFatPercent({ bodyFatPercent: 20, waistCm: 90, neckCm: 38, heightCm: 178, gender: 'male' });
  check('resolveBodyFatPercent يفضّل النسبة المُدخلة مباشرة لو موجودة ومنطقية', measured.value === 20 && measured.source === 'measured');

  const estimated = resolveBodyFatPercent({ waistCm: 90, neckCm: 38, heightCm: 178, gender: 'male' });
  check('resolveBodyFatPercent يلجأ لتقدير Navy لو النسبة المباشرة غير متوفرة', estimated.value !== null && estimated.source === 'navy_estimate');

  const neither = resolveBodyFatPercent({ gender: 'male' });
  check('resolveBodyFatPercent يرجع null بأمان لو مفيش أي مصدر متاح', neither.value === null && neither.source === null);
}

console.log('\n=== بيانات إضافية اختيارية — تفعيل Katch-McArdle (بند 9 من الأعمال المتبقية) ===');
{
  const baseProfile = { gender: 'male', age: 35, heightCm: 180, weightKg: 90 };
  const withoutFat = calculateBMR(baseProfile);
  check('من غير نسبة دهون: معادلة Mifflin-St Jeor العامة', withoutFat.formula_used === 'mifflin_st_jeor');

  const withFat = calculateBMR({ ...baseProfile, bodyFatPercent: 18 });
  check('بنسبة دهون معروفة: معادلة Katch-McArdle الأدق تتفعّل', withFat.formula_used === 'katch_mcardle');
  check('نتيجة Katch-McArdle منطقية (كتلة خالية من الدهون أقل من الوزن الكلي)', withFat.value > 1200 && withFat.value < 2500);

  // قيمة غير منطقية (مثال: خطأ إدخال 95%) لازم ترجع للمعادلة العامة الآمنة بدل نتيجة خطأ
  const invalidFat = calculateBMR({ ...baseProfile, bodyFatPercent: 95 });
  check('نسبة دهون غير منطقية (>=70%) يُتجاهل ويُستخدم fallback آمن', invalidFat.formula_used === 'mifflin_st_jeor');
}

console.log('\n=== Gamification Engine ===');
{
  const challenge = await startChallenge('ch_water_7');
  const updated = await updateChallengeProgress(challenge.id, 7);
  check('تحدي يكتمل عند بلوغ الهدف', updated.completed === true);
  check('حساب Streak صحيح', calculateStreak([true, true, false, true]) === 2);
}

console.log('\n=== Analytics Engine ===');
{
  const trend = await getCalorieTrend(['2026-08-01', '2026-08-02'], getFoodById);
  check('اتجاه السعرات يُرجع نقطة بيانات واحدة على الأقل', trend.some((p) => p.kcal !== null));

  // getWaterTrend (S16 — تاب التحليلات) — يقرأ من نفس سجل 2026-08-05 المُستخدَم فوق لاختبار getWeightTrend (waterMl: 2000)
  const waterTrend = await getWaterTrend(['2026-08-05', '2026-08-06']);
  check('اتجاه الماء (Analytics Engine) بيقرأ فعليًا من daily_tracking', waterTrend.length === 1 && waterTrend[0].date === '2026-08-05' && waterTrend[0].waterMl === 2000);
  const emptyWaterTrend = await getWaterTrend(['2026-08-06']);
  check('يوم بدون تسجيل ماء لا يظهر في اتجاه الماء (بدل قيمة null مضلِّلة)', emptyWaterTrend.length === 0);

  // compareBestWorstWeek على مدى صغير (7 أيام، أسبوع واحد بس) — نتأكد إن الدالة ترجع نفس الأسبوع كأفضل وأسوأ بدون كسر
  const oneWeekRange = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
  const weekCompare = await compareBestWorstWeek(oneWeekRange, getFoodById, 2000);
  check('مقارنة أفضل/أسوأ أسبوع بمدى بدون أي وجبات مسجَّلة ترجع null بأمان (بدل كسر)', weekCompare.bestWeek === null && weekCompare.worstWeek === null);
}

console.log('\n=== تتبع تركيب الجسم كسلسلة زمنية (بند 13 — الفجوة المتبقية) ===');
{
  await logDailyMetrics('2026-08-11', { weightKg: 80, waistCm: 95, neckCm: 39 });
  await logDailyMetrics('2026-08-12', { weightKg: 79.5 });

  // بروفايل بدون أي قياسات محيط — يوم 2026-08-05 (وزن بس، بدون نسبة دهون مباشرة) لازم يتفلتر تمامًا
  const noMeasurementsProfile = { gender: 'male', heightCm: 178 };
  const trendNoFallback = await getBodyCompositionTrend(['2026-08-05', '2026-08-07', '2026-08-11', '2026-08-12'], noMeasurementsProfile);
  check('يوم بدون أي مصدر لنسبة الدهون يتفلتر من السلسلة الزمنية (بدون قياسات بروفايل)', trendNoFallback.every((p) => p.date !== '2026-08-05'));
  check('من غير قياسات بروفايل، بس الأيام اللي فيها مصدر صريح (مقاس أو محيط ليومها) تظهر', trendNoFallback.length === 2 && trendNoFallback.map((p) => p.date).sort().join(',') === '2026-08-07,2026-08-11');

  const measuredPoint = trendNoFallback.find((p) => p.date === '2026-08-07');
  check('يوم فيه نسبة دهون مقاسة مباشرة يُستخدم كما هو (مصدر measured)', measuredPoint?.source === 'measured' && measuredPoint.bodyFatPercent === 22.5);
  check('كتلة الدهون/الكتلة الخالية من الدهون بتتحسب صح من الوزن ونسبة الدهون', Math.abs(measuredPoint.fatMassKg + measuredPoint.leanMassKg - measuredPoint.weightKg) < 0.2);

  const dayLevelEstimate = trendNoFallback.find((p) => p.date === '2026-08-11');
  check('يوم فيه محيط خصر/رقبة ليومه بس (بدون نسبة دهون مباشرة) يعتمد على تقدير Navy (مصدر navy_estimate)', dayLevelEstimate?.source === 'navy_estimate');

  // بروفايل فيه قياسات محيط fallback — يوم 2026-08-12 (وزن بس بدون محيط ليومه) لازم يستخدمها ويظهر
  const profileWithMeasurements = { gender: 'male', heightCm: 178, waistCm: 88, neckCm: 37 };
  const trendWithFallback = await getBodyCompositionTrend(['2026-08-05', '2026-08-12'], profileWithMeasurements);
  check('مع قياسات بروفايل fallback، يوم بدون محيط ليومه بيستخدمها ويظهر (مصدر navy_estimate)', trendWithFallback.find((p) => p.date === '2026-08-12')?.source === 'navy_estimate');
  // مع قياسات بروفايل fallback، يوم 2026-08-05 (وزن مسجَّل، بدون محيط ليومه ولا نسبة دهون مباشرة) لازم يستفيد من fallback البروفايل برضه
  check('قياسات بروفايل fallback تنطبق على أي يوم فيه وزن بس بدون محيط خاص بيه', trendWithFallback.find((p) => p.date === '2026-08-05')?.source === 'navy_estimate');
}

console.log('\n=== Recommendation Engine ===');
{
  const nutritionProfile = calculateFullNutritionProfile({
    gender: 'male', age: 30, heightCm: 175, weightKg: 80, targetWeightKg: 75,
    activityLevel: ACTIVITY_LEVEL.MODERATE, goal: GOAL.LOSE, timeframeDays: 90, dietStyle: DIET_STYLE.NORMAL,
  });

  // 1) مفيش وجبات مسجَّلة إطلاقًا — توصية تشجيع على أول تسجيل بس، مفيش قسمة على صفر
  const noMealsRecs = getInstantRecommendations({ nutrition: null }, nutritionProfile, []);
  check('لا توجد وجبات: توصية واحدة بس لتسجيل أول وجبة', noMealsRecs.length === 1 && noMealsRecs[0].type === 'no_meals_logged');

  // 2) نقص واضح في البروتين + سعرات لسه باقي منها كتير
  const lowProteinTotals = {
    nutrition: { kcal: 500, protein_g: 10, carbs_g: 60, fat_g: 15, saturated_fat_g: 3, sodium_mg: 400 },
  };
  const lowProteinRecs = getInstantRecommendations(lowProteinTotals, nutritionProfile, []);
  check('نقص بروتين واضح يُكتشف (مثال المستند)', lowProteinRecs.some((r) => r.type === 'protein_gap'));
  check('سعرات متبقية كتير تُكتشف', lowProteinRecs.some((r) => r.type === 'calories_remaining'));

  // 3) تجاوز صوديوم فوق الحد — مع حالة ضغط بيبقى التحذير موجود برضه (نفس النوع، رسالة مخصّصة)
  const highSodiumTotals = {
    nutrition: {
      kcal: nutritionProfile.calorieTarget.targetCalories,
      protein_g: nutritionProfile.macroTargets.protein_g,
      carbs_g: nutritionProfile.macroTargets.carb_g,
      fat_g: nutritionProfile.macroTargets.fat_g,
      saturated_fat_g: 5,
      sodium_mg: nutritionProfile.microTargets.sodium_mg + 500,
    },
  };
  const highSodiumRecs = getInstantRecommendations(highSodiumTotals, nutritionProfile, [MEDICAL_CONDITION.HYPERTENSION]);
  const sodiumRec = highSodiumRecs.find((r) => r.type === 'sodium_high');
  check('تجاوز الصوديوم يُكتشف ويكون تحذير', !!sodiumRec && sodiumRec.severity === RECOMMENDATION_SEVERITY.WARNING);

  // 4) كل حاجة متوازنة — رسالة تشجيعية واحدة بس، بدون تحذيرات
  const balancedTotals = {
    nutrition: {
      kcal: nutritionProfile.calorieTarget.targetCalories,
      protein_g: nutritionProfile.macroTargets.protein_g,
      carbs_g: nutritionProfile.macroTargets.carb_g,
      fat_g: nutritionProfile.macroTargets.fat_g,
      saturated_fat_g: 2,
      sodium_mg: 500,
    },
  };
  const balancedRecs = getInstantRecommendations(balancedTotals, nutritionProfile, []);
  check('حالة متوازنة تُرجع رسالة تشجيعية واحدة فقط', balancedRecs.length === 1 && balancedRecs[0].type === 'on_track');

  // 5) النصائح العامة + نصيحة حالة مرضية بتذكير متابعة الطبيب
  const tips = getGeneralTips([MEDICAL_CONDITION.CKD]);
  check('النصائح العامة موجودة دايمًا', tips.filter((t) => t.type === 'general').length === 5);
  const ckdTip = tips.find((t) => t.type === 'condition' && t.condition === MEDICAL_CONDITION.CKD);
  check('نصيحة مخصّصة لحالة مرضية موجودة وفيها تذكير بمتابعة الطبيب', !!ckdTip && ckdTip.message_ar.includes('طبيب'));

  // 6) كود حالة غير معروف لا يكسر الدالة
  const safeTips = getGeneralTips(['unknown_condition_code']);
  check('كود حالة غير معروف يُتجاهل بأمان بدون كسر', safeTips.length === 5);

  // 7) مؤشر الالتزام — الحالات الثلاث + حالة عدم توفر بيانات
  check('التزام مرتفع', getAdherenceTip({ adherencePct: 90 }).type === 'adherence_high');
  check('التزام متوسط', getAdherenceTip({ adherencePct: 60 }).type === 'adherence_medium');
  check('التزام منخفض', getAdherenceTip({ adherencePct: 20 }).type === 'adherence_low');
  check('عدم توفر بيانات التزام', getAdherenceTip({ adherencePct: null }).type === 'adherence_no_data');
}

console.log('\n=== حالة الحمل/الرضاعة (بند 1.1 من برومبت استكمال البنود الناقصة) ===');
{
  const baseProfile = {
    gender: 'female', age: 28, heightCm: 165, weightKg: 70, targetWeightKg: 60,
    activityLevel: ACTIVITY_LEVEL.LIGHT, goal: GOAL.LOSE, timeframeDays: 90, dietStyle: 'normal',
  };

  // 1) بدون حمل/رضاعة: يُطبَّق عجز السعرات العادي (سلوك قديم لا يتغيّر)
  const noPregnancy = calculateFullNutritionProfile(baseProfile);
  check('بدون حمل/رضاعة: pregnancyNotice = null', noPregnancy.pregnancyNotice === null);
  check('بدون حمل/رضاعة: عجز السعرات مُطبَّق كالمعتاد (أقل من TDEE)', noPregnancy.calorieTarget.targetCalories < noPregnancy.tdeeBreakdown.tdee);

  // 2) حامل + هدف "خسارة وزن": يجب تجاهل العجز كليًا وإضافة سعرات آمنة
  const pregnant = calculateFullNutritionProfile({ ...baseProfile, pregnancyStatus: 'pregnant' });
  check('حامل: السعرات المستهدفة أعلى من TDEE (لا يوجد عجز) رغم هدف "خسارة وزن"', pregnant.calorieTarget.targetCalories > pregnant.tdeeBreakdown.tdee);
  check('حامل: الإضافة = 300 سعرة تقريبًا فوق TDEE', pregnant.calorieTarget.dailyAdjustment === 300);
  check('حامل: رسالة تحذير عربية دائمة موجودة', typeof pregnant.calorieTarget.warning === 'string' && pregnant.calorieTarget.warning.includes('استشارة طبية'));
  check('حامل: pregnancyNotice موجود برسالة عربية', !!pregnant.pregnancyNotice && pregnant.pregnancyNotice.status === 'pregnant');

  // 3) مرضعة: إضافة 500 سعرة تقريبًا
  const breastfeeding = calculateFullNutritionProfile({ ...baseProfile, pregnancyStatus: 'breastfeeding' });
  check('مرضعة: الإضافة = 500 سعرة تقريبًا فوق TDEE', breastfeeding.calorieTarget.dailyAdjustment === 500);
  check('مرضعة: السعرات المستهدفة أعلى من TDEE رغم هدف "خسارة وزن"', breastfeeding.calorieTarget.targetCalories > breastfeeding.tdeeBreakdown.tdee);

  // 4) حامل + نمط حمية كيتو: يُستبدل تلقائيًا بالنمط العادي لحساب الماكرو
  const pregnantKeto = calculateFullNutritionProfile({ ...baseProfile, dietStyle: 'keto', pregnancyStatus: 'pregnant' });
  const normalOnly = calculateFullNutritionProfile({ ...baseProfile, dietStyle: 'normal', pregnancyStatus: 'pregnant' });
  check('حامل + كيتو: أهداف الماكرو مطابقة للنمط العادي (تم الاستبدال)', pregnantKeto.macroTargets.fat_g === normalOnly.macroTargets.fat_g);
  check('حامل + كيتو: pregnancyNotice.dietOverridden = true', pregnantKeto.pregnancyNotice.dietOverridden === true);

  // 5) بدون حمل + كيتو: لا يوجد استبدال (سلوك عادي)
  const nonPregnantKeto = calculateFullNutritionProfile({ ...baseProfile, dietStyle: 'keto' });
  check('بدون حمل + كيتو: لا يوجد استبدال (fat_g مرتفع كالمتوقع من كيتو)', nonPregnantKeto.macroTargets.fat_g > normalOnly.macroTargets.fat_g);

  // 6) resolveEffectiveDietStyle (Decision Engine — استبعاد الأصناف): نفس القيد على مستوى القيود
  const effDuringPregnancyKeto = resolveEffectiveDietStyle(DIET_STYLE.KETO, 'pregnant');
  check('resolveEffectiveDietStyle: كيتو أثناء الحمل يُستبدل بالعادي', effDuringPregnancyKeto.dietStyle === DIET_STYLE.NORMAL && effDuringPregnancyKeto.overridden === true);

  const effDuringBreastfeedingFasting = resolveEffectiveDietStyle(DIET_STYLE.INTERMITTENT_FASTING, 'breastfeeding');
  check('resolveEffectiveDietStyle: الصيام المتقطع أثناء الرضاعة يُستبدل بالعادي', effDuringBreastfeedingFasting.dietStyle === DIET_STYLE.NORMAL && effDuringBreastfeedingFasting.overridden === true);

  const effNoPregnancyKeto = resolveEffectiveDietStyle(DIET_STYLE.KETO, 'none');
  check('resolveEffectiveDietStyle: كيتو بدون حمل يبقى كما هو', effNoPregnancyKeto.dietStyle === DIET_STYLE.KETO && effNoPregnancyKeto.overridden === false);

  // 7) إصلاح فجوة كانت موثَّقة كـTODO: أهداف المايكرو (حديد/كالسيوم/فيتامين A...)
  // كانت بترجع نفس جدول البالغين دائمًا بغض النظر عن الحمل/الرضاعة رغم إن
  // السعرات كانت بتتعدَّل صح. الآن getMicroTargets() لازم يرجّع جدول مختلف فعليًا.
  check('حامل: هدف الحديد أعلى من الوضع العادي (27mg بدل 12mg)', pregnant.microTargets.iron_mg === 27 && pregnant.microTargets.iron_mg > noPregnancy.microTargets.iron_mg);
  check('حامل: هدف فيتامين A أقل من المرضعة (770 مقابل 1300)', pregnant.microTargets.vitamin_a_mcg === 770 && pregnant.microTargets.vitamin_a_mcg < breastfeeding.microTargets.vitamin_a_mcg);
  check('مرضعة: هدف فيتامين C أعلى من العادي والحمل معًا (120mg)', breastfeeding.microTargets.vitamin_c_mg === 120 && breastfeeding.microTargets.vitamin_c_mg > pregnant.microTargets.vitamin_c_mg);
  check('بدون حمل/رضاعة: أهداف المايكرو تساوي جدول البالغين الأساسي (لا تغيير في السلوك القديم)', noPregnancy.microTargets.iron_mg === 12 && noPregnancy.microTargets.calcium_mg === 1000);

  const effPregnancyNormal = resolveEffectiveDietStyle(DIET_STYLE.NORMAL, 'pregnant');
  check('resolveEffectiveDietStyle: النمط العادي أثناء الحمل لا يتأثر (مفيش حاجة يُستبدلها)', effPregnancyNormal.overridden === false);

  // 7) collectConstraints يستخدم فعليًا الاستبدال (وليس مجرد الدالة المستقلة):
  // "عادي" لا ينتج أي قيد أصلًا (buildDietConstraints)، فالتحقق الصحيح إن
  // قيد "كيتو" نفسه (المرفوض من الأساس) غايب تمامًا من القيود المُجمَّعة
  const constraintsPregnantKeto = collectConstraints({ dietStyle: DIET_STYLE.KETO, pregnancyStatus: 'pregnant' });
  const ketoConstraint = constraintsPregnantKeto.find((c) => c.source === 'diet' && c.source_detail === DIET_STYLE.KETO);
  check('collectConstraints: قيد "كيتو" غايب تمامًا أثناء الحمل (تم استبداله بالعادي، ومفيش قيد للعادي)', !ketoConstraint && constraintsPregnantKeto.filter((c) => c.source === 'diet').length === 0);

  const constraintsNonPregnantKeto = collectConstraints({ dietStyle: DIET_STYLE.KETO, pregnancyStatus: 'none' });
  const ketoConstraintNoPregnancy = constraintsNonPregnantKeto.find((c) => c.source === 'diet' && c.source_detail === DIET_STYLE.KETO);
  check('collectConstraints: بدون حمل، قيد "كيتو" موجود فعليًا كالمعتاد', !!ketoConstraintNoPregnancy);
}

console.log('\n=== مكتبة الطعام — فلاتر البحث الذكي (بند 1.2 من برومبت استكمال البنود الناقصة) ===');
{
  const allFoods = getAllFoods();

  // 1) minCalciumMg (الفلتر الجديد المضاف لدعم "غني بالكالسيوم")
  const highCalcium = filterFoods({ minCalciumMg: 100 });
  check('minCalciumMg: كل النتائج فعليًا >= 100mg كالسيوم', highCalcium.every((f) => f.micros.calcium_mg >= 100));
  check('minCalciumMg: النتائج أقل من إجمالي المكتبة (فلترة حقيقية حدثت)', highCalcium.length > 0 && highCalcium.length < allFoods.length);

  // 2) عالي بروتين
  const highProtein = filterFoods({ minProteinG: 15 });
  check('minProteinG: كل النتائج >= 15g بروتين', highProtein.every((f) => f.macros.protein_g >= 15));

  // 3) قليل صوديوم
  const lowSodium = filterFoods({ maxSodiumMg: 140 });
  check('maxSodiumMg: كل النتائج <= 140mg صوديوم', lowSodium.every((f) => f.micros.sodium_mg <= 140));

  // 4) مناسب للكلى (استبعاد CKD)
  const kidneyFriendly = filterFoods({ excludeConditions: [MEDICAL_CONDITION.CKD] });
  check('excludeConditions(CKD): لا يوجد صنف من نتائج "مناسب للكلى" ممنوع لحالة الكلى', kidneyFriendly.every((f) => !f.unsuitable_for_conditions.includes(MEDICAL_CONDITION.CKD)));

  // 5) بدون جلوتين
  const glutenFree = filterFoods({ excludeAllergens: [ALLERGEN.GLUTEN] });
  check('excludeAllergens(GLUTEN): لا يوجد صنف من النتائج يحتوي الجلوتين', glutenFree.every((f) => !f.allergens.includes(ALLERGEN.GLUTEN)));

  // 6) دمج أكتر من فلتر مع بعض (تركيبة كما تُستخدم فعليًا في تاب مكتبة الطعام)
  const combined = filterFoods({ minProteinG: 15, maxSodiumMg: 140 });
  check('دمج فلترين مع بعض: كل النتائج تحقق الشرطين معًا', combined.every((f) => f.macros.protein_g >= 15 && f.micros.sodium_mg <= 140));
  check('دمج فلترين: النتائج أقل من أو تساوي كل فلتر منفرد', combined.length <= highProtein.length && combined.length <= lowSodium.length);

  // 7) بحث نصي بالاسم
  const searchResult = searchFoodsByName('فراخ');
  check('searchFoodsByName: بحث "فراخ" يرجّع نتائج تحتوي الكلمة فعليًا', searchResult.length > 0 && searchResult.every((f) => f.name_ar.toLowerCase().includes('فراخ') || f.name_en.toLowerCase().includes('فراخ')));
  check('searchFoodsByName: بحث بكلمة غير موجودة يرجّع مصفوفة فاضية', searchFoodsByName('xyznonexistentfood123').length === 0);
}

console.log('\n=== مستوى الالتزام بالحمية — صارم مقابل مرن (بند 1.3 من برومبت استكمال البنود الناقصة) ===');
{
  const n = calculateFullNutritionProfile({
    gender: 'male', age: 30, heightCm: 178, weightKg: 85, targetWeightKg: 78,
    activityLevel: ACTIVITY_LEVEL.MODERATE, goal: GOAL.LOSE, timeframeDays: 120, dietStyle: 'normal',
  });
  const share = 0.35;
  const baseRequest = {
    constraintProfile: {},
    mealType: 'lunch',
    targetKcal: n.calorieTarget.targetCalories * share,
    macroTargets: { protein_g: n.macroTargets.protein_g * share, carb_g: n.macroTargets.carb_g * share, fat_g: n.macroTargets.fat_g * share },
    microTargets: n.microTargets,
    minFoodQualityScore: 30,
  };

  const flexibleResult = generateMeal({ ...baseRequest, adherenceLevel: 'flexible' });
  const strictResult = generateMeal({ ...baseRequest, adherenceLevel: 'strict' });
  const defaultResult = generateMeal(baseRequest); // بدون تحديد adherenceLevel أصلًا — لازم يتصرف زي "مرن" (سلوك قديم لا يتغيّر)

  check('توليد "مرن" ينجح', flexibleResult.success && flexibleResult.candidates.length > 0);
  check('توليد "صارم" ينجح برضه', strictResult.success && strictResult.candidates.length > 0);
  check('عدد التركيبات المرشّحة في "صارم" أقل من أو يساوي "مرن" (مجمّع ترشيح أضيق فعليًا)', strictResult.candidates.length <= flexibleResult.candidates.length);
  check('بدون تحديد adherenceLevel: نفس عدد تركيبات "مرن" تمامًا (توافق سلوك قديم)', defaultResult.candidates.length === flexibleResult.candidates.length);

  // القيد الأهم: "صارم" ما يفلوتش أي قيد صحي/ديني/حساسية — بس بيضيّق التنوع
  const strictWithConstraints = generateMeal({
    ...baseRequest,
    adherenceLevel: 'strict',
    constraintProfile: { medicalConditions: [MEDICAL_CONDITION.CKD] },
  });
  const flexibleWithConstraints = generateMeal({
    ...baseRequest,
    adherenceLevel: 'flexible',
    constraintProfile: { medicalConditions: [MEDICAL_CONDITION.CKD] },
  });
  const allowedFoodsStrict = strictWithConstraints.candidates.flatMap((c) => c.items.map((i) => i.food));
  check('"صارم" لا يزال يستبعد نفس الأصناف الممنوعة صحيًا مثل "مرن" تمامًا (القيد الصحي غير متأثر بمستوى الالتزام)',
    allowedFoodsStrict.every((f) => !f.unsuitable_for_conditions.includes(MEDICAL_CONDITION.CKD)));
  check('توليد "صارم" + قيد طبي ينجح أو يعطي تشخيص واضح (مفيش كسر)', typeof strictWithConstraints.success === 'boolean' && typeof flexibleWithConstraints.success === 'boolean');
}

console.log('\n=== LIMIT-01: استبعاد صنف دهون/زيت منفرد كوجبة كاملة (بند 1.4 من برومبت استكمال البنود الناقصة) ===');
{
  // بدون macroTargets: أي تركيبة صنف واحد فقط من فئة "دهون/زيوت" (زيت زيتون
  // مثلًا) يجب ألا تظهر أبدًا ضمن النتائج الناجحة
  const noMacroResult = generateMeal({
    constraintProfile: {},
    mealType: 'lunch',
    targetKcal: 150, // سعرات صغيرة عمدًا تناسب ملعقة زيت لتشجيع النظام يرشّحها لو مفيش القاعدة
    minFoodQualityScore: 0,
  });
  if (noMacroResult.success) {
    const hasStandaloneFatOil = noMacroResult.candidates.some((c) => c.items.length === 1 && c.items[0].food.category === 'fat_oil');
    check('بدون macroTargets: لا توجد أي تركيبة "زيت/دهن منفرد" ضمن النتائج الناجحة', !hasStandaloneFatOil);
  } else {
    check('بدون macroTargets: فشل التوليد بتشخيص واضح (مقبول لو مفيش بدائل تانية) بدل كسر', typeof noMacroResult.diagnosis?.message_ar === 'string');
  }

  // مع macroTargets: القاعدة لا تُطبَّق أصلًا (التركيبات المدفوعة بالماكرو
  // دايمًا بتبدأ ببروتين، فمفيش تركيبة "زيت فقط" تظهر أصلًا في المسار ده)
  const n2 = calculateFullNutritionProfile({
    gender: 'female', age: 27, heightCm: 165, weightKg: 68, targetWeightKg: 60,
    activityLevel: ACTIVITY_LEVEL.LIGHT, goal: GOAL.LOSE, timeframeDays: 90, dietStyle: 'normal',
  });
  const withMacroResult = generateMeal({
    constraintProfile: {},
    mealType: 'lunch',
    targetKcal: n2.calorieTarget.targetCalories * 0.3,
    macroTargets: { protein_g: n2.macroTargets.protein_g * 0.3, carb_g: n2.macroTargets.carb_g * 0.3, fat_g: n2.macroTargets.fat_g * 0.3 },
    minFoodQualityScore: 0,
  });
  check('مع macroTargets: التوليد ينجح كالمعتاد (القاعدة الجديدة ما بتكسرش المسار العادي)', withMacroResult.success && withMacroResult.candidates.length > 0);
}

console.log('\n=== توصيات تفاعلية لثبات/اتجاه الوزن (بند 1.5/12 من الأعمال المتبقية) ===');
{
  // --- Analytics Engine: detectWeightTrendPattern ---
  check('بيانات أقل من 3 نقاط: insufficient_data (not_enough_points)',
    detectWeightTrendPattern([{ date: '2026-01-01', weightKg: 80 }, { date: '2026-01-02', weightKg: 79.9 }]).status === 'insufficient_data');

  check('3 نقاط بمدى زمني أقل من 10 أيام: insufficient_data (range_too_short)',
    detectWeightTrendPattern([
      { date: '2026-01-01', weightKg: 80 }, { date: '2026-01-03', weightKg: 79.8 }, { date: '2026-01-05', weightKg: 79.6 },
    ]).status === 'insufficient_data');

  // بيانات خطية تمامًا: -0.1 كجم/يوم لمدة 14 يوم (15 نقطة) => -0.7 كجم/أسبوع بالظبط
  const linearTrend = Array.from({ length: 15 }, (_, i) => ({
    date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
    weightKg: +(80 - i * 0.1).toFixed(2),
  }));
  const linearPattern = detectWeightTrendPattern(linearTrend);
  check('بيانات خطية كافية: status=ok ومعدل أسبوعي محسوب صح بالانحدار الخطي',
    linearPattern.status === 'ok' && linearPattern.spanDays === 14 && Math.abs(linearPattern.weeklyRateKg - (-0.7)) < 0.01);

  const shuffledTrend = [...linearTrend].reverse(); // ترتيب عكسي — لازم يدّي نفس النتيجة (الدالة بترتّب داخليًا)
  check('ترتيب النقاط (تصاعدي/تنازلي) مايأثرش على نتيجة الانحدار',
    detectWeightTrendPattern(shuffledTrend).weeklyRateKg === linearPattern.weeklyRateKg);

  // --- Recommendation Engine: getWeightStabilityRecommendation ---
  const loseCalorieTarget = { targetCalories: 1800, dailyAdjustment: -500 }; // متوقَّع ≈ -0.4545 كجم/أسبوع
  const gainCalorieTarget = { targetCalories: 2800, dailyAdjustment: 300 };
  const maintainCalorieTarget = { targetCalories: 2200, dailyAdjustment: 0 };

  const insufficientPattern = { status: 'insufficient_data', reason: 'not_enough_points', points: 1 };
  const noRec = getWeightStabilityRecommendation(insufficientPattern, 'lose', loseCalorieTarget, null);
  check('بيانات غير كافية: توصية تشجيع على التسجيل، مش استنتاج', noRec?.type === 'weight_trend_insufficient_data');

  const plateauPattern = { status: 'ok', spanDays: 21, weeklyRateKg: -0.04, points: 6 };
  const plateauGoodAdherence = getWeightStabilityRecommendation(plateauPattern, 'lose', loseCalorieTarget, { trackedDays: 6, compliantDays: 5, adherencePct: 83 });
  check('ثبات وزن (Plateau) + التزام كافٍ: تحذير Plateau صريح', plateauGoodAdherence?.type === 'weight_plateau' && plateauGoodAdherence.severity === RECOMMENDATION_SEVERITY.WARNING);

  const plateauLowAdherence = getWeightStabilityRecommendation(plateauPattern, 'lose', loseCalorieTarget, { trackedDays: 2, compliantDays: 1, adherencePct: 50 });
  check('ثبات وزن ظاهري + التزام غير كافٍ: توصية "غير مؤكد" بدل جزم بـPlateau', plateauLowAdherence?.type === 'weight_plateau_unclear_adherence');

  const tooFastLoss = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: -1.2 }, 'lose', loseCalorieTarget, { trackedDays: 7, compliantDays: 7, adherencePct: 100 });
  check('نزول أسرع من الحد الآمن (>1.0 كجم/أسبوع): تحذير أمان يسبق أي مقارنة بالخطة', tooFastLoss?.type === 'weight_loss_too_fast');

  const tooFastGain = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: 0.7 }, 'gain', gainCalorieTarget, null);
  check('زيادة أسرع من الحد الآمن (>0.5 كجم/أسبوع): تحذير أمان', tooFastGain?.type === 'weight_gain_too_fast');

  const oppositeDirection = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: 0.3 }, 'lose', loseCalorieTarget, null);
  check('الوزن بيزيد رغم هدف خسارة: توصية "عكس الاتجاه"', oppositeDirection?.type === 'weight_moving_opposite_direction');

  const fasterThanExpected = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: -0.8 }, 'lose', loseCalorieTarget, null);
  check('نزول أسرع من المخطَّط لكن ضمن الحد الآمن: توصية معلوماتية "أسرع من المتوقَّع"', fasterThanExpected?.type === 'weight_change_faster_than_expected');

  const onTrack = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: -0.45 }, 'lose', loseCalorieTarget, null);
  check('التقدم مطابق تقريبًا للخطة: null (مفيش داعي لتنبيه)', onTrack === null);

  const maintainFluctuation = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: 0.5 }, 'maintain', maintainCalorieTarget, null);
  check('تذبذب واضح رغم هدف "ثبات الوزن": توصية معلوماتية', maintainFluctuation?.type === 'weight_unexpected_change_at_maintenance');

  const maintainStable = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: 0.1 }, 'maintain', maintainCalorieTarget, null);
  check('ثبات فعلي مع هدف "ثبات الوزن": null (ده بالظبط المطلوب)', maintainStable === null);

  const recompFluctuation = getWeightStabilityRecommendation({ status: 'ok', spanDays: 14, weeklyRateKg: -0.6 }, 'recomp', { targetCalories: 2200, dailyAdjustment: 0 }, null);
  check('تذبذب واضح مع هدف "إعادة تكوين الجسم": توصية معلوماتية بنفس منطق الثبات', recompFluctuation?.type === 'weight_unexpected_change_at_maintenance');
}

console.log('\n=== BMI: Guard دفاعي ضد بيانات تالفة (طول/وزن = صفر أو سالب) — S22 ===');
{
  check('calculateBMI(70, 0) يرجّع null مش Infinity', calculateBMI(70, 0) === null);
  check('calculateBMI(0, 170) يرجّع null مش 0', calculateBMI(0, 170) === null);
  check('calculateBMI(-5, 170) يرجّع null (وزن سالب)', calculateBMI(-5, 170) === null);
  check('calculateBMI(70, -170) يرجّع null (طول سالب)', calculateBMI(70, -170) === null);
  check('calculateBMI(NaN, 170) يرجّع null', calculateBMI(NaN, 170) === null);
  check('calculateBMI(70, 170) (قيم طبيعية) يرجّع نفس الناتج الصحيح القديم (24.2)', calculateBMI(70, 170) === 24.2);

  check('classifyBMI(null) بترجع تصنيف واضح "بيانات غير صالحة" مش تصنّف بصمت كسمنة', classifyBMI(null).label_ar === 'بيانات الطول/الوزن غير صالحة');
  check('classifyBMI(calculateBMI(70, 0)) (المسار الكامل) بيرجع نفس التصنيف الواضح مش "سمنة درجة 3"', classifyBMI(calculateBMI(70, 0)).label_ar === 'بيانات الطول/الوزن غير صالحة');
  check('classifyBMI(24.2) (قيمة طبيعية) لسه شغالة زي قبل الإصلاح', classifyBMI(24.2).label_ar === 'وزن طبيعي');

  check('calculateIdealWeightRange(0) يرجّع null مش {min_kg:0, max_kg:0} غير منطقي', calculateIdealWeightRange(0) === null);
  check('calculateIdealWeightRange(-10) يرجّع null', calculateIdealWeightRange(-10) === null);
  check('calculateIdealWeightRange(170) (قيمة طبيعية) لسه شغالة زي قبل الإصلاح', calculateIdealWeightRange(170)?.min_kg === 53.5);
}

console.log('\n=== استيراد البيانات: تحذير من قيم بروفايل غير منطقية بدل نجاح صامت — S22 ===');
{
  const corruptImport = {
    stores: {
      [STORE.PROFILE]: [{ id: 'current', gender: 'male', age: 30, heightCm: 0, weightKg: 70 }],
    },
  };
  const corruptResult = await importAllData(corruptImport);
  check('استيراد بروفايل بطول = صفر: بينجح جزئيًا لكن بيرجع تحذير واضح (errors)، مش نجاح صامت', corruptResult.errors.some((e) => e.includes('الطول')));

  const corruptWeightImport = {
    stores: {
      [STORE.PROFILE]: [{ id: 'current', gender: 'female', age: 25, heightCm: 165, weightKg: -5 }],
    },
  };
  const corruptWeightResult = await importAllData(corruptWeightImport);
  check('استيراد بروفايل بوزن سالب: بيرجع تحذير واضح', corruptWeightResult.errors.some((e) => e.includes('الوزن')));

  const validImport = {
    stores: {
      [STORE.PROFILE]: [{ id: 'current', gender: 'male', age: 30, heightCm: 178, weightKg: 90 }],
    },
  };
  const validResult = await importAllData(validImport);
  check('استيراد بروفايل بقيم منطقية طبيعية: مفيش أي تحذير عن الطول/الوزن/العمر (السلوك القديم لسه شغال)', !validResult.errors.some((e) => e.includes('الطول') || e.includes('الوزن') || e.includes('العمر')));
}

console.log('\n=== S23: تناقض الهدف مع اتجاه الوزن المستهدف — Guard جديد ===');
{
  const baseP = { gender: 'male', age: 30, heightCm: 178, weightKg: 90, activityLevel: ACTIVITY_LEVEL.MODERATE, timeframeDays: 90, dietStyle: 'normal' };

  const loseButHigherTarget = calculateFullNutritionProfile({ ...baseP, goal: GOAL.LOSE, targetWeightKg: 95 });
  check('هدف "خسارة" + مستهدف أعلى من الحالي: goalTargetMismatch = true', loseButHigherTarget.calorieTarget.goalTargetMismatch === true);
  check('هدف "خسارة" + مستهدف أعلى: سعرات صيانة (= TDEE) مش عجز', loseButHigherTarget.calorieTarget.targetCalories === loseButHigherTarget.tdeeBreakdown.tdee);
  check('هدف "خسارة" + مستهدف أعلى: تحذير عربي واضح موجود', typeof loseButHigherTarget.calorieTarget.warning === 'string' && loseButHigherTarget.calorieTarget.warning.includes('لا يتوافق'));

  const loseEqualTarget = calculateFullNutritionProfile({ ...baseP, goal: GOAL.LOSE, targetWeightKg: 90 });
  check('هدف "خسارة" + مستهدف = الحالي (مفيش فرق فعلي): goalTargetMismatch = true', loseEqualTarget.calorieTarget.goalTargetMismatch === true);

  const gainButLowerTarget = calculateFullNutritionProfile({ ...baseP, goal: GOAL.GAIN, targetWeightKg: 85 });
  check('هدف "زيادة" + مستهدف أقل من الحالي: goalTargetMismatch = true', gainButLowerTarget.calorieTarget.goalTargetMismatch === true);

  const loseConsistent = calculateFullNutritionProfile({ ...baseP, goal: GOAL.LOSE, targetWeightKg: 80 });
  check('هدف "خسارة" + مستهدف أقل (متوافق): مفيش goalTargetMismatch، وفيه عجز فعلي', !loseConsistent.calorieTarget.goalTargetMismatch && loseConsistent.calorieTarget.dailyAdjustment < 0);

  const gainConsistent = calculateFullNutritionProfile({ ...baseP, goal: GOAL.GAIN, targetWeightKg: 95 });
  check('هدف "زيادة" + مستهدف أعلى (متوافق): مفيش goalTargetMismatch، وفيه فائض فعلي', !gainConsistent.calorieTarget.goalTargetMismatch && gainConsistent.calorieTarget.dailyAdjustment > 0);

  const maintainAnyTarget = calculateFullNutritionProfile({ ...baseP, goal: GOAL.MAINTAIN, targetWeightKg: 999 });
  check('هدف "ثبات": الفحص لا ينطبق أصلًا (targetWeightKg غير مستخدَم)', maintainAnyTarget.calorieTarget.goalTargetMismatch === undefined);
}

console.log('\n=== S23: انتشار حراسة بيانات الطول/الوزن التالفة لكل خطة السعرات/الماكرو (مش BMI بس) ===');
{
  const corruptHeight = calculateFullNutritionProfile({
    gender: 'male', age: 30, heightCm: 0, weightKg: 70, targetWeightKg: 65,
    activityLevel: ACTIVITY_LEVEL.MODERATE, goal: GOAL.LOSE, timeframeDays: 90, dietStyle: 'normal',
  });
  check('طول = صفر: dataValidity.valid = false', corruptHeight.dataValidity.valid === false);
  check('طول = صفر: bmr يرجع null (كان بيحسب رقم غلط "شكله سليم")', corruptHeight.bmr === null);
  check('طول = صفر: tdeeBreakdown يرجع null', corruptHeight.tdeeBreakdown === null);
  check('طول = صفر: calorieTarget يرجع null (مش خطة كاملة من رقم تالف)', corruptHeight.calorieTarget === null);
  check('طول = صفر: macroTargets يرجع null', corruptHeight.macroTargets === null);
  check('طول = صفر: microTargets لسه بيترجع (مستقل عن الطول/الوزن)', corruptHeight.microTargets && corruptHeight.microTargets.iron_mg > 0);

  const corruptWeight = calculateFullNutritionProfile({
    gender: 'female', age: 28, heightCm: 165, weightKg: -5, targetWeightKg: 60,
    activityLevel: ACTIVITY_LEVEL.LIGHT, goal: GOAL.LOSE, timeframeDays: 90, dietStyle: 'normal',
  });
  check('وزن سالب: dataValidity.valid = false وcalorieTarget = null', corruptWeight.dataValidity.valid === false && corruptWeight.calorieTarget === null);

  const validProfile = calculateFullNutritionProfile({
    gender: 'male', age: 30, heightCm: 178, weightKg: 85, targetWeightKg: 78,
    activityLevel: ACTIVITY_LEVEL.MODERATE, goal: GOAL.LOSE, timeframeDays: 120, dietStyle: 'normal',
  });
  check('بيانات طبيعية: dataValidity.valid = true وكل الحسابات موجودة (السلوك القديم لسه شغال)',
    validProfile.dataValidity.valid === true && validProfile.calorieTarget !== null && validProfile.bmr !== null);
}

console.log('\n=== S23: تصادم IDs عند نداءات في نفس المللي ثانية — uniqueIdSuffix ===');
{
  const foodsForLog = getAllFoods().slice(0, 1);
  const r1 = await logMeal('2026-07-31', 'lunch', [{ food: foodsForLog[0], grams: 100 }]);
  const r2 = await logMeal('2026-07-31', 'lunch', [{ food: foodsForLog[0], grams: 100 }]);
  check('نداءان متتاليان لـlogMeal بنفس التاريخ/النوع: ids مختلفة (مفيش استبدال صامت)', r1.id !== r2.id);

  const ex1 = await logExercise('2026-07-31', 'ex1', 30, 200);
  const ex2 = await logExercise('2026-07-31', 'ex1', 30, 200);
  check('نداءان متتاليان لـlogExercise: ids مختلفة', ex1.id !== ex2.id);

  const eo1 = await logEatingOutMeal('2026-07-31', 'dinner', 600);
  const eo2 = await logEatingOutMeal('2026-07-31', 'dinner', 600);
  check('نداءان متتاليان لـlogEatingOutMeal: ids مختلفة', eo1.id !== eo2.id);

  const ch1 = await startChallenge(null, { type: 'calorie_streak', targetValue: 10, title_ar: 'اختبار 1' });
  const ch2 = await startChallenge(null, { type: 'calorie_streak', targetValue: 10, title_ar: 'اختبار 2' });
  check('نداءان متتاليان لـstartChallenge (نفس النوع): ids مختلفة (BUG-S23-03 — نفس فئة تصادم Tracking Engine)', ch1.id !== ch2.id);
}


console.log('\n=== S24: فحص إضافي — تعارض قيدين على نفس nutrient_path (Decision Engine) ===');
{
  const foods = getAllFoods();
  // تأكيد سلوك التقاطع: قيود صحية حقيقية (CKD+ضغط) على نفس nutrient_path
  // لازم تتقاطع صح (الأصرم يفوز تلقائيًا بمنطق AND بين كل القيود المستقلة)
  const sodiumConstraints = collectConstraints({ medicalConditions: ['ckd', 'hypertension'] })
    .filter((c) => c.nutrient_path === 'micros.sodium_mg');
  check('CKD+ضغط: قيدان مستقلان على micros.sodium_mg (400 و500) يُبنَيان معًا', sodiumConstraints.length === 2);
  const highSodiumFood = foods.find((f) => f.micros.sodium_mg > 400 && f.micros.sodium_mg <= 500);
  if (highSodiumFood) {
    const { survivors } = applyConstraints([highSodiumFood], sodiumConstraints);
    check('صنف صوديومه بين 400-500: يُستبعد صح مع CKD+ضغط معًا (الحد الأصرم 400 يفوز تلقائيًا بمنطق AND — لا حاجة لمنطق دمج خاص)', survivors.length === 0);
  }
}

console.log('\n=== S24: BUG-S24-02 — createConstraint يرفض limit_value سالب لـNUTRIENT_MAX/MIN ===');
{
  let threwNeg = false;
  try {
    createConstraint({ source: CONSTRAINT_SOURCE.MEDICAL, source_detail: 'x', kind: CONSTRAINT_KIND.NUTRIENT_MAX, nutrient_path: 'macros.kcal', limit_value: -10, message_ar: 'test' });
  } catch (e) { threwNeg = true; }
  check('NUTRIENT_MAX بـlimit_value سالب: يُرفَض عند الإنشاء', threwNeg);

  let threwNegMin = false;
  try {
    createConstraint({ source: CONSTRAINT_SOURCE.MEDICAL, source_detail: 'x', kind: CONSTRAINT_KIND.NUTRIENT_MIN, nutrient_path: 'macros.kcal', limit_value: -1, message_ar: 'test' });
  } catch (e) { threwNegMin = true; }
  check('NUTRIENT_MIN بـlimit_value سالب: يُرفَض عند الإنشاء', threwNegMin);

  // صفر منطقي ومسموح (مثال: "يجب ألا يحتوي سكر مضاف إطلاقًا")
  const zeroOk = createConstraint({ source: CONSTRAINT_SOURCE.MEDICAL, source_detail: 'x', kind: CONSTRAINT_KIND.NUTRIENT_MAX, nutrient_path: 'macros.added_sugar_g', limit_value: 0, message_ar: 'test' });
  check('NUTRIENT_MAX بـlimit_value=0: مسموح (منطقي، ليس خطأ)', zeroOk.limit_value === 0);
}

console.log('\n=== S24: BUG-S24-03 — generateMeal مع targetKcal<=0 يرفض بوضوح بدل توليد جرامات صفر/سالبة "ممتازة" ===');
{
  const constraintProfile = {};
  const zeroResult = generateMeal({ constraintProfile, mealType: 'lunch', targetKcal: 0, minFoodQualityScore: 30 });
  check('targetKcal=0: success=false مع تشخيص واضح (كان قبل كده يرجّع "جرجير 0 جرام" بتقييم 88/ممتاز)', zeroResult.success === false && zeroResult.diagnosis?.stage === 'invalid_input');

  const negResult = generateMeal({ constraintProfile, mealType: 'lunch', targetKcal: -300, minFoodQualityScore: 30 });
  check('targetKcal=-300: success=false مع تشخيص واضح (كان قبل كده يرجّع صنف بجرامات سالبة بتقييم 100/ممتاز)', negResult.success === false && negResult.diagnosis?.stage === 'invalid_input');

  const nanResult = generateMeal({ constraintProfile, mealType: 'lunch', targetKcal: NaN, minFoodQualityScore: 30 });
  check('targetKcal=NaN: success=false مع تشخيص واضح', nanResult.success === false && nanResult.diagnosis?.stage === 'invalid_input');

  // تأكيد عدم كسر السلوك الطبيعي: targetKcal موجب عادي لسه بيولّد وجبة صح
  const normalResult = generateMeal({ constraintProfile, mealType: 'lunch', targetKcal: 500, minFoodQualityScore: 30 });
  check('targetKcal=500 (طبيعي): success=true وكل الجرامات موجبة', normalResult.success === true && normalResult.candidates.every((c) => c.items.every((it) => it.grams > 0)));
}

console.log('\n=== S24: BUG-S24-04 — importAllData يعدّ فقط السجلات المستوردة فعليًا (مش المُتجاهَلة بسبب id ناقص) ===');
{
  const fakeExport = {
    exported_at: new Date().toISOString(), db_version: 1,
    stores: { [STORE.PROFILE]: [{ id: 'p1', heightCm: 170, weightKg: 70, age: 30 }, { heightCm: 180, weightKg: 80, age: 25 }] },
  };
  const result = await importAllData(fakeExport);
  check('سجل بدون id ضمن سجلين: importedCounts يعدّ 1 بس (المكتوب فعليًا) مش 2', result.importedCounts[STORE.PROFILE] === 1);
  check('سجل بدون id: بيظهر في errors (مش success صامت)', result.errors.some((e) => e.includes('بدون id')));

  const fullValid = { exported_at: new Date().toISOString(), db_version: 1, stores: { [STORE.PROFILE]: [{ id: 'p2', heightCm: 170, weightKg: 70, age: 30 }] } };
  const resultValid = await importAllData(fullValid);
  check('استيراد طبيعي (كل السجلات لها id): importedCounts وerrors زي القديم (توافق رجعي)', resultValid.importedCounts[STORE.PROFILE] === 1 && resultValid.errors.length === 0);
}

console.log('\n=== S24: BUG-S24-05 — calculateCaloriesBurned يرفض وزن/مدة غير منطقية بدل سعرات سالبة صامتة ===');
{
  const exercise = getAllExercises()[0];
  check('وزن سالب: يرجع 0 بدل سعرات سالبة (كان بيوصل فعليًا عبر ui/app.js لو بروفايل معطوب من استيراد)', calculateCaloriesBurned(exercise, -70, 30) === 0);
  check('وزن صفر: يرجع 0', calculateCaloriesBurned(exercise, 0, 30) === 0);
  check('مدة سالبة: يرجع 0', calculateCaloriesBurned(exercise, 70, -30) === 0);
  check('مدة صفر: يرجع 0', calculateCaloriesBurned(exercise, 70, 0) === 0);
  check('وزن NaN: يرجع 0', calculateCaloriesBurned(exercise, NaN, 30) === 0);
  // تأكيد عدم كسر السلوك الطبيعي
  check('وزن/مدة طبيعيان: يحسب سعرات موجبة عادي (السلوك القديم لسه شغال)', calculateCaloriesBurned(exercise, 70, 30) > 0);
}

console.log('\n=== S25: BUG-S25-01 — calculateWaterTargetMl وcalculateFullNutritionProfile يرفضوا وزن/BMR غير منطقي بدل قيم سالبة "شكلها سليم" ===');
{
  check('calculateWaterTargetMl(0): يرجع null بدل صفر (مش خطأ لكن يمنع خط ماء بصفر مضلِّل)', calculateWaterTargetMl(0) === null);
  check('calculateWaterTargetMl(-70): يرجع null بدل هدف ماء سالب (-2450 مل)', calculateWaterTargetMl(-70) === null);
  check('calculateWaterTargetMl(NaN): يرجع null بدل NaN', calculateWaterTargetMl(NaN) === null);
  check('calculateWaterTargetMl(70) (طبيعي): يحسب 2450 مل زي القديم بالظبط', calculateWaterTargetMl(70) === 2450);

  // BMR سالب من تركيبة عمر/طول/وزن "تقنيًا موجبة" لكن غير واقعية فسيولوجيًا
  // (كل قيمة لوحدها جوّه الحدود اللي storage-engine بيسمح بيها عند الاستيراد)
  const brokenProfile = { gender: 'male', age: 130, heightCm: 30, weightKg: 2, targetWeightKg: 2, activityLevel: 'sedentary', goal: 'maintain', timeframeDays: 30, dietStyle: 'normal' };
  const brokenResult = calculateFullNutritionProfile(brokenProfile);
  check('BMR سالب (عمر=130/طول=30/وزن=2): dataValidity.valid=false بدل خطة "سليمة الشكل"', brokenResult.dataValidity.valid === false);
  check('BMR سالب: macroTargets=null (كان قبل كده بيرجّع carb_g=-88, fat_g=-26)', brokenResult.macroTargets === null);
  check('BMR سالب: calorieTarget=null (كان قبل كده -576 بدون أي تحذير)', brokenResult.calorieTarget === null);

  // تأكيد عدم كسر السلوك الطبيعي
  const normalProfile = { gender: 'male', age: 30, heightCm: 175, weightKg: 75, targetWeightKg: 70, activityLevel: 'moderate', goal: 'lose', timeframeDays: 60, dietStyle: 'normal' };
  const normalResult = calculateFullNutritionProfile(normalProfile);
  check('بروفايل طبيعي: dataValidity.valid=true وmacroTargets كلها موجبة (السلوك القديم لسه شغال)', normalResult.dataValidity.valid === true && normalResult.macroTargets.carb_g > 0 && normalResult.macroTargets.fat_g > 0 && normalResult.macroTargets.protein_g > 0);
}

console.log('\n=== S25: BUG-S25-02 — replaceMealItem يرجع {success:false} بدل throw لـitemIndex غير صالح ===');
{
  const cp = { allergies: [], medicalConditions: [], religiousFlags: [], dietStyle: 'normal' };
  let threw = false;
  let r1;
  try { r1 = replaceMealItem({ items: [] }, 0, cp); } catch (e) { threw = true; }
  check('currentMeal.items فاضية: بيرجع success:false بدل throw', threw === false && r1?.success === false);
  check('currentMeal.items فاضية: diagnosis_ar فيه رسالة واضحة', typeof r1?.diagnosis_ar === 'string' && r1.diagnosis_ar.length > 0);

  let threw2 = false;
  let r2;
  const fakeItem = { food: { id: 'x', category: 'protein', macros: { kcal: 100 }, suitable_meal_types: ['lunch'] }, grams: 100 };
  try { r2 = replaceMealItem({ items: [fakeItem] }, 5, cp); } catch (e) { threw2 = true; }
  check('itemIndex خارج الحدود: بيرجع success:false بدل throw', threw2 === false && r2?.success === false);
}

console.log('\n=== S25: BUG-S25-06 — وسم "الصيام المسيحي (مسموح فيه السمك)" يرث تلقائيًا كل صنف موسوم "الصيام الصارم" ===');
{
  const foods = getAllFoods();
  const strictTagged = foods.filter((f) => f.religious_tags.includes('christian_fast_strict'));
  const fishAllowedTagged = foods.filter((f) => f.religious_tags.includes('christian_fast_fish_allowed'));
  check('كل صنف موسوم "الصيام الصارم" موسوم كمان "مسموح فيه السمك" (توريث صحيح)', strictTagged.every((f) => f.religious_tags.includes('christian_fast_fish_allowed')));
  check('عدد الأصناف "مسموح فيه السمك" >= عدد "الصيام الصارم" (منطقيًا أقل تشددًا)', fishAllowedTagged.length >= strictTagged.length);

  const fishAllowedMeal = generateMeal({ constraintProfile: { allergies: [], medicalConditions: [], dietStyle: 'normal', fastingTag: 'christian_fast_fish_allowed' }, mealType: 'lunch', targetKcal: 600, minFoodQualityScore: 0 });
  const strictMeal = generateMeal({ constraintProfile: { allergies: [], medicalConditions: [], dietStyle: 'normal', fastingTag: 'christian_fast_strict' }, mealType: 'lunch', targetKcal: 600, minFoodQualityScore: 0 });
  check('توليد وجبة وقت "مسموح فيه السمك" يرجّع مرشحين >= وقت "الصارم" (كان معكوسًا: 154 مقابل 1013)', fishAllowedMeal.candidates.length >= strictMeal.candidates.length);
}

process.exit(fail > 0 ? 1 : 0);
