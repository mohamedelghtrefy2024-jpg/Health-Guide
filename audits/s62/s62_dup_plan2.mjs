import { getAllFoods } from '../core/food-library/food-library.js';
import fs from 'fs';
import { execSync } from 'child_process';

const all = getAllFoods();
const byName = {};
for (const f of all) {
  const key = f.name_ar.trim();
  if (!byName[key]) byName[key] = [];
  byName[key].push(f);
}
const dups = Object.entries(byName).filter(([k, v]) => v.length > 1);

const groups = [];
for (const [name, items] of dups) {
  const bySig = {};
  for (const f of items) {
    const sig = JSON.stringify(f.macros);
    if (!bySig[sig]) bySig[sig] = [];
    bySig[sig].push(f);
  }
  for (const [sig, group] of Object.entries(bySig)) {
    if (group.length > 1) groups.push({ name, category: group[0].category, ids: group.map(g=>g.id) });
  }
}

function isReferencedInCode(id) {
  try {
    const out = execSync(`grep -rl "${id}\\b" --include="*.js" --include="*.mjs" . --exclude-dir=node_modules --exclude-dir=audits`, {encoding:'utf8'});
    const files = out.trim().split('\n').filter(Boolean).filter(f => !f.includes('foods-data.js'));
    return files.length > 0 ? files : null;
  } catch(e) { return null; }
}

const finalPlan = [];
const skipped = [];
for (const g of groups) {
  const refFlags = g.ids.map(id => ({ id, refs: isReferencedInCode(id) }));
  const anyRef = refFlags.some(r => r.refs);
  if (anyRef) {
    skipped.push({ ...g, refFlags });
    continue;
  }
  const sorted = [...g.ids].sort((a,b) => parseInt(a.replace('food_','')) - parseInt(b.replace('food_','')));
  finalPlan.push({ name: g.name, category: g.category, keep: sorted[0], del: sorted.slice(1) });
}

const totalDel = finalPlan.reduce((s,g)=>s+g.del.length,0);
console.log('مجموعات جاهزة للحذف الآمن:', finalPlan.length, '| أصناف هتتحذف:', totalDel);
console.log('مجموعات مُستبعدة لوجود مراجع في كود فعلي:', skipped.length);
skipped.forEach(s => console.log('  -', s.name, s.ids, s.refFlags.filter(r=>r.refs).map(r=>`${r.id}:${r.refs.join(',')}`)));

fs.writeFileSync('/tmp/s62_final_plan.json', JSON.stringify(finalPlan, null, 2));
