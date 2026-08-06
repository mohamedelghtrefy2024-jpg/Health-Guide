import fs from 'fs';

const plan = JSON.parse(fs.readFileSync('/tmp/s62_final_plan.json', 'utf8'));
const idsToDelete = new Set();
for (const g of plan) g.del.forEach(id => idsToDelete.add(id));

const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

let removedCount = 0;
const notFound = [];

for (const id of idsToDelete) {
  const marker = `    id: "${id}",`;
  const idx = content.indexOf(marker);
  if (idx === -1) { notFound.push(id); continue; }
  // find block start: the "  {\n" immediately preceding this id line
  const blockStart = content.lastIndexOf('  {\n', idx);
  if (blockStart === -1) { notFound.push(id); continue; }
  // find block end: the "  },\n" that closes this object, starting search after idx
  const blockEnd = content.indexOf('  },\n', idx);
  if (blockEnd === -1) { notFound.push(id); continue; }
  const endPos = blockEnd + '  },\n'.length;
  content = content.slice(0, blockStart) + content.slice(endPos);
  removedCount++;
}

console.log('اتحذف:', removedCount, '| مش لاقي:', notFound.length, notFound);
fs.writeFileSync(path, content);
