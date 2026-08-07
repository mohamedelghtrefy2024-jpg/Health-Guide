import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();

console.log('=== egg ناقص (بيض حقيقي بالاسم، مش أبيض) ===');
let c1=0;
for (const f of all) {
  if (f.category === 'composite_meal') continue;
  const name = f.name_ar;
  const hasEggWord = (name.includes('بيض') && !name.includes('أبيض') && !name.includes('بيضاء') && !name.includes('بيضا')) || name.includes('عجة') || name.includes('أومليت');
  if (hasEggWord && !(f.allergens||[]).includes('egg')) {
    console.log(f.id, f.name_ar, `[${f.category}]`, '| allergens:', f.allergens);
    c1++;
  }
}
console.log('عدد:', c1);
