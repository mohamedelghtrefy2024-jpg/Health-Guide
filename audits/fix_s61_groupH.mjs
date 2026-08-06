// S61 (تكملة) — Group H: fat_g=0 لكن مجموع الدهون الفرعية (مشبعة+أحادية+متعددة) > 0
// ده مستحيل رياضيًا (أجزاء أكبر من الكل=صفر) — نصحّح الفرعيات لصفر لتطابق
// الإجمالي المُثبَت أصلاً (مش اختراع قيمة جديدة، تصحيح تناسق داخلي فقط).
import fs from 'fs';
import { getAllFoods } from '../core/food-library/food-library.js';

const DATA_PATH = new URL('../core/food-library/foods-data.js', import.meta.url);
let text = fs.readFileSync(DATA_PATH, 'utf8');
const all = getAllFoods();

function getBlockBounds(id) {
  const marker = `id: "${id}",`;
  const start = text.indexOf(marker);
  if (start === -1) throw new Error('NOT FOUND: ' + id);
  const blockStart = text.lastIndexOf('  {\n', start);
  const blockEnd = text.indexOf('  },\n', start) + '  },\n'.length;
  return { blockStart, blockEnd };
}

function replaceInBlock(id, oldStr, newStr) {
  const { blockStart, blockEnd } = getBlockBounds(id);
  const block = text.slice(blockStart, blockEnd);
  if (!block.includes(oldStr)) {
    throw new Error(`OLD STRING NOT FOUND in ${id}: ${oldStr}\n  macros line: ${block.split('\n').find(l=>l.includes('macros:'))}`);
  }
  const count = block.split(oldStr).length - 1;
  if (count > 1) throw new Error(`NOT UNIQUE in ${id} (${count}x): ${oldStr}`);
  text = text.slice(0, blockStart) + block.replace(oldStr, newStr) + text.slice(blockEnd);
}

const targets = all.filter((f) => {
  const sum = (f.macros.saturated_fat_g||0) + (f.macros.monounsaturated_fat_g||0) + (f.macros.polyunsaturated_fat_g||0);
  return f.macros.fat_g === 0 && sum > 0.02;
});
console.log(`Group H (fat_g=0 لكن فرعياته > 0): ${targets.length} عنصر`);

const fixed = [];
for (const f of targets) {
  const { saturated_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g } = f.macros;
  // نبني السطر القديم بالظبط بنفس تنسيق التوليد (نفس عدد الأرقام كما exportتها JS)
  const oldSat = `saturated_fat_g: ${saturated_fat_g}, monounsaturated_fat_g: ${monounsaturated_fat_g}, polyunsaturated_fat_g: ${polyunsaturated_fat_g},`;
  const newSat = `saturated_fat_g: 0, monounsaturated_fat_g: 0, polyunsaturated_fat_g: 0,`;
  replaceInBlock(f.id, oldSat, newSat);
  fixed.push(f.id);
}

fs.writeFileSync(DATA_PATH, text, 'utf8');
console.log('تم تصحيح:', fixed.length);
fs.writeFileSync(new URL('./s61_groupH_summary.json', import.meta.url), JSON.stringify(fixed, null, 2));
