import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
// نفس القالب الميكروي المفبرك بالحرف اللي لقيناه (sodium=15,potassium=400,calcium=200,
// magnesium=60,iron=8,zinc=1,selenium=1,vit_a=100,vit_c=10,vit_e=2,vit_k=100,phosphorus=60)
const suspects = all.filter(f =>
  f.micros.sodium_mg === 15 && f.micros.potassium_mg === 400 && f.micros.calcium_mg === 200 &&
  f.micros.magnesium_mg === 60 && f.micros.iron_mg === 8 && f.micros.zinc_mg === 1 &&
  f.micros.selenium_mcg === 1 && f.micros.vitamin_a_mcg === 100 && f.micros.vitamin_c_mg === 10 &&
  f.micros.vitamin_e_mg === 2 && f.micros.vitamin_k_mcg === 100 && f.micros.phosphorus_mg === 60
);
console.log('عدد الأصناف بنفس القالب الميكروي المفبرك بالحرف:', suspects.length);
suspects.forEach(f => console.log(`${f.id}\t${f.name_ar}\t${f.name_en}\t[${f.category}]\tkcal=${f.macros.kcal}`));
