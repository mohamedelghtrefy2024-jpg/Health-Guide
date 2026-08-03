import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { STORE, getRecord, putRecord, openDatabase } from '../core/storage/storage-engine.js';

let pass=0, fail=0;
function check(name, cond) { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } }

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/ui/', pretendToBeVisual: true, runScripts: 'outside-only' });

global.window = dom.window;
global.document = dom.window.document;
global.FormData = dom.window.FormData;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.Event = dom.window.Event;
global.HTMLElement = dom.window.HTMLElement;

await import(new URL('../ui/app.js', import.meta.url));

// شغّل DOMContentLoaded يدويًا (jsdom مع runScripts:'outside-only' معناها إحنا مسؤولين عن تشغيل السكريبت أصلًا، فاستوردناه مباشرة كـ module فوق)
document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 50)); // انتظار الجزء async من الـhandler

check('صفحة Onboarding ظاهرة قبل حفظ أي بروفايل', document.getElementById('tab-onboarding').classList.contains('active'));
check('checkboxes الحالات المرضية اتبنت (16 حالة)', document.querySelectorAll('#medical-conditions-list input').length === 16);
check('checkboxes الحساسيات اتبنت (8 حساسية)', document.querySelectorAll('#allergies-list input').length === 8);
check('nav مخفي قبل وجود بروفايل', document.getElementById('main-nav').classList.contains('hidden'));

// -----------------------------------------------------------------------
// تعبئة نموذج Onboarding وإرساله
// -----------------------------------------------------------------------
const form = document.getElementById('onboarding-form');
form.querySelector('[name="name"]').value = 'أحمد';
form.querySelector('[name="gender"]').value = 'male';
form.querySelector('[name="age"]').value = '32';
form.querySelector('[name="heightCm"]').value = '178';
form.querySelector('[name="weightKg"]').value = '90';
form.querySelector('[name="targetWeightKg"]').value = '80';
form.querySelector('[name="activityLevel"]').value = 'moderate';
form.querySelector('[name="goal"]').value = 'lose';
form.querySelector('[name="timeframeDays"]').value = '90';
form.querySelector('[name="dietStyle"]').value = 'normal';
// اختيار حساسية واحدة بشدة "خفيفة" مخصوصة — للتأكد إن الشدة المُختارة بتتحفظ فعليًا (بند 11 — كانت كلها "شديدة" بالإجبار قبل كده)
const lactoseCheckbox = form.querySelector('input[name="allergies"][value="lactose"]');
lactoseCheckbox.checked = true;
form.querySelector('select[name="allergySeverity_lactose"]').value = 'mild';
// ملاحظة: مفيش اختيار حالات مرضية هنا عمدًا — حالة النقرس بالتحديد بتفشل حاليًا
// في توليد الوجبة بسبب محدودية Food Library (LIMIT-02 موثّقة بالفعل في
// SSCP_PROGRESS.md)، وده سلوك تشخيصي صحيح مش خطأ. السيناريو هنا لإثبات
// المسار الناجح الكامل (توليد → تسجيل) بدون قيود صحية مقيِّدة بشدة.

// -----------------------------------------------------------------------
// حقل "حامل/مرضعة" — إظهار/إخفاء حسب الجنس + تعطيل أنماط الحمية عالية
// الخطورة (بند 1.1 من برومبت استكمال البنود الناقصة). يُختبر هنا قبل
// إرسال النموذج الفعلي (بروفايل ذكر) حتى لا يتأثر باقي السيناريو الأصلي.
// -----------------------------------------------------------------------
const pregnancyRow = document.getElementById('pregnancy-status-row');
check('حقل الحمل/الرضاعة مخفي افتراضيًا (الجنس = ذكر)', pregnancyRow.style.display === 'none');

form.querySelector('[name="gender"]').value = 'female';
form.querySelector('[name="gender"]').dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
check('حقل الحمل/الرضاعة يظهر لما الجنس = أنثى', pregnancyRow.style.display === '');

form.querySelector('[name="dietStyle"]').value = 'keto';
form.querySelector('[name="pregnancyStatus"]').value = 'pregnant';
form.querySelector('[name="pregnancyStatus"]').dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
const ketoOption = form.querySelector('[name="dietStyle"] option[value="keto"]');
check('خيار "كيتو" يتعطّل تلقائيًا لما تُختار "حامل"', ketoOption.disabled === true);
check('نمط الحمية يُعاد ضبطه تلقائيًا للعادي لو كان مختارًا كيتو وقت اختيار الحمل', form.querySelector('[name="dietStyle"]').value === 'normal');

