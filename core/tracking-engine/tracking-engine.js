/**
 * ============================================================================
 * Tracking Engine
 * ============================================================================
 * يسجّل الوجبات والتمارين الفعلية عبر Storage Engine، ويحسب الإجماليات
 * اليومية (سعرات/ماكرو/مايكرو/ماء/خطوات) ومؤشر الالتزام الأسبوعي
 * (Adherence Score) المطلوب صراحة بالمستند بجانب التتبع اليومي.
 * ============================================================================
 */

'use strict';

import { STORE, putRecord, getRecord, getAllRecords, uniqueIdSuffix } from '../storage/storage-engine.js';
import { aggregateMealNutrients } from '../meal-engine/meal-quality.js';

function todayId(dateStr) {
  return dateStr; // 'YYYY-MM-DD' — يُستخدم كـid مباشرة لسجل daily_tracking
}

/**
 * كل الحقول العددية المسموح تسجيلها يوميًا في `daily_tracking`. وزن/ماء
 * كانا الوحيدين قبل كده (S13)؛ محيط الخصر/الرقبة/الأرداف ونسبة الدهون
 * المقاسة اتضافوا (بند 13) عشان يتاح تتبّع تركيب الجسم كسلسلة زمنية فعلية
 * في Analytics Engine (`getBodyCompositionTrend`) بدل الاكتفاء بقيمة واحدة
 * ثابتة في البروفايل.
 */
const DAILY_METRIC_FIELDS = ['weightKg', 'waterMl', 'waistCm', 'neckCm', 'hipCm', 'bodyFatPercent'];

/**
 * يسجّل وجبة فعلية (بعد ما المستخدم اختارها/عدّلها من Meal Generation Engine).
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} mealType
 * @param {Array<{food, grams}>} items
 */
export async function logMeal(date, mealType, items) {
  // BUG-S23-03: كان `Date.now()` وحده — نداءان في نفس المللي ثانية بيتصادموا
  // ويستبدل التاني الأول بصمت. `uniqueIdSuffix()` بتضمن التفرّد دايمًا.
  const id = `${date}_${mealType}_${uniqueIdSuffix()}`;
  const record = {
    id, date, mealType,
    items: items.map((i) => ({ foodId: i.food.id, grams: i.grams })), // نخزّن المعرّف فقط، مش الصنف كامل (تفادي تضخّم التخزين وتعارض نسخ Food Library لاحقًا)
    loggedAt: new Date().toISOString(),
  };
  await putRecord(STORE.MEAL_LOGS, record);
  return record;
}

/**
 * يسجّل مقاييس يومية (وزن و/أو ماء) في `daily_tracking` — نفس الـstore
 * اللي يقرأ منه Analytics Engine (`getWeightTrend`). دمج آمن: لو السجل
 * موجود بالفعل لنفس التاريخ (من كتابة سابقة النهاردة)، بيحدّث الحقول
 * المُرسَلة بس ويحافظ على أي حقول تانية موجودة (مثال: خطوات مستقبلًا)
 * بدل ما يستبدل السجل كله. `weightKg`/`waterMl` اختياريان — تقدر تبعت
 * واحد بس وتسيب التاني، أو الاتنين مع بعض.
 * @param {string} date - 'YYYY-MM-DD'
 * @param {{weightKg?: number, waterMl?: number, waistCm?: number, neckCm?: number, hipCm?: number, bodyFatPercent?: number}} metrics
 */
export async function logDailyMetrics(date, metrics) {
  const id = todayId(date);
  const existing = await getRecord(STORE.DAILY_TRACKING, id);
  const record = { ...(existing ?? { id, date }), id, date };
  for (const key of DAILY_METRIC_FIELDS) {
    if (typeof metrics[key] === 'number') record[key] = metrics[key];
  }
  record.updatedAt = new Date().toISOString();
  await putRecord(STORE.DAILY_TRACKING, record);
  return record;
}

