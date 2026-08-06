// Group I: إزالة أصناف نباتات برية/غير غذائية بيانات غذائية مفبركة (نفس القالب حرفيًا)
// + تصحيح kcal لبن زبادي مخفوق ليطابق الماكروز المُعلنة
import fs from 'fs';
const DATA_PATH = new URL('../core/food-library/foods-data.js', import.meta.url);
let text = fs.readFileSync(DATA_PATH, 'utf8');

function getBlockBounds(id) {
  const marker = `id: "${id}",`;
  const start = text.indexOf(marker);
  if (start === -1) throw new Error('NOT FOUND: ' + id);
  const blockStart = text.lastIndexOf('  {\n', start);
  const blockEnd = text.indexOf('  },\n', start) + '  },\n'.length;
  return { blockStart, blockEnd };
}
function deleteBlock(id) {
  const { blockStart, blockEnd } = getBlockBounds(id);
  text = text.slice(0, blockStart) + text.slice(blockEnd);
}
function replaceInBlock(id, oldStr, newStr) {
  const { blockStart, blockEnd } = getBlockBounds(id);
  const block = text.slice(blockStart, blockEnd);
  if (!block.includes(oldStr)) throw new Error(`NOT FOUND in ${id}: ${oldStr}`);
  text = text.slice(0, blockStart) + block.replace(oldStr, newStr) + text.slice(blockEnd);
}

// حذف: عرقون (Ephedra - نبات منظَّم طبيًا/خطر قلبي)، حرمل (Peganum harmala - نبات سام/مؤثر نفسيًا)،
// ندوة (Centaurea - نبات بري مش غذاء)
// الثلاثة بنفس القالب الميكروي المفبرك بالحرف (sodium=15,potassium=400,calcium=200,magnesium=60,
// iron=8,zinc=1,selenium=1,vit_a=100,vit_c=10,vit_e=2,vit_k=100,phosphorus=60) — دليل إنها بيانات
// غير حقيقية، بالإضافة لكونها نباتات مش غذائية أصلًا (خطر سلامة لو ظهرت في خطة أكل).
deleteBlock('food_4585'); // عرقون / Ephedra
deleteBlock('food_4587'); // حرمل / Peganum harmala
deleteBlock('food_4592'); // ندوة / Centaurea

// لبن زبادي مخفوق: kcal=98 لا يطابق الماكروز (protein 3.5*4 + carbs 4.7*4 + fat 3.3*9 ≈ 63)
replaceInBlock('food_5421', 'kcal: 98,', 'kcal: 63,');

fs.writeFileSync(DATA_PATH, text, 'utf8');
console.log('تم حذف 3 أصناف نباتات غير غذائية/خطرة، وتصحيح kcal لبن زبادي مخفوق');
