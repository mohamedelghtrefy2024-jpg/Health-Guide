import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function round2(n) { return Math.round(n * 100) / 100; }

let fixedCount = 0;
const log = [];

for (const f of all) {
  const carbs = f.macros.carbs_g;
  const sugar = f.macros.sugar_g;
  const fiber = f.macros.fiber_g || 0;
  if (sugar <= carbs + 0.3) continue;

  const newSugar = Math.max(0, round2(carbs - fiber));

  const marker = `id: "${f.id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  let block = content.slice(blockStart, blockEnd);

  const oldPattern = `sugar_g: ${sugar},`;
  const newPattern = `sugar_g: ${newSugar},`;
  const count = block.split(oldPattern).length - 1;
  if (count !== 1) {
    log.push(`⚠️ فشل مطابقة (${count} تطابق): ${f.id} — ${oldPattern}`);
    continue;
  }
  block = block.replace(oldPattern, newPattern);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  fixedCount++;
  log.push(`✅ ${f.id} ${f.name_ar} [${f.category}]: sugar ${sugar}→${newSugar} (carbs=${carbs}, fiber=${fiber})`);
}

fs.writeFileSync(path, content);
console.log('إجمالي المُصحَّح:', fixedCount, '| إجمالي المفحوص:', all.filter(f=>f.macros.sugar_g > f.macros.carbs_g+0.3).length);
console.log(log.join('\n'));