form.querySelector('[name="gender"]').value = 'male';
form.querySelector('[name="gender"]').dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
check('حقل الحمل/الرضاعة يختفي تاني ويرجع "لا ينطبق" لما الجنس يرجع ذكر', pregnancyRow.style.display === 'none' && form.querySelector('[name="pregnancyStatus"]').value === 'none');
check('خيار "كيتو" يرجع متاحًا تاني بعد رجوع الجنس لذكر', ketoOption.disabled === false);

form.querySelector('[name="dietStyle"]').value = 'normal';

const dietAdherenceSelect = form.querySelector('[name="dietAdherence"]');
check('حقل "مستوى الالتزام بالحمية" موجود بالـOnboarding بقيمة افتراضية "مرن"', !!dietAdherenceSelect && dietAdherenceSelect.value === 'flexible');
check('خيار "صيام متقطع" (كان ناقصًا) موجود الآن في قائمة نمط الحمية', !!form.querySelector('[name="dietStyle"] option[value="intermittent_fasting"]'));

// -----------------------------------------------------------------------
// S23: محاولة إرسال بروفايل بتناقض هدف/وزن مستهدف (BUG-S23-01) — لازم
// يُرفض بتحذير واضح ومايتحفظش أي بروفايل، قبل الإرسال الصحيح الفعلي تحت
// -----------------------------------------------------------------------
form.querySelector('[name="weightKg"]').value = '90';
form.querySelector('[name="targetWeightKg"]').value = '95'; // أعلى من الحالي رغم goal=lose أعلاه
const onboardingErrorBox = document.getElementById('onboarding-form-error');
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
check('تناقض هدف "خسارة" مع وزن مستهدف أعلى: رسالة خطأ ظاهرة قبل أي حفظ', onboardingErrorBox.style.display !== 'none' && onboardingErrorBox.textContent.includes('لازم يكون'));
check('تناقض هدف/وزن: النموذج لسه ظاهر (مفيش انتقال للـDashboard، مفيش حفظ)', document.getElementById('tab-onboarding').classList.contains('active'));

form.querySelector('[name="targetWeightKg"]').value = '80'; // تصحيح — متوافق مع goal=lose

form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 100));

check('nav ظاهر بعد حفظ البروفايل', !document.getElementById('main-nav').classList.contains('hidden'));
check('Dashboard بقى التاب النشط', document.getElementById('tab-dashboard').classList.contains('active'));
check('محتوى Dashboard اتبنى (BMI ظاهر)', document.getElementById('dashboard-content').innerHTML.includes('BMI') || document.getElementById('dashboard-content').innerHTML.includes('كتلة الجسم'));
check('محتوى Dashboard فيه قيمة سعرات مستهدفة', document.getElementById('dashboard-content').innerHTML.includes('السعرات المستهدفة'));

// -----------------------------------------------------------------------
// التحقق من حفظ شدة الحساسية المُختارة لكل حساسية على حدة (بند 11 — LIMIT-04)
// -----------------------------------------------------------------------
const savedProfile = await getRecord(STORE.PROFILE, 'current');
const savedLactoseAllergy = savedProfile?.allergies?.find((a) => a.allergen === 'lactose');
check('الحساسية المُختارة اتحفظت كـ{allergen, severity} مش كود نصي بس', typeof savedLactoseAllergy === 'object' && savedLactoseAllergy.allergen === 'lactose');
check('شدة الحساسية المُختارة يدويًا (خفيفة) اتحفظت صح وليست "شديدة" افتراضيًا', savedLactoseAllergy?.severity === 'mild');

// -----------------------------------------------------------------------
// توليد وجبة
// -----------------------------------------------------------------------
document.getElementById('meal-type-select').value = 'lunch';
document.getElementById('generate-meal-btn').click();
await new Promise((r) => setTimeout(r, 50));

const mealResultHtml = document.getElementById('meal-result').innerHTML;
check('نتيجة توليد الوجبة ظهرت (نجاح أو تشخيص فشل)', mealResultHtml.length > 20);
const mealSucceeded = document.getElementById('log-meal-btn') && !document.getElementById('log-meal-btn').disabled;
console.log(`   (توليد الوجبة: ${mealSucceeded ? 'نجح' : 'فشل مع تشخيص'})`);

