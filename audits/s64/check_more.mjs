import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
for (const id of ['food_3371','food_2922']) {
  const f = all.find(x=>x.id===id);
  console.log(JSON.stringify({id:f.id,name:f.name_ar,name_en:f.name_en,suitable:f.suitable_for_diets,unsuitable:f.unsuitable_for_diets,allergens:f.allergens}, null,2));
}
