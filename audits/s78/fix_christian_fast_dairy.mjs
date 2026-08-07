import fs from 'fs';

const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

const targetIds = [
  'food_3950', 'food_4017', 'food_4018', 'food_4019', 'food_4020', 'food_4021',
  'food_4022', 'food_4367', 'food_4368', 'food_4383', 'food_4384', 'food_4646', 'food_5101',
];

const oldTags = '["christian_fast_strict", "ramadan_iftar", "ramadan_suhoor"]';
const newTags = '["ramadan_iftar", "ramadan_suhoor"]';

let fixed = 0;
const failures = [];

for (const id of targetIds) {
  const idPattern = `id: "${id}",`;
  const idIdx = content.indexOf(idPattern);
  if (idIdx === -1) { failures.push([id, 'id not found']); continue; }

  const searchWindow = content.slice(idIdx, idIdx + 3000);
  const tagsMatch = searchWindow.match(/religious_tags:\s*\[[^\]]*\]/);
  if (!tagsMatch) { failures.push([id, 'religious_tags not found']); continue; }

  const foundRaw = tagsMatch[0];
  // طبّع الفواصل/المسافات للمقارنة
  const normalize = (s) => s.replace(/\s+/g, ' ').replace(/'/g, '"').trim();
  const expectedNormalized = normalize(`religious_tags: ${oldTags}`);
  if (normalize(foundRaw) !== expectedNormalized) {
    failures.push([id, 'unexpected current tags: ' + foundRaw]);
    continue;
  }

  const absoluteIdx = idIdx + tagsMatch.index;
  content = content.slice(0, absoluteIdx) + `religious_tags: ${newTags}` + content.slice(absoluteIdx + foundRaw.length);
  fixed++;
}

fs.writeFileSync(path, content, 'utf8');
console.log('تم تصحيح:', fixed, '/', targetIds.length);
if (failures.length) console.log('فشل:', failures);
