/**
 * ============================================================================
 * Nutrition Calculation Engine
 * ============================================================================
 * يحسب BMR، TDEE (بمكوّناته TEF/NEAT/EAT منفصلة)، السعرات المستهدفة بمعدل
 * آمن حسب المدة المطلوبة، نطاق الوزن المثالي، وأهداف الماكرو/المايكرو
 * اليومية. هذا Engine مستقل تمامًا عن Decision Engine — بيحسب "كام" مش
 * "إيه المسموح"؛ Meal Generation Engine هو اللي هيربط الاتنين مع بعض.
 * ============================================================================
 */

'use strict';

// -----------------------------------------------------------------------
// ثوابت وجداول مرجعية
// -----------------------------------------------------------------------

export const ACTIVITY_LEVEL = Object.freeze({
  SEDENTARY: 'sedentary',
  LIGHT: 'light',
  MODERATE: 'moderate',
  ACTIVE: 'active',
  VERY_ACTIVE: 'very_active',
});

/** معامل النشاط (Harris-Benedict style) — يشمل ضمنيًا NEAT+EAT مجتمعين */
const ACTIVITY_MULTIPLIER = {
  [ACTIVITY_LEVEL.SEDENTARY]: 1.2,
  [ACTIVITY_LEVEL.LIGHT]: 1.375,
  [ACTIVITY_LEVEL.MODERATE]: 1.55,
  [ACTIVITY_LEVEL.ACTIVE]: 1.725,
  [ACTIVITY_LEVEL.VERY_ACTIVE]: 1.9,
};

/**
 * نسبة تقديرية لتقسيم "الحركة فوق BMR" بين NEAT (حركة غير رياضية تلقائية)
 * و EAT (تمرين مقصود) — تقدير عرضي فقط لأغراض العرض التوضيحي في لوحة
 * التحكم؛ لو المستخدم سجّل تمارين فعلية عبر Exercise Engine لاحقًا، EAT
 * الحقيقي يُستبدل بالمُسجَّل الفعلي بدل هذا التقدير.
 */
const NEAT_EAT_SPLIT = {
  [ACTIVITY_LEVEL.SEDENTARY]: { neat: 1.0, eat: 0.0 },
  [ACTIVITY_LEVEL.LIGHT]: { neat: 0.85, eat: 0.15 },
  [ACTIVITY_LEVEL.MODERATE]: { neat: 0.65, eat: 0.35 },
  [ACTIVITY_LEVEL.ACTIVE]: { neat: 0.5, eat: 0.5 },
  [ACTIVITY_LEVEL.VERY_ACTIVE]: { neat: 0.35, eat: 0.65 },
};

export const GOAL = Object.freeze({
  LOSE: 'lose',
  GAIN: 'gain',
  MAINTAIN: 'maintain',
  RECOMP: 'recomp', // إعادة تكوين الجسم — سعرات قريبة من الصيانة
});

/** حدود أمان صارمة — لا يُسمح بتجاوزها بغض النظر عن مدخلات المستخدم */
const SAFETY_LIMITS = {
  MAX_DAILY_DEFICIT_KCAL: 1000,
  MAX_DAILY_SURPLUS_KCAL: 500,
  MAX_WEEKLY_LOSS_KG: 1.0,
  MAX_WEEKLY_GAIN_KG: 0.5,
  MIN_CALORIES_FEMALE: 1200,
  MIN_CALORIES_MALE: 1500,
  KCAL_PER_KG_BODYFAT: 7700, // تقريب معياري شائع
};

/** جداول أهداف الماكرو حسب نمط الحمية — كنسب مئوية من السعرات (protein/carb/fat) */
const MACRO_RATIOS_BY_DIET = {
  normal: { protein: 0.25, carb: 0.45, fat: 0.30 },
  mediterranean: { protein: 0.20, carb: 0.45, fat: 0.35 },
  keto: { protein: 0.25, carb: 0.05, fat: 0.70 },
  low_carb: { protein: 0.30, carb: 0.20, fat: 0.50 },
  high_protein: { protein: 0.35, carb: 0.35, fat: 0.30 },
  vegetarian: { protein: 0.20, carb: 0.50, fat: 0.30 },
  vegan: { protein: 0.18, carb: 0.55, fat: 0.27 },
  pescatarian: { protein: 0.25, carb: 0.45, fat: 0.30 },
  dash: { protein: 0.20, carb: 0.50, fat: 0.30 },
  low_sodium: { protein: 0.22, carb: 0.48, fat: 0.30 },
  low_fat: { protein: 0.25, carb: 0.55, fat: 0.20 },
  intermittent_fasting: { protein: 0.30, carb: 0.40, fat: 0.30 },
  carnivore: { protein: 0.40, carb: 0.02, fat: 0.58 },
};

/** حد أدنى بروتين g/كجم وزن جسم — سقف أمان لا يُقل عنه بغض النظر عن نسبة الحمية */
const MIN_PROTEIN_G_PER_KG = 1.2;

// -----------------------------------------------------------------------
// نطاقات الماكرو الآمنة (بار التحكم اليدوي في الماكرو)
// -----------------------------------------------------------------------

/**
 * نطاقات AMDR عامة (Acceptable Macronutrient Distribution Range) كنسب
 * مئوية من السعرات — الحدود الافتراضية لأي بالغ بدون حالة مرضية خاصة.
 * بار التحكم اليدوي في الماكرو بالواجهة لازم يمنع أي قيمة خارج النطاق ده
 * (أو النطاق الأضيق حسب الحالة المرضية أدناه) بغض النظر عن اختيار المستخدم.
 */
const DEFAULT_MACRO_SAFE_RANGE = {
  protein: { min: 0.10, max: 0.35 },
  carb: { min: 0.20, max: 0.65 },
  fat: { min: 0.15, max: 0.35 },
};

/**
 * تضييق نطاق البروتين الأقصى كنسبة مئوية لحالات مرضية بعينها — دفاع أول
 * (النسبة)، مع دفاع ثانٍ أدق بالجرام/كجم مُطبَّق مباشرة في
 * `calculateMacroTargets` (MAX_PROTEIN_G_PER_KG_BY_CONDITION) لأن حد الأمان
 * السريري للبروتين في هذه الحالات معبَّر عنه غالبًا كـ"جرام لكل كجم وزن"
 * وليس نسبة مئوية من السعرات.
 */
