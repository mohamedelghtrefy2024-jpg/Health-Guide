import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const sweets = all.filter(f => f.category === 'sweet_dessert');
console.log('عدد أصناف sweet_dessert:', sweets.length);
for (const f of sweets) {
  const m = f.macros;
  console.log(`${f.id}\t${f.name_ar}\tkcal=${m.kcal}\tprot=${m.protein_g}\tcarb=${m.carbs_g}\tfat=${m.fat_g}\tsugar=${m.sugar_g}\tfiber=${m.fiber_g}\tdiets_s=${(f.suitable_for_diets||[]).join(',')}\tdiets_u=${(f.unsuitable_for_diets||[]).join(',')}`);
}
