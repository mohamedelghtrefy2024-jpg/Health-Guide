/**
 * ============================================================================
 * App — الطبقة الرابطة بين الواجهة وكل الـEngines
 * ============================================================================
 * ملف واحد بسيط بدون framework (Vanilla JS + ES Modules) — يفتح مباشرة عبر
 * سيرفر محلي (مثال: `npx serve ui` أو `python3 -m http.server` من جذر
 * المشروع). المتصفح لا يسمح بـES Modules عبر file:// مباشرة.
 * ============================================================================
 */

import { STORE, putRecord, getRecord, getAllRecords, exportAllData, importAllData, clearAllData } from '../core/storage/storage-engine.js';
import { getFoodById, filterFoods, searchFoodsByName } from '../core/food-library/food-library.js';
import { MEDICAL_CONDITION, ALLERGEN, ALLERGY_SEVERITY, PREGNANCY_STATUS } from '../core/food-library/schema.js';
import { CONDITION_LABEL_AR } from '../core/decision-engine/medical-engine.js';
import { ALLERGEN_LABEL_AR } from '../core/decision-engine/allergy-engine.js';
import {
  calculateFullNutritionProfile, calculateWaterTargetMl, ACTIVITY_LEVEL, GOAL,
  resolveBodyFatPercent, calculateRemainingMealBudget, DEFAULT_MEAL_SHARE,
  resolveSafeMacroRange, validateCustomMacroRatios, calculateMacroTargets,
} from '../core/nutrition-engine/nutrition-engine.js';
import { generateMeal, generateDayPlan, updateMealItemPortion, resolveMealPlanTemplateDay, pickMealWithVariety } from '../core/meal-engine/meal-generation-engine.js';
import { MEAL_PLAN_CALORIE_LEVELS, MEAL_PLAN_DAYS, nearestCalorieLevel } from '../core/meal-engine/meal-plan-templates.js';
import { resolveDailyFastingStatus } from '../core/decision-engine/religious-calendar.js';
import { classifyMealQualityScore, computeMealQualityScore } from '../core/meal-engine/meal-quality.js';
import { getAllExercises, filterExercisesForConditions, calculateCaloriesBurned } from '../core/exercise-engine/exercise-engine.js';
import {
  logMeal, logExercise, computeDailyTotals, logDailyMetrics, getDailyMetrics,
  computeAdherenceScore, logEatingOutMeal,
} from '../core/tracking-engine/tracking-engine.js';
import { startChallenge, updateChallengeProgress, CHALLENGE_TEMPLATES, CHALLENGE_TYPE, calculateStreak } from '../core/gamification-engine/gamification-engine.js';
import { getInstantRecommendations, getGeneralTips, getWeightStabilityRecommendation, RECOMMENDATION_SEVERITY } from '../core/recommendation-engine/recommendation-engine.js';
import { getWeightTrend, getWaterTrend, getCalorieTrend, compareBestWorstWeek, getBodyCompositionTrend, detectWeightTrendPattern } from '../core/analytics-engine/analytics-engine.js';

const ALL_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const PROFILE_ID = 'current';

// -----------------------------------------------------------------------
// أيقونات — طبقة عرض بحتة فقط (مفيش أي أثر على منطق أي محرك)، عشان الواجهة
// تبقى أوضح بصريًا وأسهل مسح (scan) بالعين بدل الاعتماد على النص فقط.
// -----------------------------------------------------------------------
const CATEGORY_ICON = {
  protein: '🍗',
  carb: '🍞',
  vegetable: '🥦',
  fruit: '🍎',
  dairy: '🥛',
  fat_oil: '🫒',
  legume: '🫘',
  nut_seed: '🥜',
  beverage: '🥤',
  composite_meal: '🍲',
  condiment: '🌿',
  sweet_dessert: '🍯',
};
function categoryIcon(category) {
  return CATEGORY_ICON[category] ?? '🍽️';
}

const MEAL_TYPE_LABEL_AR = { breakfast: '🌅 فطار', lunch: '🍛 غداء', dinner: '🌙 عشاء', snack: '🍎 سناك' };

const CHALLENGE_ICON = {
  calorie_streak: '🔥',
  water_streak: '💧',
  healthy_meal_count: '🥗',
};

/** الحالة الحيّة في الذاكرة أثناء الجلسة — دائمًا مصدرها IndexedDB عند التحميل */
let currentProfile = null;
let currentNutrition = null; // ناتج calculateFullNutritionProfile — يُعاد حسابه كل ما البروفايل يتغيّر
let lastGeneratedMeal = null; // آخر تركيبة وجبة اتولّدت أو "الوجبة قيد التحرير" يدويًا حاليًا (S53-c: بقت قابلة للتعديل الحر — إضافة/حذف أصناف مش بس تعديل الجرامات)
let lastGeneratedMealTypeShare = null; // نوع الوجبة + الميزانية المستخدمة فعليًا في آخر توليد (لعرض/تعديل الحصة)
let todayRemainingBudget = null; // ناتج calculateRemainingMealBudget — يُعاد حسابه بعد أي تسجيل وجبة/معزوم برة (ميزة "معزوم برة")

/**
 * BUG-S25-03: أي فشل فعلي في IndexedDB (مساحة تخزين ممتلئة QuotaExceededError،
 * transaction متقطعة، اتصال مقفول) كان بيفشل بصمت تمامًا — تأكدت فعليًا
 * بمحاكاة فشل كتابة حقيقي: onboarding-form فضل ظاهر والـnav فضل مخفي (يعني
 * التطبيق كله عالق) من غير أي رسالة، والفشل ظهر كـ"Unhandled Promise
 * Rejection" في الكونسول بس — صفر ملاحظة للمستخدم في أي من الـ14 نقطة كتابة
 * في الملف ده (putRecord مباشرة أو عبر Tracking/Gamification Engine).
 * الدالة دي بتلف أي عملية كتابة حرجة، وتعرض رسالة عربية واضحة في أقرب عنصر
 * رسائل موجود للفورم بدل الفشل الصامت، بدل ما تسيب المستخدم فاكر إن التطبيق
 * متجمّد أو إن الضغطة ما سجّلتش.
 * @param {() => Promise<any>} fn - العملية اللي فيها كتابة IndexedDB
 * @param {string} messageElementId - id عنصر الرسائل الأقرب لهذا الفورم/الزرار
 * @returns {Promise<{ ok: boolean, result: any }>}
 */
async function withStorageErrorFeedback(fn, messageElementId) {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err) {
    console.error('فشل عملية حفظ محلية (IndexedDB):', err);
    const el = document.getElementById(messageElementId);
    if (el) {
      el.innerHTML = `<div class="warning-box">حصل خطأ أثناء الحفظ محليًا (احتمال: مساحة تخزين المتصفح ممتلئة، أو مشكلة اتصال بقاعدة البيانات المحلية) — من فضلك جرّب تاني. لو المشكلة استمرت، جرّب تفريغ مساحة تخزين المتصفح لهذا الموقع.</div>`;
      el.style.display = '';
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return { ok: false, result: null };
  }
}

/**
 * يرجّع تاريخ اليوم بتوقيت المستخدم المحلي بصيغة YYYY-MM-DD (مش UTC).
 * استخدام `toISOString()` هنا كان بيسبب تسجيل بيانات تحت تاريخ غلط لمستخدمي
 * المناطق الزمنية شرق UTC (مصر/الخليج) بين نص الليل ولحد 2-4 ساعات بعده،
 * لأن `toISOString()` بترجع دايمًا بتوقيت UTC مش توقيت جهاز المستخدم.
 * ملحوظة: ده منفصل تمامًا عن Timestamps الكاملة (`loggedAt`, `createdAt`,
 * `exported_at`) في `core/` اللي لسه صح تستخدم UTC عادي — المشكلة كانت فقط
 * في التاريخ اللي بيُستخدم كمفتاح تجميع يومي (todayId ونطاقات الرسوم البيانية).
 */
function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// -----------------------------------------------------------------------
// تهيئة عامة عند تحميل الصفحة
// -----------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  buildOnboardingCheckboxes();
  wireNavigation();
  wireOnboardingForm();
  wirePregnancyFieldToggle();
  wireReligionFieldToggle();
  wireMacroBar();
  wireMealGeneration();
  wireDayPlanGeneration();
  wireMealPlanTemplates();
  wireCalorieOverrideInput();
  wireSettings();
  wireInBodyDialog();
  wireResetButton();

  const savedProfile = await getRecord(STORE.PROFILE, PROFILE_ID);
  if (savedProfile) {
    currentProfile = savedProfile;
    currentNutrition = calculateFullNutritionProfile(await toEngineProfile(currentProfile));
    showApp();
    populateAdvancedFieldsForm();
    await renderDashboard();
    await renderActivityTab();
    await renderTrackingTab();
  }
});

/** يملأ نموذج "بيانات إضافية" بالإعدادات بالقيم المحفوظة فعليًا بالبروفايل، لو موجودة */
function populateAdvancedFieldsForm() {
  const form = document.getElementById('advanced-fields-form');
  if (!form || !currentProfile) return;
  for (const key of ['sleepHours', 'currentWaterMl']) {
    const input = form.querySelector(`[name="${key}"]`);
    if (input && typeof currentProfile[key] === 'number') input.value = currentProfile[key];
  }
  const smokerInput = form.querySelector('[name="smoker"]');
  if (smokerInput) smokerInput.checked = !!currentProfile.smoker;
}

function showApp() {
  document.getElementById('main-nav').classList.remove('hidden');
  document.getElementById('tab-onboarding').classList.remove('active');
  document.getElementById('tab-dashboard').classList.add('active');
  document.querySelector('.nav-btn[data-tab="dashboard"]').classList.add('active');
}

/**
 * S25 (بطلب المستخدم): محيط الخصر/الرقبة/الأرداف ونسبة الدهون بقوا يُسجَّلوا
 * في مكان واحد بس (نموذج "تركيب الجسم" اليومي بتاب التتبع)، مش مكرَّرين مع
 * بروفايل الإعدادات زي قبل كده. الدالة دي بترجع أحدث سجل تتبّع يومي فيه أي
 * قيمة من التركيب موجودة (مش شرط النهاردة بالظبط — لو المستخدم مسجّلش
 * النهاردة لسه، بنرجع لآخر تسجيل فعلي بدل ما نضيّع البيانات).
 */
async function getLatestBodyCompFields() {
  const all = await getAllRecords(STORE.DAILY_TRACKING);
  const withBodyComp = all
    .filter((r) => r.waistCm != null || r.neckCm != null || r.hipCm != null || r.bodyFatPercent != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return withBodyComp[0] ?? null;
}

/**
 * يحوّل سجل البروفايل المخزَّن (JSON بسيط) لشكل مدخلات Nutrition Engine.
 * نسبة الدهون: مُدخلة مباشرة لو موجودة، وإلا تقدير Navy تلقائي من محيط
 * الخصر/الرقبة(/الأرداف) لو متوفرين (بند 11) — مصدر واحد عبر
 * `resolveBodyFatPercent` بدل ازدواج منطق التقدير هنا وفي الداشبورد.
 * S25: محيط الخصر/الرقبة/الأرداف ونسبة الدهون بقوا بيُقرَوا من أحدث تسجيل
 * يومي (تاب التتبع) مش من البروفايل نفسه — عشان كده الدالة بقت async.
 */
async function toEngineProfile(profile) {
  const latestBodyComp = await getLatestBodyCompFields();
  const bodyFat = resolveBodyFatPercent({
    ...profile,
    waistCm: latestBodyComp?.waistCm ?? undefined,
    neckCm: latestBodyComp?.neckCm ?? undefined,
    hipCm: latestBodyComp?.hipCm ?? undefined,
    bodyFatPercent: latestBodyComp?.bodyFatPercent ?? undefined,
  });
  return {
    gender: profile.gender,
    age: Number(profile.age),
    heightCm: Number(profile.heightCm),
    weightKg: Number(profile.weightKg),
    targetWeightKg: Number(profile.targetWeightKg),
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    timeframeDays: Number(profile.timeframeDays),
    dietStyle: profile.dietStyle,
    pregnancyStatus: profile.pregnancyStatus ?? PREGNANCY_STATUS.NONE,
    medicalConditions: profile.medicalConditions ?? [],
    customMacroRatios: profile.customMacroRatios ?? null,
    ...(bodyFat.value !== null ? { bodyFatPercent: bodyFat.value } : {}),
  };
}

/**
 * يحوّل سجل البروفايل لبروفايل قيود (مدخلات Decision Engine). الحساسيات
 * بقت مخزَّنة كـ`{allergen, severity}` لكل حساسية على حدة (بند 11 — كانت
 * كلها "شديدة" بالإجبار قبل كده)، مع توافق رجعي لبروفايلات قديمة مُصدَّرة
 * قبل هذا التغيير (كانت مجرد مصفوفة أكواد نصية).
 *
 * S53: `fastingTag` بقى يُحسب تلقائيًا من `profile.religion` + تاريخ
 * النهاردة (بدل ما يكون فاضي دايمًا زي قبل كده) — عبر التقويم الديني
 * (`resolveDailyFastingStatus`). `manualOverrideNotFasting` بيسمح للمستخدم
 * يتجاوز الحساب التلقائي ليوم معيّن (مرض/سفر/عذر شرعي..) من شاشة توليد
 * الوجبة مباشرة بدل ما يغيّر بيانات بروفايله.
 * @param {Object} profile
 * @param {Object} [options]
 * @param {boolean} [options.manualOverrideNotFasting=false]
 */
function toConstraintProfile(profile, options = {}) {
  const fasting = resolveDailyFastingStatus({
    date: new Date(),
    religion: profile.religion ?? 'none',
    observeVoluntaryFasts: !!profile.observeVoluntaryFasts,
    manualOverrideNotFasting: !!options.manualOverrideNotFasting,
  });
  return {
    medicalConditions: profile.medicalConditions ?? [],
    allergies: (profile.allergies ?? []).map((a) =>
      typeof a === 'string' ? { allergen: a, severity: ALLERGY_SEVERITY.SEVERE } : a
    ),
    dietStyle: profile.dietStyle,
    pregnancyStatus: profile.pregnancyStatus ?? PREGNANCY_STATUS.NONE,
    cuisinePreference: profile.cuisinePreference ?? 'egyptian_only',
    fastingTag: fasting.fastingTag,
  };
}

// -----------------------------------------------------------------------
// التنقل بين التابات
// -----------------------------------------------------------------------

function wireNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'dashboard') await renderDashboard();
      if (btn.dataset.tab === 'meal-gen') { renderFastingBanner(); autoSelectNearestTemplateLevel(); resetCalorieOverrideInput(); await refreshRemainingBudget(); }
      if (btn.dataset.tab === 'activity') await renderActivityTab();
      if (btn.dataset.tab === 'food-library') renderFoodLibraryTab();
      if (btn.dataset.tab === 'tracking') await renderTrackingTab();
      if (btn.dataset.tab === 'analytics') await renderAnalyticsTab();
    });
  });
}

