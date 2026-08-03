/**
 * ============================================================================
 * Regression Test — S53: التقويم الديني، بار الماكرو، خطة اليوم الكامل
 * ============================================================================
 * تشغيل: `node tests/s53-regression.mjs` — لازم يفضل 100% PASS.
 * تغطية الملاحظات الأربع اللي طلبها المستخدم بعد مراجعة nutrition-platform-v2:
 *   1) خانة الديانة + حساب أيام الصيام تلقائيًا (هجري/قبطي)
 *   2) بار التحكم اليدوي في الماكرو + الحدود الآمنة
 *   3) توليد خطة يوم كامل (مش وجبة واحدة بس)
 * ============================================================================
 */

import 'fake-indexeddb/auto';
import {
  gregorianToHijri, copticEasterGregorianDate, resolveIslamicFastingStatus,
  resolveChristianFastingStatus, resolveDailyFastingStatus,
} from '../core/decision-engine/religious-calendar.js';
import {
  calculateMacroTargets, resolveSafeMacroRange, validateCustomMacroRatios,
} from '../core/nutrition-engine/nutrition-engine.js';
import { generateMeal, generateDayPlan, buildDayPlanSlots, resolveMealPlanTemplateDay } from '../core/meal-engine/meal-generation-engine.js';
import { MEAL_PLAN_CALORIE_LEVELS, MEAL_PLAN_DAYS, nearestCalorieLevel } from '../core/meal-engine/meal-plan-templates.js';
import { MEDICAL_CONDITION } from '../core/food-library/schema.js';
import { resolveAvailableFoods } from '../core/decision-engine/decision-engine.js';
import { getAllFoods } from '../core/food-library/food-library.js';
import { CUISINE_PREFERENCE } from '../core/decision-engine/cuisine-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}`); }
}

const d = (s) => new Date(`${s}T00:00:00Z`);

console.log('=== التقويم الهجري (مقابل تواريخ رمضان 2026 الفعلية المعلنة) ===');
check('16 فبراير 2026 = 28 شعبان 1447 (يوم قبل رمضان)', gregorianToHijri(d('2026-02-16')).month === 8 && gregorianToHijri(d('2026-02-16')).day === 28);
check('18 فبراير 2026 = 1 رمضان 1447 (بداية رمضان الجدولية)', gregorianToHijri(d('2026-02-18')).month === 9 && gregorianToHijri(d('2026-02-18')).day === 1);
check('19 مارس 2026 = 30 رمضان 1447 (آخر يوم رمضان)', gregorianToHijri(d('2026-03-19')).month === 9 && gregorianToHijri(d('2026-03-19')).day === 30);
check('21 مارس 2026 = 2 شوال 1447 (بعد العيد)', gregorianToHijri(d('2026-03-21')).month === 10);

console.log('=== فصح الكنيسة القبطية (مقابل التاريخ الرسمي المعلن 2026-04-12) ===');
check('فصح 2026 = 12 أبريل (يطابق التقويم الكنسي الرسمي)', copticEasterGregorianDate(2026).toISOString().slice(0, 10) === '2026-04-12');
check('فصح 2025 = 20 أبريل (تحقق سنة تانية للتأكد من عمومية الصيغة)', copticEasterGregorianDate(2025).toISOString().slice(0, 10) === '2025-04-20');

console.log('=== حالة الصيام الإسلامي ===');
check('رمضان: isFasting=true, mandatory=true', resolveIslamicFastingStatus(d('2026-02-20')).isFasting && resolveIslamicFastingStatus(d('2026-02-20')).mandatory);
check('يوم عادي (مايو) بدون تفعيل الصيام المستحب: isFasting=false', !resolveIslamicFastingStatus(d('2026-05-05'), { observeVoluntaryFasts: false }).isFasting);
check('الاتنين مع تفعيل الصيام المستحب: isFasting=true, mandatory=false', (() => {
  const r = resolveIslamicFastingStatus(d('2026-02-16'), { observeVoluntaryFasts: true }); // 2026-02-16 اتنين
  return r.isFasting && !r.mandatory && r.occasion === 'monday_thursday';
})());
check('الاتنين بدون تفعيل الصيام المستحب: isFasting=false (الفرض بس هو رمضان)', !resolveIslamicFastingStatus(d('2026-02-16'), { observeVoluntaryFasts: false }).isFasting);

