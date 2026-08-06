import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const exact = all.filter(f => f.macros.cholesterol_mg === 25 && f.micros.vitamin_b12_mcg === 0.3);
console.log('عدد الأصناف بنفس القيمة الافتراضية المشبوهة (chol=25,b12=0.3) بالضبط:', exact.length);
const byCat = {};
exact.forEach(f => { byCat[f.category] = (byCat[f.category]||0)+1; });
console.log(byCat);
exact.slice(0,80).forEach(f => console.log(`${f.id}\t${f.name_ar}\t[${f.category}]`));
