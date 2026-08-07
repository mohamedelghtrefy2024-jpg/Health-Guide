import fs from 'fs';

const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

const glutenIds = [
  'food_2707', 'food_2715', 'food_2719', 'food_2735', 'food_2740', 'food_2957',
];

const lactoseIds = [
  'food_3950', 'food_2517', 'food_2524', 'food_2538', 'food_2557', 'food_2567',
  'food_2572', 'food_2576', 'food_2578', 'food_2584', 'food_2809', 'food_2846',
  'food_2880', 'food_2913', 'food_2921', 'food_2925', 'food_2962', 'food_3000',
  'food_3009', 'food_3038', 'food_3107', 'food_3121', 'food_3228', 'food_3237',
  'food_3238', 'food_3239', 'food_3263', 'food_3271', 'food_3275', 'food_3285',
  'food_3289', 'food_3298', 'food_3306', 'food_3315', 'food_3319', 'food_3320',
  'food_3342', 'food_3343', 'food_3414', 'food_5319', 'food_5425', 'food_5426',
];

function addAllergen(content, id, allergen) {
  const idPattern = `id: "${id}",`;
  const idIdx = content.indexOf(idPattern);
  if (idIdx === -1) return { content, ok: false, reason: 'id not found' };

  const searchWindow = content.slice(idIdx, idIdx + 3000);
  const allergensMatch = searchWindow.match(/allergens:\s*\[([^\]]*)\]/);
  if (!allergensMatch) return { content, ok: false, reason: 'allergens field not found' };

  const currentAllergensRaw = allergensMatch[1].trim();
  if (currentAllergensRaw.includes(`"${allergen}"`)) {
    return { content, ok: false, reason: 'already tagged' };
  }

  const oldSegment = allergensMatch[0];
  const newInner = currentAllergensRaw.length > 0 ? `"${allergen}", ${currentAllergensRaw}` : `"${allergen}"`;
  const newSegment = `allergens: [${newInner}]`;

  const absoluteIdx = idIdx + allergensMatch.index;
  const newContent = content.slice(0, absoluteIdx) + newSegment + content.slice(absoluteIdx + oldSegment.length);
  return { content: newContent, ok: true };
}

let fixedGluten = 0, fixedLactose = 0;
const failures = [];

for (const id of glutenIds) {
  const r = addAllergen(content, id, 'gluten');
  content = r.content;
  if (r.ok) fixedGluten++; else failures.push([id, 'gluten', r.reason]);
}

for (const id of lactoseIds) {
  const r = addAllergen(content, id, 'lactose');
  content = r.content;
  if (r.ok) fixedLactose++; else failures.push([id, 'lactose', r.reason]);
}

fs.writeFileSync(path, content, 'utf8');
console.log('gluten تم تصحيح:', fixedGluten, '/', glutenIds.length);
console.log('lactose تم تصحيح:', fixedLactose, '/', lactoseIds.length);
if (failures.length) console.log('فشل:', failures);
