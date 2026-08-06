import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';
const ids = ['food_4615','food_4713','food_5335','food_5459'];
const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

for (const id of ids) {
  const f = all.find(x => x.id === id);
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  let block = content.slice(blockStart, blockEnd);

  const oldS = 'suitable_for_diets: ["vegetarian"],';
  const newS = 'suitable_for_diets: [],';
  const oldU = 'unsuitable_for_diets: ["vegan"],';
  const newU = 'unsuitable_for_diets: ["vegan", "vegetarian"],';

  if (!block.includes(oldS) || !block.includes(oldU)) { console.log('⚠️ فشل:', id); continue; }
  block = block.replace(oldS, newS).replace(oldU, newU);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅', id, f.name_ar);
}
fs.writeFileSync(path, content);