// -----------------------------------------------------------------------
// Onboarding
// -----------------------------------------------------------------------

function buildOnboardingCheckboxes() {
  const medicalContainer = document.getElementById('medical-conditions-list');
  for (const code of Object.values(MEDICAL_CONDITION)) {
    medicalContainer.insertAdjacentHTML('beforeend', `
      <label><input type="checkbox" name="medicalConditions" value="${code}"> ${CONDITION_LABEL_AR[code] ?? code}</label>
    `);
  }

  const allergyContainer = document.getElementById('allergies-list');
  const severityLabels = { [ALLERGY_SEVERITY.MILD]: 'خفيفة', [ALLERGY_SEVERITY.MODERATE]: 'متوسطة', [ALLERGY_SEVERITY.SEVERE]: 'شديدة' };
  for (const code of Object.values(ALLERGEN)) {
    allergyContainer.insertAdjacentHTML('beforeend', `
      <div class="allergy-row">
        <label><input type="checkbox" name="allergies" value="${code}"> ${ALLERGEN_LABEL_AR[code] ?? code}</label>
        <select name="allergySeverity_${code}" data-allergy-severity="${code}">
          ${Object.values(ALLERGY_SEVERITY).map((s) => `<option value="${s}"${s === ALLERGY_SEVERITY.SEVERE ? ' selected' : ''}>${severityLabels[s]}</option>`).join('')}
        </select>
      </div>
    `);
  }
}

/**
 * حقل "حامل/مرضعة" يظهر فقط لما الجنس = أنثى (بند 1.1 من برومبت استكمال
 * البنود الناقصة). أثناء الحمل/الرضاعة، أنماط الحمية عالية الخطورة
 * (كيتو/الصيام المتقطع) تُعطَّل في القائمة نفسها كإرشاد بصري إضافي — القيد
 * الفعلي غير القابل للتجاوز مطبَّق بالفعل في Nutrition/Diet Engine بغض
 * النظر عن حالة الواجهة.
 */
function wirePregnancyFieldToggle() {
  const form = document.getElementById('onboarding-form');
  const genderSelect = form.querySelector('[name="gender"]');
  const pregnancyRow = document.getElementById('pregnancy-status-row');
  const pregnancySelect = form.querySelector('[name="pregnancyStatus"]');
  const dietSelect = form.querySelector('[name="dietStyle"]');
  const highRiskDietOptions = ['keto', 'intermittent_fasting'];

  function updatePregnancyRowVisibility() {
    pregnancyRow.style.display = genderSelect.value === 'female' ? '' : 'none';
    if (genderSelect.value !== 'female') pregnancySelect.value = 'none';
    updateDietOptionsAvailability();
  }

  function updateDietOptionsAvailability() {
    const isPregnancyOrBreastfeeding = pregnancySelect.value === 'pregnant' || pregnancySelect.value === 'breastfeeding';
    for (const opt of dietSelect.options) {
      if (highRiskDietOptions.includes(opt.value)) {
        opt.disabled = isPregnancyOrBreastfeeding;
        if (isPregnancyOrBreastfeeding && dietSelect.value === opt.value) dietSelect.value = 'normal';
      }
    }
  }

  genderSelect.addEventListener('change', updatePregnancyRowVisibility);
  pregnancySelect.addEventListener('change', updateDietOptionsAvailability);
  updatePregnancyRowVisibility();
}

/**
 * يظهر تشيك بوكس "الصيام المستحب" وتحذير الدقة فقط لو المستخدم حدد ديانة
 * (إسلام/مسيحية) — بند مطلوب صراحة: "مفيش خانة لمسلم أو مسيحي".
 */
function wireReligionFieldToggle() {
  const religionSelect = document.getElementById('religion-select');
  const voluntaryRow = document.getElementById('voluntary-fasts-row');
  const voluntaryLabel = document.getElementById('voluntary-fasts-label');
  const disclaimer = document.getElementById('religion-disclaimer');

  function update() {
    const hasReligion = religionSelect.value === 'islam' || religionSelect.value === 'christianity';
    voluntaryRow.style.display = hasReligion ? '' : 'none';
    disclaimer.style.display = hasReligion ? '' : 'none';
    voluntaryLabel.textContent = religionSelect.value === 'islam'
      ? 'أراعي أيام الصيام المستحبة (الاتنين والخميس، عرفة، عاشوراء) مش رمضان بس'
      : 'أراعي صيام الأربعاء والجمعة الأسبوعي (مش بس مواسم الصوم الكبير/الميلاد/الرسل/العدرا)';
  }

  religionSelect.addEventListener('change', update);
  update();
}

/**
 * بار التحكم اليدوي في الماكرو: 3 مقابض (بروتين/كارب/دهون) بحدود آمنة
 * تتغيّر حسب الحالات المرضية المحددة في نفس الفورم، ورسالة مجموع حية
 * (لازم = 100%). القيم بتُقيَّد إلزاميًا بره الواجهة كمان (calculateMacroTargets)
 * — التحقق هنا لتجربة مستخدم واضحة وقت الإدخال بس، مش الدفاع الوحيد.
 */
function wireMacroBar() {
  const toggle = document.getElementById('custom-macro-toggle');
  const bar = document.getElementById('custom-macro-bar');
  const proteinRange = document.getElementById('macro-protein-range');
  const carbRange = document.getElementById('macro-carb-range');
  const fatRange = document.getElementById('macro-fat-range');
  const proteinValue = document.getElementById('macro-protein-value');
  const carbValue = document.getElementById('macro-carb-value');
  const fatValue = document.getElementById('macro-fat-value');
  const proteinHint = document.getElementById('macro-protein-hint');
  const carbHint = document.getElementById('macro-carb-hint');
  const fatHint = document.getElementById('macro-fat-hint');
  const sumMessage = document.getElementById('macro-sum-message');

  function selectedMedicalConditions() {
    return Array.from(document.querySelectorAll('input[name="medicalConditions"]:checked')).map((el) => el.value);
  }

  function applySafeRangeToInputs() {
    const range = resolveSafeMacroRange(selectedMedicalConditions());
    for (const [input, hint, key] of [[proteinRange, proteinHint, 'protein'], [carbRange, carbHint, 'carb'], [fatRange, fatHint, 'fat']]) {
      input.min = Math.round(range[key].min * 100);
      input.max = Math.round(range[key].max * 100);
      if (Number(input.value) < input.min) input.value = input.min;
      if (Number(input.value) > input.max) input.value = input.max;
      hint.textContent = `(${input.min}%–${input.max}%)`;
    }
  }

  function updateDisplay() {
    proteinValue.textContent = `${proteinRange.value}%`;
    carbValue.textContent = `${carbRange.value}%`;
    fatValue.textContent = `${fatRange.value}%`;

    const ratios = {
      protein: Number(proteinRange.value) / 100,
      carb: Number(carbRange.value) / 100,
      fat: Number(fatRange.value) / 100,
    };
    const validation = validateCustomMacroRatios(ratios, selectedMedicalConditions());
    if (validation.valid) {
      sumMessage.textContent = `✓ المجموع 100% وداخل الحد الآمن`;
      sumMessage.classList.remove('warning-text');
    } else {
      sumMessage.textContent = `⚠ ${validation.reason_ar}`;
      sumMessage.classList.add('warning-text');
    }
  }

  toggle.addEventListener('change', () => {
    bar.style.display = toggle.checked ? '' : 'none';
    if (toggle.checked) { applySafeRangeToInputs(); updateDisplay(); }
  });
  [proteinRange, carbRange, fatRange].forEach((el) => el.addEventListener('input', updateDisplay));
  document.querySelectorAll('input[name="medicalConditions"]').forEach((el) => {
    el.addEventListener('change', () => { if (toggle.checked) { applySafeRangeToInputs(); updateDisplay(); } });
  });
}

/**
 * يقرأ نسب الماكرو المخصّصة من بار التحكم لو مفعّل وصالح، أو null لو
 * التخصيص مش مفعّل أو مش صالح (وقتها البروفايل بيستخدم نسب نمط الحمية
 * الافتراضية زي قبل كده تمامًا — التخصيص اختياري بحت).
 */
function readCustomMacroRatiosFromForm() {
  const toggle = document.getElementById('custom-macro-toggle');
  if (!toggle || !toggle.checked) return null;
  const ratios = {
    protein: Number(document.getElementById('macro-protein-range').value) / 100,
    carb: Number(document.getElementById('macro-carb-range').value) / 100,
    fat: Number(document.getElementById('macro-fat-range').value) / 100,
  };
  const medicalConditions = Array.from(document.querySelectorAll('input[name="medicalConditions"]:checked')).map((el) => el.value);
  const validation = validateCustomMacroRatios(ratios, medicalConditions);
  return validation.valid ? validation.clamped : null;
}

function wireOnboardingForm() {
  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const errorBox = document.getElementById('onboarding-form-error');

    const goal = formData.get('goal');
    const weightKg = Number(formData.get('weightKg'));
    const targetWeightKg = Number(formData.get('targetWeightKg'));

    // BUG-S23-01: امنع حفظ بروفايل بهدف "خسارة/زيادة وزن" مع وزن مستهدف
    // في الاتجاه المعاكس (أو مساوٍ للوزن الحالي) بدل ما نسيب الحساب
    // يحصل بصمت في الـEngine بمنطق "ثبات" مُقنَّع بسعرات صيانة. الفحص هنا
    // دفاع أول (تجربة مستخدم أوضح فورًا)، والـEngine نفسه فيه حراسة مستقلة
    // كطبقة دفاع تانية لأي مسار مش عابر من الفورم ده (استيراد مثلًا).
    const goalTargetMismatch =
      (goal === 'lose' && targetWeightKg >= weightKg) ||
      (goal === 'gain' && targetWeightKg <= weightKg);

    if (goalTargetMismatch) {
      const goalLabel = goal === 'lose' ? 'خسارة وزن' : 'زيادة وزن';
      errorBox.textContent = `الوزن المستهدف (${targetWeightKg} كجم) لازم يكون ${goal === 'lose' ? 'أقل من' : 'أكبر من'} الوزن الحالي (${weightKg} كجم) عشان يتوافق مع هدف "${goalLabel}" — من فضلك صحّح أحد الحقلين.`;
      errorBox.style.display = '';
      if (typeof errorBox.scrollIntoView === 'function') {
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    errorBox.style.display = 'none';

    const profile = {
      id: PROFILE_ID,
      name: formData.get('name'),
      gender: formData.get('gender'),
      // BUG-S25-08: formData.get() بيرجّع String دايمًا. تخزين القيم كـString
      // خام هنا كان بيكسر أي فحص `typeof x === 'number'` مستقبلي — تحديدًا
      // `resolveBodyFatPercent`'s heightCm check، اللي كان بيرجع دايمًا
      // null بصمت لأي بروفايل بمحيط خصر/رقبة مسجَّل (تقدير Navy مكنش بيشتغل
      // أبدًا فعليًا رغم وجود البيانات المطلوبة كاملة). اتأكد بالتجربة
      // الفعلية أثناء بناء حوار InBody تقريبي (S25). التحويل هنا بدل كل نقطة
      // استهلاك لاحقة عشان يبقى `currentProfile` دايمًا أرقام حقيقية، متسق
      // مع باقي بيانات التتبّع اليومي (وزن/ماء بالفعل Number من قبل).
      age: Number(formData.get('age')),
      heightCm: Number(formData.get('heightCm')),
      weightKg: Number(formData.get('weightKg')),
      targetWeightKg: Number(formData.get('targetWeightKg')),
      activityLevel: formData.get('activityLevel'),
      goal: formData.get('goal'),
      timeframeDays: Number(formData.get('timeframeDays')),
      dietStyle: formData.get('dietStyle'),
      dietAdherence: formData.get('dietAdherence') || 'flexible',
      pregnancyStatus: formData.get('pregnancyStatus') || PREGNANCY_STATUS.NONE,
      religion: formData.get('religion') || 'none',
      observeVoluntaryFasts: formData.get('observeVoluntaryFasts') === 'on',
      cuisinePreference: formData.get('cuisinePreference') || 'egyptian_only',
      customMacroRatios: readCustomMacroRatiosFromForm(),
      medicalConditions: formData.getAll('medicalConditions'),
      allergies: formData.getAll('allergies').map((allergen) => ({
        allergen,
        severity: formData.get(`allergySeverity_${allergen}`) || ALLERGY_SEVERITY.SEVERE,
      })),
      createdAt: new Date().toISOString(),
    };

    const { ok } = await withStorageErrorFeedback(() => putRecord(STORE.PROFILE, profile), 'onboarding-form-error');
    if (!ok) return;
    currentProfile = profile;
    currentNutrition = calculateFullNutritionProfile(await toEngineProfile(profile));

    showApp();
    populateAdvancedFieldsForm();
    await renderDashboard();
    await renderActivityTab();
    await renderTrackingTab();
  });
}

