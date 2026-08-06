import fs from 'fs';
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('not found: ' + id);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd, text: content.slice(blockStart, blockEnd) };
}
function replaceInBlock(id, oldStr, newStr) {
  const { blockStart, blockEnd, text } = getBlock(id);
  if (!text.includes(oldStr)) throw new Error(`pattern not found in ${id}: ${oldStr}`);
  const newText = text.replace(oldStr, newStr);
  content = content.slice(0, blockStart) + newText + content.slice(blockEnd);
}

// sugar_g لا يمكن يتعدى carbs_g (- fiber_g) — قيم مفبركة ثابتة (12.9 / 9.21) اتحطت
// بغض النظر عن الكارب الحقيقي. التصحيح: sugar_g = carbs_g - fiber_g (كل كارب الألبان
// السايلة/الزبادي الصافي لاكتوز طبيعي، مفيش نشا).
const fixes = [
  ['food_4031', 'sugar_g: 12.9,', 'sugar_g: 4.7,'],
  ['food_4032', 'sugar_g: 5.88,', 'sugar_g: 5,'],
  ['food_4036', 'sugar_g: 54.4,', 'sugar_g: 26.67,'],
  ['food_4342', 'sugar_g: 6.67,', 'sugar_g: 5,'],
  ['food_4349', 'sugar_g: 12.9,', 'sugar_g: 5.33,'],
  ['food_4350', 'sugar_g: 12.9,', 'sugar_g: 6,'],
  ['food_4352', 'sugar_g: 12.9,', 'sugar_g: 6,'],
  ['food_4354', 'sugar_g: 12.9,', 'sugar_g: 5.34,'],
  ['food_4355', 'sugar_g: 12.9,', 'sugar_g: 10.67,'],
  ['food_4356', 'sugar_g: 12.9,', 'sugar_g: 5.67,'],
  ['food_4407', 'sugar_g: 9.21,', 'sugar_g: 4.17,'],
  ['food_4443', 'sugar_g: 9.21,', 'sugar_g: 2.5,'],
  ['food_4813', 'sugar_g: 12.9,', 'sugar_g: 4,'],
  ['food_4814', 'sugar_g: 12.9,', 'sugar_g: 5.33,'],
  ['food_4815', 'sugar_g: 12.9,', 'sugar_g: 4.67,'],
  ['food_4821', 'sugar_g: 9.21,', 'sugar_g: 4.17,'],
  ['food_4822', 'sugar_g: 9.21,', 'sugar_g: 2.5,'],
  ['food_5102', 'sugar_g: 12.9,', 'sugar_g: 4.7,'],
  // kcal لا يطابق الماكروز (بروتين×4+كارب×4+دهن×9 = 31.2، مش 49)
  ['food_5320', 'kcal: 49,', 'kcal: 31,'],
];
for (const [id, oldStr, newStr] of fixes) replaceInBlock(id, oldStr, newStr);

fs.writeFileSync(path, content);
console.log('تم تطبيق', fixes.length, 'تصحيح');
