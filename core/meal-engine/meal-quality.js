/**
 * ============================================================================
 * Meal Quality Engine
 * ============================================================================
 * يحسب Meal Quality Score (0-100) لتركيبة وجبة كاملة (عدة أصناف بكمياتها)،
 * بخلاف `quality_score` المخزَّن في Food Library اللي هو تقييم لصنف مفرد.
 * العوامل: كثافة الألياف، السكر المضاف، الصوديوم، الدهون المشبعة، درجة
 * المعالجة، تنوع الفئات، GI المتوسط المرجّح، وتغطية المايكرو (إن توفرت
 * أهداف مايكرو للمقارنة).
 * ============================================================================
 */

'use strict';

import { PROCESSING_LEVEL } from '../food-library/schema.js';

const PROCESSING_PENALTY = {
  [PROCESSING_LEVEL.UNPROCESSED]: 0,
  [PROCESSING_LEVEL.MINIMALLY_PROCESSED]: 3,
  [PROCESSING_LEVEL.PROCESSED]: 10,
  [PROCESSING_LEVEL.ULTRA_PROCESSED]: 25,
};

/**
 * @typedef {Object} MealItem
 * @property {import('../food-library/schema.js').FoodItem} food
 * @property {number} grams
 */

/** يجمع القيم الغذائية لكل أصناف الوجبة بكمياتها الفعلية (مقياس لكل 100 جم) */
export function aggregateMealNutrients(mealItems) {
  const totals = {
    kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, added_sugar_g: 0,
    saturated_fat_g: 0, sodium_mg: 0, potassium_mg: 0, calcium_mg: 0, magnesium_mg: 0,
    iron_mg: 0, zinc_mg: 0, selenium_mcg: 0, vitamin_a_mcg: 0, vitamin_b12_mcg: 0,
    vitamin_c_mg: 0, vitamin_d_mcg: 0, vitamin_e_mg: 0, vitamin_k_mcg: 0,
  };
  let weightedGiSum = 0;
  let giWeightTotal = 0;
  let weightedProcessingPenalty = 0;
  const categoriesSeen = new Set();

  for (const { food, grams } of mealItems) {
    const scale = grams / 100;
    totals.kcal += food.macros.kcal * scale;
    totals.protein_g += food.macros.protein_g * scale;
    totals.carbs_g += food.macros.carbs_g * scale;
    totals.fat_g += food.macros.fat_g * scale;
    totals.fiber_g += food.macros.fiber_g * scale;
    totals.sugar_g += food.macros.sugar_g * scale;
    totals.added_sugar_g += food.macros.added_sugar_g * scale;
    totals.saturated_fat_g += food.macros.saturated_fat_g * scale;
    totals.sodium_mg += food.micros.sodium_mg * scale;
    totals.potassium_mg += food.micros.potassium_mg * scale;
    totals.calcium_mg += food.micros.calcium_mg * scale;
    totals.magnesium_mg += food.micros.magnesium_mg * scale;
    totals.iron_mg += food.micros.iron_mg * scale;
    totals.zinc_mg += food.micros.zinc_mg * scale;
    totals.selenium_mcg += food.micros.selenium_mcg * scale;
    totals.vitamin_a_mcg += food.micros.vitamin_a_mcg * scale;
    totals.vitamin_b12_mcg += food.micros.vitamin_b12_mcg * scale;
    totals.vitamin_c_mg += food.micros.vitamin_c_mg * scale;
    totals.vitamin_d_mcg += food.micros.vitamin_d_mcg * scale;
    totals.vitamin_e_mg += food.micros.vitamin_e_mg * scale;
    totals.vitamin_k_mcg += food.micros.vitamin_k_mcg * scale;

    if (food.gi >= 0) {
      const kcalWeight = food.macros.kcal * scale;
      weightedGiSum += food.gi * kcalWeight;
      giWeightTotal += kcalWeight;
    }

    weightedProcessingPenalty += (PROCESSING_PENALTY[food.processing_level] ?? 10) * scale;
    categoriesSeen.add(food.category);
  }

  return {
    totals,
    averageGi: giWeightTotal > 0 ? weightedGiSum / giWeightTotal : -1,
    processingPenalty: weightedProcessingPenalty,
    distinctCategoryCount: categoriesSeen.size,
  };
}