// خريطة شدة التوصية → كلاس CSS، مشتركة بين لوحة التحكم وتاب التحليلات
const severityClass = {
  [RECOMMENDATION_SEVERITY.POSITIVE]: 'success-box',
  [RECOMMENDATION_SEVERITY.WARNING]: 'warning-box',
  [RECOMMENDATION_SEVERITY.INFO]: 'info-box',
};

// -----------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------

async function renderDashboard() {
  if (!currentNutrition) return;
  const n = currentNutrition;
  const container = document.getElementById('dashboard-content');

  // BUG-S23-02: قبل كده، طول/وزن تالف (heightCm=0 مثلًا من استيراد معطوب)
  // كان بيخلي كارت الـBMI بس يعرض "بيانات غير صالحة" بينما باقي الكاردات
  // (BMR/TDEE/سعرات/ماكرو) بتعرض خطة كاملة محسوبة من نفس الرقم التالف —
  // وده كمان كان هينهار فعليًا (n.bmr.value و n.calorieTarget.targetCalories
  // على null). لو dataValidity.valid === false، نوقف هنا ونعرض تحذير واحد
  // واضح بدل خطة وهمية أو Crash.
  if (n.dataValidity && n.dataValidity.valid === false) {
    container.innerHTML = `
      <div class="card" style="grid-column:1/-1">
        <h3>مؤشر كتلة الجسم (BMI)</h3>
        <div class="value" style="color:${n.bmiClass.color}">—</div>
        <div class="unit">${n.bmiClass.label_ar}</div>
      </div>
      <div class="card" style="grid-column:1/-1">
        <div class="warning-box">${n.dataValidity.message_ar}</div>
      </div>
    `;
    return;
  }

  const today = getLocalDateStr();
  const dailyTotals = await computeDailyTotals(today, getFoodById);
  const recommendations = getInstantRecommendations(dailyTotals, n, currentProfile.medicalConditions ?? []);
  const tips = getGeneralTips(currentProfile.medicalConditions ?? []);
  await refreshRemainingBudget(); // إعادة حساب ميزانية الوجبات المتبقية دايمًا مع أي تحديث للداشبورد (ميزة "معزوم برة")

  const latestBodyComp = await getLatestBodyCompFields(); // S25: مصدر واحد للتركيب — التسجيل اليومي بتاب التتبع
  const bodyFat = resolveBodyFatPercent({
    ...currentProfile,
    waistCm: latestBodyComp?.waistCm ?? undefined,
    neckCm: latestBodyComp?.neckCm ?? undefined,
    hipCm: latestBodyComp?.hipCm ?? undefined,
    bodyFatPercent: latestBodyComp?.bodyFatPercent ?? undefined,
  });
  let bodyCompositionCard = '';
  if (bodyFat.value !== null) {
    const weightKg = Number(currentProfile.weightKg);
    const fatMassKg = +(weightKg * (bodyFat.value / 100)).toFixed(1);
    const leanMassKg = +(weightKg - fatMassKg).toFixed(1);
    const sourceLabel = bodyFat.source === 'measured' ? 'مُدخلة يدويًا' : 'تقدير تلقائي بمعادلة Navy';
    bodyCompositionCard = `
      <div class="card">
        <h3>🧬 تركيب الجسم</h3>
        <div class="value">${bodyFat.value}%</div>
        <div class="unit">نسبة دهون (${sourceLabel})</div>
        <div class="unit" style="margin-top:6px">كتلة دهون ≈ ${fatMassKg} كجم · كتلة خالية من الدهون ≈ ${leanMassKg} كجم</div>
        <button class="secondary-btn" id="open-inbody-dialog-btn" style="margin-top:10px">تقرير InBody تقريبي</button>
      </div>
    `;
  } else {
    // S25: الزرار موجود حتى من غير محيطات/نسبة دهون مسجَّلة — تقرير مبسَّط
    // من الوزن/الطول/العمر بس زي ما طلب المستخدم بالظبط
    bodyCompositionCard = `
      <div class="card">
        <h3>🧬 تركيب الجسم</h3>
        <div class="unit">سجّل محيط الخصر/الرقبة (تاب التتبع) لتقدير أدق، أو شوف تقرير مبسَّط من الوزن/الطول بس</div>
        <button class="secondary-btn" id="open-inbody-dialog-btn" style="margin-top:10px">تقرير InBody تقريبي</button>
      </div>
    `;
  }

  const pregnancyCard = n.pregnancyNotice ? `
    <div class="card" style="grid-column:1/-1">
      <div class="warning-box">
        ${n.pregnancyNotice.message_ar}
        ${n.pregnancyNotice.dietOverridden ? `<br>${n.pregnancyNotice.dietOverrideReason_ar}` : ''}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    ${pregnancyCard}
    <div class="card highlight-card" style="grid-column:1/-1">
      <h3>💡 التوصيات الفورية</h3>
      ${recommendations.map((r) => `<div class="${severityClass[r.severity] ?? 'info-box'}">${r.message_ar}</div>`).join('')}
    </div>

    <div class="card">
      <h3>⚖️ مؤشر كتلة الجسم (BMI)</h3>
      <div class="value" style="color:${n.bmiClass.color}">${n.bmi ?? '—'}</div>
      <div class="unit">${n.bmiClass.label_ar}</div>
      ${n.bmi !== null ? `<div class="bmi-bar"><div class="bmi-marker" style="right:${Math.min(95, Math.max(2, (n.bmi / 45) * 100))}%"></div></div>` : ''}
    </div>

    <div class="card">
      <h3>🎯 نطاق الوزن المثالي</h3>
      <div class="value small">${n.idealWeightRange ? `${n.idealWeightRange.min_kg} – ${n.idealWeightRange.max_kg}` : '—'}</div>
      <div class="unit">كجم</div>
    </div>

    ${bodyCompositionCard}

    <div class="card">
      <h3>🔥 معدل الحرق الأساسي (BMR)</h3>
      <div class="value">${n.bmr.value}</div>
      <div class="unit">سعرة/يوم (${n.bmr.formula_used === 'katch_mcardle' ? 'Katch-McArdle' : 'Mifflin-St Jeor'})</div>
    </div>

    <div class="card">
      <h3>⚡ إجمالي الحرق اليومي (TDEE)</h3>
      <div class="value">${n.tdeeBreakdown.tdee}</div>
      <div class="unit">BMR:${n.tdeeBreakdown.bmr} + NEAT:${n.tdeeBreakdown.neat} + EAT:${n.tdeeBreakdown.eat} + TEF:${n.tdeeBreakdown.tef}</div>
    </div>

    <div class="card">
      <h3>🎯 السعرات المستهدفة</h3>
      <div class="value">${n.calorieTarget.targetCalories}</div>
      <div class="unit">${n.calorieTarget.dailyAdjustment > 0 ? '+' : ''}${n.calorieTarget.dailyAdjustment} عن TDEE${n.calorieTarget.estimatedWeeks ? ` — تقريبًا ${n.calorieTarget.estimatedWeeks} أسبوع للهدف` : ''}</div>
      ${n.calorieTarget.warning ? `<div class="warning-box">${n.calorieTarget.warning}</div>` : ''}
    </div>

    <div class="card">
      <h3>🍽️ أهداف الماكرو اليومية</h3>
      <div class="value small">بروتين ${n.macroTargets.protein_g}g · كارب ${n.macroTargets.carb_g}g · دهون ${n.macroTargets.fat_g}g</div>
    </div>

    <div class="card" style="grid-column:1/-1">
      <h3>📌 نصائح</h3>
      ${tips.map((t) => `<div class="unit" style="margin-bottom:6px">${t.condition_label_ar ? `<strong>${t.condition_label_ar}:</strong> ` : ''}${t.message_ar}</div>`).join('')}
    </div>
  `;

  const inbodyBtn = document.getElementById('open-inbody-dialog-btn');
  if (inbodyBtn) inbodyBtn.addEventListener('click', () => showInBodyDialog(n, bodyFat));
}

/**
 * S25 (بطلب المستخدم): حوار "InBody تقريبي" — تقدير مبسَّط لتركيب الجسم
 * من البيانات المسجَّلة فعليًا بالفعل (وزن/طول/عمر/جنس دايمًا، ونسبة
 * الدهون/المحيطات لو موجودة). القيم كلها تقديرية بالتصميم ومُعلَّم عليها
 * صراحة "تقريبي" — مش بديل عن جهاز InBody حقيقي، ومفيش أي ادّعاء دقة طبية.
 * @param {object} n - currentNutrition (فيه bmi/bmr/tdeeBreakdown)
 * @param {{value: number|null, source: string|null}} bodyFat - ناتج resolveBodyFatPercent
 */
function showInBodyDialog(n, bodyFat) {
  const weightKg = Number(currentProfile.weightKg);
  const heightM = Number(currentProfile.heightCm) / 100;
  const dialog = document.getElementById('inbody-dialog');
  const content = document.getElementById('inbody-dialog-content');

  let rows = `
    <div class="inbody-row"><span class="label">الوزن</span><span class="value">${weightKg} كجم</span></div>
    <div class="inbody-row"><span class="label">مؤشر كتلة الجسم (BMI)</span><span class="value">${n.bmi ?? '—'}</span></div>
  `;

  if (bodyFat.value !== null) {
    const fatMassKg = +(weightKg * (bodyFat.value / 100)).toFixed(1);
    const leanMassKg = +(weightKg - fatMassKg).toFixed(1);
    // تقديرات تقريبية شائعة الاستخدام: الكتلة الخالية من الدهون كمرجع لكتلة
    // العضلات الهيكلية (≈50% منها تقريبًا)، ومياه الجسم كمرجع للأنسجة
    // الخالية من الدهون (≈73% منها تقريبًا) — نفس التقديرات المستخدمة في
    // أجهزة InBody الاستهلاكية كخط أساس، مش قياس فعلي بالممانعة الكهربية.
    const skeletalMuscleKg = +(leanMassKg * 0.5).toFixed(1);
    const bodyWaterKg = +(leanMassKg * 0.73).toFixed(1);
    const bodyWaterPct = +((bodyWaterKg / weightKg) * 100).toFixed(1);
    const sourceLabel = bodyFat.source === 'measured' ? 'مُدخلة يدويًا' : 'مُقدَّرة بمعادلة Navy';
    rows += `
      <div class="inbody-row"><span class="label">نسبة الدهون (${sourceLabel})</span><span class="value">${bodyFat.value}%</span></div>
      <div class="inbody-row"><span class="label">كتلة الدهون</span><span class="value">${fatMassKg} كجم</span></div>
      <div class="inbody-row"><span class="label">الكتلة الخالية من الدهون</span><span class="value">${leanMassKg} كجم</span></div>
      <div class="inbody-row"><span class="label">تقدير كتلة العضلات الهيكلية</span><span class="value">${skeletalMuscleKg} كجم</span></div>
      <div class="inbody-row"><span class="label">تقدير نسبة مياه الجسم</span><span class="value">${bodyWaterPct}%</span></div>
    `;
  }

  rows += `<div class="inbody-row"><span class="label">معدل الحرق الأساسي (BMR)</span><span class="value">${n.bmr.value} سعرة/يوم</span></div>`;

  content.innerHTML = `
    <h2>🧬 تقرير InBody تقريبي</h2>
    <p class="subtitle" style="margin-top:-8px">تقدير تقريبي من بيانات البروفايل والتتبّع — مش قياس فعلي بجهاز InBody، ومينفعش يتحسب عليه أي قرار طبي.</p>
    ${rows}
  `;
  // بعض بيئات التشغيل (وبيئة اختبار jsdom المستخدمة في السويت هنا تحديدًا،
  // اتأكد منها فعليًا) مش بتدعم showModal()/close() الأصليين لعنصر
  // <dialog> رغم إنه عنصر HTML قياسي — احتياط بسيط بدل ما الزرار يطلع
  // استثناء غير مُمسوك لو الدعم مش موجود.
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/** يوصّل زرار إغلاق حوار الـInBody — مرة واحدة بس وقت تحميل الصفحة */
function wireInBodyDialog() {
  const closeBtn = document.getElementById('inbody-dialog-close');
  const dialog = document.getElementById('inbody-dialog');
  if (closeBtn && dialog) closeBtn.addEventListener('click', () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  });
}

/**
 * حقل "غيّر رقم السعرات لهذا التوليد" — بيتصفّر على الرقم المحسوب تلقائيًا
 * (calorieTarget.targetCalories) في كل مرة تُفتح فيها تابة التوليد، ومش
 * بيتحفظ في البروفايل (طلب المستخدم صراحة: "اسألني في كل مرة" مش حفظ ثابت).
 * لو المستخدم غيّر الرقم يدويًا قبل الضغط على توليد، القيمة دي هي اللي
 * بتتستخدم فعليًا بدل رقم النظام — فوريًا في نفس الجلسة، من غير أي تخزين دائم.
 */
