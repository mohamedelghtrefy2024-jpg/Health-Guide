import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const cm = all.filter(f => f.category === 'composite_meal');

const checks = [
  { word: 'جمبري', allergen: 'shellfish' },
  { word: 'روبيان', allergen: 'shellfish' },
  { word: 'استاكوزا', allergen: 'shellfish' },
  { word: 'سلطعون', allergen: 'shellfish' },
  { word: 'كابوريا', allergen: 'shellfish' },
  { word: 'محار', allergen: 'shellfish' },
  { word: 'بطلينوس', allergen: 'shellfish' },
  { word: 'كاليماري', allergen: 'shellfish' },
  { word: 'حبار', allergen: 'shellfish' },
  { word: 'جبن', allergen: 'lactose' },
  { word: 'جبنة', allergen: 'lactose' },
  { word: 'زبادي', allergen: 'lactose' },
  { word: 'قشطة', allergen: 'lactose' },
  { word: 'بشاميل', allergen: 'lactose' },
  { word: 'لوز', allergen: 'nuts' },
  { word: 'جوز', allergen: 'nuts' },
  { word: 'فستق', allergen: 'nuts' },
  { word: 'كاجو', allergen: 'nuts' },
  { word: 'بندق', allergen: 'nuts' },
  { word: 'سمسم', allergen: 'sesame' },
  { word: 'طحينة', allergen: 'sesame' },
];

let total = 0;
for (const {word, allergen} of checks) {
  for (const f of cm) {
    if (f.name_ar.includes(word) && !(f.allergens||[]).includes(allergen)) {
      console.log(f.id, f.name_ar, `| ناقص "${allergen}" (بسبب "${word}") | allergens حاليًا:`, f.allergens);
      total++;
    }
  }
}
console.log('\nإجمالي المرشحين:', total);