/**
 * يحسب Meal Quality Score (0-100) لتركيبة وجبة.
 * @param {MealItem[]} mealItems
 * @param {Object} [microTargets] - من Nutrition Engine، لحساب تغطية المايكرو (اختياري)
 * @returns {{ score: number, breakdown: Object }}
 */
export function computeMealQualityScore(mealItems, microTargets = null) {
  if (!mealItems.length) return { score: 0, breakdown: {} };

  const { totals, averageGi, processingPenalty, distinctCategoryCount } = aggregateMealNutrients(mealItems);

  let score = 100;
  const breakdown = {};

  // 1) الألياف: هدف >= 3g لكل 200 kcal
  const fiberPer200kcal = totals.kcal > 0 ? (totals.fiber_g / totals.kcal) * 200 : 0;
  const fiberPenalty = fiberPer200kcal < 3 ? (3 - fiberPer200kcal) * 4 : 0;
  breakdown.fiberPenalty = round1(fiberPenalty);
  score -= fiberPenalty;

  // 2) السكر المضاف: نسبة سعراته من إجمالي الوجبة
  const addedSugarKcalPct = totals.kcal > 0 ? (totals.added_sugar_g * 4 / totals.kcal) * 100 : 0;
  const addedSugarPenalty = Math.max(0, addedSugarKcalPct - 5) * 2; // سماح حتى 5%، بعدها عقوبة مضاعفة
  breakdown.addedSugarPenalty = round1(addedSugarPenalty);
  score -= addedSugarPenalty;

  // 3) الصوديوم: حد إرشادي 800mg للوجبة الواحدة (لغير مرضى الكلى/الضغط، القيود الطبية تُطبَّق منفصلة في Decision Engine)
  const sodiumPenalty = totals.sodium_mg > 800 ? Math.min(25, (totals.sodium_mg - 800) / 40) : 0;
  breakdown.sodiumPenalty = round1(sodiumPenalty);
  score -= sodiumPenalty;

  // 4) الدهون المشبعة: نسبة سعراتها
  const satFatKcalPct = totals.kcal > 0 ? (totals.saturated_fat_g * 9 / totals.kcal) * 100 : 0;
  const satFatPenalty = Math.max(0, satFatKcalPct - 10) * 1.5;
  breakdown.satFatPenalty = round1(satFatPenalty);
  score -= satFatPenalty;

  // 5) درجة المعالجة الصناعية (متوسط مرجّح بالوزن)
  breakdown.processingPenalty = round1(processingPenalty);
  score -= processingPenalty;

  // 6) تنوع الفئات: مكافأة لتنوع >=2 فئة، أقصى مكافأة عند 3+
  const varietyBonus = Math.min(distinctCategoryCount - 1, 2) * 5;
  breakdown.varietyBonus = round1(varietyBonus);
  score += varietyBonus;

  // 7) GI المتوسط المرجّح: عقوبة تدريجية فوق 55
  const giPenalty = averageGi > 55 ? (averageGi - 55) * 0.4 : 0;
  breakdown.giPenalty = round1(giPenalty);
  score -= giPenalty;

  // 8) تغطية المايكرو (اختياري، لو أُتيحت أهداف للمقارنة)
  if (microTargets) {
    const microKeys = ['calcium_mg', 'iron_mg', 'vitamin_c_mg', 'vitamin_d_mcg', 'potassium_mg', 'magnesium_mg'];
    let coveredCount = 0;
    for (const key of microKeys) {
      const target = microTargets[key];
      if (target && totals[key] / target >= 0.15) coveredCount += 1; // >=15% من الهدف اليومي في وجبة واحدة يُعتبر مساهمة معتبرة
    }
    const microBonus = (coveredCount / microKeys.length) * 10;
    breakdown.microCoverageBonus = round1(microBonus);
    score += microBonus;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, breakdown, totals, averageGi: round1(averageGi) };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** تصنيف نصي للـMeal Quality Score */
export function classifyMealQualityScore(score) {
  if (score >= 85) return 'ممتاز';
  if (score >= 70) return 'جيد جدًا';
  if (score >= 55) return 'مقبول';
  if (score >= 40) return 'ضعيف';
  return 'غير موصى به';
}
