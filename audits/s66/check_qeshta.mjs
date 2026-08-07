import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const f = all.find(x=>x.id==='food_3783');
console.log(JSON.stringify({id:f.id,name:f.name_ar,name_en:f.name_en,category:f.category}, null,2));
