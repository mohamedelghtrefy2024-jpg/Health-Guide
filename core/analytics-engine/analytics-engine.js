/**
 * ============================================================================
 * Analytics Engine
 * ============================================================================
 * يحوّل سجلات Tracking Engine الخام لبيانات جاهزة للرسم البياني (اتجاه
 * الوزن، السعرات، الالتزام) ويقارن أفضل أسبوع بأسوأ أسبوع لتحديد الأنماط،
 * حسب متطلب المستند. لا يخزّن أي شيء بنفسه — قراءة وتحويل فقط.
 * ============================================================================
 */

'use strict';

import { STORE, getAllRecords } from '../storage/storage-engine.js';
import { computeDailyTotals } from '../tracking-engine/tracking-engine.js';
import { estimateBodyFatPercentNavy } from '../nutrition-engine/nutrition-engine.js';

/** يبني سلسلة زمنية لاتجاه الوزن من سجلات تتبع يومية تحتوي حقل weight (لو مُسجَّل) */
export async function getWeightTrend(dateRange) {
  const dailyRecords = await getAllRecords(STORE.DAILY_TRACKING);
  const byDate = new Map(dailyRecords.map((r) => [r.date, r]));

  return dateRange
    .map((date) => ({ date, weightKg: byDate.get(date)?.weightKg ?? null }))
    .filter((point) => point.weightKg !== null);
}

/** يبني سلسلة زمنية لاتجاه الماء من نفس سجلات `daily_tracking` (حقل waterMl لو مُسجَّل) */
export async function getWaterTrend(dateRange) {
  const dailyRecords = await getAllRecords(STORE.DAILY_TRACKING);
  const byDate = new Map(dailyRecords.map((r) => [r.date, r]));

  return dateRange
    .map((date) => ({ date, waterMl: byDate.get(date)?.waterMl ?? null }))
    .filter((point) => point.waterMl !== null);
}

/** يبني سلسلة زمنية للسعرات الفعلية يوميًا (من الوجبات المسجَّلة فعليًا) */
export async function getCalorieTrend(dateRange, resolveFoodById) {
  const points = [];
  const allMealLogs = await getAllRecords(STORE.MEAL_LOGS);
  for (const date of dateRange) {
    const daily = await computeDailyTotals(date, resolveFoodById, allMealLogs);
    points.push({ date, kcal: daily.nutrition?.kcal ?? null });
  }
  return points;
}

/**
 * يبني سلسلة زمنية لتركيب الجسم (نسبة دهون + كتلة دهون/كتلة خالية من الدهون
 * تقديرية) — الفجوة المتبقية من بند 13 اللي احتاجت قرار منتج قبل البناء
 * (راجع S16): القرار المُتخذ هو الاعتماد على نسبة الدهون المقاسة مباشرة لو
 * اتسجلت لليوم، وإلا تقدير معادلة Navy من محيط الخصر/الرقبة(/الأرداف)
 * المسجَّلين لنفس اليوم إن وُجدوا، وإلا نفس القياسات المحفوظة في البروفايل
 * كـfallback (بفرض إنها ما اتغيّرتش كتير من يوم للتاني). أيام من غير وزن
 * مسجَّل، أو من غير أي مصدر لنسبة الدهون، بتتفلتر تمامًا (مفيش قيم تقديرية
 * مضلِّلة).
 * @param {string[]} dateRange
 * @param {Object} profile - بروفايل المستخدم الحالي (لقياسات fallback + الطول/الجنس)
 */
export async function getBodyCompositionTrend(dateRange, profile) {
  const dailyRecords = await getAllRecords(STORE.DAILY_TRACKING);
  const byDate = new Map(dailyRecords.map((r) => [r.date, r]));

  const points = [];
  for (const date of dateRange) {
    const rec = byDate.get(date);
    if (!rec || typeof rec.weightKg !== 'number') continue;

    let bodyFatPercent = typeof rec.bodyFatPercent === 'number' ? rec.bodyFatPercent : null;
    let source = bodyFatPercent !== null ? 'measured' : null;

    if (bodyFatPercent === null && profile) {
      const waistCm = rec.waistCm ?? profile.waistCm;
      const neckCm = rec.neckCm ?? profile.neckCm;
      const hipCm = rec.hipCm ?? profile.hipCm;
      const heightCm = profile.heightCm;
      if (typeof waistCm === 'number' && typeof neckCm === 'number' && typeof heightCm === 'number') {
        const navy = estimateBodyFatPercentNavy({ gender: profile.gender, waistCm, neckCm, heightCm: Number(heightCm), hipCm });
        if (navy.value !== null) {
          bodyFatPercent = navy.value;
          source = 'navy_estimate';
        }
      }
    }

    if (bodyFatPercent === null) continue; // مفيش مصدر لنسبة الدهون لليوم ده — استبعاد بدل قيمة مضلِّلة

    const fatMassKg = +(rec.weightKg * (bodyFatPercent / 100)).toFixed(1);
    const leanMassKg = +(rec.weightKg - fatMassKg).toFixed(1);
    points.push({ date, weightKg: rec.weightKg, bodyFatPercent, fatMassKg, leanMassKg, source });
  }

  return points;
}

