import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const ids = process.argv.slice(2);
for (const id of ids) {
  const f = all.find(x => x.id === id);
  console.log(JSON.stringify(f, null, 2));
}
