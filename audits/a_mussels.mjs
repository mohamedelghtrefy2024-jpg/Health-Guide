import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
['food_4632','food_4722','food_4724','food_4725','food_4732'].forEach(id=>{
  console.log(JSON.stringify(all.find(f=>f.id===id), null, 1));
});