// حدود اعتمادية اتجاه الوزن — أقل من كده الرقم مش موثوق يُبنى عليه استدلال
// (تذبذب الماء اليومي الطبيعي ممكن يدّي انطباع مضلِّل مع بيانات قليلة/مدى قصير)
const MIN_WEIGHT_TREND_POINTS = 3;
const MIN_WEIGHT_TREND_SPAN_DAYS = 10;

function daysBetweenDates(dateA, dateB) {
  return Math.round((new Date(dateB) - new Date(dateA)) / 86400000);
}

/**
 * يحلل نمط تغيّر الوزن الفعلي (كجم/أسبوع) من سلسلة نقاط `getWeightTrend()`،
 * باستخدام انحدار خطي بسيط (Least Squares) على كل النقاط المتاحة بدل الفرق
 * بين أول وآخر نقطة بس — عشان تسجيل غير منتظم يدّي معدل تمثيلي حقيقي مش
 * نتيجة محكومة بيومين طرفيين قد يكونا شاذّين (احتباس مية، أكلة كبيرة، إلخ).
 * ده الأساس اللي بند 1.5/12 (التوصيات التفاعلية لثبات الوزن) هيتبني عليه.
 * يرفض الحساب صراحة (status: 'insufficient_data') لو البيانات مش كافية،
 * بدل إرجاع رقم غير موثوق ممكن يوصل لاستنتاج مضلِّل.
 * @param {Array<{date:string, weightKg:number}>} weightTrend - ناتج getWeightTrend() (أي ترتيب)
 */
export function detectWeightTrendPattern(weightTrend) {
  if (!weightTrend || weightTrend.length < MIN_WEIGHT_TREND_POINTS) {
    return { status: 'insufficient_data', reason: 'not_enough_points', points: weightTrend?.length ?? 0 };
  }

  const sorted = [...weightTrend].sort((a, b) => new Date(a.date) - new Date(b.date));
  const spanDays = daysBetweenDates(sorted[0].date, sorted[sorted.length - 1].date);
  if (spanDays < MIN_WEIGHT_TREND_SPAN_DAYS) {
    return { status: 'insufficient_data', reason: 'range_too_short', points: sorted.length, spanDays };
  }

  const xs = sorted.map((p) => daysBetweenDates(sorted[0].date, p.date));
  const ys = sorted.map((p) => p.weightKg);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denominator = n * sumXX - sumX * sumX;
  // denominator = 0 فقط لو كل نقاط x متطابقة، وده مستحيل هنا لأننا فلترنا
  // بـspanDays >= MIN_WEIGHT_TREND_SPAN_DAYS فوق (يبقى أكيد فيه x مختلفة)
  const slopePerDay = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

  return {
    status: 'ok',
    spanDays,
    points: n,
    weeklyRateKg: +(slopePerDay * 7).toFixed(2),
    startWeightKg: sorted[0].weightKg,
    endWeightKg: sorted[sorted.length - 1].weightKg,
  };
}

/**
 * يقسّم مدى تواريخ لأسابيع (كتل 7 أيام متتالية من بداية المصفوفة)، ويحسب
 * متوسط الالتزام بالسعرات لكل أسبوع، ويُرجع أفضل وأسوأ أسبوع للمقارنة.
 * @param {string[]} dateRangeAscending - مرتّبة من الأقدم للأحدث
 * @param {(id: string) => Object|null} resolveFoodById
 * @param {number} dailyCalorieTarget
 */
export async function compareBestWorstWeek(dateRangeAscending, resolveFoodById, dailyCalorieTarget) {
  const weeks = [];
  for (let i = 0; i < dateRangeAscending.length; i += 7) {
    weeks.push(dateRangeAscending.slice(i, i + 7));
  }

  const weekSummaries = [];
  const allMealLogs = await getAllRecords(STORE.MEAL_LOGS);
  for (const week of weeks) {
    if (week.length === 0) continue;
    let totalDeviation = 0;
    let trackedDays = 0;
    for (const date of week) {
      const daily = await computeDailyTotals(date, resolveFoodById, allMealLogs);
      if (!daily.nutrition) continue;
      trackedDays += 1;
      totalDeviation += Math.abs(daily.nutrition.kcal - dailyCalorieTarget);
    }
    if (trackedDays === 0) continue;
    weekSummaries.push({
      weekStart: week[0],
      weekEnd: week[week.length - 1],
      trackedDays,
      averageDeviation: Math.round(totalDeviation / trackedDays), // كل ما قلّ الانحراف عن الهدف، كل ما كان الأسبوع أفضل
    });
  }

  if (weekSummaries.length === 0) {
    return { bestWeek: null, worstWeek: null, weekSummaries: [] };
  }

  const sorted = [...weekSummaries].sort((a, b) => a.averageDeviation - b.averageDeviation);
  return {
    bestWeek: sorted[0],
    worstWeek: sorted[sorted.length - 1],
    weekSummaries,
  };
}
