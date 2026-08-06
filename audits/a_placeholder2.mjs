import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const exact = all.filter(f => f.macros.cholesterol_mg === 25 && f.micros.vitamin_b12_mcg === 0.3);
// Check how many have non-empty ingredients (real recipes) vs empty (raw single items)
const withIngredients = exact.filter(f => f.ingredients && f.ingredients.length > 0);
const withoutIngredients = exact.filter(f => !f.ingredients || f.ingredients.length === 0);
console.log('عدد لهم ingredients (وصفة فعلية):', withIngredients.length);
console.log('عدد بدون ingredients (مكوّن خام واحد):', withoutIngredients.length);
console.log('--- نماذج بها ingredients ---');
withIngredients.slice(0,10).forEach(f => console.log(`${f.id}\t${f.name_ar}\tingredients=${JSON.stringify(f.ingredients)}`));