const PROTEIN_MAX_RATIO_BY_CONDITION = {
  ckd: 0.20,
  ckd_dialysis: 0.25, // غسيل الكلى يحتاج بروتين أعلى من CKD غير المتحاور نسبيًا، لكن لسه أقل من العام
  liver_disease: 0.25,
};

/** حد أقصى بروتين g/كجم وزن جسم لحالات كلوية — أدق سريريًا من النسبة المئوية (NKF KDOQI) */
const MAX_PROTEIN_G_PER_KG_BY_CONDITION = {
  ckd: 0.8,
  ckd_dialysis: 1.2,
};

/**
 * تضييق نطاق الكارب الأقصى لحالات السكري — إرشادي عام وليس بديلاً عن خطة
 * تغذية سريرية فردية.
 */
const CARB_MAX_RATIO_BY_CONDITION = {
  diabetes_t1: 0.50,
  diabetes_t2: 0.45,
};

/**
 * يحسب النطاق الآمن الفعلي (بروتين/كارب/دهون كنسب مئوية) لبروفايل معيّن —
 * الافتراضي مضيَّقًا بأي حالة مرضية ذات صلة موجودة بالبروفايل. هذا هو
 * المصدر الوحيد الموصى به لتحديد حدود بار التحكم اليدوي في الماكرو
 * بالواجهة (min/max كل مقبض)، وهو نفسه المستخدم لتقييد أي قيم مخصّصة تدخل
 * `calculateMacroTargets`.
 * @param {string[]} [medicalConditions]
 * @returns {{ protein: {min:number,max:number}, carb: {min:number,max:number}, fat: {min:number,max:number} }}
 */
export function resolveSafeMacroRange(medicalConditions = []) {
  const range = {
    protein: { ...DEFAULT_MACRO_SAFE_RANGE.protein },
    carb: { ...DEFAULT_MACRO_SAFE_RANGE.carb },
    fat: { ...DEFAULT_MACRO_SAFE_RANGE.fat },
  };

  for (const condition of medicalConditions) {
    if (PROTEIN_MAX_RATIO_BY_CONDITION[condition] !== undefined) {
      range.protein.max = Math.min(range.protein.max, PROTEIN_MAX_RATIO_BY_CONDITION[condition]);
    }
    if (CARB_MAX_RATIO_BY_CONDITION[condition] !== undefined) {
      range.carb.max = Math.min(range.carb.max, CARB_MAX_RATIO_BY_CONDITION[condition]);
    }
  }

  if (range.protein.max < range.protein.min) range.protein.max = range.protein.min;
  if (range.carb.max < range.carb.min) range.carb.max = range.carb.min;

  return range;
}

/**
 * يتحقق إن كانت نسب ماكرو مخصّصة (مجموعها 100% تقريبًا) داخل النطاق الآمن،
 * ويُرجع تشخيصًا واضحًا لو لأ — تُستخدم في الواجهة قبل حفظ بار التحكم
 * اليدوي، وكدفاع ثانٍ داخل `calculateMacroTargets` نفسها.
 * @param {{protein:number, carb:number, fat:number}} ratios - نسب من 0 إلى 1
 * @param {string[]} [medicalConditions]
 * @returns {{ valid: boolean, reason_ar: string|null, clamped: {protein:number, carb:number, fat:number} }}
 */
export function validateCustomMacroRatios(ratios, medicalConditions = []) {
  const range = resolveSafeMacroRange(medicalConditions);
  const sum = (ratios.protein ?? 0) + (ratios.carb ?? 0) + (ratios.fat ?? 0);

  if (Math.abs(sum - 1) > 0.02) {
    return {
      valid: false,
      reason_ar: `مجموع نسب الماكرو لازم يساوي 100% (المجموع الحالي: ${Math.round(sum * 100)}%)`,
      clamped: ratios,
    };
  }

  const clamped = {
    protein: Math.min(range.protein.max, Math.max(range.protein.min, ratios.protein)),
    carb: Math.min(range.carb.max, Math.max(range.carb.min, ratios.carb)),
    fat: Math.min(range.fat.max, Math.max(range.fat.min, ratios.fat)),
  };

  for (const key of ['protein', 'carb', 'fat']) {
    if (ratios[key] < range[key].min || ratios[key] > range[key].max) {
      const labelAr = { protein: 'البروتين', carb: 'الكارب', fat: 'الدهون' }[key];
      return {
        valid: false,
        reason_ar: `نسبة ${labelAr} (${Math.round(ratios[key] * 100)}%) خارج الحد الآمن (${Math.round(range[key].min * 100)}%–${Math.round(range[key].max * 100)}%)${medicalConditions.length ? ' حسب حالتك الصحية المسجَّلة' : ''}`,
        clamped,
      };
    }
  }

  return { valid: true, reason_ar: null, clamped };
}

/**
 * سعرات إضافية آمنة أثناء الحمل/الرضاعة (أرقام إرشادية عامة شائعة سريريًا،
 * وليست بديلاً عن استشارة طبية مباشرة) — تُضاف فوق TDEE بدل أي عجز/فائض
 * مبني على هدف المستخدم (خسارة/زيادة وزن). القيم مطابقة نصًا لقيم
 * PREGNANCY_STATUS في food-library/schema.js عمدًا (بدون استيراد متبادل،
 * حفاظًا على استقلالية Nutrition Engine عن أي Engine آخر بالتصميم).
 */
const PREGNANCY_CALORIE_ADJUSTMENT_KCAL = { pregnant: 300, breastfeeding: 500 };
const PREGNANCY_LABEL_AR = { pregnant: 'الحمل', breastfeeding: 'الرضاعة' };

/**
 * أنماط حمية عالية الخطورة أثناء الحمل/الرضاعة (تقييد كارب/سعرات حاد أو
 * نوافذ صيام طويلة) — تُستبدل تلقائيًا بالنمط العادي لحساب أهداف الماكرو
 * إلى حين استشارة طبية مباشرة. نفس مبدأ الاستبعاد مطبَّق بشكل مستقل في
 * Diet Engine (core/decision-engine/diet-engine.js) لاستبعاد الأصناف غير
 * المتوافقة من التوليد — الاثنان يعملان بالتوازي بدون استيراد متبادل.
 */
