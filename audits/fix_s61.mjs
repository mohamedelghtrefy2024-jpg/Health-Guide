// S61 fix script — يعدّل core/food-library/foods-data.js مباشرة كنص
// يحسب قوائم الـid المطلوب تصحيحها برمجيًا من الفهرس، ثم يعدّل النص خام
// بالبحث عن حدود كل block وتصحيح الحقول المطلوبة بالظبط، مش تخمين.
import fs from 'fs';
import { getAllFoods } from '../core/food-library/food-library.js';

const DATA_PATH = new URL('../core/food-library/foods-data.js', import.meta.url);
let text = fs.readFileSync(DATA_PATH, 'utf8');
const all = getAllFoods();

function getBlockBounds(id) {
  const marker = `id: "${id}",`;
  const start = text.indexOf(marker);
  if (start === -1) throw new Error('NOT FOUND: ' + id);
  const blockStart = text.lastIndexOf('  {\n', start);
  const blockEnd = text.indexOf('  },\n', start) + '  },\n'.length;
  return { blockStart, blockEnd };
}

function replaceInBlock(id, oldStr, newStr) {
  const { blockStart, blockEnd } = getBlockBounds(id);
  const block = text.slice(blockStart, blockEnd);
  if (!block.includes(oldStr)) {
    throw new Error(`OLD STRING NOT FOUND in ${id}:\n  looking for: ${oldStr}\n  block macros/micros: ${block.split('\n').find(l=>l.includes('macros:')||l.includes('micros:'))}`);
  }
  const count = block.split(oldStr).length - 1;
  if (count > 1) throw new Error(`OLD STRING NOT UNIQUE in ${id} (${count}x): ${oldStr}`);
  const newBlock = block.replace(oldStr, newStr);
  text = text.slice(0, blockStart) + newBlock + text.slice(blockEnd);
}

function deleteBlock(id) {
  const { blockStart, blockEnd } = getBlockBounds(id);
  text = text.slice(0, blockStart) + text.slice(blockEnd);
}

const results = { fixed_placeholder: [], fixed_other: [], fixed_shell_nuts: [], fixed_plant_fats: [],
  fixed_white: [], fixed_mussels: [], deleted: [] };

// ============================================================
// GROUP A: عنصر بقيمة افتراضية مكرَّرة بالضبط (كوليسترول=25، فيتامين ب12=0.3)
// اتأكد منها برمجيًا: كل الـ117 عنصر مكوّن واحد خام (ingredients: [])
// composite_meal/condiment بلا أي تفسير غذائي لوجود كوليسترول/ب12 (نباتي 100%)
// ============================================================
const groupA = all.filter(f => f.macros.cholesterol_mg === 25 && f.micros.vitamin_b12_mcg === 0.3
  && f.ingredients.length === 0 && ['composite_meal', 'condiment'].includes(f.category));
console.log(`Group A (placeholder chol=25/b12=0.3): ${groupA.length} عنصر`);

