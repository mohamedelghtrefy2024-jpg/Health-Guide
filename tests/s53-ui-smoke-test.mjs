/**
 * ============================================================================
 * UI Smoke Test — S53: الديانة + بار الماكرو + خطة اليوم الكامل (DOM حقيقي)
 * ============================================================================
 * تشغيل: `node tests/s53-ui-smoke-test.mjs` — يكمّل tests/s53-regression.mjs
 * (اللي بيختبر المحركات مباشرة بدون DOM) بمسار كامل عبر الواجهة الفعلية:
 * تعبئة فورم Onboarding بديانة + ماكرو مخصّص → حفظ → فتح تاب توليد الوجبة
 * → التأكد من ظهور بانر الصيام → توليد خطة يوم كامل والتأكد من عرضها.
 * ============================================================================
 */

import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import fs from 'fs';

let pass = 0, fail = 0;
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
document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 50));

console.log('=== خانة الديانة تظهر/تختفي معاها خيار الصيام المستحب ===');
const voluntaryRow = document.getElementById('voluntary-fasts-row');
check('مخفي افتراضيًا (ديانة = لا شيء)', voluntaryRow.style.display === 'none');

const religionSelect = document.getElementById('religion-select');
religionSelect.value = 'islam';
religionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('يظهر لما الديانة = إسلام', voluntaryRow.style.display === '');
check('نص الخيار يذكر الاتنين/الخميس/عرفة/عاشوراء لما الديانة إسلام', document.getElementById('voluntary-fasts-label').textContent.includes('عرفة'));

console.log('=== بار التحكم اليدوي في الماكرو ===');
const macroToggle = document.getElementById('custom-macro-toggle');
const macroBar = document.getElementById('custom-macro-bar');
check('البار مخفي افتراضيًا', macroBar.style.display === 'none');
macroToggle.checked = true;
macroToggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('البار يظهر بعد تفعيل التخصيص', macroBar.style.display === '');

const proteinRange = document.getElementById('macro-protein-range');
proteinRange.value = '30';
proteinRange.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
check('قيمة البروتين المعروضة اتحدّثت (30%)', document.getElementById('macro-protein-value').textContent === '30%');
check('رسالة المجموع تفيد إن 30+40+30=100% صالح', document.getElementById('macro-sum-message').textContent.includes('✓'));

// تفعيل حالة CKD لازم يضيّق سقف البروتين المسموح تلقائيًا في البار
const ckdCheckbox = document.querySelector('input[name="medicalConditions"][value="ckd"]');
ckdCheckbox.checked = true;
ckdCheckbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('سقف مقبض البروتين اتضيّق تلقائيًا لـ20% بعد تفعيل CKD', Number(proteinRange.max) === 20);
ckdCheckbox.checked = false;
ckdCheckbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

console.log('=== تعبئة فورم Onboarding كامل (بديانة + ماكرو مخصّص) وحفظه ===');
const form = document.getElementById('onboarding-form');
form.querySelector('[name="name"]').value = 'سارة';
form.querySelector('[name="gender"]').value = 'female';
form.querySelector('[name="age"]').value = '29';
form.querySelector('[name="heightCm"]').value = '165';
form.querySelector('[name="weightKg"]').value = '70';
form.querySelector('[name="targetWeightKg"]').value = '65';
form.querySelector('[name="activityLevel"]').value = 'moderate';
form.querySelector('[name="goal"]').value = 'lose';
form.querySelector('[name="timeframeDays"]').value = '90';
form.querySelector('[name="dietStyle"]').value = 'normal';
religionSelect.value = 'islam';
religionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
form.querySelector('[name="observeVoluntaryFasts"]').checked = true;
macroToggle.checked = true;
macroToggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
proteinRange.value = '25';
proteinRange.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 50));

check('nav ظهر بعد الحفظ (يعني البروفايل اتسجّل من غير كسر)', !document.getElementById('main-nav').classList.contains('hidden'));

console.log('=== تاب توليد الوجبة: بانر الصيام + توليد خطة اليوم ===');
document.querySelector('.nav-btn[data-tab="meal-gen"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 20));
check('تاب توليد الوجبة بقى الظاهر', document.getElementById('tab-meal-gen').classList.contains('active'));
check('حاوية بانر الصيام موجودة في الصفحة (فاضية أو فيها رسالة — بيعتمد على تاريخ اليوم الفعلي)', document.getElementById('fasting-banner') !== null);

document.getElementById('day-plan-snacks-count').value = '1';
document.getElementById('day-plan-drinks-count').value = '1';
document.getElementById('generate-day-plan-btn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));

const dayPlanResultHtml = document.getElementById('day-plan-result').innerHTML;
check('خطة اليوم اتولّدت وظهرت (ملخص الخطة ظاهر)', dayPlanResultHtml.includes('ملخص الخطة'));
check('زرار تسجيل وجبة من الخطة موجود على الأقل مرة', document.querySelectorAll('.log-day-plan-slot-btn').length > 0);

const firstLogBtn = document.querySelector('.log-day-plan-slot-btn');
if (firstLogBtn) {
  firstLogBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  check('تسجيل وجبة من خطة اليوم نجح (الزرار اتعطّل وبقى "اتسجّلت")', firstLogBtn.disabled === true && firstLogBtn.textContent.includes('اتسجّلت'));
}

console.log(`\n=== ${pass} نجح / ${fail} فشل ===`);
process.exit(fail > 0 ? 1 : 0);