const HIGH_RISK_DIETS_DURING_PREGNANCY = new Set(['keto', 'intermittent_fasting']);

/** RDA مرجعي مبسّط لبالغين (خارج الحمل/الرضاعة) */
const MICRO_RDA_ADULT = {
  sodium_mg: 2300, // حد أقصى موصى به، وليس هدف أدنى
  potassium_mg: 3500,
  calcium_mg: 1000,
  magnesium_mg: 350,
  iron_mg: 12,
  zinc_mg: 10,
  selenium_mcg: 55,
  vitamin_a_mcg: 800,
  vitamin_b12_mcg: 2.4,
  vitamin_c_mg: 90,
  vitamin_d_mcg: 15,
  vitamin_e_mg: 15,
  vitamin_k_mcg: 90,
};

/**
 * أهداف مايكرو مُعدَّلة للحمل/الرضاعة — كانت المشكلة (موثَّقة سابقًا كـTODO):
 * `getMicroTargets()` كانت بترجع نفس جدول البالغين دائمًا بغض النظر عن حالة
 * الحمل/الرضاعة، رغم إن `calculateCalorieTarget()` بيلغي أي عجز سعرات فعليًا
 * وقتها — يعني الحمل كان بيتحسب صح للسعرات لكن الحديد/الكالسيوم/فيتامين A
 * وغيرهم كانوا بيتحسبوا "عادي" وقت أهم مرحلة لزيادتهم فعليًا. القيم هنا
 * مرجع مبسّط من جداول DRI/IOM المعروفة عمومًا (نفس منهجية بقية حدود
 * المستند)، **وليست بديلاً عن متابعة طبية مباشرة** — نفس التحذير الدائم
 * المعروض بالفعل في `pregnancyNotice` أدناه.
 */
const MICRO_RDA_PREGNANT = {
  ...MICRO_RDA_ADULT,
  iron_mg: 27,
  zinc_mg: 11,
  vitamin_a_mcg: 770,
  vitamin_b12_mcg: 2.6,
  vitamin_c_mg: 85,
  selenium_mcg: 60,
  magnesium_mg: 360,
  potassium_mg: 2900,
};

const MICRO_RDA_BREASTFEEDING = {
  ...MICRO_RDA_ADULT,
  iron_mg: 9,
  zinc_mg: 12,
  vitamin_a_mcg: 1300,
  vitamin_b12_mcg: 2.8,
  vitamin_c_mg: 120,
  selenium_mcg: 70,
  magnesium_mg: 310,
  potassium_mg: 2800,
  vitamin_e_mg: 19,
};

// -----------------------------------------------------------------------
// BMI ونطاق الوزن المثالي
// -----------------------------------------------------------------------

/**
 * يرجّع null (مش Infinity/NaN) لو الطول أو الوزن غير صالح للحساب (صفر، سالب،
 * أو غير رقمي) — عشان مايتصنّفش المستخدم بصمت كـ"سمنة درجة 3" بسبب بيانات
 * تالفة (مثلاً ملف استيراد اتعدّل يدويًا أو اتلف جزئيًا). النموذج الأساسي في
 * `ui/index.html` بيمنع القيم دي من الـOnboarding العادي، لكن الاستيراد
 * (`importAllData`) مش بيتحقق من منطقية القيم الرقمية.
 */
export function calculateBMI(weightKg, heightCm) {
  if (!Number.isFinite(heightCm) || heightCm <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }
  const heightM = heightCm / 100;
  return +(weightKg / (heightM * heightM)).toFixed(1);
}

/** تصنيف BMI مع لون إرشادي (يُستخدم في شريط BMI الملوّن بالمستند) */
export function classifyBMI(bmi) {
  if (bmi === null || !Number.isFinite(bmi)) return { label_ar: 'بيانات الطول/الوزن غير صالحة', color: '#6b7280' };
  if (bmi < 16) return { label_ar: 'نحافة شديدة', color: '#7f1d1d' };
  if (bmi < 18.5) return { label_ar: 'نحافة', color: '#f59e0b' };
  if (bmi < 25) return { label_ar: 'وزن طبيعي', color: '#22c55e' };
  if (bmi < 30) return { label_ar: 'زيادة وزن', color: '#f59e0b' };
  if (bmi < 35) return { label_ar: 'سمنة درجة 1', color: '#f97316' };
  if (bmi < 40) return { label_ar: 'سمنة درجة 2', color: '#ef4444' };
  return { label_ar: 'سمنة درجة 3', color: '#7f1d1d' };
}

/** نطاق الوزن المثالي بناءً على BMI 18.5–24.9 (وليس رقمًا واحدًا جامدًا) */
export function calculateIdealWeightRange(heightCm) {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return {
    min_kg: +(18.5 * heightM * heightM).toFixed(1),
    max_kg: +(24.9 * heightM * heightM).toFixed(1),
  };
}

// -----------------------------------------------------------------------
// هدف الماء اليومي
// -----------------------------------------------------------------------

/**
 * هدف ماء يومي إرشادي عام (35 مل × كجم وزن الجسم) — خط أساس شائع سريريًا،
 * وليس قيدًا صحيًا أو رقمًا حرفيًا من إرشادية طبية بعينها. يُستخدم فقط
 * كمرجع عرض في الواجهة (تاب التتبع)، ولا يدخل Decision Engine.
 * @param {number} weightKg
 * @returns {number|null} الهدف بالمليلتر (مقرَّب لأقرب 50 مل)، أو null لو الوزن غير صالح
 * (صفر/سالب/غير رقمي — مثلًا بروفايل ملوَّث من استيراد بيانات معطوب)
 */
export function calculateWaterTargetMl(weightKg) {
  if (typeof weightKg !== 'number' || !isFinite(weightKg) || weightKg <= 0) return null;
  const raw = weightKg * 35;
  return Math.round(raw / 50) * 50;
}

// -----------------------------------------------------------------------
// BMR
// -----------------------------------------------------------------------

