import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const f = all.find(x=>x.id==='food_3950');
console.log(JSON.stringify(f, null, 2));
