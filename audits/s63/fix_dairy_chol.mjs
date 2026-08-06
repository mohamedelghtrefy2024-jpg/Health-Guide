import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
import fs from 'fs';

const RATIO = 3.5; // mg كوليسترول لكل جرام دهن ألبان (مستنتج من بيانات USDA: موزاريلا 22g دهن≈78mg، زبادي كامل الدسم chobani ~7g دهن≈18mg)

const fixes = [
  ['food_4031', 3.3],  // زبادي بلدي
  ['food_4342', 2.08], // لبن بقري قليل الدسم
  ['food_4349', 3.33], // زبادي بلدي كامل الدسم
  ['food_4352', 2.67], // زبادي بروبيوتيك
  ['food_4442', 11],   // لبنة بالزعتر
  ['food_4813', 4.67], // لبن زبادي ماعز عضوي
  ['food_4814', 6.67], // لبن زبادي جاموسي عضوي
  ['food_4815', 8],    // لبن زبادي غنم عضوي
  ['food_5102', 3.3],  // زبادي كامل الدسم
  ['food_4367', 22],   // جبن موزاريلا طازجة
  ['food_4368', 24],   // جبن موزاريلا مبشورة
  ['food_4646', 22],   // جبنة موزاريلا جاموسي
];

const all = getAllFoods();
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

for (const [id, fat] of fixes) {
  const f = all.find(x => x.id === id);
  const newChol = Math.round(fat * RATIO);
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  let block = content.slice(blockStart, blockEnd);
  const oldStr = 'cholesterol_mg: 0,';
  if (!block.includes(oldStr)) { console.log('⚠️ فشل:', id); continue; }
  block = block.replace(oldStr, `cholesterol_mg: ${newChol},`);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  console.log('✅', id, f.name_ar, '| fat:', fat, '→ cholesterol:', newChol, 'mg');
}
fs.writeFileSync(path, content);
