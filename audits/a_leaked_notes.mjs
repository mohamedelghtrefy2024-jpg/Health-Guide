import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
// Find name_en fields containing Arabic characters (leaked notes)
const arabicRegex = /[\u0600-\u06FF]/;
const suspects = all.filter(f => f.name_en && arabicRegex.test(f.name_en));
console.log('عدد الأصناف اللي name_en فيها حروف عربية مسربة:', suspects.length);
suspects.forEach(f => console.log(`${f.id}\t${f.name_ar}\tname_en="${f.name_en}"\t[${f.category}]`));
