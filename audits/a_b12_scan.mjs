import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const plantOnlyCats = ['vegetable', 'fruit', 'legume', 'carb', 'condiment'];
const suspects = all.filter(f => plantOnlyCats.includes(f.category) && f.ingredients.length === 0 && (f.micros.vitamin_b12_mcg > 0 || f.macros.cholesterol_mg > 0));
console.log('عدد الأصناف النباتية الخام (مكوّن واحد) بها B12 أو كوليسترول:', suspects.length);
suspects.forEach(f => console.log(`${f.id}\t${f.name_ar}\t[${f.category}]\tchol=${f.macros.cholesterol_mg}\tb12=${f.micros.vitamin_b12_mcg}`));