/**
 * @param {Object} profile
 * @param {string} profile.gender - 'male'|'female'
 * @param {number} profile.age
 * @param {number} profile.heightCm
 * @param {number} profile.weightKg
 * @param {number} [profile.bodyFatPercent] - إن توفّر، تُستخدم Katch-McArdle بدلًا من Mifflin-St Jeor
 * @returns {{ value: number, formula_used: string }}
 */
export function calculateBMR(profile) {
  const { gender, age, heightCm, weightKg, bodyFatPercent } = profile;

  if (typeof bodyFatPercent === 'number' && bodyFatPercent > 0 && bodyFatPercent < 70) {
    const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
    const value = 370 + 21.6 * leanMassKg;
    return { value: Math.round(value), formula_used: 'katch_mcardle' };
  }

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const value = gender === 'male' ? base + 5 : base - 161;
  return { value: Math.round(value), formula_used: 'mifflin_st_jeor' };
}

// -----------------------------------------------------------------------
// TDEE بمكوّناته منفصلة (BMR + NEAT + EAT + TEF)
// -----------------------------------------------------------------------

/**
 * @param {number} bmr
 * @param {string} activityLevel - أحد قيم ACTIVITY_LEVEL
 * @returns {{ bmr: number, neat: number, eat: number, tef: number, tdee: number }}
 */
export function calculateTDEEBreakdown(bmr, activityLevel) {
  const multiplier = ACTIVITY_MULTIPLIER[activityLevel];
  if (!multiplier) throw new Error(`calculateTDEEBreakdown: activityLevel غير معروف: ${activityLevel}`);

  const tdeeBeforeTEF = bmr * multiplier;
  const aboveBMR = tdeeBeforeTEF - bmr; // = NEAT + EAT مجتمعين
  const split = NEAT_EAT_SPLIT[activityLevel];
  const neat = aboveBMR * split.neat;
  const eat = aboveBMR * split.eat;

  // TEF (الأثر الحراري للطعام) ≈ 10% من إجمالي السعرات المستهلكة، والتي
  // عند اتزان الوزن تساوي التقريب tdeeBeforeTEF — نحسبه كنسبة منه ونضيفه
  const tef = tdeeBeforeTEF * 0.10;

  const roundedBmr = Math.round(bmr);
  const roundedNeat = Math.round(neat);
  const roundedEat = Math.round(eat);
  const roundedTef = Math.round(tef);

  // TDEE المعروض = مجموع المكوّنات المقرَّبة نفسها بالضبط (وليس تقريب مستقل
  // للمجموع الخام) — لضمان تطابق تام لو المستخدم جمع الأرقام المعروضة يدويًا
  return {
    bmr: roundedBmr,
    neat: roundedNeat,
    eat: roundedEat,
    tef: roundedTef,
    tdee: roundedBmr + roundedNeat + roundedEat + roundedTef,
  };
}

// -----------------------------------------------------------------------
// السعرات المستهدفة (عجز/فائض آمن حسب المدة)
// -----------------------------------------------------------------------

/**
 * @param {Object} params
 * @param {number} params.tdee
 * @param {string} params.goal - أحد قيم GOAL
 * @param {number} params.currentWeightKg
 * @param {number} params.targetWeightKg
 * @param {number} params.timeframeDays
 * @param {string} params.gender - لتحديد الحد الأدنى الآمن للسعرات
 * @param {string} [params.pregnancyStatus] - 'pregnant'|'breastfeeding'|'none' — يُلغي أي عجز سعرات فورًا بغض النظر عن goal
 */