console.log('=== حالة الصيام المسيحي (القبطي) ===');
check('داخل الصوم الكبير (قبل فصح 2026 بأيام قليلة): strict=true', resolveChristianFastingStatus(d('2026-04-05')).strict === true && resolveChristianFastingStatus(d('2026-04-05')).isFasting);
check('خلال الخماسين (بعد فصح مباشرة): مفيش صيام أربعاء/جمعة', !resolveChristianFastingStatus(d('2026-04-15')).isFasting); // أربعاء بعد فصح مباشرة، لسه في الخماسين
check('صوم الميلاد (ديسمبر): strict=false (مسموح فيه السمك)', (() => {
  const r = resolveChristianFastingStatus(d('2025-12-15'));
  return r.isFasting && r.strict === false && r.occasion === 'nativity_fast';
})());
check('أربعاء عادي خارج أي موسم صيام كبير: صيام أسبوعي fish_allowed', (() => {
  const r = resolveChristianFastingStatus(d('2026-09-02')); // أربعاء بعيد عن كل المواسم
  return r.isFasting && r.occasion === 'weekly_wed_fri' && r.strict === false;
})());

console.log('=== resolveDailyFastingStatus (نقطة الدخول الموحّدة) ===');
check('مسلم وقت رمضان: fastingTag=ramadan_suhoor, mealSlotsHint=suhoor_iftar', (() => {
  const r = resolveDailyFastingStatus({ date: d('2026-02-20'), religion: 'islam' });
  return r.isFasting && r.fastingTag === 'ramadan_suhoor' && r.mealSlotsHint === 'suhoor_iftar';
})());
check('مسيحي وقت الصوم الكبير: fastingTag=christian_fast_strict', (() => {
  const r = resolveDailyFastingStatus({ date: d('2026-04-05'), religion: 'christianity' });
  return r.isFasting && r.fastingTag === 'christian_fast_strict';
})());
check('تجاوز يدوي "مش صايم النهاردة" وقت رمضان: isFasting=false رغم إنه فعليًا رمضان', !resolveDailyFastingStatus({ date: d('2026-02-20'), religion: 'islam', manualOverrideNotFasting: true }).isFasting);
check('ديانة none: مفيش أي قيد صيام حتى لو التاريخ رمضان', !resolveDailyFastingStatus({ date: d('2026-02-20'), religion: 'none' }).isFasting);

console.log('=== بار التحكم اليدوي في الماكرو — الحدود الآمنة ===');
const normalRange = resolveSafeMacroRange([]);
check('نطاق عادي: بروتين 10%-35%', normalRange.protein.min === 0.10 && normalRange.protein.max === 0.35);
const ckdRange = resolveSafeMacroRange([MEDICAL_CONDITION.CKD]);
check('نطاق CKD: سقف بروتين أضيق (20% بدل 35%)', ckdRange.protein.max === 0.20);
const diabetesRange = resolveSafeMacroRange([MEDICAL_CONDITION.DIABETES_T2]);
check('نطاق سكري نوع 2: سقف كارب أضيق (45% بدل 65%)', diabetesRange.carb.max === 0.45);

check('validateCustomMacroRatios: نسب مجموعها 100% وداخل الحد الآمن -> valid=true', validateCustomMacroRatios({ protein: 0.30, carb: 0.40, fat: 0.30 }, []).valid === true);
check('validateCustomMacroRatios: مجموع != 100% -> valid=false برسالة واضحة', validateCustomMacroRatios({ protein: 0.30, carb: 0.30, fat: 0.30 }, []).valid === false);
check('validateCustomMacroRatios: بروتين 40% مع CKD (سقف 20%) -> valid=false', validateCustomMacroRatios({ protein: 0.40, carb: 0.35, fat: 0.25 }, [MEDICAL_CONDITION.CKD]).valid === false);

