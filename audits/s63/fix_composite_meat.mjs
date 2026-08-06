import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const realMeatIds = ['food_2454','food_2457','food_2458','food_2465','food_2467','food_2471','food_2474',
'food_2475','food_2477','food_2481','food_2483','food_2486','food_2487','food_2490','food_2492','food_2499',
'food_2500','food_2502','food_2503','food_2505','food_2517','food_2532','food_2544','food_2545','food_2552',
'food_2553','food_2554','food_2606','food_2617','food_2618','food_2619','food_2631','food_2634','food_2635',
'food_2636','food_2641','food_2649','food_2650','food_2652','food_2653','food_2666','food_2700','food_2719',
'food_2737','food_2752','food_2808','food_2837','food_2850','food_2874','food_2896','food_3030','food_3043',
'food_3058','food_3075','food_3136','food_3139','food_3140','food_3141','food_3244','food_3249','food_3250',
'food_3253','food_3400','food_3410','food_3415','food_3422','food_3435'];

const dairyOnlyIds = ['food_2921','food_2922','food_2962','food_3003','food_3247','food_3319'];

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
  if (idx === -1) throw new Error('not found: ' + id);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd };
}

let fixedCount = 0;
const log = [];

function applyFix(id, removeFromSuitable, addToUnsuitable) {
  const f = all.find(x => x.id === id);
  if (!f) { log.push(`⚠️ مش موجود: ${id}`); return; }
  const oldSuitable = f.suitable_for_diets || [];
  const oldUnsuitable = f.unsuitable_for_diets || [];
  const newSuitable = oldSuitable.filter(x => !removeFromSuitable.includes(x));
  const newUnsuitableSet = new Set(oldUnsuitable);
  addToUnsuitable.forEach(x => newUnsuitableSet.add(x));
  const newUnsuitable = [...newUnsuitableSet];

  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);

  const oldSuitableLine = `suitable_for_diets: ${arrToJs(oldSuitable)},`;
  const newSuitableLine = `suitable_for_diets: ${arrToJs(newSuitable)},`;
  const oldUnsuitableLine = `unsuitable_for_diets: ${arrToJs(oldUnsuitable)},`;
  const newUnsuitableLine = `unsuitable_for_diets: ${arrToJs(newUnsuitable)},`;

  if (!block.includes(oldSuitableLine)) { log.push(`⚠️ فشل suitable: ${id} — ${oldSuitableLine}`); return; }
  if (!block.includes(oldUnsuitableLine)) { log.push(`⚠️ فشل unsuitable: ${id} — ${oldUnsuitableLine}`); return; }

  block = block.replace(oldSuitableLine, newSuitableLine);
  block = block.replace(oldUnsuitableLine, newUnsuitableLine);

  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  fixedCount++;
  log.push(`✅ ${id} ${f.name_ar}: suitable ${JSON.stringify(oldSuitable)}→${JSON.stringify(newSuitable)} | unsuitable ${JSON.stringify(oldUnsuitable)}→${JSON.stringify(newUnsuitable)}`);
}

for (const id of realMeatIds) applyFix(id, ['vegan','vegetarian'], ['vegan','vegetarian']);
for (const id of dairyOnlyIds) applyFix(id, ['vegan'], ['vegan']);

fs.writeFileSync(path, content);
console.log('إجمالي المُصحَّح:', fixedCount, '/ ', realMeatIds.length + dairyOnlyIds.length);
console.log(log.filter(l=>l.includes('⚠️')).join('\n'));
