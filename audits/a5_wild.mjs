import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const suspects = all.filter(f => (f.name_en && (f.name_en.includes('نبات بري') || f.name_en.includes('نبات صحراوي') || f.name_en.includes('Ephedra') || f.name_en.includes('harmala') || f.name_en.includes('Peganum'))));
suspects.forEach(f => console.log(`${f.id}\t${f.name_ar}\t${f.name_en}\t[${f.category}]`));