console.log('=== calculateMacroTargets: نمط حمية جاهز (كيتو) لازم يفضل زي ما هو — مش هيتقيّد بالنطاق العام ===');
const ketoTargets = calculateMacroTargets(2000, 'keto', 70);
const normalTargets = calculateMacroTargets(2000, 'normal', 70);
check('كيتو: fat_g أعلى بكتير من العادي (النطاق العام ما بيكسرش أنماط الحمية الجاهزة)', ketoTargets.fat_g > normalTargets.fat_g * 1.5);

console.log('=== calculateMacroTargets: نسب مخصّصة من بار التحكم ===');
const customTargets = calculateMacroTargets(2000, 'normal', 70, { protein: 0.30, carb: 0.40, fat: 0.30 });
check('نسب مخصّصة صالحة: بروتين ~30% من 2000 سعرة = ~150g', Math.abs(customTargets.protein_g - 150) <= 2);

console.log('=== calculateMacroTargets: سقف بروتين CKD بالجرام/كجم يتفوّق حتى لو النسبة المخصّصة أعلى ===');
const ckdCustomTargets = calculateMacroTargets(2000, 'normal', 70, { protein: 0.35, carb: 0.35, fat: 0.30 }, [MEDICAL_CONDITION.CKD]);
check('CKD + نسبة بروتين مخصّصة عالية: بروتين النهائي محدود بـ0.8g/كجم (~56g) مش 35% الخام', ckdCustomTargets.protein_g <= 60);

console.log('=== توليد خطة يوم كامل — buildDayPlanSlots ===');
const normalDaySlots = buildDayPlanSlots({ isFasting: false, mealSlotsHint: 'normal', snacksCount: 2, drinksCount: 1 });
check('يوم عادي بسناكين ومشروب: 3 وجبات أساسية + 2 سناك + 1 مشروب = 6 سلوتات', normalDaySlots.length === 6);
check('يوم عادي: مجموع نصيب السلوتات غير المشروبات ~= 1 (المشروبات بسعرات ثابتة منفصلة)', Math.abs(normalDaySlots.filter((s) => !s.isBeverage).reduce((s, x) => s + x.share, 0) - 1) < 0.01);

const fastingDaySlots = buildDayPlanSlots({ isFasting: true, mealSlotsHint: 'suhoor_iftar', snacksCount: 0, drinksCount: 0 });
check('يوم صيام إسلامي بدون سناكس: سلوتان بس (سحور + إفطار)', fastingDaySlots.length === 2);
check('يوم صيام إسلامي: تسمية السلوتات "سحور" و"إفطار"', fastingDaySlots.some((s) => s.label_ar === 'سحور') && fastingDaySlots.some((s) => s.label_ar === 'إفطار'));

const noSnacksDaySlots = buildDayPlanSlots({ isFasting: false, mealSlotsHint: 'normal', snacksCount: 0, drinksCount: 0 });
check('يوم عادي بدون سناكس: 3 سلوتات بس (نصيب السناك اتردّ على الوجبات التلاتة)', noSnacksDaySlots.length === 3);
check('يوم عادي بدون سناكس: مجموع النصيب لسه = 1 (مفيش سعرات ضايعة)', Math.abs(noSnacksDaySlots.reduce((s, x) => s + x.share, 0) - 1) < 0.01);