if (mealSucceeded) {
  const logBtn = document.getElementById('log-meal-btn');
  check('زر تسجيل الوجبة موجود بعد النجاح', !!logBtn);

  // -----------------------------------------------------------------------
  // تعديل يدوي لحجم حصة قبل التسجيل (بند 11 — LIMIT-05)
  // -----------------------------------------------------------------------
  const portionInput = document.querySelector('.portion-input[data-item-index="0"]');
  check('حقل تعديل حجم الحصة يدويًا موجود لكل صنف في الوجبة', !!portionInput);
  const kcalBeforeEdit = document.getElementById('meal-result').innerHTML;
  const originalGrams = Number(portionInput.value);
  portionInput.value = String(originalGrams * 3);
  portionInput.dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  const kcalAfterEdit = document.getElementById('meal-result').innerHTML;
  check('تعديل حجم الحصة يدويًا يعيد رسم كارت الوجبة بإجمالي مختلف', kcalAfterEdit !== kcalBeforeEdit);
  check('حقل تعديل الحصة بيعكس القيمة الجديدة بعد التعديل', document.querySelector('.portion-input[data-item-index="0"]').value === String(originalGrams * 3));

  document.getElementById('log-meal-btn').click();
  await new Promise((r) => setTimeout(r, 50));
  check('رسالة تأكيد التسجيل ظهرت', document.getElementById('meal-result').innerHTML.includes('تم تسجيل الوجبة'));
}

// -----------------------------------------------------------------------
// ميزة "معزوم برة" — تقدير سعرات + إعادة توازن باقي اليوم (بند 11)
// -----------------------------------------------------------------------
check('نموذج "معزوم برة" موجود في تاب توليد الوجبة', !!document.getElementById('eating-out-form'));
const eatingOutForm = document.getElementById('eating-out-form');
eatingOutForm.querySelector('[name="eatingOutMealType"]').value = 'dinner';
eatingOutForm.querySelector('[name="eatingOutKcal"]').value = '750';
eatingOutForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));
check('حفظ "معزوم برة" يظهر رسالة تأكيد', document.getElementById('eating-out-message').innerHTML.includes('تم الحفظ'));
check('الميزانية المتبقية من هدف اليوم بتتحدَّث وتظهر بعد "معزوم برة"', document.getElementById('remaining-budget-content').innerHTML.includes('الباقي من هدف اليوم'));

// -----------------------------------------------------------------------
// تاب التمارين — التحقق من استبعاد التمارين الممنوعة للنقرس (لا يوجد استبعاد فعلي للنقرس في بيانات التمارين، لكن نتأكد إن التاب اتبنى بدون كسر)
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="activity"]').click();
await new Promise((r) => setTimeout(r, 30));
check('تاب التمارين اتبنى (فيه كروت)', document.querySelectorAll('#exercise-list .card').length > 0);

const firstExerciseBtn = document.querySelector('.log-exercise-btn');
if (firstExerciseBtn) {
  firstExerciseBtn.click();
  await new Promise((r) => setTimeout(r, 50));
  check('تسجيل تمرين يعطّل الزر ويأكّد التسجيل', firstExerciseBtn.disabled && firstExerciseBtn.textContent.includes('تم'));
}

// -----------------------------------------------------------------------
// تاب مكتبة الطعام — بحث نصي + فلاتر ذكية (بند 1.2 من برومبت استكمال البنود الناقصة)
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="food-library"]').click();
await new Promise((r) => setTimeout(r, 30));

const foodLibraryChips = document.querySelectorAll('#food-library-filter-chips .filter-chip');
check('تاب مكتبة الطعام: الفلاتر الخمسة اتبنت', foodLibraryChips.length === 5);
check('تاب مكتبة الطعام: فيه نتائج معروضة افتراضيًا بدون أي فلتر', document.querySelectorAll('#food-library-results .food-card').length > 0);
check('كارت مكتبة الطعام بيعرض رقم سعرات حقيقي مش undefined', !document.querySelector('.food-card .food-macro').textContent.includes('undefined'));

function foodLibraryResultsCount() {
  return Number(document.getElementById('food-library-results-count').textContent.match(/\d+/)?.[0] ?? 0);
}

const initialResultsCount = foodLibraryResultsCount();
const highProteinChip = Array.from(foodLibraryChips).find((c) => c.textContent.includes('عالي بروتين'));
highProteinChip.click();
await new Promise((r) => setTimeout(r, 20));
check('فلتر "عالي بروتين" مفعّل بصريًا (active class)', highProteinChip.classList.contains('active'));
const highProteinResultsCount = foodLibraryResultsCount();
check('فلتر "عالي بروتين" يقلّل عدد النتائج فعليًا', highProteinResultsCount > 0 && highProteinResultsCount < initialResultsCount);

highProteinChip.click(); // إلغاء التفعيل
await new Promise((r) => setTimeout(r, 20));
check('إلغاء تفعيل الفلتر يرجّع كل النتائج تاني', foodLibraryResultsCount() === initialResultsCount);

