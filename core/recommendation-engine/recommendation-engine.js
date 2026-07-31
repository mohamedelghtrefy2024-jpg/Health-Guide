/**
 * ============================================================================
 * Recommendation Engine
 * ============================================================================
 * يحوّل نواتج Tracking Engine + Nutrition Engine + Analytics Engine لتوصيات
 * نصية جاهزة للعرض في الـDashboard وصفحة "النصائح والتوصيات" (§4، §11 من
 * مستند الرؤية). لا يخزّن أي شيء بنفسه — قراءة وتحويل فقط، بنفس فلسفة
 * Analytics Engine.
 *
 * **نطاق الإصدار الأول (مطابق للمستند)**: توصيات فورية مبنية مباشرة على
 * أرقام اليوم الفعلية مقابل الأهداف (مثال المستند الحرفي: "ناقصك 20 جرام
 * بروتين النهاردة") + نصائح عامة وأخرى مخصّصة لكل حالة مرضية مع تذكير دائم
 * بمتابعة الطبيب + رسالة مؤشر التزام أسبوعي بسيطة.
 *
 * **توصيات تفاعلية لثبات الوزن (بند 1.5/12، مُنجَز)**: `getWeightStabilityRecommendation()`
 * تقارن اتجاه الوزن الفعلي (انحدار خطي من `detectWeightTrendPattern()` في
 * Analytics Engine) بالمعدل المخطَّط له من `calorieTarget.dailyAdjustment`،
 * وتُرجع توصية واحدة (ثبات/Plateau، عكس الاتجاه، أسرع من المتوقَّع، أو تحذير
 * أمان عند سرعة غير آمنة) أو null لو التقدم مطابق للخطة. تحتاج بيانات وزن
 * كافية (>=3 نقاط، مدى >=10 أيام) وإلا بترجع توصية تشجيع على التسجيل بدل
 * استنتاج غير موثوق.
 * ============================================================================
 */

'use strict';

import { CONDITION_LABEL_AR } from '../decision-engine/medical-engine.js';

export const RECOMMENDATION_SEVERITY = Object.freeze({
  POSITIVE: 'positive',
  INFO: 'info',
  WARNING: 'warning',
});

// حدود القرار — كل عتبة موثّقة سببها بجانبها
const PROTEIN_GAP_THRESHOLD_G = 10; // فرق أقل من كده مش يستاهل تنبيه (ضوضاء قياس طبيعية)
const CALORIE_REMAINING_INFO_RATIO = 0.15; // لو باقي أكتر من 15% من الهدف يستاهل تذكير
const CALORIE_OVER_WARNING_RATIO = 0.10; // لو اتجاوز الهدف بأكتر من 10% يستاهل تحذير
const SAT_FAT_LIMIT_KCAL_RATIO = 0.10; // إرشاد WHO العام: أقل من 10% من السعرات من دهون مشبعة
const SODIUM_HIGH_RISK_CONDITIONS = Object.freeze(['hypertension', 'ckd', 'ckd_dialysis']);
const SAT_FAT_HIGH_RISK_CONDITIONS = Object.freeze(['dyslipidemia', 'heart_disease']);

/**
 * يبني توصيات فورية للوحة التحكم من إجماليات اليوم الفعلية مقابل أهداف
 * المستخدم. لا يفترض أي تسجيل مسبق — لو مفيش وجبات مسجَّلة النهاردة، بيرجّع
 * توصية واحدة بس تشجّع على أول تسجيل بدل قسمة على صفر/رسائل مضلِّلة.
 *
 * @param {Object|null} dailyTotals - ناتج computeDailyTotals() من Tracking Engine
 * @param {Object} nutritionProfile - ناتج calculateFullNutritionProfile() من Nutrition Engine
 * @param {string[]} [medicalConditions=[]] - أكواد من MEDICAL_CONDITION
 * @returns {Array<{type:string, severity:string, message_ar:string}>}
 */