function resetCalorieOverrideInput() {
  const input = document.getElementById('calorie-override-input');
  if (!input || !currentNutrition?.calorieTarget) return;
  input.value = String(currentNutrition.calorieTarget.targetCalories);
  input.dataset.systemDefault = String(currentNutrition.calorieTarget.targetCalories);
}

/**
 * الهدف اليومي الفعلي اللي هيُستخدم في التوليد (وجبة مفردة أو خطة يوم):
 * لو حقل التخصيص فيه رقم مختلف عن رقم النظام المحسوب، بيتم إعادة حساب
 * الماكرو بالكامل على أساسه (مش بس تناسب بسيط) عشان تفضل نسب البروتين/الكارب/
 * الدهون سليمة ومتقيّدة بنفس الحدود الآمنة والقيود الطبية. لو الحقل فاضي/غير
 * صالح، بيرجع لرقم النظام الأصلي زي ما هو.
 */
function getEffectiveDailyTarget() {
  const fallback = { targetCalories: currentNutrition.calorieTarget.targetCalories, macroTargets: currentNutrition.macroTargets };
  const input = document.getElementById('calorie-override-input');
  if (!input) return fallback;
  const overrideValue = Number(input.value);
  if (!Number.isFinite(overrideValue) || overrideValue <= 0) return fallback;

  const macroTargets = calculateMacroTargets(
    overrideValue,
    currentProfile.dietStyle ?? 'normal',
    Number(currentProfile.weightKg),
    currentProfile.customMacroRatios ?? null,
    currentProfile.medicalConditions ?? []
  );
  return { targetCalories: Math.round(overrideValue), macroTargets };
}

/**
 * يعيد حساب ميزانية الوجبات المتبقية في اليوم (سعرات/ماكرو) بناءً على أي
 * استهلاك فعلي حتى الآن (وجبات مسجَّلة + تقدير "معزوم برة") — ده اللي
 * يُفعِّل "إعادة توازن تلقائي لباقي وجبات اليوم" المطلوبة صراحة لميزة
 * "معزوم برة". يُستدعى بعد أي تسجيل (وجبة عادية أو معزوم برة) وعند أي
 * إعادة رسم للداشبورد، فيبقى `todayRemainingBudget` دايمًا محدَّث.
 * بيستخدم الهدف *الفعلي* (رقم النظام أو رقم المستخدم المخصص لو غيّره) —
 * مش رقم النظام مباشرة — عشان توليد الوجبة المفردة وخطة اليوم الاتنين
 * يشتغلوا على نفس الرقم اللي اختاره المستخدم.
 */
async function refreshRemainingBudget() {
  // BUG-S23-02: currentNutrition ممكن يكون موجود لكن calorieTarget/macroTargets
  // جواه null (بيانات طول/وزن تالفة) — بدون الفحص ده كان هينهار على
  // .targetCalories من undefined بصمت.
  if (!currentProfile || !currentNutrition?.calorieTarget) { todayRemainingBudget = null; return; }
  const today = getLocalDateStr();
  const daily = await computeDailyTotals(today, getFoodById);

  const allLogs = await getAllRecords(STORE.MEAL_LOGS);
  const loggedMealTypesToday = new Set(allLogs.filter((l) => l.date === today).map((l) => l.mealType));
  const remainingMealTypes = ALL_MEAL_TYPES.filter((mt) => !loggedMealTypesToday.has(mt));

  const effectiveTarget = getEffectiveDailyTarget();

  todayRemainingBudget = calculateRemainingMealBudget({
    dailyCalorieTarget: effectiveTarget.targetCalories,
    dailyMacroTargets: effectiveTarget.macroTargets,
    consumedKcal: daily.nutrition?.kcal ?? 0,
    consumedMacros: daily.nutrition
      ? { protein_g: daily.nutrition.protein_g, carb_g: daily.nutrition.carbs_g, fat_g: daily.nutrition.fat_g }
      : {},
    remainingMealTypes,
  });

  renderRemainingBudget();
}

function renderRemainingBudget() {
  const container = document.getElementById('remaining-budget-content');
  if (!container) return;
  if (!todayRemainingBudget) { container.innerHTML = ''; return; }

  const b = todayRemainingBudget;
  const remainingTypesCount = Object.keys(b.perMeal).length;
  container.innerHTML = `
    <div class="card" style="grid-column:1/-1">
      <h3>🧮 الباقي من هدف اليوم</h3>
      <div class="value">${b.remainingKcal} سعرة</div>
      <div class="unit">بروتين ${b.remainingMacros.protein_g}g · كارب ${b.remainingMacros.carb_g}g · دهون ${b.remainingMacros.fat_g}g</div>
      ${remainingTypesCount > 0
        ? `<div class="unit" style="margin-top:6px">موزّعة على ${remainingTypesCount} وجبة متبقية — التوليد هيستخدم النصيب ده تلقائيًا.</div>`
        : `<div class="unit" style="margin-top:6px">كل الوجبات الأساسية مسجَّلة النهاردة بالفعل.</div>`}
    </div>
  `;
}

/** يقرأ تشيك بوكس "مش صايم النهاردة" (تجاوز يدوي مشترك بين التوليد المفرد وخطة اليوم) */
function readManualFastingOverride() {
  return !!document.getElementById('day-plan-not-fasting-override')?.checked;
}

/** يحسب حالة الصيام الفعلية للبروفايل الحالي اليوم (بيراعي التجاوز اليدوي) */
function resolveCurrentFastingStatus() {
  if (!currentProfile) return { isFasting: false, fastingTag: null, label_ar: null, mealSlotsHint: 'normal' };
  return resolveDailyFastingStatus({
    date: new Date(),
    religion: currentProfile.religion ?? 'none',
    observeVoluntaryFasts: !!currentProfile.observeVoluntaryFasts,
    manualOverrideNotFasting: readManualFastingOverride(),
  });
}

