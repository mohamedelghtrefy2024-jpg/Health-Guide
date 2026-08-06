// Group J: إزالة نباتات سامة/مؤثرة هرمونيًا مصنَّفة "توابل" بلا أي تحذير، وحذف
// نسخة زوفا المكرَّرة والمستحيلة فيزيائيًا (بروتين+كارب+دهن = 210غ من أصل 100غ)
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

// شيح (Artemisia/wormwood) — يحتوي الثوجون العصبي السمّي، مش غذاء عادي
deleteBlock('food_5174');
// قدح (Teucrium/Germander) — نبات موثَّق طبيًا بتسممه للكبد (hepatotoxic)
deleteBlock('food_5175');
// عشرق (Sodom Apple/Calotropis procera) — نبات سام غير صالح للأكل أصلًا
deleteBlock('food_5182');
// كف مريم (Vitex agnus-castus) — عشب مؤثر هرمونيًا (طبي)، غير مناسب كـ"توابل" غذاء عادي
deleteBlock('food_4594');
// زوفا (food_5171) — نسخة مكررة من food_4591 وبيانات مستحيلة فيزيائيًا (210غ ماكروز من أصل 100غ)
deleteBlock('food_5171');

fs.writeFileSync(DATA_PATH, text, 'utf8');
console.log('تم حذف 5 أصناف (نباتات سامة/طبية غير مناسبة + نسخة مستحيلة فيزيائيًا)');