export function getInstantRecommendations(dailyTotals, nutritionProfile, medicalConditions = []) {
  const recs = [];

  if (!dailyTotals || !dailyTotals.nutrition) {
    recs.push({
      type: 'no_meals_logged',
      severity: RECOMMENDATION_SEVERITY.INFO,
      message_ar: 'لسه ما سجلتش أي وجبة النهاردة — سجّل وجبتك الأولى عشان نقدر نتابع تقدمك.',
    });
    return recs;
  }

  const totals = dailyTotals.nutrition;
  const { calorieTarget, macroTargets, microTargets } = nutritionProfile;
  const targetKcal = calorieTarget.targetCalories;

  // 1) السعرات
  const kcalRemaining = targetKcal - totals.kcal;
  if (kcalRemaining > targetKcal * CALORIE_REMAINING_INFO_RATIO) {
    recs.push({
      type: 'calories_remaining',
      severity: RECOMMENDATION_SEVERITY.INFO,
      message_ar: `باقيلك ${Math.round(kcalRemaining)} سعرة النهاردة عشان توصل لهدفك.`,
    });
  } else if (totals.kcal > targetKcal * (1 + CALORIE_OVER_WARNING_RATIO)) {
    recs.push({
      type: 'calories_exceeded',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: `تجاوزت السعرات المستهدفة بحوالي ${Math.round(totals.kcal - targetKcal)} سعرة النهاردة.`,
    });
  }

  // 2) البروتين — نفس مثال المستند الحرفي
  const proteinGap = macroTargets.protein_g - totals.protein_g;
  if (proteinGap > PROTEIN_GAP_THRESHOLD_G) {
    recs.push({
      type: 'protein_gap',
      severity: RECOMMENDATION_SEVERITY.INFO,
      message_ar: `ناقصك ${Math.round(proteinGap)} جرام بروتين النهاردة.`,
    });
  }

  // 3) الصوديوم — حد أقصى عام (microTargets.sodium_mg هدف "لا يتجاوز" وليس أدنى)
  if (totals.sodium_mg > microTargets.sodium_mg) {
    const isHighRisk = medicalConditions.some((c) => SODIUM_HIGH_RISK_CONDITIONS.includes(c));
    recs.push({
      type: 'sodium_high',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: isHighRisk
        ? `الصوديوم اليوم تجاوز الحد الموصى به (${Math.round(totals.sodium_mg)} من ${microTargets.sodium_mg} ملجم) — ده مهم بالذات مع حالتك، راجع طبيبك لو تكرر.`
        : `الصوديوم اليوم تجاوز الحد الموصى به (${Math.round(totals.sodium_mg)} من ${microTargets.sodium_mg} ملجم).`,
    });
  }

  // 4) الدهون المشبعة — مقارنة بحد نسبي من السعرات المستهدفة (WHO)
  const satFatLimitG = (targetKcal * SAT_FAT_LIMIT_KCAL_RATIO) / 9;
  if (totals.saturated_fat_g > satFatLimitG) {
    const isHighRisk = medicalConditions.some((c) => SAT_FAT_HIGH_RISK_CONDITIONS.includes(c));
    recs.push({
      type: 'saturated_fat_high',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: isHighRisk
        ? 'الدهون المشبعة اليوم أعلى من الموصى به — مهم جدًا مع حالتك، حاول تقلل المقلي والدهون الحيوانية الصلبة.'
        : `الدهون المشبعة اليوم أعلى شوية من الموصى به (الحد التقريبي ~${Math.round(satFatLimitG)} جم).`,
    });
  }

  // لو مفيش أي تحذير أو نقص محسوب، رسالة تشجيعية بدل صفحة فاضية
  if (recs.length === 0) {
    recs.push({
      type: 'on_track',
      severity: RECOMMENDATION_SEVERITY.POSITIVE,
      message_ar: 'أداءك اليوم متوازن بالنسبة لأهدافك — كمّل كده!',
    });
  }

  return recs;
}