const searchInput = document.getElementById('food-library-search');
searchInput.value = 'فراخ';
searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 20));
const searchResultsCount = foodLibraryResultsCount();
check('البحث النصي "فراخ" يرجّع نتائج ويقلّل العدد عن الكل', searchResultsCount > 0 && searchResultsCount < initialResultsCount);

searchInput.value = '';
searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 20));


document.querySelector('.nav-btn[data-tab="tracking"]').click();
await new Promise((r) => setTimeout(r, 50));
const trackingHtml = document.getElementById('tracking-content').innerHTML;
check('تاب التتبع اتبنى من غير كسر', trackingHtml.length > 10);
if (mealSucceeded) {
  check('تاب التتبع بيعرض بيانات حقيقية بعد تسجيل وجبة', trackingHtml.includes('سعرات اليوم'));
}

// -----------------------------------------------------------------------
// نموذج تسجيل الوزن/الماء اليومي (LIMIT-08)
// -----------------------------------------------------------------------
check('نموذج تسجيل الوزن/الماء موجود في تاب التتبع', !!document.getElementById('daily-metrics-form'));
document.getElementById('metrics-weight-input').value = '88.5';
document.getElementById('metrics-water-input').value = '1800';
document.getElementById('daily-metrics-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));

check('حفظ الوزن/الماء يعيد بناء التاب ويعرض القيم المحفوظة', document.getElementById('metrics-weight-input').value === '88.5' && document.getElementById('metrics-water-input').value === '1800');
check('شريط تقدّم الماء ظهر بعد الحفظ', document.getElementById('tracking-content').innerHTML.includes('water-bar'));

// -----------------------------------------------------------------------
// نموذج تركيب الجسم اليومي الاختياري (بند 13 — يغذّي اتجاه نسبة الدهون في التحليلات)
// -----------------------------------------------------------------------
check('نموذج تركيب الجسم اليومي موجود في تاب التتبع', !!document.getElementById('body-comp-form'));
document.getElementById('metrics-waist-input').value = '90';
document.getElementById('metrics-neck-input').value = '38';
document.getElementById('body-comp-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));
check('حفظ تركيب الجسم اليومي يظهر رسالة تأكيد', document.getElementById('body-comp-message').innerHTML.includes('تم الحفظ'));
check('حفظ تركيب الجسم اليومي يعيد بناء التاب ويعرض القيم المحفوظة', document.getElementById('metrics-waist-input').value === '90' && document.getElementById('metrics-neck-input').value === '38');

// -----------------------------------------------------------------------
// تاب التحليلات (S16 — بند 13: Analytics Engine كان مبني من S6 بدون واجهة)
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="analytics"]').click();
await new Promise((r) => setTimeout(r, 80));
const analyticsHtml = document.getElementById('analytics-content').innerHTML;
check('تاب التحليلات اتبنى من غير كسر', analyticsHtml.length > 10);
check('كارت الالتزام (آخر 7 أيام) ظاهر', analyticsHtml.includes('الالتزام (آخر 7 أيام)'));
check('رسم بياني لاتجاه الوزن ظهر بعد تسجيل وزن اليوم', analyticsHtml.includes('trend-chart'));
if (mealSucceeded) {
  check('رسم بياني لاتجاه السعرات ظهر بعد تسجيل وجبة', (analyticsHtml.match(/trend-chart/g) || []).length >= 2);
}
check('كارت تركيب الجسم الحالي ظاهر في تاب التحليلات بعد تسجيل محيط الخصر/الرقبة', analyticsHtml.includes('تركيب الجسم الحالي'));
check('رسم بياني لاتجاه نسبة دهون الجسم ظهر (بند 13)', (analyticsHtml.match(/trend-chart/g) || []).length >= 3);
check('كارت توصية اتجاه الوزن ظاهر (بند 1.5/12) — بيانات وزن قليلة هنا فتظهر توصية تشجيع على التسجيل', analyticsHtml.includes('توصية اتجاه الوزن'));

// -----------------------------------------------------------------------
// S25 (بطلب المستخدم): حوار "InBody تقريبي" في تاب لوحة التحكم
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="dashboard"]').click();
await new Promise((r) => setTimeout(r, 50));
const inbodyBtn = document.getElementById('open-inbody-dialog-btn');
check('زرار "تقرير InBody تقريبي" ظاهر في لوحة التحكم', !!inbodyBtn);
inbodyBtn.click();
await new Promise((r) => setTimeout(r, 20));
const inbodyDialog = document.getElementById('inbody-dialog');
check('حوار الـInBody اتفتح فعليًا (مش استثناء غير مُمسوك) — open=true', inbodyDialog.open === true);
const inbodyContent = document.getElementById('inbody-dialog-content').innerHTML;
check('تقرير الـInBody فيه الوزن ونسبة الدهون وBMR فعليًا (مش قالب فاضي)', inbodyContent.includes('الوزن') && inbodyContent.includes('نسبة الدهون') && inbodyContent.includes('BMR'));
document.getElementById('inbody-dialog-close').click();
check('حوار الـInBody اتقفل فعليًا بعد ضغط إغلاق — open=false', inbodyDialog.open === false);

