import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
console.log('=== fish ناقص ===');
const fishWords = ['سمك','تونة','سلمون','بلطي','بوري','دنيس','قاروص','ماكريل','سردين','رنجة','هامور'];
let c=0;
for (const f of all) {
  if (f.category === 'composite_meal') continue;
  const hasFish = fishWords.some(w=>f.name_ar.includes(w));
  if (hasFish && !(f.allergens||[]).includes('fish')) {
    console.log(f.id, f.name_ar, `[${f.category}]`, '| allergens:', f.allergens);
    c++;
  }
}
console.log('عدد:', c);