const GENERAL_TIPS_AR = Object.freeze([
  'اشرب مية كفاية على مدار اليوم — العطش أحيانًا بيتلخبط بالجوع.',
  'حاول تاكل بروتين في كل وجبة — بيساعد على الشبع وبيحافظ على الكتلة العضلية وانت بتنزل وزن.',
  'النوم الكويس (7-9 ساعات) له تأثير مباشر على هرمونات الجوع والشبع.',
  'النزول التدريجي (نص كيلو لكيلو في الأسبوع) أنسب للاستمرارية من الحميات القاسية.',
  'ركّز على الصورة الكاملة للأسبوع مش يوم واحد بس — يوم زيادة مش نهاية العالم.',
]);

// نصيحة واحدة مركّزة لكل حالة — تفصيل طبي أعمق مسؤولية الطبيب/الاختصاصي
const CONDITION_TIPS_AR = Object.freeze({
  diabetes_t1: 'راقب نسبة السكر بانتظام، وتابع مع طبيبك أي تعديل جرعة إنسولين مرتبط بتغيير نظامك الغذائي.',
  diabetes_t2: 'توزيع الكارب بانتظام على مدار اليوم أهم من إجمالي الكمية نفسها.',
  hypertension: 'قلل الصوديوم والأطعمة المصنّعة، وتابع قياس ضغطك بانتظام.',
  ckd: 'مرضى الكلى محتاجين متابعة دقيقة للصوديوم والبوتاسيوم والفوسفور مع اختصاصي تغذية كلوية.',
  ckd_dialysis: 'الغسيل الكلوي محتاج قيود أشد على السوائل والبوتاسيوم والفوسفور — قرارات لازم تتاخد مع فريقك الطبي مباشرة.',
  liver_disease: 'كمية البروتين المناسبة لحالتك بتختلف حسب مرحلة المرض — استشر طبيبك تحديدًا في النقطة دي.',
  gout: 'قلل الأطعمة عالية البيورين (اللحوم الحمراء، المأكولات البحرية، الكبدة) وحافظ على شرب مية كفاية.',
  celiac: 'تأكد إن كل مكوّن خالي من الجلوتين تمامًا — التلوث التقاطعي في المطبخ مهم برضه.',
  ibs_fodmap: 'قلّل الأطعمة عالية الـFODMAP تدريجيًا وسجّل رد فعل جسمك، وده أفضل مع متابعة اختصاصي تغذية.',
  gerd: 'قلل الوجبات الدسمة/الحارة قبل النوم بفترة كافية، وتجنب الاستلقاء فورًا بعد الأكل.',
  dyslipidemia: 'قلل الدهون المشبعة والمتحولة، وزوّد الألياف والدهون غير المشبعة (زيت زيتون، مكسرات، أسماك).',
  heart_disease: 'الصوديوم والدهون المشبعة أهم نقطتين تتابعهم يوميًا، بالتنسيق مع طبيب القلب.',
  pcos: 'التركيز على الكارب المعقد وتقليل السكريات المضافة بيساعد مع مقاومة الأنسولين المرتبطة بالحالة.',
  hypothyroidism: 'تابع مستوى الطاقة والوزن مع طبيبك، لأن التمثيل الغذائي بيتأثر مباشرة بجرعة الدواء.',
  anemia: 'ركّز على مصادر الحديد (خصوصًا الحيواني) مع فيتامين سي لتحسين الامتصاص، وتابع تحليل الدم بانتظام.',
  osteoporosis: 'الكالسيوم وفيتامين د أساسيين، وتمارين حمل الوزن بتساعد في الحفاظ على كثافة العظام.',
});

/**
 * يبني قائمة نصائح: عامة دايمًا + نصيحة واحدة إضافية لكل حالة مرضية موجودة
 * بالبروفايل، كل نصيحة حالة بتنتهي بتذكير صريح بمتابعة الطبيب (§11 بالمستند).
 * @param {string[]} [medicalConditions=[]]
 * @returns {Array<{type:string, condition?:string, condition_label_ar?:string, message_ar:string}>}
 */