/** بانر "انت صايم النهاردة" أعلى شاشة توليد الوجبة/خطة اليوم — بند مطلوب صراحة من المستخدم */
function renderFastingBanner() {
  const container = document.getElementById('fasting-banner');
  if (!container) return;
  if (!currentProfile || (currentProfile.religion ?? 'none') === 'none') { container.innerHTML = ''; return; }

  const status = resolveCurrentFastingStatus();
  if (!status.isFasting) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="card" style="grid-column:1/-1">
      <h3>🌙 انت صايم النهاردة</h3>
      <div class="unit">${status.label_ar}${status.mealSlotsHint === 'suhoor_iftar' ? ' — توليد خطة اليوم هيقسّمها سحور/إفطار بدل الوجبات العادية' : ''}</div>
    </div>
  `;
}

/** أي تعديل يدوي في رقم السعرات المخصص يحدّث فورًا عرض "الباقي من هدف اليوم" بنفس الرقم الجديد */
function wireCalorieOverrideInput() {
  const input = document.getElementById('calorie-override-input');
  if (!input) return;
  input.addEventListener('input', () => { refreshRemainingBudget(); });
}

function wireMealGeneration() {
  document.getElementById('generate-meal-btn').addEventListener('click', async () => {
    if (!currentProfile || !currentNutrition?.calorieTarget) return;
    const mealType = document.getElementById('meal-type-select').value;

    await refreshRemainingBudget();
    const budget = todayRemainingBudget?.perMeal?.[mealType];
    const mealShare = DEFAULT_MEAL_SHARE[mealType] ?? 0.25;
    const effectiveTarget = getEffectiveDailyTarget();

    const targetKcal = budget ? budget.targetKcal : effectiveTarget.targetCalories * mealShare;
    const macroTargets = budget ? budget.macroTargets : {
      protein_g: effectiveTarget.macroTargets.protein_g * mealShare,
      carb_g: effectiveTarget.macroTargets.carb_g * mealShare,
      fat_g: effectiveTarget.macroTargets.fat_g * mealShare,
    };

    const result = generateMeal({
      constraintProfile: toConstraintProfile(currentProfile, { manualOverrideNotFasting: readManualFastingOverride() }),
      mealType,
      targetKcal,
      macroTargets,
      microTargets: currentNutrition.microTargets,
      minFoodQualityScore: 30,
      adherenceLevel: currentProfile.dietAdherence || 'flexible',
    });

    // S80-d: تنويع عشوائي محكوم — بدل ما زرار "توليد" يرجّع نفس التركيبة
    // الحتمية بالظبط كل مرة، بيختار من ضمن أفضل التركيبات المتقاربة بالجودة
    if (result.success) {
      const chosen = pickMealWithVariety(result.candidates);
      result.candidates = [chosen, ...result.candidates.filter((c) => c !== chosen)];
    }

    renderMealResult(result, mealType);
  });

  wireEatingOutForm();
}

/**
 * توليد خطة اليوم الكامل — بند مطلوب صراحة: "مش بس وجبة واحدة، عايز نظام
 * يوم كامل على حسب عدد السعرات وعدد السناكس/المشروبات". بيستخدم الهدف
 * اليومي *المتبقي* فعليًا (زي توليد الوجبة المفردة) لو فيه وجبات مسجَّلة
 * بالفعل النهاردة، مش الهدف الكلي من الصفر.
 */
function wireDayPlanGeneration() {
  document.getElementById('generate-day-plan-btn').addEventListener('click', async () => {
    if (!currentProfile || !currentNutrition?.calorieTarget) return;

    await refreshRemainingBudget();
    const snacksCount = Math.max(0, Number(document.getElementById('day-plan-snacks-count').value) || 0);
    const drinksCount = Math.max(0, Number(document.getElementById('day-plan-drinks-count').value) || 0);
    const status = resolveCurrentFastingStatus();

    const effectiveTarget = getEffectiveDailyTarget();
    const dailyCalorieTarget = todayRemainingBudget?.remainingKcal ?? effectiveTarget.targetCalories;
    const dailyMacroTargets = todayRemainingBudget?.remainingMacros ?? effectiveTarget.macroTargets;

    const result = generateDayPlan({
      constraintProfile: toConstraintProfile(currentProfile, { manualOverrideNotFasting: readManualFastingOverride() }),
      dailyCalorieTarget,
      dailyMacroTargets,
      microTargets: currentNutrition.microTargets,
      isFasting: status.isFasting,
      mealSlotsHint: status.mealSlotsHint,
      snacksCount,
      drinksCount,
      adherenceLevel: currentProfile.dietAdherence || 'flexible',
      minFoodQualityScore: 30,
    });

    renderDayPlanResult(result);
  });

  document.getElementById('day-plan-not-fasting-override').addEventListener('change', renderFastingBanner);
}

let templateLevelUserChanged = false; // يمنع الكشف التلقائي لأقرب مستوى سعرات من الكتابة فوق اختيار اليوزر اليدوي

/** يبني القائمتين المنسدلتين (المستوى/اليوم) لقسم "خطط جاهزة بالسعرات" — مرة واحدة عند التحميل */
function wireMealPlanTemplates() {
  const levelSelect = document.getElementById('meal-plan-template-level');
  const daySelect = document.getElementById('meal-plan-template-day');

  levelSelect.innerHTML = MEAL_PLAN_CALORIE_LEVELS.map((lvl) => `<option value="${lvl}">${lvl} سعرة</option>`).join('');
  daySelect.innerHTML = MEAL_PLAN_DAYS.map((d) => `<option value="${d}">${d}</option>`).join('');
  levelSelect.addEventListener('change', () => { templateLevelUserChanged = true; });

  document.getElementById('show-meal-plan-template-btn').addEventListener('click', () => {
    const level = Number(levelSelect.value);
    const day = daySelect.value;
    const result = resolveMealPlanTemplateDay(level, day);
    renderMealPlanTemplateResult(result);
  });
}

/** لو اليوزر لسه ما لمسش القائمة يدويًا، يختار أقرب مستوى سعرات جاهز لهدفه الحالي — راحة استخدام بسيطة، مش إلزام */
function autoSelectNearestTemplateLevel() {
  if (templateLevelUserChanged || !currentNutrition?.calorieTarget) return;
  const levelSelect = document.getElementById('meal-plan-template-level');
  if (!levelSelect) return;
  levelSelect.value = String(nearestCalorieLevel(currentNutrition.calorieTarget.targetCalories));
}

const TEMPLATE_MEAL_KEY_TO_ENGLISH = { 'فطار': 'breakfast', 'غداء': 'lunch', 'سناك': 'snack', 'عشاء': 'dinner' };

function renderMealPlanTemplateResult(result) {
  const container = document.getElementById('meal-plan-template-result');
  if (!container) return;
  if (!result) { container.innerHTML = '<div class="warning-box">مفيش قالب لليوم/المستوى ده.</div>'; return; }

  const slotsHtml = result.slots.map((slot, idx) => {
    const itemsHtml = slot.meal.items.map((i) =>
      `<li><span class="food-icon">${categoryIcon(i.food.category)}</span> ${i.food.name_ar} — ${i.grams} جم</li>`
    ).join('');
    return `
      <div class="card" style="grid-column:1/-1">
        <h3>${MEAL_TYPE_LABEL_AR[TEMPLATE_MEAL_KEY_TO_ENGLISH[slot.slotType]] ?? slot.label_ar} <span class="unit">(${slot.meal.qualityLabel})</span></h3>
        <ul>${itemsHtml}</ul>
        <div class="unit">${Math.round(slot.meal.totals.kcal)} سعرة · بروتين ${Math.round(slot.meal.totals.protein_g)}g · كارب ${Math.round(slot.meal.totals.carbs_g)}g · دهون ${Math.round(slot.meal.totals.fat_g)}g</div>
        <button class="secondary-btn log-template-slot-btn" data-slot-index="${idx}">✅ تسجيل هذه الوجبة</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card" style="grid-column:1/-1">
      <h3>📊 إجمالي اليوم — ${result.calorieLevel} سعرة</h3>
      <div class="value">${result.totals.kcal} سعرة الفعلية</div>
      <div class="unit">بروتين ${result.totals.protein_g}g · كارب ${result.totals.carbs_g}g · دهون ${result.totals.fat_g}g</div>
    </div>
    ${slotsHtml}
  `;

  container.querySelectorAll('.log-template-slot-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.slotIndex);
      const slot = result.slots[idx];
      const today = getLocalDateStr();
      const { ok } = await withStorageErrorFeedback(
        () => logMeal(today, TEMPLATE_MEAL_KEY_TO_ENGLISH[slot.slotType] ?? 'snack', slot.meal.items),
        'meal-plan-template-result'
      );
      if (!ok) return;
      await refreshRemainingBudget();
      await renderDashboard();
      btn.disabled = true;
      btn.textContent = '✓ اتسجّلت';
    });
  });
}

function renderDayPlanResult(result) {
  const container = document.getElementById('day-plan-result');
  if (!container) return;

  const slotsHtml = result.slots.map((slot, idx) => {
    if (!slot.success) {
      return `
        <div class="card" style="grid-column:1/-1">
          <h3>${slot.isBeverage ? '🥤' : '🍽️'} ${slot.label_ar}</h3>
          <div class="warning-box">تعذّر توليد هذا السلوت: ${slot.diagnosis?.message_ar ?? 'سبب غير محدد'}</div>
        </div>
      `;
    }
    const itemsHtml = slot.meal.items.map((i) =>
      `<li><span class="food-icon">${categoryIcon(i.food.category)}</span> ${i.food.name_ar} — ${i.grams} جم</li>`
    ).join('');
    return `
      <div class="card" style="grid-column:1/-1">
        <h3>${slot.isBeverage ? '🥤' : '🍽️'} ${slot.label_ar} <span class="unit">(${slot.meal.qualityLabel})</span></h3>
        <ul>${itemsHtml}</ul>
        <div class="unit">${Math.round(slot.meal.totals.kcal)} سعرة · بروتين ${Math.round(slot.meal.totals.protein_g)}g · كارب ${Math.round(slot.meal.totals.carbs_g)}g · دهون ${Math.round(slot.meal.totals.fat_g)}g</div>
        <button class="secondary-btn log-day-plan-slot-btn" data-slot-index="${idx}">✅ تسجيل هذه الوجبة</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card" style="grid-column:1/-1">
      <h3>📊 ملخص الخطة</h3>
      <div class="value">${result.successCount}/${result.totalCount} سلوت اتولّد بنجاح</div>
      <div class="unit">إجمالي الخطة: ${result.totals.kcal} سعرة · بروتين ${result.totals.protein_g}g · كارب ${result.totals.carbs_g}g · دهون ${result.totals.fat_g}g (الهدف: ${result.dailyCalorieTarget} سعرة)</div>
    </div>
    ${slotsHtml}
  `;

  container.querySelectorAll('.log-day-plan-slot-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.slotIndex);
      const slot = result.slots[idx];
      if (!slot?.success) return;
      const today = getLocalDateStr();
      const mealTypeForLog = slot.slotType;
      const { ok } = await withStorageErrorFeedback(
        () => logMeal(today, mealTypeForLog, slot.meal.items),
        'day-plan-result'
      );
      if (!ok) return;
      await refreshRemainingBudget();
      await renderDashboard();
      btn.disabled = true;
      btn.textContent = '✓ اتسجّلت';
    });
  });
}

function wireEatingOutForm() {
  document.getElementById('eating-out-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentProfile) return;
    const formData = new FormData(e.target);
    const mealType = formData.get('eatingOutMealType');
    const estimatedKcal = Number(formData.get('eatingOutKcal'));
    const messageBox = document.getElementById('eating-out-message');

    if (!estimatedKcal || estimatedKcal <= 0) {
      messageBox.innerHTML = `<div class="warning-box">دخّل تقدير سعرات صحيح.</div>`;
      return;
    }

    const today = getLocalDateStr();
    const { ok } = await withStorageErrorFeedback(() => logEatingOutMeal(today, mealType, estimatedKcal), 'eating-out-message');
    if (!ok) return;
    await refreshRemainingBudget();
    await renderDashboard();

    messageBox.innerHTML = `<div class="success-box">تم الحفظ ✓ — الباقي من هدف اليوم اتحدَّث تلقائيًا، وباقي الوجبات هتتولّد بناءً عليه.</div>`;
    e.target.reset();
  });
}

function renderMealResult(result, mealType) {
  const container = document.getElementById('meal-result');

  if (!result.success) {
    lastGeneratedMeal = null;
    container.innerHTML = `
      <div class="error-box">
        <strong>مافيش تركيبة مناسبة —</strong> ${result.diagnosis.message_ar}
        ${result.diagnosis.details && Array.isArray(result.diagnosis.details) ? `
          <ul>${result.diagnosis.details.slice(0, 3).map((d) => `<li>${d.message_ar}</li>`).join('')}</ul>
        ` : ''}
      </div>`;
    return;
  }

  const best = result.candidates[0];
  lastGeneratedMeal = { items: best.items, mealType };
  renderMealCard(best, mealType);
}

/** يبني كارت تركيبة الوجبة — تعديل حجم كل حصة، وبقى قابل للتعديل الحر بالكامل (S53-c): حذف صنف، وإضافة أي صنف من المكتبة بحث سريع جوّه الكارت نفسه */
function renderMealCard(meal, mealType) {
  const container = document.getElementById('meal-result');
  const qualityClass = meal.qualityScore >= 85 ? 'quality-excellent' : meal.qualityScore >= 70 ? 'quality-good' : meal.qualityScore >= 55 ? 'quality-ok' : 'quality-poor';
  const hasItems = meal.items.length > 0;

  container.innerHTML = `
    <div class="card">
      <h3>${MEAL_TYPE_LABEL_AR[mealType] ?? mealType} — تركيبة قابلة للتعديل الحر ${hasItems ? `<span class="quality-badge ${qualityClass}">${meal.qualityScore} — ${meal.qualityLabel}</span>` : ''}</h3>
      ${hasItems ? meal.items.map((i, idx) => `
        <div class="meal-item-row">
          <span><span class="food-icon">${categoryIcon(i.food.category)}</span> ${i.food.name_ar}</span>
          <span class="portion-edit">
            <input type="number" class="portion-input" data-item-index="${idx}" value="${i.grams}" min="1" max="2000" step="1"> جم
            <button type="button" class="remove-meal-item-btn" data-item-index="${idx}" title="حذف الصنف من الوجبة">✕</button>
          </span>
        </div>
      `).join('') : '<p class="subtitle">الوجبة فاضية دلوقتي — ضيف أصناف من البحث تحت أو من تاب مكتبة الطعام.</p>'}
      ${hasItems ? `
        <div class="meal-item-row"><strong>الإجمالي</strong><strong>${Math.round(meal.totals.kcal)} سعرة</strong></div>
        <div class="unit">بروتين ${Math.round(meal.totals.protein_g)}g · كارب ${Math.round(meal.totals.carbs_g)}g · دهون ${Math.round(meal.totals.fat_g)}g</div>
      ` : ''}
      <div id="portion-edit-message"></div>

      <div class="form-row" style="margin-top:10px">
        <label style="flex:1">ضيف صنف تاني (بحث سريع)
          <input type="text" id="meal-quick-add-search" placeholder="مثال: عدس، جبن قريش...">
        </label>
      </div>
      <div id="meal-quick-add-results" class="quick-add-results"></div>

      <button id="log-meal-btn" class="primary-btn" style="margin-top:12px" ${hasItems ? '' : 'disabled'}>تسجيل هذه الوجبة</button>
    </div>
  `;

  container.querySelectorAll('.portion-input').forEach((input) => {
    input.addEventListener('change', () => {
      const itemIndex = Number(input.dataset.itemIndex);
      const newGrams = Number(input.value);
      const updated = updateMealItemPortion(lastGeneratedMeal, itemIndex, newGrams, currentNutrition?.microTargets ?? null);

      if (!updated.success) {
        document.getElementById('portion-edit-message').innerHTML = `<div class="warning-box">${updated.diagnosis_ar}</div>`;
        return;
      }

      lastGeneratedMeal = { items: updated.candidate.items, mealType };
      renderMealCard(updated.candidate, mealType);
    });
  });

  container.querySelectorAll('.remove-meal-item-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemIndex = Number(btn.dataset.itemIndex);
      const items = meal.items.filter((_, idx) => idx !== itemIndex);
      lastGeneratedMeal = { items, mealType };
      renderMealCard(buildMealCandidateFromItems(items), mealType);
    });
  });

  const quickAddInput = document.getElementById('meal-quick-add-search');
  const quickAddResults = document.getElementById('meal-quick-add-results');
  quickAddInput.addEventListener('input', () => {
    const query = quickAddInput.value.trim();
    if (query.length < 2) { quickAddResults.innerHTML = ''; return; }
    const matches = searchFoodsByName(query).slice(0, 8);
    quickAddResults.innerHTML = matches.map((f) =>
      `<button type="button" class="quick-add-result-chip" data-food-id="${f.id}"><span class="food-icon">${categoryIcon(f.category)}</span> ${f.name_ar}</button>`
    ).join('') || '<span class="unit">مفيش نتائج</span>';

    quickAddResults.querySelectorAll('.quick-add-result-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const food = matches.find((f) => f.id === chip.dataset.foodId);
        if (!food) return;
        const items = [...meal.items, { food, grams: 100 }];
        lastGeneratedMeal = { items, mealType };
        renderMealCard(buildMealCandidateFromItems(items), mealType);
      });
    });
  });

  if (!hasItems) return;

  document.getElementById('log-meal-btn').addEventListener('click', async () => {
    const today = getLocalDateStr();
    const { ok } = await withStorageErrorFeedback(() => logMeal(today, mealType, lastGeneratedMeal.items), 'portion-edit-message');
    if (!ok) return;
    document.getElementById('meal-result').insertAdjacentHTML('beforeend', '<div class="success-box">تم تسجيل الوجبة ✓</div>');
    await refreshRemainingBudget();
    await renderDashboard(); // تحديث التوصيات الفورية + الميزانية المتبقية فورًا بعد تسجيل وجبة جديدة
  });
}

// -----------------------------------------------------------------------
// Exercise
// -----------------------------------------------------------------------

/**
 * S25 (بطلب المستخدم): تاب "التمارين" وتاب "التحديات" اتدمجوا في تاب واحد
 * ("التمارين والتحديات") مربوط بكارت "سعرات محروقة اليوم" في الأعلى — نفس
 * الرقم اللي التمرين بيغذّيه (`totalCaloriesBurned` من Tracking Engine)
 * وبعض التحديات (calorie_streak) بتعتمد عليه فعليًا.
 */
async function renderActivityTab() {
  if (!currentProfile) return;
  await renderActivityBurnSummary();
  renderExerciseList();
  await renderChallengeTemplatesAndMyChallenges();
}

async function renderActivityBurnSummary() {
  const today = getLocalDateStr();
  const daily = await computeDailyTotals(today, getFoodById);
  const container = document.getElementById('activity-burn-summary');
  container.innerHTML = `
    <div class="card">
      <h3>🔥 سعرات محروقة اليوم (تمرين)</h3>
      <div class="value">${daily.totalCaloriesBurned}</div>
      <div class="unit">سعرة</div>
    </div>
  `;
}

function renderExerciseList() {
  const safeExercises = filterExercisesForConditions(currentProfile.medicalConditions ?? []);
  const container = document.getElementById('exercise-list');

  container.innerHTML = safeExercises.map((ex) => {
    const kcal = calculateCaloriesBurned(ex, Number(currentProfile.weightKg), 30);
    return `
      <div class="card">
        <h3><span class="food-icon">🏃</span> ${ex.name_ar}</h3>
        <div class="value small">${kcal} سعرة / 30 دقيقة</div>
        <div class="unit">صعوبة: ${ex.difficulty}</div>
        ${ex.warning_ar ? `<div class="warning-box">${ex.warning_ar}</div>` : ''}
        <button class="secondary-btn log-exercise-btn" data-id="${ex.id}" data-kcal="${kcal}" style="margin-top:10px">تسجيل 30 دقيقة</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.log-exercise-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const today = getLocalDateStr();
      try {
        await logExercise(today, btn.dataset.id, 30, Number(btn.dataset.kcal));
        btn.textContent = 'تم التسجيل ✓';
        btn.disabled = true;
        await renderActivityBurnSummary(); // يحدّث كارت الحرق اليومي فورًا — ده أساس الربط بين التمارين والتحديات
      } catch (err) {
        console.error('فشل عملية حفظ محلية (IndexedDB):', err);
        btn.insertAdjacentHTML('afterend', '<div class="warning-box" style="margin-top:6px">حصل خطأ أثناء الحفظ محليًا — من فضلك جرّب تاني.</div>');
      }
    });
  });
}

// -----------------------------------------------------------------------
// مكتبة الطعام (بند 1.2 من برومبت استكمال البنود الناقصة)
// -----------------------------------------------------------------------

