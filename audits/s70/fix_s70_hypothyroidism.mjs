import fs from 'fs';
import { getAllFoods } from '../../core/food-library/food-library.js';

const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');
const all = getAllFoods();

function arrToJs(arr) { return arr.length===0 ? '[]' : '[' + arr.map(x=>`"${x}"`).join(', ') + ']'; }
function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('not found: '+id);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd };
}

// نطاق S70: خضروات صليبية خام فقط (processing_level='unprocessed') + منتجات
// الصويا (أي مستوى معالجة). النطاق ده مقصود وأضيق من "كل صنف فيه كلمة كرنب/
// لفت/إلخ" — الأطباق المطبوخة (طواجن، سلطات مطبوخة، محشي) مستبعدة عمدًا لأن
// الطهي بيقلل المركبات الجويترجينية (goitrogens) بدرجة كبيرة سريريًا،
// فالتصنيف كـ"غير مناسب" ليها غير مبرَّر بنفس قوة الصنف الخام.
const CRUCIFEROUS_TOKENS = ['كرنب', 'ملفوف', 'بروكلي', 'قرنبيط', 'لفت', 'فجل'];
const SOY_TOKENS = ['صويا', 'توفو', 'تمبيه', 'تيمبه'];

function tokenize(text) { return text.split(/[\s()،,.\-]+/).filter(Boolean); }

const targets = [];
for (const f of all) {
  const name = f.name_ar || '';
  const ing = (f.ingredients || []).join(' ');
  const tokens = tokenize(name + ' ' + ing);
  const isOatsFalsePositive = name.includes('شوفان'); // "شوفان ملفوف" = rolled oats، مش كرنب
  const hasCruciferous = tokens.some((t) => CRUCIFEROUS_TOKENS.includes(t)) && !isOatsFalsePositive;
  const hasSoy = tokens.some((t) => SOY_TOKENS.includes(t));

  if (hasSoy) {
    targets.push({ food: f, reason: 'soy' });
  } else if (hasCruciferous && f.processing_level === 'unprocessed') {
    targets.push({ food: f, reason: 'raw_cruciferous' });
  }
}

console.log('Total candidates (raw cruciferous + soy):', targets.length);

let fixed = 0, skipped = 0;
for (const { food: f, reason } of targets) {
  const old = f.unsuitable_for_conditions || [];
  if (old.includes('hypothyroidism')) { skipped++; continue; }
  const updated = [...old, 'hypothyroidism'];
  const { blockStart, blockEnd } = getBlock(f.id);
  let block = content.slice(blockStart, blockEnd);
  const oldLine = `unsuitable_for_conditions: ${arrToJs(old)},`;
  const newLine = `unsuitable_for_conditions: ${arrToJs(updated)},`;
  if (!block.includes(oldLine)) { console.log('⚠️ FAILED match:', f.id, f.name_ar); continue; }
  block = block.replace(oldLine, newLine);
  content = content.slice(0, blockStart) + block + content.slice(blockEnd);
  fixed++;
  console.log(`+ ${reason}: ${f.id} ${f.name_ar}`);
}
console.log('Fixed (hypothyroidism added):', fixed, '| already had it:', skipped);

fs.writeFileSync(path, content);
console.log('Done — file written.');
