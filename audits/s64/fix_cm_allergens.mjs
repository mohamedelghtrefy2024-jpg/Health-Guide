import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function arrToJs(arr) {
  if (arr.length === 0) return '[]';
  return '[' + arr.map(x => `"${x}"`).join(', ') + ']';
}
function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd };
}
function addAllergens(id, toAdd) {
  const f = all.find(x => x.id === id);
  if (!f) { console.log('⚠️ مش موجود:', id); return; }
  const old = f.allergens || [];
  const newSet = new Set(old);
  toAdd.forEach(a => newSet.add(a));
  const updated = [...newSet];
  if (updated.length === old.length) return; // no change needed

  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);
  const oldLine = `allergens: ${arrToJs(old)},`;
  const newLine = `allergens: ${arrToJs(updated)},`;
  if (!block.includes(oldLine)) { console.log('⚠️ فشل مطابقة:', id, oldLine); return; }
  block = block.replace(oldLine, newLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅', id, f.name_ar, ':', JSON.stringify(old), '→', JSON.stringify(updated));
}

const shellfish = ['food_2850','food_2896','food_3075'];
const lactose = ['food_2624','food_2639','food_2645','food_2710','food_2717','food_2754','food_2805',
'food_2836','food_2839','food_3171','food_3216','food_3242','food_3244','food_3247','food_3252','food_3254',
'food_2604','food_2773','food_2801','food_2907','food_2972','food_3003','food_3206','food_3219',
'food_2753','food_2908','food_3313','food_2503','food_2580','food_2636','food_2727','food_3231','food_3248','food_2922'];
const nuts = ['food_2774','food_2802','food_2922','food_3082','food_3111','food_3170','food_3198','food_3274','food_3565'];

for (const id of shellfish) addAllergens(id, ['shellfish']);
for (const id of lactose) addAllergens(id, ['lactose']);
for (const id of nuts) addAllergens(id, ['nuts']);

fs.writeFileSync(path, content);
console.log('\nتم');
