/**
 * ============================================================================
 * App — الطبقة الرابطة بين الواجهة وكل الـEngines
 * ============================================================================
 * ملف واحد بسيط بدون framework (Vanilla JS + ES Modules) — يفتح مباشرة عبر
 * سيرفر محلي (مثال: `npx serve ui` أو `python3 -m http.server` من جذر
 * المشروع). المتصفح لا يسمح بـES Modules عبر file:// مباشرة.
 * ============================================================================
 */

import { STORE, putRecord, getRecord, getAllRecords, exportAllData, importAllData } from '../core/storage/storage-engine.js';
import { getFoodById, filterFoods, searchFoodsByName } from '../core/food-library/food-library.js';
import { MEDICAL_CONDITION, ALLERGEN, ALLERGY_SEVERITY, PREGNANCY_STATUS } from '../core/food-library/schema.js';
import { CONDITION_LABEL_AR } from '../core/decision-engine/medical-engine.js';
import { ALLERGEN_LABEL_AR } from '../core/decision-engine/allergy-engine.js';
import {
  calculateFullNutritionProfile, calculateWaterTargetMl, ACTIVITY_LEVEL, GOAL,
  resolveBodyFatPercent, calculateRemainingMealBudget, DEFAULT_MEAL_SHARE,
} from '../core/nutrition-engine/nutrition-engine.js';
import { generateMeal, updateMealItemPortion } from '../core/meal-engine/meal-generation-engine.js';
import { classifyMealQualityScore } from '../core/meal-engine/meal-quality.js';
import { getAllExercises, filterExercisesForConditions, calculateCaloriesBurned } from '../core/exercise-engine/exercise-engine.js';
import {
  logMeal, logExercise, computeDailyTotals, logDailyMetrics, getDailyMetrics,
  computeAdherenceScore, logEatingOutMeal,
} from '../core/tracking-engine/tracking-engine.js';
import { startChallenge, updateChallengeProgress, CHALLENGE_TEMPLATES } from '../core/gamification-engine/gamification-engine.js';
import { getInstantRecommendations, getGeneralTips, getWeightStabilityRecommendation, RECOMMENDATION_SEVERITY } from '../core/recommendation-engine/recommendation-engine.js';
import { getWeightTrend, getWaterTrend, getCalorieTrend, compareBestWorstWeek, getBodyCompositionTrend, detectWeightTrendPattern } from '../core/analytics-engine/analytics-engine.js';

const ALL_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const PROFILE_ID = 'current';

/** الحالة الحيّة في الذاكرة أثناء الجلسة — دائمًا مصدرها IndexedDB عند التحميل */
let currentProfile = null;
let currentNutrition = null; // ناتج calculateFullNutritionProfile — يُعاد حسابه كل ما البروفايل يتغيّر
let lastGeneratedMeal = null; // آخر تركيبة وجبة اتولّدت (لتفعيل زر "تسجيل هذه الوجبة")
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
  wireMealGeneration();
  wireSettings();

  const savedProfile = await getRecord(STORE.PROFILE, PROFILE_ID);
  if (savedProfile) {
    currentProfile = savedProfile;
    currentNutrition = calculateFullNutritionProfile(toEngineProfile(currentProfile));
    showApp();
    populateAdvancedFieldsForm();
    await renderDashboard();
    renderExerciseTab();
    renderChallengesTab();
    await renderTrackingTab();
  }
});