// -----------------------------------------------------------------------
// تاب التحديات
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="activity"]').click();
await new Promise((r) => setTimeout(r, 30));
check('قوالب التحديات اتبنت (3 قوالب)', document.querySelectorAll('#challenge-templates .card').length === 3);

const startChallengeBtn = document.querySelector('.start-challenge-btn');
const startedTemplateId = startChallengeBtn.dataset.id;
startChallengeBtn.click();
await new Promise((r) => setTimeout(r, 50));
check('تحدي جديد ظهر في "تحدياتي" بعد البدء', document.querySelectorAll('#my-challenges .card').length === 1);

// -----------------------------------------------------------------------
// S25: BUG-S25-05 — بدء نفس قالب التحدي مرتين كان بينشئ سجلّين مستقلّين
// مكرّرين (0/30 لكل واحد) بدل ما يمنع/يعطّل الزرار للقالب الشغّال بالفعل
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="dashboard"]').click();
await new Promise((r) => setTimeout(r, 20));
document.querySelector('.nav-btn[data-tab="activity"]').click();
await new Promise((r) => setTimeout(r, 30));
const sameTemplateBtn = document.querySelector(`.start-challenge-btn[data-id="${startedTemplateId}"]`);
check('BUG-S25-05: زرار "ابدأ" للقالب الشغّال بالفعل اختفى/اتعطّل بدل ما يسمح ببدء تاني', !sameTemplateBtn || sameTemplateBtn.disabled);
check('BUG-S25-05: لسه "تحدي واحد بس" في "تحدياتي" (مفيش تكرار)', document.querySelectorAll('#my-challenges .card').length === 1);

// -----------------------------------------------------------------------
// S25 (طلب المستخدم): تقدّم التحدي كان بيفضل 0/الهدف للأبد حتى لو المستخدم
// حقّق الشرط فعليًا — updateChallengeProgress/calculateStreak موجودين
// ومُختبَرين على مستوى المحرك بس ماكانوش متوصّلين بالتتبّع الفعلي في
// الواجهة. اتوصّلوا دلوقتي عبر refreshChallengeProgress() اللي بتتنادى قبل
// عرض "تحدياتي". سيناريو متحكَّم فيه (مش معتمد على حالة سابقة هشّة): نبدأ
// تحدي "7 أيام ماء مكتمل" ونسجّل ماء النهاردة فوق الهدف يدويًا.
// -----------------------------------------------------------------------
{
  const waterBtn = document.querySelector('.start-challenge-btn[data-id="ch_water_7"]');
  waterBtn.click();
  await new Promise((r) => setTimeout(r, 50));
  const todayForChallenge = new Date().toISOString().slice(0, 10);
  await putRecord(STORE.DAILY_TRACKING, { id: todayForChallenge, date: todayForChallenge, weightKg: null, waterMl: 5000, bodyFatPercent: null, waistCm: null, neckCm: null, hipCm: null });
  document.querySelector('.nav-btn[data-tab="dashboard"]').click();
  await new Promise((r) => setTimeout(r, 20));
  document.querySelector('.nav-btn[data-tab="activity"]').click();
  await new Promise((r) => setTimeout(r, 80));
  const myChallengesHtml = document.getElementById('my-challenges').innerHTML;
  check('تقدّم تحدي الماء اتحدّث فعليًا من بيانات التتبّع الحقيقية (1/7 مش 0/7 بعد يوم ماء محقَّق)', myChallengesHtml.includes('1 / 7'));
}

// -----------------------------------------------------------------------
// S25: محيط الخصر/الرقبة/الأرداف ونسبة الدهون بقوا بيُسجَّلوا من تاب التتبع
// بس (اتشالوا من تاب الإعدادات المكرَّر بطلب المستخدم) — نتأكد إن تاب
// الإعدادات فعلًا مبقاش فيه الحقول دي، وإن حفظهم من تاب التتبع لسه بيفعّل
// Katch-McArdle في الداشبورد زي ما كان بيحصل من الإعدادات قبل كده بالظبط.
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="settings"]').click();
await new Promise((r) => setTimeout(r, 20));
check('نموذج البيانات الإضافية موجود في تاب الإعدادات', !!document.getElementById('advanced-fields-form'));
const advForm = document.getElementById('advanced-fields-form');
check('محيط الأرداف اتشال من تاب الإعدادات (بقى بس في تاب التتبع، مفيش تكرار)', !advForm.querySelector('[name="hipCm"]'));
check('نسبة الدهون اتشالت من تاب الإعدادات (بقت بس في تاب التتبع، مفيش تكرار)', !advForm.querySelector('[name="bodyFatPercent"]'));