/**
 * فلاتر جاهزة بالخصائص كما طلبها مستند الرؤية §6 حرفيًا. كل فلتر يُترجَم
 * لمعيار فعلي في filterFoods() الموجودة بالفعل — بدون أي منطق فلترة جديد
 * غير مغطّى، باستثناء minCalciumMg اللي أُضيف لـ food-library.js لأن
 * "غني بالكالسيوم" لم يكن مغطّى من قبل.
 */
const FOOD_LIBRARY_FILTERS = [
  { id: 'high_protein', label: 'عالي بروتين', criteria: { minProteinG: 15 } },
  { id: 'low_sodium', label: 'قليل صوديوم', criteria: { maxSodiumMg: 140 } },
  { id: 'high_calcium', label: 'غني بالكالسيوم', criteria: { minCalciumMg: 100 } },
  { id: 'kidney_friendly', label: 'مناسب للكلى', criteria: { excludeConditions: [MEDICAL_CONDITION.CKD] } },
  { id: 'gluten_free', label: 'بدون جلوتين', criteria: { excludeAllergens: [ALLERGEN.GLUTEN] } },
];

const activeFoodLibraryFilterIds = new Set();
let foodLibrarySearchQuery = '';
let foodLibraryDisplayLimit = 60; // S53-c: كان .slice(0,60) بدون أي طريقة لعرض الباقي — بقى قابل للتوسيع بزرار "تحميل المزيد"

function renderFoodLibraryTab() {
  const chipsContainer = document.getElementById('food-library-filter-chips');

  // بناء الفلاتر مرة واحدة فقط (أول فتح للتاب)
  if (!chipsContainer.dataset.built) {
    chipsContainer.innerHTML = FOOD_LIBRARY_FILTERS.map(
      (f) => `<button type="button" class="filter-chip" data-filter-id="${f.id}">${f.label}</button>`
    ).join('');
    chipsContainer.dataset.built = 'true';

    chipsContainer.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.filterId;
        if (activeFoodLibraryFilterIds.has(id)) {
          activeFoodLibraryFilterIds.delete(id);
          chip.classList.remove('active');
        } else {
          activeFoodLibraryFilterIds.add(id);
          chip.classList.add('active');
        }
        foodLibraryDisplayLimit = 60;
        renderFoodLibraryResults();
      });
    });

    const searchInput = document.getElementById('food-library-search');
    searchInput.addEventListener('input', () => {
      foodLibrarySearchQuery = searchInput.value;
      foodLibraryDisplayLimit = 60;
      renderFoodLibraryResults();
    });
  }

  renderFoodLibraryResults();
}

/** يجمع كل معايير الفلاتر المفعّلة حاليًا في كائن criteria واحد لـ filterFoods() */
function buildActiveFoodLibraryCriteria() {
  const combined = {};
  for (const filterId of activeFoodLibraryFilterIds) {
    const filter = FOOD_LIBRARY_FILTERS.find((f) => f.id === filterId);
    if (!filter) continue;
    for (const [key, value] of Object.entries(filter.criteria)) {
      if (Array.isArray(value)) {
        combined[key] = [...(combined[key] ?? []), ...value];
      } else {
        // لو أكتر من فلتر بيحدد نفس المفتاح الرقمي (مش حالنا حاليًا)، ناخد الأشد
        combined[key] = value;
      }
    }
  }
  return combined;
}

function renderFoodLibraryResults() {
  const resultsContainer = document.getElementById('food-library-results');
  const countContainer = document.getElementById('food-library-results-count');
  const loadMoreContainer = document.getElementById('food-library-load-more-container');

  let results = foodLibrarySearchQuery.trim()
    ? searchFoodsByName(foodLibrarySearchQuery)
    : filterFoods({});

  const activeCriteria = buildActiveFoodLibraryCriteria();
  if (Object.keys(activeCriteria).length > 0) {
    const matchingIds = new Set(filterFoods(activeCriteria).map((f) => f.id));
    results = results.filter((f) => matchingIds.has(f.id));
  }

  const pageResults = results.slice(0, foodLibraryDisplayLimit);
  countContainer.textContent = `إجمالي ${results.length} صنف مطابق — بيتعرض ${pageResults.length} منهم`;

  const byId = new Map(pageResults.map((f) => [f.id, f]));

  resultsContainer.innerHTML = pageResults.map((f) => {
    const qClass = f.quality_score >= 85 ? 'quality-excellent' : f.quality_score >= 70 ? 'quality-good' : f.quality_score >= 55 ? 'quality-ok' : 'quality-poor';
    return `
    <div class="food-card">
      <h4><span class="food-icon">${categoryIcon(f.category)}</span> ${f.name_ar}</h4>
      <div class="food-meta">${f.name_en} — لكل 100 جم</div>
      <div class="food-macro">${f.macros.kcal} سعرة | بروتين ${f.macros.protein_g}g | كارب ${f.macros.carbs_g}g | دهون ${f.macros.fat_g}g</div>
      <div class="food-meta">صوديوم ${f.micros.sodium_mg}mg | كالسيوم ${f.micros.calcium_mg}mg</div>
      <span class="quality-badge ${qClass}">${f.quality_score} — ${classifyMealQualityScore(f.quality_score)}</span>
      ${f.warnings?.length ? `<div class="food-warning">${f.warnings.join('، ')}</div>` : ''}
      <div class="add-to-meal-row" data-food-id="${f.id}">
        <button type="button" class="secondary-btn add-to-meal-btn" data-food-id="${f.id}">➕ أضف لوجبة</button>
        <div class="add-to-meal-picker" data-food-id="${f.id}" style="display:none">
          <select class="add-to-meal-type-select">
            ${Object.entries(MEAL_TYPE_LABEL_AR).map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}
          </select>
          <input type="number" class="add-to-meal-grams-input" value="100" min="1" max="2000" step="1"> جم
          <button type="button" class="primary-btn confirm-add-to-meal-btn" data-food-id="${f.id}">تأكيد</button>
        </div>
        <div class="add-to-meal-confirm" data-food-id="${f.id}"></div>
      </div>
    </div>
  `;
  }).join('') || '<p class="subtitle">مفيش نتائج مطابقة</p>';

  loadMoreContainer.innerHTML = results.length > pageResults.length
    ? `<button type="button" id="food-library-load-more-btn" class="secondary-btn">تحميل المزيد (${results.length - pageResults.length} صنف متبقي)</button>`
    : '';
  document.getElementById('food-library-load-more-btn')?.addEventListener('click', () => {
    foodLibraryDisplayLimit += 60;
    renderFoodLibraryResults();
  });

  resultsContainer.querySelectorAll('.add-to-meal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const picker = resultsContainer.querySelector(`.add-to-meal-picker[data-food-id="${btn.dataset.foodId}"]`);
      picker.style.display = picker.style.display === 'none' ? '' : 'none';
    });
  });

  resultsContainer.querySelectorAll('.confirm-add-to-meal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const foodId = btn.dataset.foodId;
      const food = byId.get(foodId);
      if (!food) return;
      const row = resultsContainer.querySelector(`.add-to-meal-row[data-food-id="${foodId}"]`);
      const mealType = row.querySelector('.add-to-meal-type-select').value;
      const grams = Math.max(1, Number(row.querySelector('.add-to-meal-grams-input').value) || 100);
      addFoodToCurrentMeal(food, grams, mealType);
      row.querySelector('.add-to-meal-picker').style.display = 'none';
      row.querySelector('.add-to-meal-confirm').innerHTML = `<div class="unit">✓ اتضاف لـ${MEAL_TYPE_LABEL_AR[mealType]} — راجعها في تاب "توليد وجبة"</div>`;
    });
  });
}

/**
 * يضيف صنف لـ"الوجبة قيد التحرير" الحالية (`lastGeneratedMeal`) — من مكتبة
 * الطعام مباشرة أو من صندوق البحث السريع جوّه كارت الوجبة نفسه. لو مفيش
 * وجبة قيد التحرير أصلًا، بينشئ واحدة جديدة فاضية بنوع الوجبة المطلوب.
 * بند مطلوب صراحة: "أدوس على أي صنف في المكتبة يطلب مني يروح في وجبة إيه".
 * @param {import('../core/food-library/schema.js').FoodItem} food
 * @param {number} grams
 * @param {string} mealType
 */
function addFoodToCurrentMeal(food, grams, mealType) {
  const items = [...(lastGeneratedMeal?.items ?? []), { food, grams }];
  lastGeneratedMeal = { items, mealType };
  const mealTypeSelect = document.getElementById('meal-type-select');
  if (mealTypeSelect) mealTypeSelect.value = mealType;
  renderMealCard(buildMealCandidateFromItems(items), mealType);
}

/** يحوّل مصفوفة أصناف حرة (يدوية) لنفس شكل "تركيبة الوجبة" اللي بيرجّعها generateMeal — عشان renderMealCard تشتغل بلا فرق بين الاتنين */
function buildMealCandidateFromItems(items) {
  if (!items.length) {
    return { items: [], qualityScore: 0, qualityLabel: classifyMealQualityScore(0), totals: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
  }
  const result = computeMealQualityScore(items, currentNutrition?.microTargets ?? null);
  return { items, qualityScore: result.score, qualityLabel: classifyMealQualityScore(result.score), totals: result.totals };
}

// -----------------------------------------------------------------------
// Tracking
// -----------------------------------------------------------------------

async function renderTrackingTab() {
  const today = getLocalDateStr();
  const daily = await computeDailyTotals(today, getFoodById);
  const dailyMetrics = await getDailyMetrics(today);
  const container = document.getElementById('tracking-content');

  const waterTargetMl = currentProfile ? calculateWaterTargetMl(Number(currentProfile.weightKg)) : null;
  const waterPct = waterTargetMl && dailyMetrics?.waterMl ? Math.min(100, Math.round((dailyMetrics.waterMl / waterTargetMl) * 100)) : 0;

  const metricsCard = `
    <div class="card" style="grid-column:1/-1">
      <h3>⚖️ تسجيل اليوم — الوزن والماء</h3>
      <form id="daily-metrics-form" class="form-row">
        <label>الوزن اليوم (كجم) <input type="number" id="metrics-weight-input" min="30" max="300" step="0.1" value="${dailyMetrics?.weightKg ?? ''}" placeholder="اختياري"></label>
        <label>الماء اليوم (مل) <input type="number" id="metrics-water-input" min="0" max="10000" step="50" value="${dailyMetrics?.waterMl ?? ''}" placeholder="اختياري"></label>
        <button type="submit" class="primary-btn">حفظ</button>
      </form>
      ${waterTargetMl ? `
        <div class="unit" style="margin-top:10px">الماء: ${dailyMetrics?.waterMl ?? 0} من ${waterTargetMl} مل</div>
        <div class="water-bar"><div class="water-fill" style="width:${waterPct}%"></div></div>
      ` : ''}
      <div id="daily-metrics-message"></div>

      <h3 style="margin-top:18px">🧬 تركيب الجسم (اختياري — بيحدّث اتجاه نسبة الدهون في التحليلات، ومعادلة BMR في لوحة التحكم)</h3>
      <form id="body-comp-form" class="form-row">
        <label>محيط الخصر (سم) <input type="number" id="metrics-waist-input" min="40" max="200" step="0.5" value="${dailyMetrics?.waistCm ?? ''}" placeholder="اختياري"></label>
        <label>محيط الرقبة (سم) <input type="number" id="metrics-neck-input" min="20" max="60" step="0.5" value="${dailyMetrics?.neckCm ?? ''}" placeholder="اختياري"></label>
        <label>محيط الأرداف (سم) — للإناث <input type="number" id="metrics-hip-input" min="40" max="200" step="0.5" value="${dailyMetrics?.hipCm ?? ''}" placeholder="اختياري"></label>
        <label>نسبة الدهون المقاسة (%) <input type="number" id="metrics-bodyfat-input" min="3" max="60" step="0.1" value="${dailyMetrics?.bodyFatPercent ?? ''}" placeholder="اختياري"></label>
        <button type="submit" class="secondary-btn">حفظ</button>
      </form>
      <p class="subtitle" style="margin-top:6px">لو نسبة الدهون مش مقاسة مباشرة، هتتقدَّر تلقائيًا بمعادلة Navy من آخر محيطات مسجَّلة (ولو مسجّلتش النهاردة، بيتم استخدام آخر تسجيل فعلي).</p>
      <div id="body-comp-message"></div>
    </div>
  `;

  if (!daily.nutrition) {
    const unresolvedOnlyNotice = daily.unresolvedFoodIds.length > 0
      ? `<div class="warning-box" style="margin-top:10px">تنبيه: ${daily.unresolvedFoodIds.length} صنف من وجبات مسجَّلة اليوم لم يعد موجودًا في مكتبة الطعام (على الأرجح بعد استيراد نسخة احتياطية قديمة) — لذلك السعرات ظاهرة كأنها مش مسجَّلة رغم وجود وجبات.</div>`
      : '';
    container.innerHTML = `${metricsCard}<p class="subtitle">مفيش أي وجبة مسجَّلة النهاردة لسه. سجّل وجبة من تاب "توليد وجبة".</p>${unresolvedOnlyNotice}`;
    wireDailyMetricsForm(today);
    wireBodyCompForm(today);
    return;
  }

  const target = currentNutrition?.calorieTarget?.targetCalories ?? null;
  // BUG-S25-04: computeDailyTotals() بيحسب unresolvedFoodIds (أصناف اتسجلت
  // في وجبة قديمة وبعدين اختفت من Food Library — سيناريو واقعي عند استيراد
  // نسخة احتياطية قديمة على إصدار تطبيق أحدث اتغيّرت فيه بيانات الأصناف)
  // لكن الحقل ده ما كانش بيتعرض في أي مكان في الواجهة أبدًا رغم إنه موجود
  // تحديدًا لغرض التشخيص (تعليق الدالة نفسها: "تشخيص: أصناف اتسجلت وبعدين
  // اتشالت من Food Library"). النتيجة: المستخدم بيشوف "عدد الوجبات
  // المسجَّلة: 3" لكن السعرات المحسوبة أقل من المتوقع بصمت تمامًا من غير
  // أي تفسير. تحقّقت فعليًا: computeDailyTotals بيرجّع unresolvedFoodIds
  // صحيح، لكن render لم يكن يستخدمه قط.
  const unresolvedNotice = daily.unresolvedFoodIds.length > 0
    ? `<div class="card" style="grid-column:1/-1"><div class="warning-box">تنبيه: ${daily.unresolvedFoodIds.length} صنف من وجبات مسجَّلة اليوم لم يعد موجودًا في مكتبة الطعام (على الأرجح بعد استيراد نسخة احتياطية قديمة) — السعرات/الماكرو المعروضة هنا لا تشمل هذه الأصناف.</div></div>`
    : '';
  container.innerHTML = `
    ${metricsCard}
    <div class="cards-grid">
      ${unresolvedNotice}
      <div class="card"><h3>سعرات اليوم</h3><div class="value">${Math.round(daily.nutrition.kcal)}</div>${target ? `<div class="unit">من هدف ${Math.round(target)}</div>` : ''}</div>
      <div class="card"><h3>بروتين</h3><div class="value">${Math.round(daily.nutrition.protein_g)}g</div></div>
      <div class="card"><h3>كارب</h3><div class="value">${Math.round(daily.nutrition.carbs_g)}g</div></div>
      <div class="card"><h3>دهون</h3><div class="value">${Math.round(daily.nutrition.fat_g)}g</div></div>
      <div class="card"><h3>سعرات محروقة (تمرين)</h3><div class="value">${daily.totalCaloriesBurned}</div></div>
      <div class="card"><h3>عدد الوجبات المسجَّلة</h3><div class="value">${daily.mealCount}</div></div>
      ${daily.eatingOutKcal > 0 ? `<div class="card"><h3>منها "معزوم برة"</h3><div class="value">${daily.eatingOutKcal}</div><div class="unit">سعرة تقديرية</div></div>` : ''}
    </div>
  `;
  wireDailyMetricsForm(today);
  wireBodyCompForm(today);
}

function wireBodyCompForm(today) {
  document.getElementById('body-comp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = {
      waistCm: document.getElementById('metrics-waist-input').value,
      neckCm: document.getElementById('metrics-neck-input').value,
      hipCm: document.getElementById('metrics-hip-input').value,
      bodyFatPercent: document.getElementById('metrics-bodyfat-input').value,
    };
    const metrics = {};
    for (const [key, val] of Object.entries(fields)) {
      if (val !== '') metrics[key] = Number(val);
    }

    if (Object.keys(metrics).length === 0) {
      document.getElementById('body-comp-message').innerHTML = `<div class="warning-box">دخّل قيمة واحدة على الأقل.</div>`;
      return;
    }

    const { ok } = await withStorageErrorFeedback(() => logDailyMetrics(today, metrics), 'body-comp-message');
    if (!ok) return;
    // S25: النموذج ده بقى المصدر الوحيد لمحيط الخصر/الرقبة/الأرداف ونسبة
    // الدهون بعد ما اتشالوا من تاب الإعدادات المكرَّر — لازم نعيد حساب
    // التغذية فورًا هنا زي ما كان بيحصل هناك بالظبط (ممكن يفعّل Katch-McArdle)
    if (currentProfile) {
      currentNutrition = calculateFullNutritionProfile(await toEngineProfile(currentProfile));
    }
    await renderTrackingTab();
    document.getElementById('body-comp-message').innerHTML = `<div class="success-box">تم الحفظ ✓</div>`;
  });
}

