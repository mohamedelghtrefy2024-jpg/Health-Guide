import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();

// Plant categories that should never have cholesterol (cholesterol only in animal products)
const plantCategories = ['vegetable', 'fruit', 'legume', 'carb', 'nut_seed', 'condiment', 'sweet_dessert', 'fat_oil', 'beverage'];
const suspects = all.filter(f => plantCategories.includes(f.category) && f.macros.cholesterol_mg > 0);
console.log('عدد الأصناف من فئات نباتية بها كوليسترول > 0:', suspects.length);
suspects.forEach(f => console.log(`${f.id}\t${f.name_ar}\t[${f.category}]\tcholesterol=${f.macros.cholesterol_mg}\tb12=${f.micros.vitamin_b12_mcg}`));