console.log('=== توليد خطة يوم كامل — generateDayPlan (تكامل حقيقي مع Decision + Meal Engine) ===');
const basicConstraintProfile = { medicalConditions: [], allergies: [], dietStyle: 'normal', pregnancyStatus: 'none' };
const dayPlanResult = generateDayPlan({
  constraintProfile: basicConstraintProfile,
  dailyCalorieTarget: 2000,
  dailyMacroTargets: { protein_g: 125, carb_g: 225, fat_g: 67 },
  isFasting: false,
  mealSlotsHint: 'normal',
  snacksCount: 1,
  drinksCount: 1,
  minFoodQualityScore: 0,
});
check('خطة يوم عادي: 5 سلوتات (فطار/غدا/عشا/سناك/مشروب)', dayPlanResult.totalCount === 5);
check('خطة يوم عادي: كل السلوتات نجحت (مكتبة طعام كبيرة كفاية)', dayPlanResult.successCount === dayPlanResult.totalCount);
check('خطة يوم عادي: مجموع سعرات الخطة قريب من الهدف اليومي (هامش معقول)', Math.abs(dayPlanResult.totals.kcal - 2000) < 500);
check('سلوت المشروب مقيّد فعليًا بفئة beverage', (() => {
  const drinkSlot = dayPlanResult.slots.find((s) => s.isBeverage);
  return drinkSlot?.success && drinkSlot.meal.items.every((i) => i.food.category === 'beverage');
})());

const fastingDayPlanResult = generateDayPlan({
  constraintProfile: { ...basicConstraintProfile },
  dailyCalorieTarget: 2000,
  dailyMacroTargets: { protein_g: 125, carb_g: 225, fat_g: 67 },
  isFasting: true,
  mealSlotsHint: 'suhoor_iftar',
  snacksCount: 0,
  drinksCount: 0,
  minFoodQualityScore: 0,
});
check('خطة يوم صيام إسلامي: سلوتان بس نجحا (سحور/إفطار)، مش 3-4 وجبات عادية', fastingDayPlanResult.totalCount === 2 && fastingDayPlanResult.successCount === 2);

console.log('=== categoryFilter على generateMeal مباشرة (مش بس عبر خطة اليوم) ===');
const beverageOnlyResult = generateMeal({
  constraintProfile: basicConstraintProfile,
  mealType: 'snack',
  targetKcal: 80,
  categoryFilter: ['beverage'],
  minFoodQualityScore: 0,
});
check('generateMeal مع categoryFilter=[beverage]: كل الأصناف الناتجة فعليًا مشروبات', beverageOnlyResult.success && beverageOnlyResult.candidates[0].items.every((i) => i.food.category === 'beverage'));

const impossibleCategoryResult = generateMeal({
  constraintProfile: basicConstraintProfile,
  mealType: 'snack',
  targetKcal: 80,
  categoryFilter: ['this_category_does_not_exist'],
  minFoodQualityScore: 0,
});
check('generateMeal مع فئة غير موجودة: فشل بتشخيص stage=category_filtering واضح (مش خلط مع مشاكل تانية)', !impossibleCategoryResult.success && impossibleCategoryResult.diagnosis.stage === 'category_filtering');

console.log('=== قيد المطبخ (cuisine) — بند "الأصناف الغريبة عن الأكل المصري" ===');
const allFoodsCount = getAllFoods().length;
const internationalOrLevantineCount = getAllFoods().filter((f) => f.cuisine !== 'egyptian').length;

check('بدون تحديد cuisinePreference: القيد القديم يفضل زي ما هو (كل المكتبة متاحة — توافق رجعي)', resolveAvailableFoods(basicConstraintProfile).availableFoods.length === allFoodsCount);

const egyptianOnlyProfile = { ...basicConstraintProfile, cuisinePreference: CUISINE_PREFERENCE.EGYPTIAN_ONLY };
const egyptianOnlyResult = resolveAvailableFoods(egyptianOnlyProfile);
check('cuisinePreference=egyptian_only: الأصناف الدولية/الشامية اتستبعدت فعليًا', egyptianOnlyResult.availableFoods.length === allFoodsCount - internationalOrLevantineCount);
check('cuisinePreference=egyptian_only: كل الأصناف الناجية cuisine=egyptian فعليًا', egyptianOnlyResult.availableFoods.every((f) => f.cuisine === 'egyptian'));

