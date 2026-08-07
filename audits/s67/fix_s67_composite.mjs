import fs from 'fs';
import { getAllFoods } from '../../core/food-library/food-library.js';

const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');
const all = getAllFoods();

function arrToJs(arr) { return arr.length===0 ? '[]' : '[' + arr.map(x=>`"${x}"`).join(', ') + ']'; }
function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('not found: '+id);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd };
}

// ---- 1. Diet-tag fix: remove 'vegan' from suitable_for_diets, add to unsuitable_for_diets ----
const dietFixIds = ['food_2419','food_2493','food_2604','food_2624','food_2645','food_2656','food_2684',
  'food_2710','food_2753','food_2754','food_2773','food_2801','food_2805','food_2815','food_2836','food_2839',
  'food_2840','food_2886','food_2907','food_2908','food_2972','food_3004','food_3015','food_3018','food_3022',
  'food_3145','food_3171','food_3175','food_3206','food_3216','food_3219','food_3221','food_3242','food_3252',
  'food_3254','food_3255','food_3283','food_3284','food_3313'];

let dietFixCount = 0;
for (const id of dietFixIds) {
  const f = all.find(x=>x.id===id);
  const oldSuit = f.suitable_for_diets || [];
  const oldUnsuit = f.unsuitable_for_diets || [];
  if (!oldSuit.includes('vegan')) { console.log('⚠️ skip (no vegan tag):', id); continue; }
  const newSuit = oldSuit.filter(d=>d!=='vegan');
  const newUnsuit = oldUnsuit.includes('vegan') ? oldUnsuit : [...oldUnsuit, 'vegan'];
  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);
  const oldSuitLine = `suitable_for_diets: ${arrToJs(oldSuit)},`;
  const newSuitLine = `suitable_for_diets: ${arrToJs(newSuit)},`;
  const oldUnsuitLine = `unsuitable_for_diets: ${arrToJs(oldUnsuit)},`;
  const newUnsuitLine = `unsuitable_for_diets: ${arrToJs(newUnsuit)},`;
  if (!block.includes(oldSuitLine) || !block.includes(oldUnsuitLine)) { console.log('⚠️ FAILED match:', id); continue; }
  block = block.replace(oldSuitLine, newSuitLine).replace(oldUnsuitLine, newUnsuitLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  dietFixCount++;
  console.log('✅ diet-tag', id, f.name_ar, ': vegan removed from suit, added to unsuit');
}
console.log('\nTotal diet-tag fixes:', dietFixCount, '/', dietFixIds.length);

// ---- 2. Add missing lactose allergen ----
function addAllergens(id, toAdd) {
  const f = all.find(x => x.id === id);
  const old = f.allergens || [];
  const newSet = new Set(old);
  toAdd.forEach(a => newSet.add(a));
  const updated = [...newSet];
  if (updated.length === old.length) { console.log('⚠️ no change needed:', id); return; }
  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);
  const oldLine = `allergens: ${arrToJs(old)},`;
  const newLine = `allergens: ${arrToJs(updated)},`;
  if (!block.includes(oldLine)) { console.log('⚠️ FAILED allergen match:', id); return; }
  block = block.replace(oldLine, newLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅ allergen', id, f.name_ar, ':', JSON.stringify(old), '→', JSON.stringify(updated));
}

const lactoseAdd = ['food_2419','food_2886','food_3004','food_3018','food_3175','food_3221','food_3255','food_3283','food_3284'];
const shellfishAdd = ['food_2656','food_2684'];
for (const id of lactoseAdd) addAllergens(id, ['lactose']);
for (const id of shellfishAdd) addAllergens(id, ['shellfish']);

// ---- 3. Cholesterol fix for unambiguously 100% plant-based items (biological impossibility otherwise) ----
function setCholesterol(id, newVal) {
  const f = all.find(x => x.id === id);
  const oldVal = f.macros.cholesterol_mg;
  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);
  // macros line has cholesterol_mg: X within it
  const re = new RegExp('cholesterol_mg: ' + oldVal.toString().replace('.', '\\.') + '(?=[,}])');
  if (!re.test(block)) { console.log('⚠️ FAILED cholesterol match:', id, oldVal); return; }
  block = block.replace(re, 'cholesterol_mg: ' + newVal);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅ cholesterol', id, f.name_ar, ':', oldVal, '→', newVal);
}
const cholFixIds = ['food_2974','food_3156','food_3164','food_3189','food_3194','food_3197','food_3222','food_3245'];
for (const id of cholFixIds) setCholesterol(id, 0);

fs.writeFileSync(path, content);
console.log('\nDone — file written.');
