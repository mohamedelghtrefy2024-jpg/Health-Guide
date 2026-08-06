import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function arrToJs(arr) {
  if (arr.length === 0) return '[]';
  return '[' + arr.map(x => `"${x}"`).join(', ') + ']';
}

let fixedCount = 0;
const log = [];

for (const f of all) {
  const s = f.suitable_for_diets || [];
  const u = new Set(f.unsuitable_for_diets || []);
  const overlap = s.filter(x => u.has(x));
  if (overlap.length === 0) continue;

  const newSuitable = s.filter(x => !u.has(x));

  const marker = `id: "${f.id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  let block = content.slice(blockStart, blockEnd);

  const oldLine = `suitable_for_diets: ${arrToJs(s)},`;
  const newLine = `suitable_for_diets: ${arrToJs(newSuitable)},`;
  if (!block.includes(oldLine)) {
    log.push(`⚠️ فشل: ${f.id} — النمط مش متطابق. متوقع: ${oldLine}`);
    continue;
  }
  block = block.replace(oldLine, newLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  fixedCount++;
  log.push(`✅ ${f.id} ${f.name_ar} [${f.category}]: أُزيل ${overlap.join(',')} من suitable`);
}

fs.writeFileSync(path, content);
console.log('إجمالي المُصحَّح:', fixedCount);
fs.writeFileSync('/tmp/diet_contradiction_log.txt', log.join('\n'));