export function calculateCalorieTarget(params) {
  const { tdee, goal, currentWeightKg, targetWeightKg, timeframeDays, gender, pregnancyStatus } = params;

  // قيد أمان صارم: أثناء الحمل/الرضاعة يُتجاهَل أي عجز/فائض مبني على هدف
  // المستخدم كليًا — لا يُسمح بأي عجز سعرات مهما كان الهدف المُدخَل (خسارة
  // وزن مثلًا)، وتُضاف سعرات آمنة فوق TDEE فقط. هذا قيد إلزامي غير قابل
  // للتجاوز من الواجهة (راجع بند 1.1 من برومبت استكمال البنود الناقصة).
  if (pregnancyStatus === 'pregnant' || pregnancyStatus === 'breastfeeding') {
    const addKcal = PREGNANCY_CALORIE_ADJUSTMENT_KCAL[pregnancyStatus];
    const label = PREGNANCY_LABEL_AR[pregnancyStatus];
    return {
      targetCalories: Math.round(tdee + addKcal),
      dailyAdjustment: addKcal,
      estimatedWeeks: null,
      capped: true,
      warning: `تم تجاهل هدف العجز/الفائض المُدخَل لأن حالة "${label}" تستوجب سعرات إضافية آمنة (+${addKcal} سعرة تقريبًا فوق معدل الحرق) بدل أي عجز سعرات — هذه أرقام إرشادية عامة وليست بديلاً عن استشارة طبية مباشرة، يُنصح بمتابعة طبيب/أخصائي تغذية طوال هذه الفترة.`,
    };
  }

  if (goal === GOAL.MAINTAIN || goal === GOAL.RECOMP) {
    return {
      targetCalories: Math.round(tdee),
      dailyAdjustment: 0,
      estimatedWeeks: null,
      capped: false,
      warning: goal === GOAL.RECOMP
        ? 'إعادة تكوين الجسم: سعرات قريبة من الصيانة، التركيز على البروتين والتمرين وليس العجز/الفائض'
        : null,
    };
  }

  // BUG-S23-01: الكود كان بياخد weightDiffKg = Math.abs(...) من غير ما يتحقق
  // إن اتجاه الفرق متوافق مع الـgoal أصلًا. مستخدم اختار "خسارة وزن" بس
  // دخّل وزن مستهدف أعلى من الحالي (خطأ إدخال شائع) كان بياخد عجز سعرات
  // كامل محسوب من فرق وزن باتجاه معاكس تمامًا لهدفه — بصمت وبدون أي تحذير.
  // نفس الحاجة بالظبط مع "زيادة وزن" ووزن مستهدف أقل من الحالي. المساواة
  // (targetWeightKg === currentWeightKg) معتبرة تناقض كمان لأنه مفيش أي
  // فرق فعلي يبرر عجز/فائض مع goal=lose/gain تحديدًا (لو ده المطلوب فعلًا
  // في نفس الوزن، الهدف الصحيح هو "ثبات" مش "خسارة/زيادة").
  const goalTargetMismatch =
    (goal === GOAL.LOSE && targetWeightKg >= currentWeightKg) ||
    (goal === GOAL.GAIN && targetWeightKg <= currentWeightKg);

  if (goalTargetMismatch) {
    const goalLabel = goal === GOAL.LOSE ? 'خسارة وزن' : 'زيادة وزن';
    return {
      targetCalories: Math.round(tdee),
      dailyAdjustment: 0,
      estimatedWeeks: null,
      capped: false,
      goalTargetMismatch: true,
      warning: `الوزن المستهدف (${targetWeightKg} كجم) لا يتوافق مع اتجاه هدف "${goalLabel}" مقارنة بالوزن الحالي (${currentWeightKg} كجم) — تم عرض سعرات الصيانة مؤقتًا بدل حساب عجز/فائض في الاتجاه الغلط. من فضلك راجع الوزن المستهدف أو الهدف المختار من الإعدادات.`,
    };
  }

  const weightDiffKg = Math.abs(currentWeightKg - targetWeightKg);
  const totalKcalNeeded = weightDiffKg * SAFETY_LIMITS.KCAL_PER_KG_BODYFAT;
  const rawDailyAdjustment = totalKcalNeeded / Math.max(timeframeDays, 1);

  const maxAdjustment = goal === GOAL.LOSE
    ? SAFETY_LIMITS.MAX_DAILY_DEFICIT_KCAL
    : SAFETY_LIMITS.MAX_DAILY_SURPLUS_KCAL;

  const cappedByRate = Math.min(rawDailyAdjustment, maxAdjustment);
  const dailyAdjustment = goal === GOAL.LOSE ? -cappedByRate : cappedByRate;

  let targetCalories = tdee + dailyAdjustment;

  const minSafeCalories = gender === 'male' ? SAFETY_LIMITS.MIN_CALORIES_MALE : SAFETY_LIMITS.MIN_CALORIES_FEMALE;
  let flooredBySafety = false;
  if (goal === GOAL.LOSE && targetCalories < minSafeCalories) {
    targetCalories = minSafeCalories;
    flooredBySafety = true;
  }

  const capped = rawDailyAdjustment > maxAdjustment || flooredBySafety;
  const actualDailyAdjustment = targetCalories - tdee;
  const estimatedDays = Math.abs(actualDailyAdjustment) > 0
    ? totalKcalNeeded / Math.abs(actualDailyAdjustment)
    : null;

  let warning = null;
  if (flooredBySafety) {
    warning = `السعرات المطلوبة للوصول للهدف في المدة المحددة أقل من الحد الآمن (${minSafeCalories} سعرة) — تم رفعها للحد الآمن، وهذا يعني إن الوصول للهدف هياخد وقت أطول من المطلوب`;
  } else if (rawDailyAdjustment > maxAdjustment) {
    warning = `المعدل المطلوب للوصول للهدف في المدة دي أسرع من الحد الآمن (${maxAdjustment} سعرة/يوم) — تم تعديل الخطة لمعدل آمن، والمدة الفعلية هتكون أطول`;
  }

  return {
    targetCalories: Math.round(targetCalories),
    dailyAdjustment: Math.round(actualDailyAdjustment),
    estimatedWeeks: estimatedDays ? +(estimatedDays / 7).toFixed(1) : null,
    capped,
    warning,
  };
}

// -----------------------------------------------------------------------
// أهداف الماكرو
// -----------------------------------------------------------------------

/**
 * @param {number} targetCalories
 * @param {string} dietStyle - أحد قيم DIET_STYLE (من food-library/schema.js)
 * @param {number} weightKg - لفرض حد أدنى أمان للبروتين (g/kg)
 * @returns {{ protein_g: number, carb_g: number, fat_g: number, protein_kcal: number, carb_kcal: number, fat_kcal: number }}
 */
/**
 * @param {number} targetCalories
 * @param {string} dietStyle
 * @param {number} weightKg
 * @param {{protein:number, carb:number, fat:number}|null} [customRatios] - نسب مخصّصة من بار
 *   التحكم اليدوي (0-1)، تحل محل جدول MACRO_RATIOS_BY_DIET لو موجودة. تُقيَّد
 *   إلزاميًا داخل `resolveSafeMacroRange(medicalConditions)` قبل الاستخدام —
 *   القيمة المُمرَّرة هنا لا يُفترض أنها آمنة تلقائيًا حتى لو مرّت من تحقّق
 *   الواجهة (`validateCustomMacroRatios`)، لأن أي مسار استدعاء تاني (استيراد
 *   بروفايل قديم مثلًا) ممكن ما يكونش عدّى بنفس التحقق.
 * @param {string[]} [medicalConditions]
 */
