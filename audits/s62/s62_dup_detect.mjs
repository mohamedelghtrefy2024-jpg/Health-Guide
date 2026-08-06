import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const byName = {};
for (const f of all) {
  const key = f.name_ar.trim();
  if (!byName[key]) byName[key] = [];
  byName[key].push(f);
}
const dups = Object.entries(byName).filter(([k, v]) => v.length > 1);

let exactGroups = 0;
let exactItems = 0;
const toReview = [];

for (const [name, items] of dups) {
  // group by macro signature (full macros object)
  const bySig = {};
  for (const f of items) {
    const sig = JSON.stringify(f.macros);
    if (!bySig[sig]) bySig[sig] = [];
    bySig[sig].push(f);
  }
  for (const [sig, group] of Object.entries(bySig)) {
    if (group.length > 1) {
      exactGroups++;
      exactItems += group.length;
      toReview.push({ name, ids: group.map(f => f.id), category: group[0].category });
    }
  }
}
console.log('مجموعات متطابقة حرفيًا (نفس الاسم + نفس macros بالكامل):', exactGroups);
console.log('إجمالي الأصناف في المجموعات دي:', exactItems);
console.log('---');
toReview.forEach(g => console.log(`${g.name} [${g.category}]: ${g.ids.join(', ')}`));
