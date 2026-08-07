import fs from 'fs';

const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

const targetIds = [
  'food_3997', 'food_4046', 'food_4047', 'food_4048', 'food_4049', 'food_4050',
  'food_4082', 'food_4083', 'food_4084', 'food_4786', 'food_4796',
  'food_5107', 'food_5108', 'food_5399',
];

let fixed = 0;
let notFound = [];

for (const id of targetIds) {
  // Find the object block for this id: from `id: "food_XXXX"` to the next `allergens: [...]`
  const idPattern = `id: "${id}",`;
  const idIdx = content.indexOf(idPattern);
  if (idIdx === -1) { notFound.push(id); continue; }

  // Find the "allergens: [...]" segment following this id within a reasonable window
  const searchWindow = content.slice(idIdx, idIdx + 3000);
  const allergensMatch = searchWindow.match(/allergens:\s*\[([^\]]*)\]/);
  if (!allergensMatch) { notFound.push(id + ' (no allergens field found)'); continue; }

  const currentAllergensRaw = allergensMatch[1].trim();
  if (currentAllergensRaw.includes("'nuts'") || currentAllergensRaw.includes('"nuts"')) {
    continue; // already tagged, skip
  }

  const oldSegment = allergensMatch[0];
  const newInner = currentAllergensRaw.length > 0 ? `"nuts", ${currentAllergensRaw}` : `"nuts"`;
  const newSegment = `allergens: [${newInner}]`;

  const absoluteIdx = idIdx + allergensMatch.index;
  content = content.slice(0, absoluteIdx) + newSegment + content.slice(absoluteIdx + oldSegment.length);
  fixed++;
}

fs.writeFileSync(path, content, 'utf8');
console.log('تم تصحيح:', fixed, 'صنف');
if (notFound.length) console.log('لم يتم إيجادهم:', notFound);