/**
 * نسبة ماكرو تقديرية عامة (نفس افتراض نمط الحمية "عادي" في Nutrition Engine)
 * تُستخدم فقط لتقدير تقريبي لماكرو وجبة "معزوم برة" غير معروفة التفاصيل —
 * مفيش أصناف حقيقية لحساب ماكرو دقيق منها، فده أفضل تقريب متاح.
 */
const EATING_OUT_MACRO_RATIOS = { protein: 0.20, carb: 0.50, fat: 0.30 };

function estimateEatingOutMacros(kcal) {
  return {
    kcal,
    protein_g: Math.round((kcal * EATING_OUT_MACRO_RATIOS.protein) / 4),
    carbs_g: Math.round((kcal * EATING_OUT_MACRO_RATIOS.carb) / 4),
    fat_g: Math.round((kcal * EATING_OUT_MACRO_RATIOS.fat) / 9),
  };
}

/** سجل ماكرو فاضٍ بنفس شكل totals الناتج من aggregateMealNutrients — لتوحيد الشكل لما مفيش أي وجبة "حقيقية" مسجَّلة في اليوم غير "معزوم برة" */
function emptyNutrientTotals() {
  return {
    kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, added_sugar_g: 0,
    saturated_fat_g: 0, sodium_mg: 0, potassium_mg: 0, calcium_mg: 0, magnesium_mg: 0,
    iron_mg: 0, zinc_mg: 0, selenium_mcg: 0, vitamin_a_mcg: 0, vitamin_b12_mcg: 0,
    vitamin_c_mg: 0, vitamin_d_mcg: 0, vitamin_e_mg: 0, vitamin_k_mcg: 0,
  };
}

/**
 * يسجّل وجبة "معزوم برة" — سعرات تقريبية فقط بدون تفاصيل أصناف (مطلوبة
 * صراحة في مستند الرؤية §... "معزوم برة: تحديد سعرات تقريبية، تصنيفها
 * كغداء/عشاء"). تُخزَّن كسجل مميّز (`isEatingOut: true`) بدل مصفوفة `items`
 * العادية، و`computeDailyTotals` بيتعامل معاه بتقدير ماكرو تقريبي مش بمحاولة
 * إيجاد صنف حقيقي (اللي مش موجود أصلًا).
 * @param {string} date
 * @param {string} mealType - عادة 'lunch' أو 'dinner' حسب المستند
 * @param {number} estimatedKcal
 */
export async function logEatingOutMeal(date, mealType, estimatedKcal) {
  const id = `${date}_${mealType}_eatingout_${uniqueIdSuffix()}`; // BUG-S23-03
  const record = { id, date, mealType, isEatingOut: true, estimatedKcal, loggedAt: new Date().toISOString() };
  await putRecord(STORE.MEAL_LOGS, record);
  return record;
}

/**
 * يسجّل تمرينًا فعليًا.
 * @param {string} date
 * @param {string} exerciseId
 * @param {number} durationMinutes
 * @param {number} caloriesBurned
 */
export async function logExercise(date, exerciseId, durationMinutes, caloriesBurned) {
  const id = `${date}_${exerciseId}_${uniqueIdSuffix()}`; // BUG-S23-03
  const record = { id, date, exerciseId, durationMinutes, caloriesBurned, loggedAt: new Date().toISOString() };
  await putRecord(STORE.EXERCISE_LOGS, record);
  return record;
}

/** يقرأ سجل المقاييس اليومية (وزن/ماء) ليوم معيّن، أو null لو مفيش تسجيل */
export async function getDailyMetrics(date) {
  const record = await getRecord(STORE.DAILY_TRACKING, todayId(date));
  return record ?? null;
}

/**
 * يحسب الإجماليات الفعلية ليوم معيّن من كل الوجبات المسجَّلة فيه.
 * يحتاج دالة `resolveFoodById` (عادة `getFoodById` من Food Library) عشان
 * يحوّل foodId المخزَّن لكائن الصنف الكامل قبل التجميع.
 * @param {string} date
 * @param {(id: string) => Object|null} resolveFoodById
 */
