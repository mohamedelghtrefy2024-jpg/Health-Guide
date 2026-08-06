import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
// Find all condiment/spice items sharing cholesterol=25, b12=0.3 pattern (or close variants)
const suspects = all.filter(f => f.category === 'condiment' && f.macros.cholesterol_mg > 0);
console.log('عدد التوابل/الكوندمنت بكوليسترول > 0:', suspects.length);
suspects.forEach(f => console.log(`${f.id}\t${f.name_ar}\tchol=${f.macros.cholesterol_mg}\tb12=${f.micros.vitamin_b12_mcg}\tingredients=${JSON.stringify(f.ingredients)}`));
