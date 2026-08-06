import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
console.log(JSON.stringify(all.find(f=>f.id==='food_2862'),null,1));
console.log('---3378 vs 5082---');
console.log(JSON.stringify(all.find(f=>f.id==='food_3378'),null,1));
console.log(JSON.stringify(all.find(f=>f.id==='food_5082'),null,1));