for (const f of groupA) {
  replaceInBlock(f.id, 'cholesterol_mg: 25, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
  replaceInBlock(f.id, 'vitamin_b12_mcg: 0.3,', 'vitamin_b12_mcg: 0,');
  results.fixed_placeholder.push(f.id);
}

// ============================================================
// GROUP B: أصناف نباتية/توابل مفردة بقيم كوليسترول/ب12 مختلفة لكن نفس السبب
// (مكوّن واحد نباتي، ingredients: []، مفيش تفسير غذائي منطقي)
// ============================================================
const groupB_manual = [
  { id: 'food_2941', chol: 24, b12: 0.13 },   // يانسون
  { id: 'food_4122', chol: 25, b12: 0.4 },    // بذور الخردل البني
  { id: 'food_4495', chol: 25, b12: 0.4 },    // مخلل طرشي لبناني
  { id: 'food_4552', chol: 102, b12: 1.9 },   // سكر نبات
  { id: 'food_5049', chol: 102, b12: 1.9 },   // قرفة عود
];
for (const { id, chol, b12 } of groupB_manual) {
  const f = all.find(x => x.id === id);
  if (f.macros.cholesterol_mg !== chol || f.micros.vitamin_b12_mcg !== b12) {
    throw new Error(`قيمة غير متطابقة لـ ${id}`);
  }
  replaceInBlock(id, `cholesterol_mg: ${chol}, omega3_mg:`, 'cholesterol_mg: 0, omega3_mg:');
  replaceInBlock(id, `vitamin_b12_mcg: ${b12},`, 'vitamin_b12_mcg: 0,');
  results.fixed_other.push(id);
}

// فلفل شطة الطيور × 2 (نسختان مكررتان بنفس الاسم تقريبًا، كوليسترول/ب12 غلط في الاتنين)
for (const id of ['food_3734', 'food_5076']) {
  replaceInBlock(id, 'cholesterol_mg: 21, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
  replaceInBlock(id, 'vitamin_b12_mcg: 1.02,', 'vitamin_b12_mcg: 0,');
  results.fixed_other.push(id);
}

// راديكيو: كوليسترول/ب12 مستحيلين لخضار ورقي + تصنيف غلط إنه غير مناسب للنباتيين
replaceInBlock('food_5220', 'cholesterol_mg: 80, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
replaceInBlock('food_5220', 'vitamin_b12_mcg: 2.5,', 'vitamin_b12_mcg: 0,');
replaceInBlock('food_5220', 'unsuitable_for_diets: ["pescatarian", "vegan", "vegetarian"],',
  'unsuitable_for_diets: ["pescatarian"],');
replaceInBlock('food_5220', 'suitable_for_diets: [],', 'suitable_for_diets: ["vegan", "vegetarian"],');
results.fixed_other.push('food_5220');

// لسان الحمل (نبات طبي - Plantago): ب12 مستحيل لنبات + وسوم حمية غلط
replaceInBlock('food_4588', 'vitamin_b12_mcg: 2.5,', 'vitamin_b12_mcg: 0,');
replaceInBlock('food_4588', 'unsuitable_for_diets: ["carnivore", "pescatarian", "vegan", "vegetarian"],',
  'unsuitable_for_diets: ["carnivore", "pescatarian"],');
replaceInBlock('food_4588', 'suitable_for_diets: [],', 'suitable_for_diets: ["vegan", "vegetarian"],');
results.fixed_other.push('food_4588');

// تتبيلات (شاورما/سمك/لحم بالخل) - توابل جافة زي شقيقتها (كباب/فراخ مشوية) اللي مالهاش كوليسترول/ب12
replaceInBlock('food_4566', 'cholesterol_mg: 80, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
replaceInBlock('food_4566', 'vitamin_b12_mcg: 2.5,', 'vitamin_b12_mcg: 0,');
results.fixed_other.push('food_4566');
replaceInBlock('food_4569', 'cholesterol_mg: 55, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
replaceInBlock('food_4569', 'vitamin_b12_mcg: 3,', 'vitamin_b12_mcg: 0,');
results.fixed_other.push('food_4569');
replaceInBlock('food_4570', 'cholesterol_mg: 80, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
replaceInBlock('food_4570', 'vitamin_b12_mcg: 2.5,', 'vitamin_b12_mcg: 0,');
results.fixed_other.push('food_4570');

// ============================================================
// GROUP C: مكسرات بقشرتها بكوليسترول (المكسرات مالها كوليسترول خالص أبدًا)
// ============================================================
for (const id of ['food_4050', 'food_4064', 'food_4073']) {
  replaceInBlock(id, 'cholesterol_mg: 171, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:');
  results.fixed_shell_nuts.push(id);
}

// ============================================================
// GROUP D: دهون نباتية 100% اتحطلها كوليسترول زبدة حيوانية غلط
// ============================================================
replaceInBlock('food_4549', 'cholesterol_mg: 215, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:'); // زبدة كاكاو
replaceInBlock('food_4549', 'vitamin_b12_mcg: 0.17,', 'vitamin_b12_mcg: 0,');
results.fixed_plant_fats.push('food_4549');
replaceInBlock('food_5091', 'cholesterol_mg: 500, omega3_mg:', 'cholesterol_mg: 0, omega3_mg:'); // زيت مهدرج
results.fixed_plant_fats.push('food_5091');

// ============================================================
// GROUP E: أصناف "أبيض" فيها ب12=1.1 غلط (أرز/بصل/حمص/فاصوليا... أبيض) —
// اتأكد بالمقارنة مع كل الأصناف الشقيقة (باقي الألوان/الأنواع) اللي كلها ب12=0
// ============================================================
const groupE = all.filter(f => f.micros.vitamin_b12_mcg === 1.1
  && ['vegetable', 'condiment', 'carb', 'legume'].includes(f.category));
console.log(`Group E ("أبيض" b12=1.1): ${groupE.length} عنصر`);
for (const f of groupE) {
  replaceInBlock(f.id, 'vitamin_b12_mcg: 1.1,', 'vitamin_b12_mcg: 0,');
  results.fixed_white.push(f.id);
}

// ============================================================
// GROUP F: بلح البحر (محار حقيقي) مصنَّف غلط "fruit" + وسوم حمية غلط
// (اتنقل لـ"protein"، وشيل وسم مناسب للنباتيين/الفيجن، ضيف وسم حساسية المحار)
// ============================================================
const musselIds = ['food_4632', 'food_4722', 'food_4724', 'food_4725', 'food_4732'];
for (const id of musselIds) {
  replaceInBlock(id, 'category: "fruit",', 'category: "protein",');
}
for (const id of ['food_4632', 'food_4722', 'food_4725', 'food_4724']) {
  replaceInBlock(id, '\n    unsuitable_for_diets: ["carnivore"],', '\n    unsuitable_for_diets: ["vegan", "vegetarian"],');
  replaceInBlock(id, '\n    suitable_for_diets: ["vegan", "vegetarian"],', '\n    suitable_for_diets: ["pescatarian", "carnivore"],');
  replaceInBlock(id, 'religious_tags: ["christian_fast_strict", "ramadan_iftar", "ramadan_suhoor"],',
    'religious_tags: ["ramadan_iftar", "ramadan_suhoor", "christian_fast_fish_allowed"],');
}
// وزم البلح: تعارض منطقي مباشر (نفس الوسم في suitable و unsuitable معًا) + مفيش allergen shellfish
replaceInBlock('food_4732', '\n    unsuitable_for_diets: ["carnivore", "vegetarian", "vegan"],', '\n    unsuitable_for_diets: ["vegan", "vegetarian"],');
replaceInBlock('food_4732', '\n    suitable_for_diets: ["vegan", "vegetarian"],', '\n    suitable_for_diets: ["pescatarian", "carnivore"],');
replaceInBlock('food_4732', 'religious_tags: ["christian_fast_strict", "ramadan_iftar", "ramadan_suhoor"],',
  'religious_tags: ["ramadan_iftar", "ramadan_suhoor", "christian_fast_fish_allowed"],');
replaceInBlock('food_4732', 'allergens: [],', 'allergens: ["shellfish"],');
results.fixed_mussels = musselIds;

// ============================================================
// GROUP G: حذف نسخ مكرَّرة فعليًا (موسومة "مكرر"/"محذوف لتكرار" في اسمها هي نفسها،
// ومؤكَّد وجود نسخة حقيقية تانية بنفس البيانات في مكان آخر بالمكتبة)
// ============================================================
deleteBlock('food_3910');
results.deleted.push('food_3910 (بصل حب - تكرار/تضارب اسم مع أصناف حبة البركة الموجودة)');

deleteBlock('food_4621');
results.deleted.push('food_4621 (لحم حجل الرمال - تكرار مؤكَّد لـfood_4617)');

deleteBlock('food_4723');
results.deleted.push('food_4723 (بلح البحر الأخضر مكرر - تكرار مؤكَّد لـfood_4632)');

fs.writeFileSync(DATA_PATH, text, 'utf8');

console.log('\n=== ملخص التصحيحات ===');
console.log('Group A (placeholder 25/0.3):', results.fixed_placeholder.length);
console.log('Group B (other plant chol/b12):', results.fixed_other.length);
console.log('Group C (shell nuts cholesterol):', results.fixed_shell_nuts.length);
console.log('Group D (plant fats cholesterol):', results.fixed_plant_fats.length);
console.log('Group E (white foods b12):', results.fixed_white.length);
console.log('Group F (mussels recategorized):', results.fixed_mussels.length);
console.log('Group G (deleted duplicates):', results.deleted.length);
const total = results.fixed_placeholder.length + results.fixed_other.length + results.fixed_shell_nuts.length
  + results.fixed_plant_fats.length + results.fixed_white.length + results.fixed_mussels.length;
console.log('إجمالي الأصناف المُصحَّحة (بدون الحذف):', total);
console.log('إجمالي الأصناف المحذوفة:', results.deleted.length);
fs.writeFileSync(new URL('./s61_fix_summary.json', import.meta.url), JSON.stringify(results, null, 2));