export async function computeDailyTotals(date, resolveFoodById) {
  const allMealLogs = await getAllRecords(STORE.MEAL_LOGS);
  const dayLogs = allMealLogs.filter((l) => l.date === date);

  const mealItems = [];
  const unresolvedFoodIds = [];
  let eatingOutKcalTotal = 0;
  for (const log of dayLogs) {
    if (log.isEatingOut) {
      eatingOutKcalTotal += log.estimatedKcal;
      continue; // مفيش items أصلًا في سجل "معزوم برة" — تقدير مباشر، مش أصناف
    }
    for (const item of log.items) {
      const food = resolveFoodById(item.foodId);
      if (!food) { unresolvedFoodIds.push(item.foodId); continue; }
      mealItems.push({ food, grams: item.grams });
    }
  }

  const allExerciseLogs = await getAllRecords(STORE.EXERCISE_LOGS);
  const dayExerciseLogs = allExerciseLogs.filter((l) => l.date === date);
  const totalCaloriesBurned = dayExerciseLogs.reduce((sum, l) => sum + l.caloriesBurned, 0);

  const loggedTotals = mealItems.length > 0 ? aggregateMealNutrients(mealItems).totals : null;
  const eatingOutEstimate = eatingOutKcalTotal > 0 ? estimateEatingOutMacros(eatingOutKcalTotal) : null;

  let nutrition = null;
  if (loggedTotals || eatingOutEstimate) {
    const base = loggedTotals ?? emptyNutrientTotals();
    nutrition = {
      ...base,
      kcal: base.kcal + (eatingOutEstimate?.kcal ?? 0),
      protein_g: base.protein_g + (eatingOutEstimate?.protein_g ?? 0),
      carbs_g: base.carbs_g + (eatingOutEstimate?.carbs_g ?? 0),
      fat_g: base.fat_g + (eatingOutEstimate?.fat_g ?? 0),
    };
  }

  return {
    date,
    mealCount: dayLogs.length,
    nutrition, // null لو مفيش وجبات ولا "معزوم برة" مسجَّلة أصلًا
    totalCaloriesBurned,
    unresolvedFoodIds, // تشخيص: أصناف اتسجلت وبعدين اتشالت من Food Library
    eatingOutKcal: eatingOutKcalTotal, // 0 لو مفيش أي "معزوم برة" النهاردة
  };
}

/**
 * يحسب مؤشر الالتزام الأسبوعي: نسبة الأيام اللي السعرات الفعلية فيها كانت
 * ضمن هامش مقبول من الهدف اليومي (افتراضي ±15%)، من آخر N يوم (افتراضي 7).
 * @param {(id: string) => Object|null} resolveFoodById
 * @param {number} dailyCalorieTarget
 * @param {string[]} dateRange - قائمة تواريخ 'YYYY-MM-DD' مرتّبة (عادة آخر 7 أيام)
 * @param {number} [marginPct=0.15]
 */
export async function computeAdherenceScore(resolveFoodById, dailyCalorieTarget, dateRange, marginPct = 0.15) {
  let compliantDays = 0;
  let trackedDays = 0;

  for (const date of dateRange) {
    const daily = await computeDailyTotals(date, resolveFoodById);
    if (!daily.nutrition) continue; // يوم مفيش فيه أي تسجيل — لا يُحتسب في المقام (مش فشل، مجرد غياب بيانات)
    trackedDays += 1;
    const actual = daily.nutrition.kcal;
    const withinMargin = actual >= dailyCalorieTarget * (1 - marginPct) && actual <= dailyCalorieTarget * (1 + marginPct);
    if (withinMargin) compliantDays += 1;
  }

  return {
    trackedDays,
    compliantDays,
    adherencePct: trackedDays > 0 ? Math.round((compliantDays / trackedDays) * 100) : null,
  };
}