export function getGeneralTips(medicalConditions = []) {
  const tips = GENERAL_TIPS_AR.map((text) => ({ type: 'general', message_ar: text }));

  for (const condition of medicalConditions) {
    const text = CONDITION_TIPS_AR[condition];
    if (!text) continue; // كود غير معروف — نتجاهله بأمان بدل ما نكسر
    tips.push({
      type: 'condition',
      condition,
      condition_label_ar: CONDITION_LABEL_AR[condition] ?? condition,
      message_ar: `${text} (تذكير: دي نصيحة عامة ومتقدرش تغني عن متابعة طبيبك المباشرة).`,
    });
  }

  return tips;
}

/**
 * يحوّل ناتج computeAdherenceScore() (Tracking Engine) لرسالة نصية واحدة.
 * @param {{trackedDays:number, compliantDays:number, adherencePct:number|null}|null} adherenceResult
 */
export function getAdherenceTip(adherenceResult) {
  if (!adherenceResult || adherenceResult.adherencePct === null) {
    return {
      type: 'adherence_no_data',
      severity: RECOMMENDATION_SEVERITY.INFO,
      message_ar: 'سجّل وجباتك بانتظام كذا يوم عشان نقدر نحسبلك مؤشر الالتزام الأسبوعي.',
    };
  }

  const pct = adherenceResult.adherencePct;
  if (pct >= 80) {
    return { type: 'adherence_high', severity: RECOMMENDATION_SEVERITY.POSITIVE, message_ar: `التزامك ممتاز الأسبوع ده (${pct}%) — استمر!` };
  }
  if (pct >= 50) {
    return { type: 'adherence_medium', severity: RECOMMENDATION_SEVERITY.INFO, message_ar: `التزامك متوسط الأسبوع ده (${pct}%) — في مجال للتحسين.` };
  }
  return { type: 'adherence_low', severity: RECOMMENDATION_SEVERITY.WARNING, message_ar: `التزامك منخفض الأسبوع ده (${pct}%) — حاول تسجّل وجباتك بانتظام أكتر عشان نقدر نساعدك صح.` };
}

// -----------------------------------------------------------------------
// توصيات تفاعلية لثبات الوزن / مؤشرات غير طبيعية (بند 1.5/12 — §11 بالمستند)
// -----------------------------------------------------------------------
// كل الحدود موثّقة سببها بجانبها، بنفس فلسفة الثوابت فوق. القيم مبنية على
// KCAL_PER_KG_BODYFAT=7700 وحدود الأمان الأسبوعية نفسها المُستخدَمة في
// Nutrition Engine (mirrored هنا عمدًا بدل استيراد متبادل بين الاثنين،
// بنفس مبدأ الفصل المُتّبع في باقي المشروع بين diet-engine ونutrition-engine).

const KCAL_PER_KG_BODYFAT = 7700;
const SAFETY_MAX_WEEKLY_LOSS_KG = 1.0;
const SAFETY_MAX_WEEKLY_GAIN_KG = 0.5;

const WEEKLY_CHANGE_NOISE_EPSILON_KG = 0.05; // أقل من كده = "شبه صفر" فعليًا (دقة قياس الميزان)
const PLATEAU_RATIO_MAX = 0.25; // فعلي أقل من 25% من المخطَّط = ثبات (Plateau) يستاهل تنبيه
const RAPID_RATIO_MIN = 1.6; // فعلي أكتر من 1.6 ضعف المخطَّط = أسرع من الخطة، يستاهل مراجعة
const MAINTAIN_TOLERANCE_KG_PER_WEEK = 0.3; // لهدف الثبات/إعادة التكوين: تذبذب أكتر من كده مش طبيعي
const MIN_ADHERENCE_TRACKED_DAYS = 5; // من أصل 7 — أقل من كده مينفعش نعزو الثبات لالتزام حقيقي

