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
import { calculateFullNutritionProfile, calculateWaterTargetMl, calculateBMR, calculateTDEEBreakdown, ACTIVITY_LEVEL, GOAL, calculateBMI, classifyBMI, calculateIdealWeightRange } from '../core/nutrition-engine/nutrition-engine.js';
import { generateMeal, replaceMealItem, updateMealItemPortion } from '../core/meal-engine/meal-generation-engine.js';
import { computeMealQualityScore } from '../core/meal-engine/meal-quality.js';
import { MEDICAL_CONDITION, ALLERGEN, ALLERGY_SEVERITY, DIET_STYLE, createEmptyMacros, createEmptyMicros } from '../core/food-library/schema.js';
import { STORE, putRecord, getRecord, exportAllData, importAllData, clearAllData, getAllRecords as getAllRecordsRaw } from '../core/storage/storage-engine.js';
import { getAllExercises, filterExercisesForConditions, calculateCaloriesBurned } from '../core/exercise-engine/exercise-engine.js';
import { logMeal, logExercise, computeDailyTotals, logDailyMetrics, getDailyMetrics, logEatingOutMeal } from '../core/tracking-engine/tracking-engine.js';
import { startChallenge, updateChallengeProgress, calculateStreak } from '../core/gamification-engine/gamification-engine.js';
import { getCalorieTrend, compareBestWorstWeek, getWeightTrend, getWaterTrend, getBodyCompositionTrend, detectWeightTrendPattern } from '../core/analytics-engine/analytics-engine.js';
import { getFoodById, filterFoods, searchFoodsByName } from '../core/food-library/food-library.js';
import { getInstantRecommendations, getGeneralTips, getAdherenceTip, getWeightStabilityRecommendation, RECOMMENDATION_SEVERITY } from '../core/recommendation-engine/recommendation-engine.js';
import {
  estimateBodyFatPercentNavy, resolveBodyFatPercent, calculateRemainingMealBudget, calculateCalorieTarget,
} from '../core/nutrition-engine/nutrition-engine.js';
import { deleteRecord } from '../core/storage/storage-engine.js';
import { validateFoodItem } from '../core/food-library/schema.js';

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

