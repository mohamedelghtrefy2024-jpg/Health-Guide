import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function arrToJs(arr) { return arr.length===0 ? '[]' : '[' + arr.map(x=>`"${x}"`).join(', ') + ']'; }
function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd };
}
function addAllergens(id, toAdd) {
  const f = all.find(x => x.id === id);
  const old = f.allergens || [];
  const newSet = new Set(old);
  toAdd.forEach(a => newSet.add(a));
  const updated = [...newSet];
  if (updated.length === old.length) return;
  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);
  const oldLine = `allergens: ${arrToJs(old)},`;
  const newLine = `allergens: ${arrToJs(updated)},`;
  if (!block.includes(oldLine)) { console.log('⚠️ فشل:', id); return; }
  block = block.replace(oldLine, newLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅', id, f.name_ar, ':', JSON.stringify(old), '→', JSON.stringify(updated));
}

const shellfish = ['food_4747','food_4748','food_4713','food_5335','food_4628','food_4711','food_4712','food_4749','food_4750'];
const lactose = ['food_4563','food_4564'];
const nuts = ['food_4066','food_4067','food_4068','food_4069','food_4070','food_5115','food_5116'];

for (const id of shellfish) addAllergens(id, ['shellfish']);
for (const id of lactose) addAllergens(id, ['lactose']);
for (const id of nuts) addAllergens(id, ['nuts']);

fs.writeFileSync(path, content);
console.log('\nتم');
