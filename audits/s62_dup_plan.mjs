import { getAllFoods } from '../core/food-library/food-library.js';
import fs from 'fs';
const all = getAllFoods();
const byName = {};
for (const f of all) {
  const key = f.name_ar.trim();
  if (!byName[key]) byName[key] = [];
  byName[key].push(f);
}
const dups = Object.entries(byName).filter(([k, v]) => v.length > 1);

const toDelete = [];
const plan = [];

for (const [name, items] of dups) {
  const bySig = {};
  for (const f of items) {
    const sig = JSON.stringify(f.macros);
    if (!bySig[sig]) bySig[sig] = [];
    bySig[sig].push(f);
  }
  for (const [sig, group] of Object.entries(bySig)) {
    if (group.length > 1) {
      // sort by numeric id, keep lowest
      const sorted = [...group].sort((a,b) => {
        const na = parseInt(a.id.replace('food_',''));
        const nb = parseInt(b.id.replace('food_',''));
        return na - nb;
      });
      const keep = sorted[0];
      const del = sorted.slice(1);
      plan.push({ name, category: keep.category, keep: keep.id, del: del.map(d=>d.id) });
      toDelete.push(...del.map(d=>d.id));
    }
  }
}

console.log('إجمالي المجموعات:', plan.length);
console.log('إجمالي الأصناف المطلوب حذفها:', toDelete.length);
fs.writeFileSync('/tmp/s62_todelete.json', JSON.stringify(toDelete, null, 2));
fs.writeFileSync('/tmp/s62_plan.json', JSON.stringify(plan, null, 2));