// S70: توسيم قصور الغدة الدرقية (hypothyroidism) — خضروات صليبية خام +
// منتجات صويا. نطاق ضيق ومقصود (راجع audits/s70/fix_s70_hypothyroidism.mjs)
{
  const rawBroccoli = getFoodById('food_4904'); // بروكلي، unprocessed
  const tofu = getFoodById('food_4228'); // توفو
  const cookedCauliflowerStew = getFoodById('food_2615'); // صينية قرنبيط بصلصة الطماطم — مطبوخ
  check('بروكلي خام موسوم unsuitable لقصور الغدة الدرقية', !!rawBroccoli && rawBroccoli.unsuitable_for_conditions.includes('hypothyroidism'));
  check('توفو موسوم unsuitable لقصور الغدة الدرقية', !!tofu && tofu.unsuitable_for_conditions.includes('hypothyroidism'));
  check('صنف قرنبيط مطبوخ (طاجن/صينية) مش موسوم — الطهي بيقلل الجويتروجينات، النطاق مقصود على الخام بس', !!cookedCauliflowerStew && !cookedCauliflowerStew.unsuitable_for_conditions.includes('hypothyroidism'));
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

console.log('\n=== S26: clearAllData — زرار "إعادة تعيين كل البيانات" بالإعدادات ===');
{
  // نملأ أكتر من Store بسجلات فعلية أولًا (مش بس PROFILE) عشان نتأكد إن
  // المسح شامل كل الـStores مش واحد بس.
  await putRecord(STORE.PROFILE, { id: 'current', name: 'مستخدم قبل المسح' });
  await putRecord(STORE.MEAL_LOGS, { id: 'meal-1', date: '2026-08-01', mealType: 'lunch' });
  await putRecord(STORE.DAILY_TRACKING, { id: '2026-08-01', weightKg: 80 });
  await putRecord(STORE.EXERCISE_LOGS, { id: 'ex-1', exerciseId: 'e1' });
  await putRecord(STORE.CHALLENGES, { id: 'ch-1', type: 'water_streak' });

  const beforeProfile = await getRecord(STORE.PROFILE, 'current');
  check('قبل المسح: البروفايل موجود فعليًا', beforeProfile?.name === 'مستخدم قبل المسح');

  await clearAllData();

  const afterProfile = await getRecord(STORE.PROFILE, 'current');
  const afterMeals = await getAllRecordsRaw(STORE.MEAL_LOGS);
  const afterTracking = await getAllRecordsRaw(STORE.DAILY_TRACKING);
  const afterExercise = await getAllRecordsRaw(STORE.EXERCISE_LOGS);
  const afterChallenges = await getAllRecordsRaw(STORE.CHALLENGES);

  check('بعد المسح: البروفايل اختفى', afterProfile === undefined);
  check('بعد المسح: سجلات الوجبات كلها اتمسحت', afterMeals.length === 0);
  check('بعد المسح: التتبع اليومي اتمسح', afterTracking.length === 0);
  check('بعد المسح: سجلات التمارين اتمسحت', afterExercise.length === 0);
  check('بعد المسح: التحديات اتمسحت', afterChallenges.length === 0);

  // التأكد إن قاعدة البيانات لسه شغّالة وقابلة للكتابة بعد المسح (مش
  // اتقفلت أو اتلفت الاتصال بيها)
  await putRecord(STORE.PROFILE, { id: 'current', name: 'مستخدم بعد المسح' });
  const rewritten = await getRecord(STORE.PROFILE, 'current');
  check('قاعدة البيانات لسه قابلة للكتابة فعليًا بعد المسح', rewritten?.name === 'مستخدم بعد المسح');
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

    // Fix (تحسين أداء): preloadedMealLogs اختياري — لازم يرجّع نفس النتيجة بالظبط
    // سواء اتنادت الدالة بيه أو من غيره (تحسين قراءة الـstore، مش تغيير سلوك)
    const preloaded = await getAllRecordsRaw(STORE.MEAL_LOGS);
    const dailyPreloaded = await computeDailyTotals('2026-08-01', getFoodById, preloaded);
    check(
      'computeDailyTotals مع preloadedMealLogs بترجع نفس نتيجة القراءة العادية بالظبط',
      JSON.stringify(dailyPreloaded) === JSON.stringify(daily),
    );
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

  // 8) S70: الحديد لمرضى الأنيميا — تحذير مخصَّص فقط لما الحديد الفعلي أقل
  // بوضوح من الهدف *و* الأنيميا موجودة بالبروفايل (مش تحذير عام لغير المصابين)
  const lowIronTotals = {
    nutrition: {
      kcal: nutritionProfile.calorieTarget.targetCalories,
      protein_g: nutritionProfile.macroTargets.protein_g,
      carbs_g: nutritionProfile.macroTargets.carb_g,
      fat_g: nutritionProfile.macroTargets.fat_g,
      saturated_fat_g: 2,
      sodium_mg: 500,
      iron_mg: nutritionProfile.microTargets.iron_mg * 0.3,
    },
  };
  const lowIronAnemiaRecs = getInstantRecommendations(lowIronTotals, nutritionProfile, [MEDICAL_CONDITION.ANEMIA]);
  const ironRec = lowIronAnemiaRecs.find((r) => r.type === 'iron_low_anemia');
  check('أنيميا + حديد فعلي أقل من 70% من الهدف: تحذير حديد مخصَّص يظهر', !!ironRec && ironRec.severity === RECOMMENDATION_SEVERITY.WARNING);
  const lowIronNoAnemiaRecs = getInstantRecommendations(lowIronTotals, nutritionProfile, []);
  check('نفس نقص الحديد بدون تشخيص أنيميا: مفيش تحذير حديد (مش عام لكل الناس)', !lowIronNoAnemiaRecs.some((r) => r.type === 'iron_low_anemia'));
  const okIronTotals = { nutrition: { ...lowIronTotals.nutrition, iron_mg: nutritionProfile.microTargets.iron_mg } };
  const okIronRecs = getInstantRecommendations(okIronTotals, nutritionProfile, [MEDICAL_CONDITION.ANEMIA]);
  check('أنيميا + حديد كافٍ (100% من الهدف): مفيش تحذير حديد', !okIronRecs.some((r) => r.type === 'iron_low_anemia'));
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

console.log('\n=== S71: تركيبات "طبق حقيقي (composite_meal) + صنف جانبي" (بطلب المستخدم — مثال رز/فريك + لحمة + سلطة) ===');
{
  const request = {
    constraintProfile: {},
    mealType: 'lunch',
    targetKcal: 700,
    macroTargets: { protein_g: 45, carb_g: 70, fat_g: 20 },
    minFoodQualityScore: 0,
    macroMarginPct: 0.3,
  };
  const result = generateMeal(request);
  check('التوليد بنجاح مع أهداف ماكرو واقعية', result.success && result.candidates.length > 0);

  const compositeBaseCandidates = result.candidates.filter((c) => c.items.length > 1 && c.items[0].food.category === 'composite_meal');
  check('توجد تركيبات "طبق حقيقي + صنف جانبي" فعليًا ضمن النتائج (مش مجرد صنف composite_meal لوحده)', compositeBaseCandidates.length > 0);
  check('كل قاعدة composite_meal بحصة واقعية (≥30 جم) — مفيش تركيبة بكمية أساس تافهة', compositeBaseCandidates.every((c) => c.items[0].grams >= 30));

  // كل تركيبة من النوع ده لازم تكون فعليًا داخل هامش الماكرو المطلوب فعلًا —
  // نفس البوابة العادية لأي تركيبة تانية (isWithinMacroMargin مطبَّقة مركزيًا
  // في generateMeal على كل الـcandidates بدون تمييز)، فبما إنها موجودة أصلًا
  // في result.candidates.filter(c=>c.success!==false) فده كافٍ كتأكيد؛ هنا
  // بس نتأكد إن البروتين مش صفر (يعني الصنف الجانبي فعلًا اتضاف مش تجاهل)
  check('تركيبات "طبق+جانب" فيها بروتين حقيقي مضاف من الصنف الجانبي (مش بس قاعدة الكارب)', compositeBaseCandidates.every((c) => c.items[1].food.macros.protein_g > 0));

  // أفضل تركيبة من النوع ده لازم يكون score محسوب فعليًا (نفس مسار التقييم العادي)
  if (compositeBaseCandidates.length > 0) {
    const best = compositeBaseCandidates.sort((a, b) => b.qualityScore - a.qualityScore)[0];
    check('أفضل تركيبة "طبق+جانب" ليها qualityScore رقمي صالح (0-100)', typeof best.qualityScore === 'number' && best.qualityScore >= 0 && best.qualityScore <= 100);
  }

  // بدون macroTargets: المسار ده لازم يرجع مصفوفة فاضية (نفس شرط buildMacroDrivenCandidates تمامًا — بيعتمد على وجود أهداف ماكرو)
  const noMacroResult = generateMeal({ constraintProfile: {}, mealType: 'lunch', targetKcal: 500, minFoodQualityScore: 0 });
  const hasCompositeBasePairWithoutMacro = noMacroResult.candidates.some((c) => c.items.length > 1 && c.items[0].food.category === 'composite_meal');
  check('بدون macroTargets: مفيش أي تركيبة "طبق+جانب" (القيد يعتمد على وجود أهداف ماكرو، زي buildMacroDrivenCandidates بالظبط)', !hasCompositeBasePairWithoutMacro);

  // S72 (بطلب المستخدم بعد ملاحظة فعلية): الغداء لازم يفضّل بروتين حيواني
  // حقيقي (فئة protein) كصنف جانبي، مش بقوليات — الفطار/العشاء يفضلوا زي ما هما (بدون تفضيل)
  const lunchResult = generateMeal({ ...request, mealType: 'lunch' });
  const lunchCompositeBase = lunchResult.candidates.filter((c) => c.items.length > 1 && c.items[0].food.category === 'composite_meal');
  check('الغداء: تركيبات "طبق+جانب" فيها صنف بروتين حيواني حقيقي (فئة protein) موجودة فعليًا', lunchCompositeBase.some((c) => c.items[1].food.category === 'protein'));
  check('الغداء: مفيش أي تركيبة "طبق+جانب" فيها بقوليات كصنف جانبي (البروتين الحيواني بقى الأولوية)', !lunchCompositeBase.some((c) => c.items[1].food.category === 'legume'));

  const breakfastResult = generateMeal({ ...request, mealType: 'breakfast' });
  const breakfastCompositeBase = breakfastResult.candidates.filter((c) => c.items.length > 1 && c.items[0].food.category === 'composite_meal');
  check('الفطار: لسه مسموح بصنف جانبي بقولي (سلوك قديم بدون تغيير — فول/عدس فطار واقعي)', breakfastCompositeBase.length === 0 || breakfastCompositeBase.some((c) => c.items[1].food.category === 'legume' || c.items[1].food.category === 'protein'));

  // نفس السلوك في buildMacroDrivenCandidates العادية (بروتين+كارب، مش بس مسار طبق+جانب)
  const lunchProteinCarb = lunchResult.candidates.filter((c) => c.items.length >= 2 && (c.items[0].food.category === 'protein' || c.items[0].food.category === 'legume') && c.items[1].food.category === 'carb');
  check('الغداء: تركيبات بروتين+كارب العادية برضه بتفضّل بروتين حيواني حقيقي مش بقوليات', lunchProteinCarb.length === 0 || lunchProteinCarb.every((c) => c.items[0].food.category === 'protein'));
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

console.log('\n=== S25 (بطلب المستخدم): سيناريوهات مُستخرَجة من سويت اختبارات "مرشدك الصحي" القديم — مش الملفات نفسها (بنية مختلفة تمامًا)، لكن القيم/السيناريوهات السريرية الحقيقية اتنقلت وأُعيد كتابتها ضد محرك المشروع الحالي ===');
{
  // -----------------------------------------------------------------------
  // Golden BMR/TDEE — 8 حالة Mifflin-St Jeor مُتحقَّق منها فعليًا ضد قيم
  // مرشدك المرجعية (GBR01-08) قبل الإضافة هنا؛ القيم الـ8 طابقت 100% لأن
  // Mifflin-St Jeor معادلة سريرية ثابتة مش تفصيلة تنفيذ خاصة بمرشدك.
  // TDEE: قيم مرشدك المرجعية (tdee = bmr × معامل النشاط فقط) اتفحصت وطلعت
  // *مش* قابلة للنقل المباشر — محركنا بيضيف TEF (الأثر الحراري للطعام)
  // كمكوّن منفصل فوق bmr×معامل (فرق تصميم متعمَّد وموثَّق في نفس الملف،
  // مش باج). فالقيم التحتية دي مُقفَّلة من ناتج محركنا نفسه (Golden Case
  // بالمعنى الصحيح: نقطة مرجعية تحمي من Regression مستقبلي)، مش من مرشدك.
  // -----------------------------------------------------------------------
  const GOLDEN_BMR_TDEE = [
    { id: 'GBR01', gender: 'male', age: 30, heightCm: 175, weightKg: 75, activityLevel: 'light', bmr: 1699, tdee: 2571 },
    { id: 'GBR02', gender: 'female', age: 35, heightCm: 163, weightKg: 70, activityLevel: 'sedentary', bmr: 1383, tdee: 1826 },
    { id: 'GBR03', gender: 'male', age: 28, heightCm: 178, weightKg: 80, activityLevel: 'moderate', bmr: 1778, tdee: 3032 },
    { id: 'GBR04', gender: 'male', age: 55, heightCm: 170, weightKg: 90, activityLevel: 'sedentary', bmr: 1693, tdee: 2235 },
    { id: 'GBR05', gender: 'female', age: 50, heightCm: 173, weightKg: 85, activityLevel: 'light', bmr: 1520, tdee: 2300 },
    { id: 'GBR06', gender: 'male', age: 60, heightCm: 168, weightKg: 75, activityLevel: 'sedentary', bmr: 1505, tdee: 1987 },
    { id: 'GBR07', gender: 'male', age: 58, heightCm: 172, weightKg: 95, activityLevel: 'sedentary', bmr: 1740, tdee: 2297 },
    { id: 'GBR08', gender: 'female', age: 25, heightCm: 162, weightKg: 60, activityLevel: 'moderate', bmr: 1327, tdee: 2262 },
  ];
  for (const c of GOLDEN_BMR_TDEE) {
    const bmr = calculateBMR({ gender: c.gender, age: c.age, heightCm: c.heightCm, weightKg: c.weightKg });
    check(`${c.id}: BMR = ${c.bmr} (طابق مرجع مرشدك 100% — Mifflin-St Jeor معادلة ثابتة)`, bmr.value === c.bmr);
    const tdee = calculateTDEEBreakdown(bmr.value, c.activityLevel);
    check(`${c.id}: TDEE = ${c.tdee} (مُقفَّل من ناتج محركنا، بعد TEF — مش رقم مرشدك المباشر)`, tdee.tdee === c.tdee);
  }

  // -----------------------------------------------------------------------
  // بيانات أكل حقيقية (صوديوم/بوتاسيوم/فوسفور/دهون مشبعة لكل 100 جم) من
  // سويت مرشدك — مُختبَرة هنا ضد حدود محرك المشروع *الحالي* فعليًا
  // (EXTRA_NUTRIENT_RULES في medical-engine.js)، مش ضد استنتاجات مرشدك
  // (تختلف الحدود الدقيقة بين المشروعين — هنا الأساس هو حدودنا احنا).
  // -----------------------------------------------------------------------
  function foodWithMicros(micros) {
    return { macros: createEmptyMacros(), micros: { ...createEmptyMicros(), ...micros } };
  }
  const REAL_FOODS = {
    rice: { sodium_mg: 1, potassium_mg: 35, phosphorus_mg: 30 },
    banana_ripe: { sodium_mg: 1, potassium_mg: 422, phosphorus_mg: 22 },
    chicken_grilled: { sodium_mg: 85, potassium_mg: 290, phosphorus_mg: 220 },
    egg: { sodium_mg: 124, potassium_mg: 126, phosphorus_mg: 172 },
    luncheon: { sodium_mg: 800, potassium_mg: 200, phosphorus_mg: 100 },
    mortadella: { sodium_mg: 900, potassium_mg: 220, phosphorus_mg: 120 },
    canned_tuna: { sodium_mg: 421, potassium_mg: 300, phosphorus_mg: 200 },
    cheddar: { sodium_mg: 620, potassium_mg: 98, phosphorus_mg: 512 },
    anchovy: { sodium_mg: 3667, potassium_mg: 392, phosphorus_mg: 252 },
  };
  const REAL_FATS = { butter: 52, margarine_hydrogenated: 15, cheddar: 9, mortadella: 3, chicken_liver: 3, rice: 0.1, banana: 0.1 };

  const ckdConstraints = buildMedicalConstraints([MEDICAL_CONDITION.CKD]);
  const ckdDialysisConstraints = buildMedicalConstraints([MEDICAL_CONDITION.CKD_DIALYSIS]);
  const hypertensionConstraints = buildMedicalConstraints([MEDICAL_CONDITION.HYPERTENSION]);
  const dyslipidemiaConstraints = buildMedicalConstraints([MEDICAL_CONDITION.DYSLIPIDEMIA]);

  const sodiumMaxCkd = ckdConstraints.find((c) => c.nutrient_path === 'micros.sodium_mg');
  const potassiumMaxCkd = ckdConstraints.find((c) => c.nutrient_path === 'micros.potassium_mg');
  const phosphorusMaxCkd = ckdConstraints.find((c) => c.nutrient_path === 'micros.phosphorus_mg');
  const potassiumMaxDialysis = ckdDialysisConstraints.find((c) => c.nutrient_path === 'micros.potassium_mg');
  const sodiumMaxHtn = hypertensionConstraints.find((c) => c.nutrient_path === 'micros.sodium_mg');
  const satFatMaxDyslipid = dyslipidemiaConstraints.find((c) => c.nutrient_path === 'macros.saturated_fat_g');

  // بوتاسيوم: موز ناضج (422) أعلى من حد الكلى عندنا (300) — لازم يُرفَض
  check('CKD: موز ناضج (بوتاسيوم 422mg) يُرفَض — أعلى من حدنا (300mg)', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.banana_ripe), potassiumMaxCkd));
  check('CKD: أرز أبيض (بوتاسيوم 35mg) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.rice), potassiumMaxCkd));
  // صوديوم: مرتديلا (900) وأنشوجة (3667) أعلى بكتير من حدنا (400) — لازم يُرفَضوا
  check('CKD: مرتديلا (صوديوم 900mg) تُرفَض — أعلى من حدنا (400mg)', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.mortadella), sodiumMaxCkd));
  check('CKD: أنشوجة (صوديوم 3667mg) تُرفَض بوضوح', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.anchovy), sodiumMaxCkd));
  // فوسفور: جبنة شيدر (512) أعلى من حدنا (180) — لازم تُرفَض
  check('CKD: جبنة شيدر (فوسفور 512mg) تُرفَض — أعلى من حدنا (180mg)', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.cheddar), phosphorusMaxCkd));
  check('CKD: دجاج مشوي (فوسفور 220mg) يُرفَض — أعلى من حدنا (180mg) رغم إنه أكل "صحي" عمومًا', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.chicken_grilled), phosphorusMaxCkd));

  // غسيل كلوي: حده أشد من الكلى العادي — موز عادي (358 مذكور بمصدر تاني)
  // برضه هيترفض، وبيضة (بوتاسيوم 126) تتقبل
  check('غسيل كلوي: بيضة (بوتاسيوم 126mg) تُقبَل — أقل من حد الغسيل (250mg)', evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.egg), potassiumMaxDialysis));
  check('غسيل كلوي: تونة معلبة (بوتاسيوم 300mg) تُرفَض — أعلى من حد الغسيل الأشد (250mg)', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.canned_tuna), potassiumMaxDialysis));

  // ضغط الدم: حد الصوديوم عندنا 500mg/حصة — لانشون (800) يترفض، دجاج مشوي (85) يتقبل
  check('ضغط الدم: لانشون دجاج (صوديوم 800mg) يُرفَض — أعلى من حدنا (500mg)', !evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.luncheon), sodiumMaxHtn));
  check('ضغط الدم: دجاج مشوي (صوديوم 85mg) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWithMicros(REAL_FOODS.chicken_grilled), sodiumMaxHtn));

  // ارتفاع الدهون: زبدة (دهون مشبعة 52g) ومرجرين مهدرج (15g) أعلى بكتير من حدنا (5g)
  function foodWithSatFat(satFatG) {
    return { macros: { ...createEmptyMacros(), saturated_fat_g: satFatG }, micros: createEmptyMicros() };
  }
  check('ارتفاع الدهون: زبدة (دهون مشبعة 52g) تُرفَض بوضوح — أعلى من حدنا (5g)', !evaluateFoodAgainstConstraint(foodWithSatFat(REAL_FATS.butter), satFatMaxDyslipid));
  check('ارتفاع الدهون: مرجرين مهدرج (دهون مشبعة 15g) يُرفَض — أعلى من حدنا (5g)', !evaluateFoodAgainstConstraint(foodWithSatFat(REAL_FATS.margarine_hydrogenated), satFatMaxDyslipid));
  check('ارتفاع الدهون: أرز أبيض (دهون مشبعة 0.1g) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWithSatFat(REAL_FATS.rice), satFatMaxDyslipid));

  // -----------------------------------------------------------------------
  // S68: أول شبكة أمان رقمية لـ4 من الـ8 حالات اللي كانت بلا أي تأثير فلترة
  // فعلي (heart_disease, pcos, gerd, osteoporosis) — راجع S67 لتفاصيل
  // الاكتشاف. liver_disease/hypothyroidism/anemia اتأجّلوا عمدًا (تعليق في
  // medical-engine.js يشرح السبب لكل واحدة).
  // -----------------------------------------------------------------------
  const heartDiseaseConstraints = buildMedicalConstraints([MEDICAL_CONDITION.HEART_DISEASE]);
  const pcosConstraints = buildMedicalConstraints([MEDICAL_CONDITION.PCOS]);
  const gerdConstraints = buildMedicalConstraints([MEDICAL_CONDITION.GERD]);
  const osteoporosisConstraints = buildMedicalConstraints([MEDICAL_CONDITION.OSTEOPOROSIS]);

  const satFatMaxHeart = heartDiseaseConstraints.find((c) => c.nutrient_path === 'macros.saturated_fat_g');
  const sodiumMaxHeart = heartDiseaseConstraints.find((c) => c.nutrient_path === 'micros.sodium_mg');
  const cholesterolMaxHeart = heartDiseaseConstraints.find((c) => c.nutrient_path === 'macros.cholesterol_mg');
  const giMaxPcos = pcosConstraints.find((c) => c.nutrient_path === 'gi');
  const addedSugarMaxPcos = pcosConstraints.find((c) => c.nutrient_path === 'macros.added_sugar_g');
  const fatMaxGerd = gerdConstraints.find((c) => c.nutrient_path === 'macros.fat_g');
  const sodiumMaxOsteo = osteoporosisConstraints.find((c) => c.nutrient_path === 'micros.sodium_mg');

  function foodWith(macrosPatch, microsPatch) {
    return { macros: { ...createEmptyMacros(), ...macrosPatch }, micros: { ...createEmptyMicros(), ...microsPatch } };
  }
  function foodWithGi(giValue) {
    return { macros: createEmptyMacros(), micros: createEmptyMicros(), gi: giValue };
  }

  // أمراض القلب: زبدة (دهون مشبعة 52g) ترفض، لانشون (صوديوم 800) ترفض، بيضة (كوليسترول ~372/100g) ترفض
  check('أمراض القلب: زبدة (دهون مشبعة 52g) تُرفَض — أعلى من حدنا (5g)', !evaluateFoodAgainstConstraint(foodWith({ saturated_fat_g: REAL_FATS.butter }), satFatMaxHeart));
  check('أمراض القلب: أرز أبيض (دهون مشبعة 0.1g) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({ saturated_fat_g: REAL_FATS.rice }), satFatMaxHeart));
  check('أمراض القلب: لانشون دجاج (صوديوم 800mg) يُرفَض — أعلى من حدنا (500mg)', !evaluateFoodAgainstConstraint(foodWith({}, { sodium_mg: REAL_FOODS.luncheon.sodium_mg }), sodiumMaxHeart));
  check('أمراض القلب: دجاج مشوي (صوديوم 85mg) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({}, { sodium_mg: REAL_FOODS.chicken_grilled.sodium_mg }), sodiumMaxHeart));
  check('أمراض القلب: بيضة (كوليسترول 372mg/100جم) تُرفَض — أعلى من حدنا (60mg)', !evaluateFoodAgainstConstraint(foodWith({ cholesterol_mg: 372 }), cholesterolMaxHeart));
  check('أمراض القلب: أرز أبيض (كوليسترول 0mg — نباتي) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({ cholesterol_mg: 0 }), cholesterolMaxHeart));

  // تكيّس المبايض: خبز أبيض (GI~75) يُرفَض، عدس (GI~32) يُقبَل، لحمة (gi=-1 غير منطبق) تُقبَل تلقائيًا
  check('تكيّس المبايض: خبز أبيض (GI=75) يُرفَض — أعلى من حدنا (55)', !evaluateFoodAgainstConstraint(foodWithGi(75), giMaxPcos));
  check('تكيّس المبايض: عدس (GI=32) يُقبَل — منخفض المؤشر', evaluateFoodAgainstConstraint(foodWithGi(32), giMaxPcos));
  check('تكيّس المبايض: صنف gi=-1 (غير منطبق، زي اللحوم) يُقبَل تلقائيًا بلا استبعاد خاطئ', evaluateFoodAgainstConstraint(foodWithGi(-1), giMaxPcos));
  check('تكيّس المبايض: حلوى بسكريات مضافة 20g تُرفَض — أعلى من حدنا (5g)', !evaluateFoodAgainstConstraint(foodWith({ added_sugar_g: 20 }), addedSugarMaxPcos));
  check('تكيّس المبايض: أرز أبيض (سكريات مضافة 0g) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({ added_sugar_g: 0 }), addedSugarMaxPcos));

  // ارتجاع المريء: مقلي عالي الدهون (30g/100g) يُرفَض، صدر فرخة مسلوق (فقير الدهون) يُقبَل
  check('ارتجاع المريء: صنف مقلي (دهون 30g) يُرفَض — أعلى من حدنا (20g)', !evaluateFoodAgainstConstraint(foodWith({ fat_g: 30 }), fatMaxGerd));
  check('ارتجاع المريء: صدر فرخة مسلوق (دهون 3.5g) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({ fat_g: 3.5 }), fatMaxGerd));

  // هشاشة العظام: أنشوجة (صوديوم 3667mg) تُرفَض، أرز أبيض (صوديوم 1mg) يُقبَل
  check('هشاشة العظام: أنشوجة (صوديوم 3667mg) تُرفَض — أعلى من حدنا (700mg)', !evaluateFoodAgainstConstraint(foodWith({}, { sodium_mg: REAL_FOODS.anchovy.sodium_mg }), sodiumMaxOsteo));
  check('هشاشة العظام: أرز أبيض (صوديوم 1mg) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({}, { sodium_mg: REAL_FOODS.rice.sodium_mg }), sodiumMaxOsteo));

  // S69: أمراض الكبد — صوديوم/سكريات مضافة/دهون مشبعة (بدون أي لمس للبروتين
  // عمدًا — راجع تعليق medical-engine.js لسبب الاستثناء)
  const liverDiseaseConstraints = buildMedicalConstraints([MEDICAL_CONDITION.LIVER_DISEASE]);
  const sodiumMaxLiver = liverDiseaseConstraints.find((c) => c.nutrient_path === 'micros.sodium_mg');
  const addedSugarMaxLiver = liverDiseaseConstraints.find((c) => c.nutrient_path === 'macros.added_sugar_g');
  const satFatMaxLiver = liverDiseaseConstraints.find((c) => c.nutrient_path === 'macros.saturated_fat_g');
  const proteinRuleLiver = liverDiseaseConstraints.find((c) => c.nutrient_path === 'macros.protein_g');

  check('أمراض الكبد: أنشوجة (صوديوم 3667mg) تُرفَض — أعلى من حدنا (500mg)', !evaluateFoodAgainstConstraint(foodWith({}, { sodium_mg: REAL_FOODS.anchovy.sodium_mg }), sodiumMaxLiver));
  check('أمراض الكبد: أرز أبيض (صوديوم 1mg) يُقبَل بأمان', evaluateFoodAgainstConstraint(foodWith({}, { sodium_mg: REAL_FOODS.rice.sodium_mg }), sodiumMaxLiver));
  check('أمراض الكبد: حلوى بسكريات مضافة 20g تُرفَض — أعلى من حدنا (5g)', !evaluateFoodAgainstConstraint(foodWith({ added_sugar_g: 20 }), addedSugarMaxLiver));
  check('أمراض الكبد: زبدة (دهون مشبعة 52g) تُرفَض — أعلى من حدنا (5g)', !evaluateFoodAgainstConstraint(foodWith({ saturated_fat_g: REAL_FATS.butter }), satFatMaxLiver));
  check('أمراض الكبد: مفيش أي قيد على البروتين إطلاقًا (عمدًا — يتناقض حسب المرحلة)', proteinRuleLiver === undefined);

  // hypothyroidism/anemia: لسه بلا أي قاعدة رقمية عمدًا (موثَّق بالتعليق بالكود) — نتأكد إن مفيش قيود اتضافت غلط
  check('قصور الغدة الدرقية: لسه بلا قاعدة رقمية إضافية (يحتاج توسيم فئة/مكوّنات لا حد رقمي)', buildMedicalConstraints([MEDICAL_CONDITION.HYPOTHYROIDISM]).filter((c) => c.kind === CONSTRAINT_KIND.NUTRIENT_MAX || c.kind === CONSTRAINT_KIND.NUTRIENT_MIN).length === 0);
  check('الأنيميا: لسه بلا قاعدة رقمية إضافية (احتياج توصية لا استبعاد — خارج نطاق هذا المحرك)', buildMedicalConstraints([MEDICAL_CONDITION.ANEMIA]).filter((c) => c.kind === CONSTRAINT_KIND.NUTRIENT_MAX || c.kind === CONSTRAINT_KIND.NUTRIENT_MIN).length === 0);
}

// S78 (طبقة 5.1): calculateCalorieTarget كانت بلا أي اختبار مباشر إطلاقًا رغم
// إنها الدالة اللي بتطبّق حدود الأمان (SAFETY_LIMITS) اللي راجعناها كودًا فقط
// في تدقيق الطبقة 3 — بنحوّل التأكيد اليدوي ده لاختبار Regression دائم.
console.log('\n=== S78: calculateCalorieTarget — تغطية اختبار مباشرة لأول مرة (كانت صفر) ===');
{
  // 1) عجز عادي غير متطرف: لازم يحسب عجز فعلي مش يوصل لأي حد أقصى
  const normalLoss = calculateCalorieTarget({
    tdee: 2200, goal: GOAL.LOSE, currentWeightKg: 80, targetWeightKg: 75,
    timeframeDays: 90, gender: 'male', pregnancyStatus: 'none',
  });
  check('عجز عادي (5كجم/90يوم): capped=false ومفيش تحذير', normalLoss.capped === false && normalLoss.warning === null);
  check('عجز عادي: targetCalories أقل من tdee فعليًا (فيه عجز حقيقي)', normalLoss.targetCalories < 2200);

  // 2) عجز متطرف جدًا (وزن كبير/مدة قصيرة جدًا) لازم يتقفل عند MAX_DAILY_DEFICIT_KCAL=1000
  const extremeLoss = calculateCalorieTarget({
    tdee: 2200, goal: GOAL.LOSE, currentWeightKg: 100, targetWeightKg: 70,
    timeframeDays: 30, gender: 'male', pregnancyStatus: 'none',
  });
  check('عجز متطرف (30كجم/30يوم): capped=true فعليًا', extremeLoss.capped === true);
  check('عجز متطرف: العجز الفعلي (tdee-target) ما يتجاوزش 1000 سعرة/يوم (MAX_DAILY_DEFICIT_KCAL)', (2200 - extremeLoss.targetCalories) <= 1000);

  // 3) حد أدنى آمن للسعرات: امرأة بTDEE منخفض + عجز متطرف لازم يتقفل عند MIN_CALORIES_FEMALE=1200
  const floorLoss = calculateCalorieTarget({
    tdee: 1400, goal: GOAL.LOSE, currentWeightKg: 60, targetWeightKg: 50,
    timeframeDays: 20, gender: 'female', pregnancyStatus: 'none',
  });
  check('حد أدنى أنثى: targetCalories ما ينزلش تحت 1200 (MIN_CALORIES_FEMALE)', floorLoss.targetCalories >= 1200);
  check('حد أدنى أنثى: flooredBySafety اتفعّل فعليًا في السيناريو المتطرف ده', floorLoss.warning !== null && floorLoss.warning.includes('الحد الآمن'));

  // 4) رجل بحد أدنى مختلف (1500) — نفس المنطق بقيمة مختلفة
  const floorLossMale = calculateCalorieTarget({
    tdee: 1600, goal: GOAL.LOSE, currentWeightKg: 65, targetWeightKg: 55,
    timeframeDays: 20, gender: 'male', pregnancyStatus: 'none',
  });
  check('حد أدنى ذكر: targetCalories ما ينزلش تحت 1500 (MIN_CALORIES_MALE)', floorLossMale.targetCalories >= 1500);

  // 5) حمل: أي عجز مطلوب لازم يتجاهل تمامًا ويُضاف سعرات آمنة فوق TDEE
  const pregnantIgnoresDeficit = calculateCalorieTarget({
    tdee: 2000, goal: GOAL.LOSE, currentWeightKg: 80, targetWeightKg: 60,
    timeframeDays: 30, gender: 'female', pregnancyStatus: 'pregnant',
  });
  check('حمل: تم تجاهل هدف العجز كليًا — targetCalories أعلى من tdee مش أقل', pregnantIgnoresDeficit.targetCalories > 2000);
  check('حمل: capped=true وتحذير واضح يوضّح تجاهل هدف العجز', pregnantIgnoresDeficit.capped === true && pregnantIgnoresDeficit.warning.includes('تجاهل'));

  // 6) BUG-S23-01 (goalTargetMismatch): هدف خسارة وزن لكن الوزن المستهدف أعلى من الحالي
  const mismatch = calculateCalorieTarget({
    tdee: 2200, goal: GOAL.LOSE, currentWeightKg: 70, targetWeightKg: 80,
    timeframeDays: 60, gender: 'male', pregnancyStatus: 'none',
  });
  check('تعارض هدف/وزن مستهدف: goalTargetMismatch=true وسعرات الصيانة تُعرض بدل عجز خاطئ الاتجاه', mismatch.goalTargetMismatch === true && mismatch.targetCalories === 2200);

  // 7) هدف "ثبات" (MAINTAIN): سعرات = tdee بالظبط بدون أي تعديل
  const maintain = calculateCalorieTarget({
    tdee: 2100, goal: GOAL.MAINTAIN, currentWeightKg: 75, targetWeightKg: 75,
    timeframeDays: 30, gender: 'male', pregnancyStatus: 'none',
  });
  check('هدف ثبات: targetCalories = tdee بالظبط، dailyAdjustment=0', maintain.targetCalories === 2100 && maintain.dailyAdjustment === 0);
}

// S78 (طبقة 5.1): deleteRecord (Storage Engine) كانت بلا أي اختبار مباشر
console.log('\n=== S78: deleteRecord — تغطية اختبار مباشرة لأول مرة (كانت صفر) ===');
{
  await putRecord(STORE.MEAL_LOGS, { id: 's78-delete-test', date: '2026-08-06', mealType: 'lunch' });
  const beforeDelete = await getRecord(STORE.MEAL_LOGS, 's78-delete-test');
  check('قبل الحذف: السجل موجود فعليًا', beforeDelete?.id === 's78-delete-test');

  await deleteRecord(STORE.MEAL_LOGS, 's78-delete-test');
  const afterDelete = await getRecord(STORE.MEAL_LOGS, 's78-delete-test');
  check('بعد الحذف: السجل مختفي فعليًا (undefined)', afterDelete === undefined);

  // حذف id مش موجود أصلًا: لازم ما يكسرش أو يرمي استثناء
  let threwOnMissingId = false;
  try { await deleteRecord(STORE.MEAL_LOGS, 'id-غير-موجود-أبدًا'); }
  catch (e) { threwOnMissingId = true; }
  check('حذف id غير موجود: ما بيرميش استثناء (سلوك متسامح متوقَّع من IndexedDB)', threwOnMissingId === false);

  // نتأكد إن باقي السجلات في نفس الـStore ما اتأثرتش (الحذف انتقائي مش شامل)
  await putRecord(STORE.MEAL_LOGS, { id: 's78-untouched', date: '2026-08-06', mealType: 'dinner' });
  await deleteRecord(STORE.MEAL_LOGS, 's78-delete-test-2-non-existent');
  const untouchedRecord = await getRecord(STORE.MEAL_LOGS, 's78-untouched');
  check('حذف سجل تاني ما بيأثرش على سجلات موجودة فعليًا في نفس الـStore', untouchedRecord?.id === 's78-untouched');
}

// S78 (طبقة 5.1): validateFoodItem — اتفحصت إيجابيًا فقط (كل الـ2821 صنف
// الحقيقيين صالحين) عبر getLibraryStats طول الجلسات السابقة، لكن مفيش أي
// اختبار سلبي (negative case) يتأكد إنها فعليًا بترفض بيانات ناقصة/تالفة
console.log('\n=== S78: validateFoodItem — أول اختبار سلبي (negative case) ===');
{
  const validMinimalFood = {
    id: 'food_test_valid', name_ar: 'تفاحة اختبار', name_en: 'Test Apple', category: 'fruit',
    ingredients: [], reference_amount_g: 100,
    macros: createEmptyMacros(), micros: createEmptyMicros(),
    gi: 36, gl: 5, quality_score: 80, processing_level: 'unprocessed',
    suitable_meal_types: ['any'], cuisine: 'egyptian', allergens: [],
    unsuitable_for_conditions: [], suitable_for_conditions: [],
    unsuitable_for_diets: [], suitable_for_diets: [], religious_tags: [],
    warnings: [], typical_portion_desc_ar: 'حصة ~100 جم',
  };
  const { valid: validOk } = validateFoodItem(validMinimalFood);
  check('صنف كامل وسليم: valid=true', validOk === true);

  const missingId = { ...validMinimalFood };
  delete missingId.id;
  const { valid: missingIdValid, errors: missingIdErrors } = validateFoodItem(missingId);
  check('صنف بدون id: valid=false مع رسالة خطأ واضحة', missingIdValid === false && Array.isArray(missingIdErrors) && missingIdErrors.length > 0);

  const badMacros = { ...validMinimalFood, macros: { ...createEmptyMacros(), kcal: -50 } };
  const { valid: badMacrosValid } = validateFoodItem(badMacros);
  check('صنف بسعرات سالبة (kcal=-50): valid=false — رفض فعلي مش قبول أعمى', badMacrosValid === false);

  const missingCategory = { ...validMinimalFood };
  delete missingCategory.category;
  const { valid: missingCategoryValid } = validateFoodItem(missingCategory);
  check('صنف بدون category: valid=false', missingCategoryValid === false);
}

process.exit(fail > 0 ? 1 : 0);