function wireDailyMetricsForm(today) {
  document.getElementById('daily-metrics-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weightVal = document.getElementById('metrics-weight-input').value;
    const waterVal = document.getElementById('metrics-water-input').value;
    const metrics = {};
    if (weightVal !== '') metrics.weightKg = Number(weightVal);
    if (waterVal !== '') metrics.waterMl = Number(waterVal);

    if (Object.keys(metrics).length === 0) {
      document.getElementById('daily-metrics-message').innerHTML = `<div class="warning-box">دخّل قيمة وزن أو ماء على الأقل.</div>`;
      return;
    }

    const { ok } = await withStorageErrorFeedback(() => logDailyMetrics(today, metrics), 'daily-metrics-message');
    if (!ok) return;
    await renderTrackingTab(); // إعادة بناء التاب بالكامل لعرض القيم المحفوظة والشريط المحدَّث
    document.getElementById('daily-metrics-message').innerHTML = `<div class="success-box">تم الحفظ ✓</div>`;
  });
}

// -----------------------------------------------------------------------
// Analytics (S16 — بند 13: كان الـEngine مبني ومُختبر من S6 بدون أي واجهة)
// -----------------------------------------------------------------------

/** يبني مصفوفة تواريخ 'YYYY-MM-DD' تصاعدية (الأقدم أولًا) لآخر N يوم بما فيهم النهاردة */
function buildDateRange(days) {
  const dates = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(getLocalDateStr(d));
  }
  return dates;
}

function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

/**
 * يبني رسم بياني خطي خام بـSVG (بدون أي مكتبة خارجية، حسب قاعدة المشروع
 * الثابتة) من مصفوفة نقاط {date, value}. يرجع null لو مفيش نقاط أصلًا
 * (القرار يُترك للمستدعي: يعرض رسالة "مفيش بيانات كفاية" بدل رسم فاضي).
 */
function buildLineChartSvg(points, { color = '#16a34a', unit = '' } = {}) {
  if (points.length === 0) return null;

  const width = 560;
  const height = 160;
  const padding = { top: 18, right: 16, bottom: 24, left: 16 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; } // تفادي قسمة على صفر لو كل القيم متساوية (يوم واحد أو قيم ثابتة)

  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + plotH - ((p.value - min) / (max - min)) * plotH,
    point: p,
  }));

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const dots = coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${color}"><title>${c.point.date}: ${c.point.value}${unit}</title></circle>`).join('');

  return `
    <svg class="trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
      <polyline points="${polylinePoints}" fill="none" stroke="${color}" stroke-width="2.5"/>
      ${dots}
      <text x="${padding.left}" y="${padding.top}" font-size="11" fill="#6b7280">${max}${unit}</text>
      <text x="${padding.left}" y="${height - padding.bottom + 4}" font-size="11" fill="#6b7280">${min}${unit}</text>
      <text x="${padding.left}" y="${height - 6}" font-size="11" fill="#6b7280">${formatDateShort(coords[0].point.date)}</text>
      <text x="${width - padding.right}" y="${height - 6}" font-size="11" fill="#6b7280" text-anchor="end">${formatDateShort(coords[coords.length - 1].point.date)}</text>
    </svg>
  `;
}

function chartCard(title, chartHtml, emptyMsg) {
  return `
    <div class="card" style="grid-column:1/-1">
      <h3>${title}</h3>
      ${chartHtml ? `<div class="chart-wrap">${chartHtml}</div>` : `<p class="subtitle">${emptyMsg}</p>`}
    </div>
  `;
}

async function renderAnalyticsTab() {
  const container = document.getElementById('analytics-content');
  if (!currentProfile || !currentNutrition) {
    container.innerHTML = `<p class="subtitle">محتاج تكمّل البيانات الشخصية الأول.</p>`;
    return;
  }

  const dateRange = buildDateRange(30); // تصاعدي (الأقدم أولًا) — نفس الترتيب اللي compareBestWorstWeek محتاجه
  const target = currentNutrition?.calorieTarget?.targetCalories ?? null;

  // BUG-S23-04: لو البروفايل عنده بيانات طول/وزن تالفة، calorieTarget = null
  // (بعد إصلاح BUG-S23-02) — لكن computeAdherenceScore/compareBestWorstWeek
  // كانوا بياخدوا `target` ده ويحسبوا `null * 0.85` و`kcal - null` (بترجع 0
  // و kcal بالترتيب بدل NaN/كسر، لأن JS بتحوّل null لصفر تلقائيًا) — يعني
  // كان هيظهر رقم "التزام 0%" أو انحراف مضلِّل بدل رسالة واضحة إن الحساب
  // مش متاح أصلًا من بيانات تالفة.
  const invalidData = currentNutrition.dataValidity && currentNutrition.dataValidity.valid === false;

  const invalidDataNotice = invalidData ? `
    <div class="card" style="grid-column:1/-1">
      <div class="warning-box">${currentNutrition.dataValidity.message_ar} — كارتات الالتزام ومقارنة الأسابيع المبنية على هدف السعرات معطَّلة مؤقتًا لحد ما تتصحّح البيانات.</div>
    </div>
  ` : '';

  const weightTrendRaw = await getWeightTrend(dateRange);
  const weightPoints = weightTrendRaw.map((p) => ({ date: p.date, value: p.weightKg }));
  const waterPoints = (await getWaterTrend(dateRange)).map((p) => ({ date: p.date, value: p.waterMl }));
  const calorieRaw = await getCalorieTrend(dateRange, getFoodById);
  const caloriePoints = calorieRaw.filter((p) => p.kcal !== null).map((p) => ({ date: p.date, value: Math.round(p.kcal) }));

  const bodyCompRaw = await getBodyCompositionTrend(dateRange, currentProfile);
  const bodyFatPoints = bodyCompRaw.map((p) => ({ date: p.date, value: p.bodyFatPercent }));
  const hasEstimatedPoints = bodyCompRaw.some((p) => p.source === 'navy_estimate');

  const last7 = dateRange.slice(-7);
  const adherence = target !== null
    ? await computeAdherenceScore(getFoodById, target, last7)
    : { trackedDays: 0, compliantDays: 0, adherencePct: null };
  const weekComparison = target !== null
    ? await compareBestWorstWeek(dateRange, getFoodById, target)
    : { bestWeek: null, worstWeek: null, weekSummaries: [] };

  // توصية تفاعلية لاتجاه/ثبات الوزن (بند 1.5/12) — بتستخدم نفس نقاط الوزن
  // المجلوبة فوق (30 يوم) للانحدار الخطي، ومؤشر التزام آخر 14 يوم (نافذة
  // أقرب لمدى تحليل الوزن نفسه من آخر 7 أيام بس)
  const weightPattern = detectWeightTrendPattern(weightTrendRaw);
  const adherence14 = target !== null
    ? await computeAdherenceScore(getFoodById, target, dateRange.slice(-14))
    : { trackedDays: 0, compliantDays: 0, adherencePct: null };
  const stabilityRec = currentNutrition?.calorieTarget
    ? getWeightStabilityRecommendation(weightPattern, currentProfile.goal, currentNutrition.calorieTarget, adherence14)
    : null;
  const stabilityCard = stabilityRec ? `
    <div class="card" style="grid-column:1/-1">
      <h3>توصية اتجاه الوزن</h3>
      <div class="${severityClass[stabilityRec.severity] ?? 'info-box'}">${stabilityRec.message_ar}</div>
    </div>
  ` : '';

  const weightChart = buildLineChartSvg(weightPoints, { color: '#16a34a', unit: ' كجم' });
  const waterChart = buildLineChartSvg(waterPoints, { color: '#0ea5e9', unit: ' مل' });
  const calorieChart = buildLineChartSvg(caloriePoints, { color: '#f59e0b', unit: ' سعرة' });
  const bodyFatChart = buildLineChartSvg(bodyFatPoints, { color: '#a855f7', unit: '%' });

  const latestBodyComp = bodyCompRaw.length > 0 ? bodyCompRaw[bodyCompRaw.length - 1] : null;
  const bodyCompCard = latestBodyComp ? `
    <div class="card">
      <h3>تركيب الجسم الحالي</h3>
      <div class="value">${latestBodyComp.bodyFatPercent}%</div>
      <div class="unit">كتلة دهون ${latestBodyComp.fatMassKg} كجم · كتلة خالية من الدهون ${latestBodyComp.leanMassKg} كجم</div>
      <div class="unit">${latestBodyComp.source === 'measured' ? 'من قياس مباشر' : 'تقدير بمعادلة Navy'} — بتاريخ ${latestBodyComp.date}</div>
    </div>
  ` : `
    <div class="card"><h3>تركيب الجسم الحالي</h3><p class="subtitle">سجّل وزنك مع محيط الخصر/الرقبة (أو نسبة الدهون مباشرة) من تاب التتبع لعرض الاتجاه هنا.</p></div>
  `;

  const adherenceCard = `
    <div class="card">
      <h3>الالتزام (آخر 7 أيام)</h3>
      <div class="value">${adherence.adherencePct !== null ? adherence.adherencePct + '%' : '—'}</div>
      <div class="unit">${adherence.trackedDays} يوم متتبَّع من 7</div>
    </div>
  `;

  const hasWeekData = weekComparison.bestWeek !== null;
  const showTwoWeeks = hasWeekData && weekComparison.worstWeek && weekComparison.worstWeek.weekStart !== weekComparison.bestWeek.weekStart;
  const weekCompareCard = hasWeekData ? `
    <div class="card">
      <h3>مقارنة أفضل/أسوأ أسبوع</h3>
      <div class="unit">أفضل: ${weekComparison.bestWeek.weekStart} → ${weekComparison.bestWeek.weekEnd} (متوسط انحراف ${weekComparison.bestWeek.averageDeviation} سعرة عن الهدف)</div>
      ${showTwoWeeks ? `<div class="unit">أسوأ: ${weekComparison.worstWeek.weekStart} → ${weekComparison.worstWeek.weekEnd} (متوسط انحراف ${weekComparison.worstWeek.averageDeviation} سعرة عن الهدف)</div>` : ''}
    </div>
  ` : `
    <div class="card"><h3>مقارنة أفضل/أسوأ أسبوع</h3><p class="subtitle">محتاج تسجيل سعرات لأسبوع كامل على الأقل.</p></div>
  `;

  container.innerHTML = `
    ${invalidDataNotice}
    ${stabilityCard}
    <div class="cards-grid">
      ${adherenceCard}
      ${weekCompareCard}
      ${bodyCompCard}
    </div>
    <div class="cards-grid" style="margin-top:14px">
      ${chartCard('اتجاه الوزن', weightChart, 'مفيش تسجيل وزن كفاية لعرض الاتجاه — سجّل وزنك من تاب التتبع.')}
      ${chartCard('اتجاه الماء', waterChart, 'مفيش تسجيل ماء كفاية لعرض الاتجاه — سجّل من تاب التتبع.')}
      ${chartCard('اتجاه السعرات الفعلية', calorieChart, 'مفيش وجبات مسجَّلة كفاية لعرض اتجاه السعرات.')}
      ${chartCard('اتجاه نسبة دهون الجسم', bodyFatChart, 'مفيش بيانات وزن + محيط خصر/رقبة (أو نسبة دهون مباشرة) كفاية لعرض الاتجاه.')}
      ${bodyFatChart && hasEstimatedPoints ? '<p class="subtitle" style="grid-column:1/-1">القيم المُقدَّرة بمعادلة Navy تقريبية، مش قياس طبي دقيق.</p>' : ''}
    </div>
  `;
}

