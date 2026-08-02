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
import { generateMeal, generateDayPlan, buildDayPlanSlots } from '../core/meal-engine/meal-generation-engine.js';
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

console.log(`\n=== ${pass} نجح / ${fail} فشل ===`);
process.exit(fail > 0 ? 1 : 0);
