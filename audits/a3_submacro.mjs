import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const bad = all.filter((f) => {
  const sum = (f.macros.saturated_fat_g||0) + (f.macros.monounsaturated_fat_g||0) + (f.macros.polyunsaturated_fat_g||0);
  return sum > f.macros.fat_g * 1.15;
});
console.log('عدد الأصناف اللي مجموع دهونها الفرعية أكبر من الإجمالي:', bad.length);
bad.forEach((f) => console.log(f.id, f.name_ar, '| fat_g:', f.macros.fat_g, '| sum sub:', (f.macros.saturated_fat_g + f.macros.monounsaturated_fat_g + f.macros.polyunsaturated_fat_g).toFixed(2)));
