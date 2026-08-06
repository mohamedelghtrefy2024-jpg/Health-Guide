import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function round2(n) { return Math.round(n * 100) / 100; }

let fixedCount = 0;
const log = [];

for (const f of all) {
  const sat = f.macros.saturated_fat_g || 0;
  const mono = f.macros.monounsaturated_fat_g || 0;
  const poly = f.macros.polyunsaturated_fat_g || 0;
  const sum = sat + mono + poly;
  const fat = f.macros.fat_g;
  if (sum <= fat * 1.15 + 0.3) continue; // not broken

  const factor = fat / sum;
  const newSat = round2(sat * factor);
  const newMono = round2(mono * factor);
  const newPoly = round2(poly * factor);

  const marker = `id: "${f.id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  let block = content.slice(blockStart, blockEnd);

  const oldPattern = `saturated_fat_g: ${sat}, monounsaturated_fat_g: ${mono}, polyunsaturated_fat_g: ${poly},`;
  const newPattern = `saturated_fat_g: ${newSat}, monounsaturated_fat_g: ${newMono}, polyunsaturated_fat_g: ${newPoly},`;

  if (!block.includes(oldPattern)) {
    log.push(`⚠️ فشل مطابقة: ${f.id} — ${oldPattern}`);
    continue;
  }
  block = block.replace(oldPattern, newPattern);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  fixedCount++;
  log.push(`✅ ${f.id} ${f.name_ar} [${f.category}]: sat ${sat}→${newSat}, mono ${mono}→${newMono}, poly ${poly}→${newPoly} (fat_g=${fat})`);
}

fs.writeFileSync(path, content);
console.log('إجمالي المُصحَّح:', fixedCount);
console.log(log.join('\n'));
