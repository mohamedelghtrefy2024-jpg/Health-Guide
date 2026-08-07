import fs from 'fs';
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd };
}
function replaceInBlock(id, oldStr, newStr) {
  const { blockStart, blockEnd } = getBlock(id);
  let block = content.slice(blockStart, blockEnd);
  if (!block.includes(oldStr)) { console.log('⚠️ فشل:', id, oldStr); return; }
  block = block.replace(oldStr, newStr);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅', id);
}

// مكاديميا (محمصة/مملحة): fat 80→78.3 (تقارب أدق مع USDA: بروتين 7.8/كارب
// 13.8/دهن 75.8 = مجموع 97.4، وقيمنا الحالية أقرب بس الدهن مبالَغ فيه شوية)
replaceInBlock('food_4077', 'fat_g: 80,', 'fat_g: 78.3,');
replaceInBlock('food_4078', 'fat_g: 80,', 'fat_g: 78.3,');

// كلوريلا: تحجيم نسبي عشان المجموع = 100 (بروتين50/كارب40/دهن15 → ×0.952)
replaceInBlock('food_4378', 'protein_g: 50, carbs_g: 40, fat_g: 15,', 'protein_g: 47.6, carbs_g: 38.1, fat_g: 14.3,');

// دقة بالمكسرات: نفس المنطق (بروتين25/كارب30/دهن50 → ×0.952)
replaceInBlock('food_4559', 'protein_g: 25, carbs_g: 30, fat_g: 50,', 'protein_g: 23.8, carbs_g: 28.6, fat_g: 47.6,');

// حبة سوداء: fiber (37) لازم ما يتعداش carbs. المراجع الحقيقية (Healthline/
// snapcalorie) بتذكر ~44g كارب كلي للحبة السوداء — نستخدمها بدل الرقم
// المستحيل الحالي (35 < fiber 37)
replaceInBlock('food_2954', 'carbs_g: 35,', 'carbs_g: 44,');

fs.writeFileSync(path, content);
console.log('تم');
