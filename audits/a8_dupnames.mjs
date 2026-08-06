import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const byName = {};
for (const f of all) {
  const key = f.name_ar.trim();
  if (!byName[key]) byName[key] = [];
  byName[key].push(f);
}
const dups = Object.entries(byName).filter(([k, v]) => v.length > 1);
console.log('عدد الأسماء المكررة تمامًا:', dups.length);
for (const [name, items] of dups) {
  console.log(`--- ${name} (${items.length}) ---`);
  items.forEach(f => console.log(`  ${f.id}\t[${f.category}]\tkcal=${f.macros.kcal}\tprotein=${f.macros.protein_g}\tcarbs=${f.macros.carbs_g}\tfat=${f.macros.fat_g}`));
}
