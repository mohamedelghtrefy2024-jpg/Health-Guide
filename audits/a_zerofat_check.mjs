import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const bad = all.filter((f) => {
  const sum = (f.macros.saturated_fat_g||0) + (f.macros.monounsaturated_fat_g||0) + (f.macros.polyunsaturated_fat_g||0);
  return f.macros.fat_g === 0 && sum > 0.02;
});
console.log('عدد الأصناف بـfat_g=0 بالضبط لكن مجموع الدهون الفرعية > 0:', bad.length);
bad.forEach(f => {
  const sum = (f.macros.saturated_fat_g||0) + (f.macros.monounsaturated_fat_g||0) + (f.macros.polyunsaturated_fat_g||0);
  console.log(`${f.id}\t${f.name_ar}\tsat=${f.macros.saturated_fat_g}\tmono=${f.macros.monounsaturated_fat_g}\tpoly=${f.macros.polyunsaturated_fat_g}\tsum=${sum.toFixed(2)}`);
});