// -----------------------------------------------------------------------
// Challenges
// -----------------------------------------------------------------------

/**
 * منتج/إصلاح مطلوب في جلسة S25: `updateChallengeProgress`/`calculateStreak`
 * كانوا موجودين ومُختبَرين على مستوى المحرك من جلسات قديمة، لكن ماكانش فيه
 * أي كود في الواجهة بيربطهم بالتتبّع الفعلي — يعني أي تحدي بيتبدأ كان يفضل
 * 0/الهدف للأبد حتى لو المستخدم حقّق الشرط كل يوم. الدالة دي بتحسب التقدّم
 * الحقيقي من بيانات Tracking Engine (نفس مصدر الحقيقة، من غير أي منطق حساب
 * مختلف) وتحدّث كل تحدي نشط:
 * - calorie_streak/water_streak: أيام متتالية محقَّقة (من الأحدث للأقدم،
 *   بحد أقصى targetValue يوم، ومتوقفة عند تاريخ بدء التحدي).
 * - healthy_meal_count: عدد تراكمي للوجبات (من وقت بدء التحدي) بجودة
 *   Meal Quality Score >= 70.
 */
async function refreshChallengeProgress() {
  const challenges = await getAllRecords(STORE.CHALLENGES);
  const active = challenges.filter((c) => !c.completed);
  if (active.length === 0) return;

  const today = getLocalDateStr();
  const startDateOf = (c) => c.startedAt.slice(0, 10);

  for (const challenge of active) {
    let newProgress = challenge.currentProgress;

    if (challenge.type === CHALLENGE_TYPE.CALORIE_STREAK) {
      if (currentNutrition?.calorieTarget?.targetCalories) {
        const target = currentNutrition.calorieTarget.targetCalories;
        const recentDatesDesc = buildDateRange(challenge.targetValue).reverse().filter((d) => d >= startDateOf(challenge) && d <= today);
        const results = [];
        const allMealLogsForStreak = await getAllRecords(STORE.MEAL_LOGS);
        for (const d of recentDatesDesc) {
          const daily = await computeDailyTotals(d, getFoodById, allMealLogsForStreak);
          results.push(!!daily.nutrition && daily.nutrition.kcal <= target);
        }
        newProgress = calculateStreak(results);
      }
    } else if (challenge.type === CHALLENGE_TYPE.WATER_STREAK) {
      const waterTarget = currentProfile ? calculateWaterTargetMl(Number(currentProfile.weightKg)) : null;
      if (waterTarget) {
        const recentDatesDesc = buildDateRange(challenge.targetValue).reverse().filter((d) => d >= startDateOf(challenge) && d <= today);
        const results = [];
        for (const d of recentDatesDesc) {
          const metrics = await getDailyMetrics(d);
          results.push((metrics?.waterMl ?? 0) >= waterTarget);
        }
        newProgress = calculateStreak(results);
      }
    } else if (challenge.type === CHALLENGE_TYPE.HEALTHY_MEAL_COUNT) {
      const allMealLogs = await getAllRecords(STORE.MEAL_LOGS);
      const sinceStart = allMealLogs.filter((log) => log.date >= startDateOf(challenge));
      let count = 0;
      for (const log of sinceStart) {
        const resolvedItems = log.items
          .map((it) => {
            const food = getFoodById(it.foodId);
            return food ? { food, grams: it.grams } : null;
          })
          .filter(Boolean);
        if (resolvedItems.length === 0) continue; // BUG-S25-04: نفس منطق تجاهل الأصناف المحذوفة، بدون كسر
        if (computeMealQualityScore(resolvedItems).score >= 70) count += 1;
      }
      newProgress = count;
    }

    if (newProgress !== challenge.currentProgress) {
      await updateChallengeProgress(challenge.id, newProgress);
    }
  }
}

async function renderChallengeTemplatesAndMyChallenges() {
  const templatesContainer = document.getElementById('challenge-templates');
  // BUG-S25-05: مفيش أي تحقّق قبل كده من وجود تحدٍّ نشط بنفس القالب —
  // ضغط "ابدأ التحدي" مرتين (تأكيد مزدوج غير مقصود، أو مجرد إعادة زيارة
  // التاب) كان بينشئ سجل تحدٍّ تاني منفصل بنفس النوع (تحقّقت فعليًا:
  // startChallenge('ch_calorie_30') مرتين ينتج سجلّين مستقلّين، كل واحد
  // 0/30 لوحده) — يظهرا مكرّرين في "تحدياتي" من غير أي تفسير. نجيب
  // التحديات الحالية الأول ونعطّل/نغيّر الزرار لأي قالب نشط بالفعل وغير مكتمل.
  const existingChallenges = await getAllRecords(STORE.CHALLENGES);
  const activeTypes = new Set(existingChallenges.filter((c) => !c.completed).map((c) => c.type));

  templatesContainer.innerHTML = CHALLENGE_TEMPLATES.map((t) => `
    <div class="card">
      <h3><span class="food-icon">${CHALLENGE_ICON[t.type] ?? '🏆'}</span> ${t.title_ar}</h3>
      ${activeTypes.has(t.type)
        ? `<button class="secondary-btn" disabled>التحدي شغّال بالفعل</button>`
        : `<button class="secondary-btn start-challenge-btn" data-id="${t.id}">ابدأ التحدي</button>`}
    </div>
  `).join('');

  templatesContainer.querySelectorAll('.start-challenge-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await startChallenge(btn.dataset.id);
        await renderChallengeTemplatesAndMyChallenges(); // إعادة بناء القوالب كمان عشان الزرار يتعطّل فورًا، مش بس "تحدياتي"
      } catch (err) {
        console.error('فشل عملية حفظ محلية (IndexedDB):', err);
        btn.insertAdjacentHTML('afterend', '<div class="warning-box" style="margin-top:6px">حصل خطأ أثناء بدء التحدي — من فضلك جرّب تاني.</div>');
      }
    });
  });

  await renderMyChallenges();
}

async function renderMyChallenges() {
  await refreshChallengeProgress(); // يحدّث التقدّم الحقيقي من التتبّع قبل ما نعرض
  const challenges = await getAllRecords(STORE.CHALLENGES);
  const container = document.getElementById('my-challenges');

  if (challenges.length === 0) {
    container.innerHTML = `<p class="subtitle">لسه مفيش تحديات بدأتها.</p>`;
    return;
  }

  container.innerHTML = challenges.map((c) => `
    <div class="card">
      <h3><span class="food-icon">${CHALLENGE_ICON[c.type] ?? '🏆'}</span> ${c.title_ar}</h3>
      <div class="value small">${c.currentProgress} / ${c.targetValue}</div>
      ${c.completed ? '<div class="success-box">مكتمل ✓</div>' : ''}
    </div>
  `).join('');
}

// -----------------------------------------------------------------------
// Settings — تصدير/استيراد
// -----------------------------------------------------------------------

function wireSettings() {
  document.getElementById('advanced-fields-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentProfile) return;
    const formData = new FormData(e.target);

    const advancedFields = {};
    for (const key of ['sleepHours', 'currentWaterMl']) {
      const raw = formData.get(key);
      if (raw !== null && raw !== '') advancedFields[key] = Number(raw);
    }
    advancedFields.smoker = formData.get('smoker') === 'on';

    const updatedProfile = { ...currentProfile, ...advancedFields };
    const { ok } = await withStorageErrorFeedback(() => putRecord(STORE.PROFILE, updatedProfile), 'advanced-fields-message');
    if (!ok) return;
    currentProfile = updatedProfile;
    currentNutrition = calculateFullNutritionProfile(await toEngineProfile(currentProfile));

    document.getElementById('advanced-fields-message').innerHTML = `<div class="success-box">تم الحفظ ✓</div>`;
    await renderDashboard();
  });

  document.getElementById('export-data-btn').addEventListener('click', async () => {
    let data;
    try {
      data = await exportAllData();
    } catch (err) {
      console.error('فشل عملية قراءة محلية (IndexedDB):', err);
      document.getElementById('settings-message').innerHTML = `<div class="warning-box">حصل خطأ أثناء قراءة البيانات المحلية للتصدير — من فضلك جرّب تاني.</div>`;
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-platform-backup-${getLocalDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-data-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const messageBox = document.getElementById('settings-message');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await importAllData(parsed);
      if (result.success) {
        messageBox.innerHTML = `<div class="success-box">تم الاستيراد بنجاح. أعد تحميل الصفحة لتطبيق البيانات.</div>`;
      } else {
        messageBox.innerHTML = `<div class="error-box">حصلت أخطاء أثناء الاستيراد: ${result.errors.join('، ')}</div>`;
      }
    } catch (err) {
      messageBox.innerHTML = `<div class="error-box">ملف غير صالح: ${err.message}</div>`;
    }
  });
}

// -----------------------------------------------------------------------
// إعادة تعيين كل البيانات (زرار "ابدأ من جديد" بالإعدادات)
// -----------------------------------------------------------------------

/**
 * بيسأل تأكيد صريح (لأن الفعل نهائي ومفيش تراجع)، وبعدين يمسح كل الـStores
 * ويرجّع الواجهة لشاشة Onboarding فاضية — من غير إعادة تحميل الصفحة كلها،
 * عشان لو المسح فشل (خطأ IndexedDB فعلي) نقدر نعرض رسالة واضحة بدل ما
 * نفقد فرصة إظهارها بسبب reload فوري.
 */
function wireResetButton() {
  const btn = document.getElementById('reset-all-data-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const confirmed = window.confirm(
      'هيتم حذف كل بياناتك المحلية نهائيًا: البروفايل، التتبع اليومي، الوجبات المسجَّلة، التمارين، والتحديات. مفيش أي رجوع في الخطوة دي. متأكد إنك عايز تبدأ من الأول؟'
    );
    if (!confirmed) return;
    await performFullReset();
  });
}

async function performFullReset() {
  const { ok } = await withStorageErrorFeedback(() => clearAllData(), 'settings-message');
  if (!ok) return;

  currentProfile = null;
  currentNutrition = null;
  lastGeneratedMeal = null;
  lastGeneratedMealTypeShare = null;
  todayRemainingBudget = null;
  activeFoodLibraryFilterIds.clear();
  foodLibrarySearchQuery = '';

  const onboardingForm = document.getElementById('onboarding-form');
  const advancedForm = document.getElementById('advanced-fields-form');
  if (onboardingForm) onboardingForm.reset();
  if (advancedForm) advancedForm.reset();

  const pregnancyRow = document.getElementById('pregnancy-status-row');
  if (pregnancyRow) pregnancyRow.style.display = 'none';

  [
    'dashboard-content', 'remaining-budget-content', 'meal-result', 'food-library-results',
    'food-library-results-count', 'activity-burn-summary', 'exercise-list', 'challenge-templates',
    'my-challenges', 'tracking-content', 'analytics-content',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  const foodLibraryChips = document.getElementById('food-library-filter-chips');
  if (foodLibraryChips) {
    foodLibraryChips.innerHTML = '';
    delete foodLibraryChips.dataset.built;
  }
  const foodLibrarySearchInput = document.getElementById('food-library-search');
  if (foodLibrarySearchInput) foodLibrarySearchInput.value = '';

  ['eating-out-message', 'settings-message', 'advanced-fields-message', 'onboarding-form-error'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
  });

  document.getElementById('main-nav').classList.add('hidden');
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.nav-btn[data-tab="dashboard"]').classList.add('active');
  document.getElementById('tab-onboarding').classList.add('active');

  const resetMsg = document.getElementById('onboarding-reset-message');
  if (resetMsg) {
    resetMsg.innerHTML = '<div class="success-box">تم حذف كل بياناتك القديمة ✓ — سجّل بياناتك من جديد للمتابعة.</div>';
    resetMsg.style.display = '';
  }
}