export function calculateMacroTargets(targetCalories, dietStyle, weightKg, customRatios = null, medicalConditions = []) {
  // ملاحظة تصميم مهمة: نطاق الأمان (resolveSafeMacroRange) بتقيّد بس النسب
  // "المخصّصة" اللي اليوزر بيدخلها يدويًا من بار التحكم — مش جداول أنماط
  // الحمية الجاهزة (keto/carnivore وغيرهم) لأن دي أنماط مُقصودة بتصميمها
  // على نسب متطرّفة عمدًا (كيتو دهون 70% مثلًا) وده سلوكها الصحيح المتوقَّع
  // والمُختبَر بالفعل. لو طبّقنا نفس النطاق العام على أنماط الحمية كان هيكسر
  // تعريف كل نمط حمية متطرّف قصدًا.
  const safeRange = resolveSafeMacroRange(medicalConditions);
  const baseRatios = MACRO_RATIOS_BY_DIET[dietStyle] ?? MACRO_RATIOS_BY_DIET.normal;

  const ratios = customRatios
    ? {
        protein: Math.min(safeRange.protein.max, Math.max(safeRange.protein.min, customRatios.protein)),
        carb: Math.min(safeRange.carb.max, Math.max(safeRange.carb.min, customRatios.carb)),
        fat: Math.min(safeRange.fat.max, Math.max(safeRange.fat.min, customRatios.fat)),
      }
    : baseRatios;

  let proteinKcal = targetCalories * ratios.protein;
  let proteinG = proteinKcal / 4;

  // فرض حد أدنى أمان للبروتين بغض النظر عن نسبة الحمية (يهم خصوصًا في keto/carnivore
  // منخفضي السعرات، أو أنماط نباتية بنسبة بروتين منخفضة عند وزن جسم مرتفع)
  const minProteinG = MIN_PROTEIN_G_PER_KG * weightKg;
  if (proteinG < minProteinG) {
    proteinG = minProteinG;
    proteinKcal = proteinG * 4;
  }

  // سقف بروتين g/كجم لحالات كلوية/كبدية (NKF KDOQI) — أدق من نسبة السعرات
  // المئوية، وله الأولوية فوقها لو تعارضا (يُطبَّق بعد الحد الأدنى العام،
  // ولا يُسمح للحد الأدنى نفسه بتجاوزه — أهم قيد أمان في هذه الدالة)
  let maxProteinGFromCondition = Infinity;
  for (const condition of medicalConditions) {
    if (MAX_PROTEIN_G_PER_KG_BY_CONDITION[condition] !== undefined) {
      maxProteinGFromCondition = Math.min(maxProteinGFromCondition, MAX_PROTEIN_G_PER_KG_BY_CONDITION[condition] * weightKg);
    }
  }
  if (Number.isFinite(maxProteinGFromCondition) && proteinG > maxProteinGFromCondition) {
    proteinG = Math.max(maxProteinGFromCondition, MIN_PROTEIN_G_PER_KG * weightKg * 0.7); // لا ينزل تحت 70% من الحد الأدنى العام حتى مع سقف مرضي صارم
    proteinKcal = proteinG * 4;
  }

  const remainingKcal = targetCalories - proteinKcal;
  const carbFatTotal = ratios.carb + ratios.fat;
  const carbKcal = remainingKcal * (ratios.carb / carbFatTotal);
  const fatKcal = remainingKcal * (ratios.fat / carbFatTotal);

  return {
    protein_g: Math.round(proteinG),
    carb_g: Math.round(carbKcal / 4),
    fat_g: Math.round(fatKcal / 9),
    protein_kcal: Math.round(proteinKcal),
    carb_kcal: Math.round(carbKcal),
    fat_kcal: Math.round(fatKcal),
    appliedRatios: ratios,
  };
}

/**
 * يستبدل نمط الحمية بالنمط "العادي" تلقائيًا لحساب أهداف الماكرو، لو كان
 * النمط المختار عالي الخطورة (كيتو/صيام متقطع) والمستخدمة حامل أو مرضعة.
 * لا يُغيّر أي شيء آخر بالبروفايل — فقط أهداف الماكرو المحسوبة هنا.
 * @param {string} dietStyle
 * @param {string} [pregnancyStatus]
 * @returns {{ dietStyle: string, overridden: boolean, reason_ar: string|null }}
 */
export function resolveSafeDietStyleForPregnancy(dietStyle, pregnancyStatus) {
  const isPregnancyOrBreastfeeding = pregnancyStatus === 'pregnant' || pregnancyStatus === 'breastfeeding';
  if (isPregnancyOrBreastfeeding && HIGH_RISK_DIETS_DURING_PREGNANCY.has(dietStyle)) {
    return {
      dietStyle: 'normal',
      overridden: true,
      reason_ar: `نمط الحمية المختار غير آمن أثناء الحمل/الرضاعة — تم احتساب أهداف الماكرو بالنمط العادي بدلًا منه إلى حين استشارة طبية مباشرة`,
    };
  }
  return { dietStyle, overridden: false, reason_ar: null };
}

// -----------------------------------------------------------------------
// أهداف المايكرو (مرجعية مبسّطة)
// -----------------------------------------------------------------------

/**
 * @param {string} [pregnancyStatus='none'] - 'none'|'pregnant'|'breastfeeding'
 * @returns {Object} نسخة من جدول RDA المرجعي المناسب للحالة — لا تُعدَّل النسخة الأصلية
 */
export function getMicroTargets(pregnancyStatus = 'none') {
  if (pregnancyStatus === 'pregnant') return { ...MICRO_RDA_PREGNANT };
  if (pregnancyStatus === 'breastfeeding') return { ...MICRO_RDA_BREASTFEEDING };
  return { ...MICRO_RDA_ADULT };
}

// -----------------------------------------------------------------------
// تقدير نسبة الدهون تلقائيًا (معادلة Navy) — بند 11 من الأعمال المتبقية
// -----------------------------------------------------------------------

/**
 * يقدّر نسبة دهون الجسم بمعادلة البحرية الأمريكية (Navy Method) من قياسات
 * محيط الخصر/الرقبة (وللإناث: محيط الأرداف كمان — إلزامي رياضيًا في صيغة
 * الإناث، بخلاف الذكور). يُستخدم فقط لما نسبة الدهون المباشرة مش متوفرة.
 * @param {Object} params
 * @param {string} params.gender - 'male'|'female'
 * @param {number} params.waistCm
 * @param {number} params.neckCm
 * @param {number} params.heightCm
 * @param {number} [params.hipCm] - إلزامي للإناث فقط
 * @returns {{ value: number|null, formula: 'navy', reason_ar: string|null }}
 */