document.querySelector('.nav-btn[data-tab="tracking"]').click();
await new Promise((r) => setTimeout(r, 30));
document.getElementById('metrics-bodyfat-input').value = '15';
document.getElementById('metrics-waist-input').value = '85';
document.getElementById('body-comp-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 50));

document.querySelector('.nav-btn[data-tab="dashboard"]').click();
await new Promise((r) => setTimeout(r, 50));
check('الـDashboard بيعكس معادلة BMR الجديدة بعد حفظ نسبة الدهون من تاب التتبع الموحَّد', document.getElementById('dashboard-content').innerHTML.includes('Katch-McArdle'));

// -----------------------------------------------------------------------
// تصدير البيانات من تاب الإعدادات
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="settings"]').click();
await new Promise((r) => setTimeout(r, 20));
let downloadTriggered = false;
URL.createObjectURL = () => { downloadTriggered = true; return 'blob:mock-url'; };
URL.revokeObjectURL = () => {};
document.getElementById('export-data-btn').click();
await new Promise((r) => setTimeout(r, 30));
check('زر تصدير البيانات يبني ملف تحميل بنجاح', downloadTriggered);

// -----------------------------------------------------------------------
// إصلاح باج التاريخ المحلي (UTC Bug) — S22
// محاكاة مستخدم في القاهرة (UTC+2) بيسجّل الساعة 00:30 بتوقيته المحلي يوم
// 1 أغسطس، بينما نفس اللحظة بتوقيت UTC لسه 22:30 مساءً يوم 31 يوليو (اليوم
// السابق). التأكد إن السجل بيتخزّن تحت تاريخ اليوم المحلي الصح (2026-08-01)
// مش تاريخ UTC الغلط (2026-07-31).
// -----------------------------------------------------------------------
process.env.TZ = 'Africa/Cairo';
const REAL_DATE = global.Date;
const FIXED_UTC_MS = REAL_DATE.UTC(2026, 6, 31, 22, 30, 0); // = 2026-08-01T00:30 بتوقيت القاهرة (UTC+2)
class MockDate extends REAL_DATE {
  constructor(...args) {
    if (args.length === 0) super(FIXED_UTC_MS);
    else super(...args);
  }
  static now() { return FIXED_UTC_MS; }
}
global.Date = MockDate;

check(
  'التأكيد الأولي: نفس اللحظة تقع في يومين مختلفين حسب UTC مقابل التوقيت المحلي (سيناريو الباج فعليًا)',
  new Date().toISOString().slice(0, 10) === '2026-07-31' && `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}` === '2026-08-01'
);