/** يملأ نموذج "بيانات إضافية" بالإعدادات بالقيم المحفوظة فعليًا بالبروفايل، لو موجودة */
function populateAdvancedFieldsForm() {
  const form = document.getElementById('advanced-fields-form');
  if (!form || !currentProfile) return;
  for (const key of ['waistCm', 'neckCm', 'hipCm', 'bodyFatPercent', 'sleepHours', 'currentWaterMl']) {
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
 * يحوّل سجل البروفايل المخزَّن (JSON بسيط) لشكل مدخلات Nutrition Engine.
 * نسبة الدهون: مُدخلة مباشرة لو موجودة، وإلا تقدير Navy تلقائي من محيط
 * الخصر/الرقبة(/الأرداف) لو متوفرين (بند 11) — مصدر واحد عبر
 * `resolveBodyFatPercent` بدل ازدواج منطق التقدير هنا وفي الداشبورد.
 */
function toEngineProfile(profile) {
  const bodyFat = resolveBodyFatPercent(profile);
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
    ...(bodyFat.value !== null ? { bodyFatPercent: bodyFat.value } : {}),
  };
}

/**
 * يحوّل سجل البروفايل لبروفايل قيود (مدخلات Decision Engine). الحساسيات
 * بقت مخزَّنة كـ`{allergen, severity}` لكل حساسية على حدة (بند 11 — كانت
 * كلها "شديدة" بالإجبار قبل كده)، مع توافق رجعي لبروفايلات قديمة مُصدَّرة
 * قبل هذا التغيير (كانت مجرد مصفوفة أكواد نصية).
 */
function toConstraintProfile(profile) {
  return {
    medicalConditions: profile.medicalConditions ?? [],
    allergies: (profile.allergies ?? []).map((a) =>
      typeof a === 'string' ? { allergen: a, severity: ALLERGY_SEVERITY.SEVERE } : a
    ),
    dietStyle: profile.dietStyle,
    pregnancyStatus: profile.pregnancyStatus ?? PREGNANCY_STATUS.NONE,
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
      if (btn.dataset.tab === 'exercise') renderExerciseTab();
      if (btn.dataset.tab === 'food-library') renderFoodLibraryTab();
      if (btn.dataset.tab === 'tracking') await renderTrackingTab();
      if (btn.dataset.tab === 'analytics') await renderAnalyticsTab();
      if (btn.dataset.tab === 'challenges') renderChallengesTab();
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
      age: formData.get('age'),
      heightCm: formData.get('heightCm'),
      weightKg: formData.get('weightKg'),
      targetWeightKg: formData.get('targetWeightKg'),
      activityLevel: formData.get('activityLevel'),
      goal: formData.get('goal'),
      timeframeDays: formData.get('timeframeDays'),
      dietStyle: formData.get('dietStyle'),
      dietAdherence: formData.get('dietAdherence') || 'flexible',
      pregnancyStatus: formData.get('pregnancyStatus') || PREGNANCY_STATUS.NONE,
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
    currentNutrition = calculateFullNutritionProfile(toEngineProfile(profile));

    showApp();
    populateAdvancedFieldsForm();
    await renderDashboard();
    renderExerciseTab();
    renderChallengesTab();
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

  const bodyFat = resolveBodyFatPercent(currentProfile);
  let bodyCompositionCard = '';
  if (bodyFat.value !== null) {
    const weightKg = Number(currentProfile.weightKg);
    const fatMassKg = +(weightKg * (bodyFat.value / 100)).toFixed(1);
    const leanMassKg = +(weightKg - fatMassKg).toFixed(1);
    const sourceLabel = bodyFat.source === 'measured' ? 'مُدخلة يدويًا' : 'تقدير تلقائي بمعادلة Navy';
    bodyCompositionCard = `
      <div class="card">
        <h3>تركيب الجسم</h3>
        <div class="value">${bodyFat.value}%</div>
        <div class="unit">نسبة دهون (${sourceLabel})</div>
        <div class="unit" style="margin-top:6px">كتلة دهون ≈ ${fatMassKg} كجم · كتلة خالية من الدهون ≈ ${leanMassKg} كجم</div>
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
    <div class="card" style="grid-column:1/-1">
      <h3>التوصيات الفورية</h3>
      ${recommendations.map((r) => `<div class="${severityClass[r.severity] ?? 'info-box'}">${r.message_ar}</div>`).join('')}
    </div>

    <div class="card">
      <h3>مؤشر كتلة الجسم (BMI)</h3>
      <div class="value" style="color:${n.bmiClass.color}">${n.bmi ?? '—'}</div>
      <div class="unit">${n.bmiClass.label_ar}</div>
      ${n.bmi !== null ? `<div class="bmi-bar"><div class="bmi-marker" style="right:${Math.min(95, Math.max(2, (n.bmi / 45) * 100))}%"></div></div>` : ''}
    </div>

    <div class="card">
      <h3>نطاق الوزن المثالي</h3>
      <div class="value small">${n.idealWeightRange ? `${n.idealWeightRange.min_kg} – ${n.idealWeightRange.max_kg}` : '—'}</div>
      <div class="unit">كجم</div>
    </div>

    ${bodyCompositionCard}

    <div class="card">
      <h3>معدل الحرق الأساسي (BMR)</h3>
      <div class="value">${n.bmr.value}</div>
      <div class="unit">سعرة/يوم (${n.bmr.formula_used === 'katch_mcardle' ? 'Katch-McArdle' : 'Mifflin-St Jeor'})</div>
    </div>

    <div class="card">
      <h3>إجمالي الحرق اليومي (TDEE)</h3>
      <div class="value">${n.tdeeBreakdown.tdee}</div>
      <div class="unit">BMR:${n.tdeeBreakdown.bmr} + NEAT:${n.tdeeBreakdown.neat} + EAT:${n.tdeeBreakdown.eat} + TEF:${n.tdeeBreakdown.tef}</div>
    </div>

    <div class="card">
      <h3>السعرات المستهدفة</h3>
      <div class="value">${n.calorieTarget.targetCalories}</div>
      <div class="unit">${n.calorieTarget.dailyAdjustment > 0 ? '+' : ''}${n.calorieTarget.dailyAdjustment} عن TDEE${n.calorieTarget.estimatedWeeks ? ` — تقريبًا ${n.calorieTarget.estimatedWeeks} أسبوع للهدف` : ''}</div>
      ${n.calorieTarget.warning ? `<div class="warning-box">${n.calorieTarget.warning}</div>` : ''}
    </div>

    <div class="card">
      <h3>أهداف الماكرو اليومية</h3>
      <div class="value small">بروتين ${n.macroTargets.protein_g}g · كارب ${n.macroTargets.carb_g}g · دهون ${n.macroTargets.fat_g}g</div>
    </div>

    <div class="card" style="grid-column:1/-1">
      <h3>نصائح</h3>
      ${tips.map((t) => `<div class="unit" style="margin-bottom:6px">${t.condition_label_ar ? `<strong>${t.condition_label_ar}:</strong> ` : ''}${t.message_ar}</div>`).join('')}
    </div>
  `;
}

// -----------------------------------------------------------------------
// Meal Generation
// -----------------------------------------------------------------------

/**
 * يعيد حساب ميزانية الوجبات المتبقية في اليوم (سعرات/ماكرو) بناءً على أي
 * استهلاك فعلي حتى الآن (وجبات مسجَّلة + تقدير "معزوم برة") — ده اللي
 * يُفعِّل "إعادة توازن تلقائي لباقي وجبات اليوم" المطلوبة صراحة لميزة
 * "معزوم برة". يُستدعى بعد أي تسجيل (وجبة عادية أو معزوم برة) وعند أي
 * إعادة رسم للداشبورد، فيبقى `todayRemainingBudget` دايمًا محدَّث.
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

  todayRemainingBudget = calculateRemainingMealBudget({
    dailyCalorieTarget: currentNutrition.calorieTarget.targetCalories,
    dailyMacroTargets: currentNutrition.macroTargets,
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
      <h3>الباقي من هدف اليوم</h3>
      <div class="value">${b.remainingKcal} سعرة</div>
      <div class="unit">بروتين ${b.remainingMacros.protein_g}g · كارب ${b.remainingMacros.carb_g}g · دهون ${b.remainingMacros.fat_g}g</div>
      ${remainingTypesCount > 0
        ? `<div class="unit" style="margin-top:6px">موزّعة على ${remainingTypesCount} وجبة متبقية — التوليد هيستخدم النصيب ده تلقائيًا.</div>`
        : `<div class="unit" style="margin-top:6px">كل الوجبات الأساسية مسجَّلة النهاردة بالفعل.</div>`}
    </div>
  `;
}

function wireMealGeneration() {
  document.getElementById('generate-meal-btn').addEventListener('click', async () => {
    if (!currentProfile || !currentNutrition?.calorieTarget) return;
    const mealType = document.getElementById('meal-type-select').value;

    await refreshRemainingBudget();
    const budget = todayRemainingBudget?.perMeal?.[mealType];
    const mealShare = DEFAULT_MEAL_SHARE[mealType] ?? 0.25;

    const targetKcal = budget ? budget.targetKcal : currentNutrition.calorieTarget.targetCalories * mealShare;
    const macroTargets = budget ? budget.macroTargets : {
      protein_g: currentNutrition.macroTargets.protein_g * mealShare,
      carb_g: currentNutrition.macroTargets.carb_g * mealShare,
      fat_g: currentNutrition.macroTargets.fat_g * mealShare,
    };

    const result = generateMeal({
      constraintProfile: toConstraintProfile(currentProfile),
      mealType,
      targetKcal,
      macroTargets,
      microTargets: currentNutrition.microTargets,
      minFoodQualityScore: 30,
      adherenceLevel: currentProfile.dietAdherence || 'flexible',
    });

    renderMealResult(result, mealType);
  });

  wireEatingOutForm();
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

/** يبني كارت تركيبة الوجبة — بما فيه تعديل يدوي لحجم كل حصة (LIMIT-05) */
function renderMealCard(meal, mealType) {
  const container = document.getElementById('meal-result');
  const qualityClass = meal.qualityScore >= 85 ? 'quality-excellent' : meal.qualityScore >= 70 ? 'quality-good' : meal.qualityScore >= 55 ? 'quality-ok' : 'quality-poor';

  container.innerHTML = `
    <div class="card">
      <h3>أفضل تركيبة مقترحة <span class="quality-badge ${qualityClass}">${meal.qualityScore} — ${meal.qualityLabel}</span></h3>
      ${meal.items.map((i, idx) => `
        <div class="meal-item-row">
          <span>${i.food.name_ar}</span>
          <span class="portion-edit">
            <input type="number" class="portion-input" data-item-index="${idx}" value="${i.grams}" min="1" max="2000" step="1"> جم
          </span>
        </div>
      `).join('')}
      <div class="meal-item-row"><strong>الإجمالي</strong><strong>${Math.round(meal.totals.kcal)} سعرة</strong></div>
      <div class="unit">بروتين ${Math.round(meal.totals.protein_g)}g · كارب ${Math.round(meal.totals.carbs_g)}g · دهون ${Math.round(meal.totals.fat_g)}g</div>
      <div id="portion-edit-message"></div>
      <button id="log-meal-btn" class="primary-btn" style="margin-top:12px">تسجيل هذه الوجبة</button>
    </div>
  `;

  container.querySelectorAll('.portion-input').forEach((input) => {
    input.addEventListener('change', () => {
      const itemIndex = Number(input.dataset.itemIndex);
      const newGrams = Number(input.value);
      const updated = updateMealItemPortion(lastGeneratedMeal, itemIndex, newGrams, currentNutrition.microTargets);

      if (!updated.success) {
        document.getElementById('portion-edit-message').innerHTML = `<div class="warning-box">${updated.diagnosis_ar}</div>`;
        return;
      }

      lastGeneratedMeal = { items: updated.candidate.items, mealType };
      renderMealCard(updated.candidate, mealType);
    });
  });

  document.getElementById('log-meal-btn').addEventListener('click', async () => {
    const today = getLocalDateStr();
    const { ok } = await withStorageErrorFeedback(() => logMeal(today, mealType, lastGeneratedMeal.items), 'portion-edit-message');
    if (!ok) return;
    document.getElementById('meal-result').insertAdjacentHTML('beforeend', '<div class="success-box">تم تسجيل الوجبة ✓</div>');
    await renderDashboard(); // تحديث التوصيات الفورية + الميزانية المتبقية فورًا بعد تسجيل وجبة جديدة
  });
}

// -----------------------------------------------------------------------
// Exercise
// -----------------------------------------------------------------------

function renderExerciseTab() {
  if (!currentProfile) return;
  const safeExercises = filterExercisesForConditions(currentProfile.medicalConditions ?? []);
  const container = document.getElementById('exercise-list');

  container.innerHTML = safeExercises.map((ex) => {
    const kcal = calculateCaloriesBurned(ex, Number(currentProfile.weightKg), 30);
    return `
      <div class="card">
        <h3>${ex.name_ar}</h3>
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
        renderFoodLibraryResults();
      });
    });

    const searchInput = document.getElementById('food-library-search');
    searchInput.addEventListener('input', () => {
      foodLibrarySearchQuery = searchInput.value;
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

  let results = foodLibrarySearchQuery.trim()
    ? searchFoodsByName(foodLibrarySearchQuery)
    : filterFoods({});

  const activeCriteria = buildActiveFoodLibraryCriteria();
  if (Object.keys(activeCriteria).length > 0) {
    const matchingIds = new Set(filterFoods(activeCriteria).map((f) => f.id));
    results = results.filter((f) => matchingIds.has(f.id));
  }

  countContainer.textContent = `${results.length} صنف`;

  resultsContainer.innerHTML = results.slice(0, 60).map((f) => {
    const qClass = f.quality_score >= 85 ? 'quality-excellent' : f.quality_score >= 70 ? 'quality-good' : f.quality_score >= 55 ? 'quality-ok' : 'quality-poor';
    return `
    <div class="food-card">
      <h4>${f.name_ar}</h4>
      <div class="food-meta">${f.name_en} — لكل 100 جم</div>
      <div class="food-macro">${f.calories} سعرة | بروتين ${f.macros.protein_g}g | كارب ${f.macros.carbs_g}g | دهون ${f.macros.fat_g}g</div>
      <div class="food-meta">صوديوم ${f.micros.sodium_mg}mg | كالسيوم ${f.micros.calcium_mg}mg</div>
      <span class="quality-badge ${qClass}">${f.quality_score} — ${classifyMealQualityScore(f.quality_score)}</span>
      ${f.warnings?.length ? `<div class="food-warning">${f.warnings.join('، ')}</div>` : ''}
    </div>
  `;
  }).join('') || '<p class="subtitle">مفيش نتائج مطابقة</p>';
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
      <h3>تسجيل اليوم — الوزن والماء</h3>
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

      <h3 style="margin-top:18px">تركيب الجسم (اختياري — لتحديث اتجاه نسبة الدهون في التحليلات)</h3>
      <form id="body-comp-form" class="form-row">
        <label>محيط الخصر (سم) <input type="number" id="metrics-waist-input" min="40" max="200" step="0.5" value="${dailyMetrics?.waistCm ?? ''}" placeholder="اختياري"></label>
        <label>محيط الرقبة (سم) <input type="number" id="metrics-neck-input" min="20" max="60" step="0.5" value="${dailyMetrics?.neckCm ?? ''}" placeholder="اختياري"></label>
        <label>محيط الأرداف (سم) — للإناث <input type="number" id="metrics-hip-input" min="40" max="200" step="0.5" value="${dailyMetrics?.hipCm ?? ''}" placeholder="اختياري"></label>
        <label>نسبة الدهون المقاسة (%) <input type="number" id="metrics-bodyfat-input" min="3" max="60" step="0.1" value="${dailyMetrics?.bodyFatPercent ?? ''}" placeholder="اختياري"></label>
        <button type="submit" class="secondary-btn">حفظ</button>
      </form>
      <p class="subtitle" style="margin-top:6px">لو نسبة الدهون مش مقاسة مباشرة، هتتقدَّر تلقائيًا بمعادلة Navy من المحيطات المسجَّلة (لليوم ده أو من بيانات البروفايل) في تاب التحليلات.</p>
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

function renderChallengesTab() {
  renderChallengeTemplatesAndMyChallenges();
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
      <h3>${t.title_ar}</h3>
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
  const challenges = await getAllRecords(STORE.CHALLENGES);
  const container = document.getElementById('my-challenges');

  if (challenges.length === 0) {
    container.innerHTML = `<p class="subtitle">لسه مفيش تحديات بدأتها.</p>`;
    return;
  }

  container.innerHTML = challenges.map((c) => `
    <div class="card">
      <h3>${c.title_ar}</h3>
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
    for (const key of ['waistCm', 'neckCm', 'hipCm', 'bodyFatPercent', 'sleepHours', 'currentWaterMl']) {
      const raw = formData.get(key);
      if (raw !== null && raw !== '') advancedFields[key] = Number(raw);
    }
    advancedFields.smoker = formData.get('smoker') === 'on';

    const updatedProfile = { ...currentProfile, ...advancedFields };
    const { ok } = await withStorageErrorFeedback(() => putRecord(STORE.PROFILE, updatedProfile), 'advanced-fields-message');
    if (!ok) return;
    currentProfile = updatedProfile;
    currentNutrition = calculateFullNutritionProfile(toEngineProfile(currentProfile)); // إعادة حساب فورية — نسبة الدهون (مُدخلة أو مُقدَّرة بـNavy) ممكن تغيّر معادلة BMR المستخدمة

    const bodyFat = resolveBodyFatPercent(currentProfile);
    const bodyFatMsg = bodyFat.source === 'measured'
      ? ' — معادلة BMR بقت Katch-McArdle الأدق.'
      : bodyFat.source === 'navy_estimate'
        ? ` — اتقدَّرت نسبة الدهون تلقائيًا بمعادلة Navy (${bodyFat.value}%) ومعادلة BMR بقت Katch-McArdle.`
        : '';
    document.getElementById('advanced-fields-message').innerHTML = `<div class="success-box">تم الحفظ ✓${bodyFatMsg}</div>`;
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