export function estimateBodyFatPercentNavy({ gender, waistCm, neckCm, heightCm, hipCm }) {
  if (typeof waistCm !== 'number' || typeof neckCm !== 'number' || typeof heightCm !== 'number') {
    return { value: null, formula: 'navy', reason_ar: 'محتاج محيط الخصر والرقبة والطول على الأقل' };
  }

  let raw;
  if (gender === 'male') {
    const diff = waistCm - neckCm;
    if (diff <= 0) return { value: null, formula: 'navy', reason_ar: 'محيط الخصر لازم يكون أكبر من محيط الرقبة لحساب صحيح' };
    raw = 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (typeof hipCm !== 'number') {
      return { value: null, formula: 'navy', reason_ar: 'حساب نسبة الدهون للإناث بمعادلة Navy محتاج محيط الأرداف كمان' };
    }
    const sum = waistCm + hipCm - neckCm;
    if (sum <= 0) return { value: null, formula: 'navy', reason_ar: 'قيم المحيط المُدخلة غير منطقية' };
    raw = 495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.22100 * Math.log10(heightCm)) - 450;
  }

  if (!Number.isFinite(raw) || raw < 2 || raw > 70) {
    return { value: null, formula: 'navy', reason_ar: 'القياسات المُدخلة أنتجت نسبة غير منطقية — راجع الأرقام' };
  }

  return { value: +raw.toFixed(1), formula: 'navy', reason_ar: null };
}

/**
 * يحدّد نسبة دهون الجسم الفعّالة لبروفايل معيّن: نسبة مُدخلة مباشرة لو
 * موجودة ومنطقية، وإلا تقدير Navy تلقائي من محيط الخصر/الرقبة(/الأرداف)
 * لو متوفرين. تُستخدم هذه الدالة كمصدر واحد سواء لعرض تركيب الجسم بالواجهة
 * أو لتغذية BMR (Katch-McArdle) — بدل ازدواج المنطق.
 * @param {Object} profile
 * @returns {{ value: number|null, source: 'measured'|'navy_estimate'|null, reason_ar: string|null }}
 */
export function resolveBodyFatPercent(profile) {
  if (typeof profile.bodyFatPercent === 'number' && profile.bodyFatPercent > 0 && profile.bodyFatPercent < 70) {
    return { value: profile.bodyFatPercent, source: 'measured', reason_ar: null };
  }
  if (typeof profile.waistCm === 'number' && typeof profile.neckCm === 'number' && typeof profile.heightCm === 'number') {
    const navy = estimateBodyFatPercentNavy({
      gender: profile.gender, waistCm: profile.waistCm, neckCm: profile.neckCm,
      heightCm: profile.heightCm, hipCm: profile.hipCm,
    });
    if (navy.value !== null) return { value: navy.value, source: 'navy_estimate', reason_ar: null };
    return { value: null, source: null, reason_ar: navy.reason_ar };
  }
  return { value: null, source: null, reason_ar: null };
}

// -----------------------------------------------------------------------
// إعادة توازن ميزانية الوجبات المتبقية في اليوم — ميزة "معزوم برة" (بند 11)
// -----------------------------------------------------------------------

/** نفس نسب توزيع السعرات الافتراضية المستخدمة في توليد الوجبة بالواجهة */
export const DEFAULT_MEAL_SHARE = Object.freeze({ breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 });

/** أقل هدف سعرات واقعي لوجبة واحدة — تفادي أهداف صفرية/سالبة بعد استهلاك كبير (مثال: معزوم برة بسعرات عالية) */
const MIN_MEAL_TARGET_KCAL = 100;

/**
 * يحسب الميزانية المتبقية من هدف اليوم (سعرات + ماكرو) بعد خصم أي استهلاك
 * فعلي حتى الآن (وجبات مسجَّلة + تقدير "معزوم برة")، ويوزّعها على أنواع
 * الوجبات المتبقية فقط، بنفس نسب `DEFAULT_MEAL_SHARE` بعد إعادة تطبيعها.
 * هذا ما يُفعِّل "اقتراح إعادة توازن تلقائي لباقي وجبات اليوم" المطلوب صراحة
 * في مستند الرؤية لميزة "معزوم برة".
 * @param {Object} params
 * @param {number} params.dailyCalorieTarget
 * @param {{protein_g:number, carb_g:number, fat_g:number}} params.dailyMacroTargets
 * @param {number} params.consumedKcal
 * @param {{protein_g?:number, carb_g?:number, fat_g?:number}} [params.consumedMacros]
 * @param {string[]} params.remainingMealTypes - أنواع الوجبات اللي لسه ما اتسجلتش النهاردة
 */
export function calculateRemainingMealBudget({ dailyCalorieTarget, dailyMacroTargets, consumedKcal, consumedMacros = {}, remainingMealTypes }) {
  const remainingKcal = Math.max(0, dailyCalorieTarget - consumedKcal);
  const remainingProtein = Math.max(0, dailyMacroTargets.protein_g - (consumedMacros.protein_g ?? 0));
  const remainingCarb = Math.max(0, dailyMacroTargets.carb_g - (consumedMacros.carb_g ?? 0));
  const remainingFat = Math.max(0, dailyMacroTargets.fat_g - (consumedMacros.fat_g ?? 0));

  const totalDefaultShare = remainingMealTypes.reduce((s, mt) => s + (DEFAULT_MEAL_SHARE[mt] ?? 0), 0);

  const perMeal = {};
  if (totalDefaultShare > 0) {
    for (const mt of remainingMealTypes) {
      const normalizedShare = (DEFAULT_MEAL_SHARE[mt] ?? 0) / totalDefaultShare;
      perMeal[mt] = {
        targetKcal: Math.max(MIN_MEAL_TARGET_KCAL, Math.round(remainingKcal * normalizedShare)),
        macroTargets: {
          protein_g: Math.round(remainingProtein * normalizedShare),
          carb_g: Math.round(remainingCarb * normalizedShare),
          fat_g: Math.round(remainingFat * normalizedShare),
        },
      };
    }
  }

  return {
    remainingKcal: Math.round(remainingKcal),
    remainingMacros: { protein_g: Math.round(remainingProtein), carb_g: Math.round(remainingCarb), fat_g: Math.round(remainingFat) },
    perMeal,
  };
}

// -----------------------------------------------------------------------
// نقطة الدخول المجمّعة
// -----------------------------------------------------------------------

/**
 * يحسب كل شيء دفعة واحدة من بروفايل المستخدم — الدالة الموصى بها للاستخدام
 * من لوحة التحكم/التحليل مباشرة.
 * @param {Object} profile
 * @param {string} profile.gender
 * @param {number} profile.age
 * @param {number} profile.heightCm
 * @param {number} profile.weightKg
 * @param {number} profile.targetWeightKg
 * @param {number} [profile.bodyFatPercent]
 * @param {string} profile.activityLevel
 * @param {string} profile.goal
 * @param {number} profile.timeframeDays
 * @param {string} [profile.dietStyle='normal']
 * @param {string} [profile.pregnancyStatus='none'] - 'none'|'pregnant'|'breastfeeding'
 */