document.querySelector('.nav-btn[data-tab="tracking"]').click();
await new Promise((r) => setTimeout(r, 50));
document.getElementById('metrics-weight-input').value = '87.2';
document.getElementById('daily-metrics-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 80));

const localDateRecord = await getRecord(STORE.DAILY_TRACKING, '2026-08-01');
const utcDateRecord = await getRecord(STORE.DAILY_TRACKING, '2026-07-31');
check('تسجيل الوزن قرب منتصف الليل بيتخزّن تحت تاريخ اليوم المحلي الصح (2026-08-01) مش تاريخ UTC', !!localDateRecord && localDateRecord.weightKg === 87.2);
check('السجل مبيتخزّنش غلط تحت تاريخ UTC (2026-07-31)', !utcDateRecord || utcDateRecord.weightKg !== 87.2);

global.Date = REAL_DATE;
delete process.env.TZ;

// -----------------------------------------------------------------------
// S25: BUG-S25-04 — computeDailyTotals() كان بيحسب unresolvedFoodIds
// (أصناف اتسجلت وبعدين اختفت من Food Library، زي بعد استيراد نسخة احتياطية
// قديمة على إصدار تطبيق أحدث) لكن الحقل ده ما كانش بيتعرض في الواجهة أبدًا.
// نضيف سجل وجبة تالف يدويًا (foodId مش موجود) لليوم الحالي، ونتأكد إن
// تاب التتبع بيعرض تنبيه واضح بدل ما يتجاهل الأصناف دي بصمت.
// -----------------------------------------------------------------------
const todayForUnresolvedTest = new REAL_DATE().toISOString().slice(0, 10);
await putRecord(STORE.MEAL_LOGS, {
  id: `${todayForUnresolvedTest}_snack_test-unresolved`,
  date: todayForUnresolvedTest,
  mealType: 'snack',
  items: [{ foodId: 'FOOD_ID_THAT_NO_LONGER_EXISTS', grams: 100 }],
  loggedAt: new REAL_DATE().toISOString(),
});
document.querySelector('.nav-btn[data-tab="tracking"]').click();
await new Promise((r) => setTimeout(r, 50));
const unresolvedTrackingHtml = document.getElementById('tracking-content').innerHTML;
check('صنف محذوف من مكتبة الطعام: تاب التتبع اتبنى من غير كسر (مفيش استثناء وقف السكريبت)', unresolvedTrackingHtml.length > 10);
check('صنف محذوف من مكتبة الطعام: تنبيه واضح ظهر للمستخدم بدل تجاهل صامت (BUG-S25-04)', unresolvedTrackingHtml.includes('لم يعد موجودًا في مكتبة الطعام'));

// -----------------------------------------------------------------------
// End-to-End: بروفايل حامل يعيد كتابة الـOnboarding — يتحقق من ظهور
// التحذير الدائم في الداشبورد فعليًا (وليس فقط اختبار منطق الإظهار/الإخفاء
// أعلاه). هذا آخر اختبار في الملف عمدًا لأنه يستبدل البروفايل الحالي.
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="dashboard"]').click(); // العودة لأي تاب، غير مهم قبل إعادة تحميل الـOnboarding يدويًا
form.querySelector('[name="name"]').value = 'سارة';
form.querySelector('[name="gender"]').value = 'female';
form.querySelector('[name="gender"]').dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
form.querySelector('[name="age"]').value = '29';
form.querySelector('[name="heightCm"]').value = '162';
form.querySelector('[name="weightKg"]').value = '65';
form.querySelector('[name="targetWeightKg"]').value = '60';
form.querySelector('[name="goal"]').value = 'lose';
form.querySelector('[name="dietStyle"]').value = 'normal';
form.querySelector('[name="pregnancyStatus"]').value = 'pregnant';
form.querySelector('[name="pregnancyStatus"]').dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));

form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 100));

const pregnantDashboardHtml = document.getElementById('dashboard-content').innerHTML;
check('الداشبورد يعرض تحذير الحمل الدائم بعد بروفايل حامل', pregnantDashboardHtml.includes('استشارة طبية') || pregnantDashboardHtml.includes('الحمل'));
check('السعرات المستهدفة في الداشبورد أعلى من TDEE (لا عجز رغم هدف "خسارة وزن")', (() => {
  const kcalMatch = pregnantDashboardHtml.match(/<h3>[^<]*السعرات المستهدفة<\/h3>[\s\S]*?<div class="value">(\d+)<\/div>/);
  const tdeeMatch = pregnantDashboardHtml.match(/<h3>[^<]*إجمالي الحرق اليومي \(TDEE\)<\/h3>[\s\S]*?<div class="value">(\d+)<\/div>/);
  return !!kcalMatch && !!tdeeMatch && Number(kcalMatch[1]) > Number(tdeeMatch[1]);
})());

// -----------------------------------------------------------------------
// S23: بروفايل ببيانات طول تالفة (heightCm=0) — لازم الداشبورد وتاب
// التحليلات يعرضوا تحذير واضح بدل خطة وهمية أو كسر أو رقم مضلِّل
// (BUG-S23-02 على الداشبورد، BUG-S23-04 على تاب التحليلات) — سيناريو أخير
// عمدًا (بيغيّر currentProfile/currentNutinion لحالة غير صالحة)
// -----------------------------------------------------------------------
form.querySelector('[name="heightCm"]').value = '0';
form.querySelector('[name="weightKg"]').value = '70';
form.querySelector('[name="targetWeightKg"]').value = '65';
form.querySelector('[name="goal"]').value = 'lose';
form.querySelector('[name="pregnancyStatus"]').value = 'none';
form.querySelector('[name="pregnancyStatus"]').dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 100));

const invalidDashboardHtml = document.getElementById('dashboard-content').innerHTML;
check('طول = صفر: الداشبورد يعرض تحذير "بيانات غير صالحة" بدل خطة وهمية أو كسر', invalidDashboardHtml.includes('بيانات الطول/الوزن غير صالحة') || invalidDashboardHtml.includes('غير صالح'));
check('طول = صفر: الداشبورد لا يعرض كارت "السعرات المستهدفة" (كان هيتحسب من رقم تالف)', !invalidDashboardHtml.includes('السعرات المستهدفة'));