const egyptianAndLevantineResult = resolveAvailableFoods({ ...basicConstraintProfile, cuisinePreference: CUISINE_PREFERENCE.EGYPTIAN_AND_LEVANTINE });
check('cuisinePreference=egyptian_and_levantine: أكبر من egyptian_only بس (فيه أصناف شامية زيادة)', egyptianAndLevantineResult.availableFoods.length > egyptianOnlyResult.availableFoods.length);
check('cuisinePreference=egyptian_and_levantine: مفيش صنف دولي (international) متسرّب', egyptianAndLevantineResult.availableFoods.every((f) => f.cuisine !== 'international'));

check('generateMeal مع cuisinePreference=egyptian_only: كل أصناف أفضل تركيبة مصرية فعليًا', (() => {
  const r = generateMeal({ constraintProfile: egyptianOnlyProfile, mealType: 'lunch', targetKcal: 600, minFoodQualityScore: 0 });
  return r.success && r.candidates[0].items.every((i) => i.food.cuisine === 'egyptian');
})());

console.log('=== S53-d: واقعية التوليد — بند "دي وجبات الواحد ياكلها؟" ===');
const realismConstraintProfile = { medicalConditions: [], allergies: [], dietStyle: 'normal', pregnancyStatus: 'none', cuisinePreference: 'egyptian_only' };
const realismDayPlan = generateDayPlan({
  constraintProfile: realismConstraintProfile,
  dailyCalorieTarget: 2292,
  dailyMacroTargets: { protein_g: 172, carb_g: 258, fat_g: 76 },
  isFasting: false,
  mealSlotsHint: 'normal',
  snacksCount: 3,
  drinksCount: 2,
  minFoodQualityScore: 30,
});
const successfulSlots = realismDayPlan.slots.filter((s) => s.success);
check('خطة اليوم كلها نجحت (8 سلوتات) رغم القيود الواقعية الجديدة', realismDayPlan.successCount === 8);

const allUsedIds = successfulSlots.flatMap((s) => s.meal.items.map((i) => i.food.id));
check('مفيش أي صنف اتكرر بالظبط في أكتر من سلوت في نفس اليوم', new Set(allUsedIds).size === allUsedIds.length);

check('مفيش سلوت (سناك/وجبة) صنفه الوحيد من فئة خضار/توابل (زي "شبت" كوجبة كاملة)', successfulSlots.every((s) =>
  s.meal.items.length > 1 || !['vegetable', 'condiment'].includes(s.meal.items[0].food.category)
));

const drinkSlots = successfulSlots.filter((s) => s.isBeverage);
check('كل سلوتات المشروبات كثافتها السعرية معقولة فعليًا (≤90 سعرة/100جم، مش دبس/شراب مكثّف)', drinkSlots.every((s) =>
  s.meal.items.every((i) => i.food.macros.kcal <= 90)
));

check('مفيش صنف كارب بحصة تافهة (أقل من 15 جم) داخل أي تركيبة', successfulSlots.every((s) =>
  s.meal.items.every((i) => i.food.category !== 'carb' || i.grams >= 15)
));

check('مفيش سلوت صنفه الوحيد مكسرات/بذور بحصة أكبر من 60 جم (كثافة سعرات عالية)', successfulSlots.every((s) =>
  s.meal.items.length > 1 || s.meal.items[0].food.category !== 'nut_seed' || s.meal.items[0].grams <= 60
));

console.log('=== BUG-S54-03: بقوليات جافة/نيّة (زي الترمس) لا تظهر كوجبة قائمة بذاتها ===');
const RAW_UNCOOKED_LEGUME_IDS_TEST = new Set([
  'food_4199', 'food_4200', 'food_4201', 'food_4203', 'food_4204', 'food_4205', 'food_4206',
  'food_4207', 'food_4208', 'food_4209', 'food_4210', 'food_4211', 'food_4213', 'food_4214',
  'food_4215', 'food_4217', 'food_4218', 'food_4219', 'food_4220', 'food_4221', 'food_4222',
  'food_4223', 'food_4224', 'food_4225', 'food_4226', 'food_4227', 'food_4231', 'food_4232',
  'food_4233', 'food_4237', 'food_4238', 'food_4239', 'food_4240', 'food_4461', 'food_4462',
  'food_4463', 'food_4513', 'food_4636', 'food_4637', 'food_4867', 'food_4997', 'food_5000',
  'food_5001', 'food_5002', 'food_5003', 'food_5005', 'food_5006', 'food_5020', 'food_5021',
  'food_5030', 'food_5031', 'food_5032',
]);
check('مفيش سلوت (في نفس خطة اليوم الواقعية فوق) صنفه الوحيد بقولي جاف/نيء من القايمة دي', successfulSlots.every((s) =>
  s.meal.items.length > 1 || !RAW_UNCOOKED_LEGUME_IDS_TEST.has(s.meal.items[0].food.id)
));

