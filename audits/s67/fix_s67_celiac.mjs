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

const glutenItems = all.filter(f => (f.allergens||[]).includes('gluten'));
console.log('Total gluten items across whole library:', glutenItems.length);

let fixed = 0, skipped = 0;
for (const f of glutenItems) {
  const old = f.unsuitable_for_conditions || [];
  if (old.includes('celiac')) { skipped++; continue; }
  const updated = [...old, 'celiac'];
  const { blockStart, blockEnd } = getBlock(f.id);
  let block = content.slice(blockStart, blockEnd);
  const oldLine = `unsuitable_for_conditions: ${arrToJs(old)},`;
  const newLine = `unsuitable_for_conditions: ${arrToJs(updated)},`;
  if (!block.includes(oldLine)) { console.log('⚠️ FAILED match:', f.id); continue; }
  block = block.replace(oldLine, newLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  fixed++;
}
console.log('Fixed (celiac added):', fixed, '| already had it:', skipped);

fs.writeFileSync(path, content);
console.log('Done — file written.');
