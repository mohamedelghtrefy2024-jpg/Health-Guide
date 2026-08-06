import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const dairy = all.filter(f => f.category === 'dairy');
for (const f of dairy) {
  console.log(f.id, f.name_ar, '| fat:', f.macros.fat_g, '| chol:', f.macros.cholesterol_mg);
}