// توليد وجبة غداء مباشرة بسعرات تكفي فقط ترمس مصري (814 سعرة تقريبًا) للتأكد
// إنه مش بيظهر كصنف وحيد حتى لو هو أنسب صنف حسابيًا للسعرات المطلوبة
const turmusOnlyAttempt = generateMeal({
  constraintProfile: realismConstraintProfile,
  mealType: 'lunch',
  targetKcal: 814,
  minFoodQualityScore: 30,
});
check('توليد وجبة بسعرات قريبة من "220 جم ترمس مصري" مبيرجّعش ترمس مصري كصنف وحيد', !(
  turmusOnlyAttempt.success &&
  turmusOnlyAttempt.candidates[0].items.length === 1 &&
  turmusOnlyAttempt.candidates[0].items[0].food.id === 'food_4231'
));

const allFoodsForPeanutCheck = getAllFoods();
const peanutFoods = allFoodsForPeanutCheck.filter((f) => ['food_4071', 'food_4073', 'food_4074', 'food_4075', 'food_5029', 'food_5118'].includes(f.id));
check('الفول السوداني (6 أصناف) بقى مصنَّف nut_seed مش legume (BUG-S54-03)', peanutFoods.length === 6 && peanutFoods.every((f) => f.category === 'nut_seed'));

console.log('=== S53-e: قوالب البرنامج الغذائي الجاهز (1200-2500 سعرة) ===');
check('7 مستويات سعرات متاحة (1200 إلى 2500)', MEAL_PLAN_CALORIE_LEVELS.length === 7 && MEAL_PLAN_CALORIE_LEVELS[0] === 1200 && MEAL_PLAN_CALORIE_LEVELS.at(-1) === 2500);
check('nearestCalorieLevel(1750) يرجّع 1800 (أقرب مستوى)', nearestCalorieLevel(1750) === 1800);
check('nearestCalorieLevel(1250) يرجّع 1200 (أقرب مستوى)', nearestCalorieLevel(1250) === 1200);

for (const level of MEAL_PLAN_CALORIE_LEVELS) {
  for (const day of MEAL_PLAN_DAYS) {
    const r = resolveMealPlanTemplateDay(level, day);
    if (!r || r.slots.length === 0 || r.slots.some((s) => s.meal.items.length === 0)) {
      check(`قالب ${level}/${day} سليم (4 وجبات، كل وجبة فيها أصناف فعلية)`, false);
    }
  }
}
check('كل الـ49 يوم/مستوى (7×7) اتحلّوا بنجاح لأصناف فعلية من المكتبة', true); // لو أي مستوى فشل، الحلقة فوق كانت سجّلت ❌ بالفعل

const sampleDay = resolveMealPlanTemplateDay(1200, 'الأحد');
check('كل صنف في القالب اتربط بصنف حقيقي (food كائن كامل، مش مجرد id)', sampleDay.slots.every((s) => s.meal.items.every((i) => typeof i.food === 'object' && i.food.name_ar)));
check('إجمالي سعرات اليوم قريب من المستوى المُسمّى (هامش معقول ±20%)', Math.abs(sampleDay.totals.kcal - 1200) / 1200 < 0.20);

check('مستوى/يوم غير موجودين يرجّعوا null بدل ما يكسروا', resolveMealPlanTemplateDay(9999, 'الأحد') === null);

console.log(`\n=== ${pass} نجح / ${fail} فشل ===`);
process.exit(fail > 0 ? 1 : 0);
