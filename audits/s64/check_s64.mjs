import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
for (const id of ['food_4568','food_4588','food_4381','food_4382']) {
  const f = all.find(x=>x.id===id);
  console.log(JSON.stringify({id:f.id,name:f.name_ar,name_en:f.name_en,suitable:f.suitable_for_diets,unsuitable:f.unsuitable_for_diets,allergens:f.allergens,carbs:f.macros.carbs_g,protein:f.macros.protein_g,fat:f.macros.fat_g}, null,2));
}
