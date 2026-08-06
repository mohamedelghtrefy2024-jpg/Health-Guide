import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const ids = ['food_4615','food_4713','food_5335','food_5459'];
for (const id of ids) {
  const f = all.find(x=>x.id===id);
  console.log(f.id, f.name_ar, '| suitable:', f.suitable_for_diets, '| unsuitable:', f.unsuitable_for_diets);
}
