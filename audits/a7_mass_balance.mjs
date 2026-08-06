import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
// مستحيل فيزيائيًا: مجموع الماكروز (بروتين+كارب+دهن+فايبر) أكبر من الكتلة الكلية (reference_amount_g)
const bad = all.filter(f => {
  const sum = f.macros.protein_g + f.macros.carbs_g + f.macros.fat_g + (f.macros.fiber_g||0)*0; // fiber included in carbs usually
  const sumNoFiberDouble = f.macros.protein_g + f.macros.carbs_g + f.macros.fat_g;
  return sumNoFiberDouble > f.reference_amount_g * 1.05;
});
console.log('عدد الأصناف بمجموع ماكروز أكبر من الكتلة الكلية:', bad.length);
bad.forEach(f => console.log(`${f.id}\t${f.name_ar}\t[${f.category}]\tref=${f.reference_amount_g}\tprotein=${f.macros.protein_g}\tcarbs=${f.macros.carbs_g}\tfat=${f.macros.fat_g}\tsum=${(f.macros.protein_g+f.macros.carbs_g+f.macros.fat_g).toFixed(1)}`));