/**
 * يبني توصية تفاعلية واحدة (أو null لو مفيش داعي) بمقارنة اتجاه الوزن
 * الفعلي (من `detectWeightTrendPattern()` بـAnalytics Engine) بالمعدل
 * المخطَّط له حسب هدف المستخدم والسعرات المستهدفة. الترتيب المتّبع:
 * 1) بيانات غير كافية → توصية تشجيع على تسجيل أكتر (مفيش استنتاج بدون بيانات)
 * 2) قيد أمان مطلق (سرعة نزول/زيادة تتجاوز الحد الآمن) — يسبق أي مقارنة بالخطة
 * 3) هدف ثبات/إعادة تكوين: أي تذبذب واضح غير متوقَّع
 * 4) هدف خسارة/زيادة: عكس الاتجاه، أو ثبات (Plateau) رغم الخطة، أو أسرع من المتوقَّع
 * @param {ReturnType<import('../analytics-engine/analytics-engine.js').detectWeightTrendPattern>} weightPattern
 * @param {string} goal - أحد قيم GOAL (lose/gain/maintain/recomp)
 * @param {{targetCalories:number, dailyAdjustment:number}} calorieTarget - ناتج calculateCalorieTarget()
 * @param {{trackedDays:number, compliantDays:number, adherencePct:number|null}|null} [adherenceResult] - عن نفس فترة اتجاه الوزن تقريبًا
 * @returns {{type:string, severity:string, message_ar:string}|null}
 */
