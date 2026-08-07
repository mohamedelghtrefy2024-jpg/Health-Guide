import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
for (const id of ['food_4077','food_4078','food_4378','food_4559','food_2954']) {
  const f = all.find(x=>x.id===id);
  console.log(f.id, f.name_ar, '| p:', f.macros.protein_g, '| c:', f.macros.carbs_g, '| f:', f.macros.fat_g, '| fiber:', f.macros.fiber_g, '| sum:', (f.macros.protein_g+f.macros.carbs_g+f.macros.fat_g).toFixed(1));
}
