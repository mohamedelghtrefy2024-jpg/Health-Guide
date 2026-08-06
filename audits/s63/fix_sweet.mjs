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

// سكر نبات (rock candy sugar): سكروز نقي شبه بلوري، لازم يكون قريب من باقي
// أنواع السكر النقي في نفس المكتبة (97-99.2) مش 0.8
replaceInBlock('food_4552', 'sugar_g: 0.8,', 'sugar_g: 99.2,');

// حلاوة طحينية عادية (food_5446): sugar=0 غير منطقي لصنف حلاوة طحينية —
// كل الأصناف الشقيقة (دايت/كاكاو/تمر) نسبة السكر فيهم للكارب ~80-95%،
// المتوسط ~85% × carb=28 → sugar≈23.8
replaceInBlock('food_5446', 'sugar_g: 0,', 'sugar_g: 23.8,');

// مافن التمر والجوز (food_4777): جوز = مكسرات — allergen ناقص، كل الأصناف
// الشقيقة اللي فيها مكسرات بالاسم (لوز/جوز الهند) معلَّمة nuts بالفعل
replaceInBlock('food_4777', 'allergens: [],', 'allergens: ["nuts"],');

fs.writeFileSync(path, content);
console.log('تم تطبيق 3 تصحيحات على sweet_dessert');