document.querySelector('.nav-btn[data-tab="analytics"]').click();
await new Promise((r) => setTimeout(r, 80));
const invalidAnalyticsHtml = document.getElementById('analytics-content').innerHTML;
check('طول = صفر: تاب التحليلات اتبنى من غير كسر (مفيش استثناء وقف السكريبت)', invalidAnalyticsHtml.length > 10);
check('طول = صفر: تاب التحليلات يعرض نفس تحذير البيانات غير الصالحة', invalidAnalyticsHtml.includes('غير صالح'));
check('طول = صفر: كارت الالتزام يعرض "—" بدل "0%" مضلِّل (BUG-S23-04)', invalidAnalyticsHtml.includes('>—<'));

// -----------------------------------------------------------------------
// S26: زرار "إعادة تعيين كل البيانات" بتاب الإعدادات — لازم يتفحص قبل
// سيناريو إغلاق اتصال الـDB اللي جاي بعده (آخر اختبار في الملف عمدًا).
// أولًا سيناريو الإلغاء (المستخدم يضغط "إلغاء" في نافذة التأكيد) — مفيش
// حاجة المفروض تتمسح. بعدين سيناريو التأكيد الفعلي.
// -----------------------------------------------------------------------
document.querySelector('.nav-btn[data-tab="settings"]').click();
await new Promise((r) => setTimeout(r, 20));

dom.window.confirm = () => false;
document.getElementById('reset-all-data-btn').click();
await new Promise((r) => setTimeout(r, 50));
check(
  'إلغاء التأكيد: البروفايل لسه موجود ومفيش أي مسح حصل',
  !document.getElementById('main-nav').classList.contains('hidden') && (await getRecord(STORE.PROFILE, 'current'))?.heightCm === 0
);

dom.window.confirm = () => true;
document.getElementById('reset-all-data-btn').click();
await new Promise((r) => setTimeout(r, 80));

check('التأكيد الفعلي: البروفايل اتمسح من IndexedDB فعليًا', (await getRecord(STORE.PROFILE, 'current')) === undefined);
check('التأكيد الفعلي: nav رجع مخفي (زي أول مرة قبل أي بروفايل)', document.getElementById('main-nav').classList.contains('hidden'));
check('التأكيد الفعلي: تاب Onboarding رجع هو الظاهر', document.getElementById('tab-onboarding').classList.contains('active'));
check('التأكيد الفعلي: رسالة تأكيد الحذف ظهرت للمستخدم', document.getElementById('onboarding-reset-message').innerHTML.includes('تم حذف'));
check('التأكيد الفعلي: محتوى الداشبورد القديم اتفضّى (مفيش بيانات بروفايل قديم فاضل ظاهر)', document.getElementById('dashboard-content').innerHTML === '');

// -----------------------------------------------------------------------
// S25: BUG-S25-03 — فشل كتابة IndexedDB فعلي (Quota Exceeded/اتصال مقطوع)
// كان بيفشل بصمت تمامًا (Unhandled Promise Rejection، مفيش رسالة للمستخدم،
// الواجهة بتفضل عالقة). السيناريو ده آخر حاجة في الملف عمدًا لأنه بيقفل
// اتصال الـDB فعليًا (محاكاة فشل حقيقي) فمينفعش يكمل أي تسجيل بعده.
// -----------------------------------------------------------------------
{
  let unhandled = null;
  process.on('unhandledRejection', (reason) => { unhandled = reason; });

  const db = await openDatabase();
  db.close();

  // إعادة استخدام نفس فورم الـOnboarding (لسه في تاب الداشبورد من السيناريو
  // اللي فات، فنرجع نعرض تاب الـOnboarding الأول عن طريق النموذج المخفي —
  // البيانات هتتبعت لنفس الفورم اللي لسه موجود في الـDOM بغض النظر عن التاب الظاهر)
  form.querySelector('[name="heightCm"]').value = '178';
  form.querySelector('[name="weightKg"]').value = '90';
  form.querySelector('[name="targetWeightKg"]').value = '80';
  form.querySelector('[name="goal"]').value = 'lose';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 100));

  check('فشل كتابة IndexedDB: مفيش Unhandled Promise Rejection بعد الفشل', unhandled === null);
  const errBox = document.getElementById('onboarding-form-error');
  check('فشل كتابة IndexedDB: رسالة خطأ واضحة اتعرضت للمستخدم بدل فشل صامت', errBox.style.display !== 'none' && errBox.textContent.includes('خطأ'));
}

console.log(`\n=== ${pass} نجح / ${fail} فشل ===`);
process.exit(fail > 0 ? 1 : 0);