export function calculateFullNutritionProfile(profile) {
  const pregnancyStatus = profile.pregnancyStatus ?? 'none';
  const bmi = calculateBMI(profile.weightKg, profile.heightCm);
  const bmiClass = classifyBMI(bmi);
  const idealWeightRange = calculateIdealWeightRange(profile.heightCm);

  // BUG-S23-02: حماية S22 كانت بتوقف بس عند BMI (بيرجع null بدل تصنيف
  // غلط)، لكن calculateBMR/calculateTDEEBreakdown/calculateCalorieTarget/
  // calculateMacroTargets كانوا لسه بيحسبوا عادي من نفس heightCm/weightKg
  // التالف (مثلاً heightCm=0 من ملف استيراد معطوب) — الناتج رقم "شكله
  // سليم" لكن معناه غلط تمامًا، وكان بيتعرض كخطة سعرات/ماكرو كاملة من غير
  // أي تحذير، رغم إن كارت الـBMI لوحده بيعرض "بيانات غير صالحة". الحارس ده
  // بيوقف كل الحسابات المعتمدة على الطول/الوزن مبكرًا لو BMI مش صالح أصلًا.
  if (bmi === null) {
    return {
      bmi: null,
      bmiClass,
      idealWeightRange: null,
      bmr: null,
      tdeeBreakdown: null,
      calorieTarget: null,
      macroTargets: null,
      microTargets: getMicroTargets(pregnancyStatus),
      pregnancyNotice: null,
      dataValidity: {
        valid: false,
        message_ar: 'الطول أو الوزن المسجَّل غير صالح (صفر أو قيمة غير رقمية) — لا يمكن حساب خطة السعرات أو الماكرو بأمان من بيانات تالفة. من فضلك صحّح الطول/الوزن من الإعدادات.',
      },
    };
  }

  const bmrResult = calculateBMR(profile);

  // BUG-S25-01: الحارس اللي فوق (bmi === null) بيوقف بس لو الطول/الوزن نفسهم
  // صفر/سالب/غير رقمي. لكن تركيبة عمر/طول/وزن "تقنيًا موجبة" (زي عمر=130،
  // طول=30سم، وزن=2كجم — كل قيمة لوحدها جوّه الحدود اللي storage-engine
  // بيسمح بيها عند الاستيراد: طول≤300، وزن≤500، عمر≤130) ممكن تنتج BMI طبيعي
  // الشكل (وزن/طول متناسبين) بينما معادلة Mifflin-St Jeor بترجع BMR سالب
  // فعليًا (جرّبتها: BMR=-437). كان ده بيتسرّب كخطة سعرات/ماكرو كاملة "شكلها
  // سليم" (macroTargets فيها carb_g=-88, fat_g=-26) بدون أي تحذير — نفس فئة
  // مشكلة BUG-S23-02 بس من زاوية تانية (BMR مش BMI). الحارس ده بيوقف نفس
  // مسار dataValidity.valid=false الموجود، فالواجهة (Dashboard/Analytics)
  // بتتعامل معاه تلقائيًا من غير أي تعديل إضافي.
  if (!Number.isFinite(bmrResult.value) || bmrResult.value <= 0) {
    return {
      bmi,
      bmiClass,
      idealWeightRange,
      bmr: null,
      tdeeBreakdown: null,
      calorieTarget: null,
      macroTargets: null,
      microTargets: getMicroTargets(pregnancyStatus),
      pregnancyNotice: null,
      dataValidity: {
        valid: false,
        message_ar: 'تركيبة العمر/الطول/الوزن المسجَّلة تنتج معدل حرق أساسي (BMR) غير منطقي (صفر أو سالب) — لا يمكن حساب خطة السعرات أو الماكرو بأمان من بيانات غير واقعية. من فضلك راجع الطول/الوزن/العمر من الإعدادات.',
      },
    };
  }

  const tdeeBreakdown = calculateTDEEBreakdown(bmrResult.value, profile.activityLevel);
  const calorieTarget = calculateCalorieTarget({
    tdee: tdeeBreakdown.tdee,
    goal: profile.goal,
    currentWeightKg: profile.weightKg,
    targetWeightKg: profile.targetWeightKg,
    timeframeDays: profile.timeframeDays,
    gender: profile.gender,
    pregnancyStatus,
  });
  const safeDiet = resolveSafeDietStyleForPregnancy(profile.dietStyle ?? 'normal', pregnancyStatus);
  // بار التحكم اليدوي في الماكرو: نسب مخصّصة اختيارية من البروفايل (S53) —
  // تتقيّد إلزاميًا داخل calculateMacroTargets بالنطاق الآمن العام أو
  // الأضيق حسب الحالات المرضية المسجَّلة، بغض النظر عن أي تحقق سابق حصل
  // في الواجهة وقت الحفظ
  const macroTargets = calculateMacroTargets(
    calorieTarget.targetCalories,
    safeDiet.dietStyle,
    profile.weightKg,
    profile.customMacroRatios ?? null,
    profile.medicalConditions ?? []
  );
  const microTargets = getMicroTargets(pregnancyStatus);

  const pregnancyNotice = (pregnancyStatus === 'pregnant' || pregnancyStatus === 'breastfeeding')
    ? {
        status: pregnancyStatus,
        message_ar: `أنتِ في مرحلة "${PREGNANCY_LABEL_AR[pregnancyStatus]}" — الأرقام المعروضة إرشادية عامة وليست بديلاً عن متابعة طبيب/أخصائي تغذية مباشرة طوال هذه الفترة.`,
        dietOverridden: safeDiet.overridden,
        dietOverrideReason_ar: safeDiet.reason_ar,
      }
    : null;

  return {
    bmi,
    bmiClass,
    idealWeightRange,
    bmr: bmrResult,
    tdeeBreakdown,
    calorieTarget,
    macroTargets,
    microTargets,
    pregnancyNotice,
    dataValidity: { valid: true },
  };
}