export function getWeightStabilityRecommendation(weightPattern, goal, calorieTarget, adherenceResult = null) {
  if (!weightPattern || weightPattern.status !== 'ok') {
    return {
      type: 'weight_trend_insufficient_data',
      severity: RECOMMENDATION_SEVERITY.INFO,
      message_ar: 'سجّل وزنك بانتظام (مرتين أسبوعيًا على الأقل، لمدة أسبوعين تقريبًا) عشان نقدر نحلّل اتجاه وزنك الحقيقي ونديك توصيات مبنية عليه.',
    };
  }

  const actualWeeklyKg = weightPattern.weeklyRateKg; // سالب = نزول، موجب = زيادة

  // 1) قيد أمان مطلق — سرعة تتجاوز الحد الآمن بغض النظر عن الخطة المحسوبة
  if (goal === 'lose' && actualWeeklyKg < -SAFETY_MAX_WEEKLY_LOSS_KG) {
    return {
      type: 'weight_loss_too_fast',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: `وزنك بينزل بمعدل أسرع من الحد الآمن (~${Math.abs(actualWeeklyKg)} كجم/أسبوع) — ده ممكن يشمل فقدان كتلة عضلية مش دهون بس. يُنصح تراجع طبيبك أو أخصائي تغذية قريب.`,
    };
  }
  if (goal === 'gain' && actualWeeklyKg > SAFETY_MAX_WEEKLY_GAIN_KG) {
    return {
      type: 'weight_gain_too_fast',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: `وزنك بيزيد بمعدل أسرع من الحد الآمن (~${actualWeeklyKg} كجم/أسبوع) — ده ممكن يزوّد نسبة الدهون أكتر من العضلات. جرّب تقلل الفائض شوية.`,
    };
  }

  // 2) هدف ثبات/إعادة تكوين — المفروض الوزن يفضل شبه ثابت أصلًا؛ أي تذبذب واضح يستاهل مراجعة
  if (goal === 'maintain' || goal === 'recomp') {
    if (Math.abs(actualWeeklyKg) > MAINTAIN_TOLERANCE_KG_PER_WEEK) {
      return {
        type: 'weight_unexpected_change_at_maintenance',
        severity: RECOMMENDATION_SEVERITY.INFO,
        message_ar: `وزنك بيتغيّر بمعدل ~${actualWeeklyKg > 0 ? '+' : ''}${actualWeeklyKg} كجم/أسبوع رغم إن هدفك ${goal === 'recomp' ? 'إعادة تكوين الجسم' : 'ثبات الوزن'} — راجع دقة تسجيل وجباتك وحجم الحصص، ممكن يكون فيه فرق فعلي عن السعرات المفترضة (${calorieTarget.targetCalories}).`,
      };
    }
    return null; // ثبات فعلي وده بالظبط المطلوب — مفيش داعي لتنبيه
  }

  // 3) هدف خسارة/زيادة وزن — مقارنة الفعلي بالمخطَّط من calorieTarget.dailyAdjustment
  const expectedWeeklyKg = (calorieTarget.dailyAdjustment * 7) / KCAL_PER_KG_BODYFAT;
  if (expectedWeeklyKg === 0) return null; // احتياطي أمان (نظريًا لا يحدث مع goal=lose/gain لأن dailyAdjustment != 0 دايمًا)

  const isEffectivelyZero = Math.abs(actualWeeklyKg) < WEEKLY_CHANGE_NOISE_EPSILON_KG;
  const sameDirection = isEffectivelyZero || Math.sign(actualWeeklyKg) === Math.sign(expectedWeeklyKg);

  if (!isEffectivelyZero && !sameDirection) {
    return {
      type: 'weight_moving_opposite_direction',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: `وزنك ${actualWeeklyKg > 0 ? 'بيزيد' : 'بينزل'} بمعدل ~${Math.abs(actualWeeklyKg)} كجم/أسبوع، رغم إن هدفك ${goal === 'lose' ? 'خسارة وزن' : 'زيادة وزن'} — تأكد إنك فعلاً بتلتزم بالسعرات المستهدفة (${calorieTarget.targetCalories} سعرة)، ولو ملتزم فعلاً يبقى الأفضل تتابع مع أخصائي تغذية للاطمئنان.`,
    };
  }

  const ratio = Math.abs(actualWeeklyKg / expectedWeeklyKg);

  if (ratio < PLATEAU_RATIO_MAX) {
    const hasEnoughAdherenceData = adherenceResult && adherenceResult.trackedDays >= MIN_ADHERENCE_TRACKED_DAYS;
    if (!hasEnoughAdherenceData) {
      return {
        type: 'weight_plateau_unclear_adherence',
        severity: RECOMMENDATION_SEVERITY.INFO,
        message_ar: 'وزنك شبه ثابت في الفترة الأخيرة، بس تسجيلك للوجبات مش منتظم كفاية عشان نقول ده ثبات حقيقي (Plateau) ولا مجرد سعرات فعلية أعلى/أقل من المسجَّل. سجّل وجباتك يوميًا كذا يوم كمان عشان نقدر نأكد.',
      };
    }
    return {
      type: 'weight_plateau',
      severity: RECOMMENDATION_SEVERITY.WARNING,
      message_ar: `وزنك تقريبًا ثابت آخر ${weightPattern.spanDays} يوم رغم التزامك بتسجيل وجباتك — ده طبيعي بيحصل مع الوقت (Plateau). جرّب: (1) تأكد من دقة وزن الحصص بالجرام، (2) زوّد نشاطك اليومي شوية، أو (3) لو الثبات فضل مستمر أكتر من أسبوعين كمان، ممكن تحتاج تقليل السعرات المستهدفة تدريجيًا بالتنسيق مع أخصائي تغذية.`,
    };
  }

  if (ratio > RAPID_RATIO_MIN) {
    return {
      type: 'weight_change_faster_than_expected',
      severity: RECOMMENDATION_SEVERITY.INFO,
      message_ar: `وزنك بيتغيّر أسرع من المتوقَّع حسب خطتك (${Math.abs(actualWeeklyKg)} كجم/أسبوع فعليًا مقابل ~${Math.abs(expectedWeeklyKg).toFixed(2)} كجم/أسبوع مخطَّط) — لو حاسس إنك مش بتاكل أقل من كده، يفضّل تتابع مع طبيبك للاطمئنان.`,
    };
  }

  return null; // التقدم مطابق تقريبًا للخطة — لا داعي لأي تنبيه إضافي
}
