import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();

const checks = [
  { word: 'جمبري', allergen: 'shellfish' },{ word: 'روبيان', allergen: 'shellfish' },
  { word: 'استاكوزا', allergen: 'shellfish' },{ word: 'سلطعون', allergen: 'shellfish' },
  { word: 'كابوريا', allergen: 'shellfish' },{ word: 'محار', allergen: 'shellfish' },
  { word: 'بطلينوس', allergen: 'shellfish' },{ word: 'كاليماري', allergen: 'shellfish' },
  { word: 'حبار', allergen: 'shellfish' },{ word: 'قواقع', allergen: 'shellfish' },
  { word: 'جبن', allergen: 'lactose' },{ word: 'جبنة', allergen: 'lactose' },
  { word: 'زبادي', allergen: 'lactose' },{ word: 'قشطة', allergen: 'lactose' },
  { word: 'بشاميل', allergen: 'lactose' },{ word: 'لبنة', allergen: 'lactose' },
  { word: 'كريمة', allergen: 'lactose' },
  { word: 'لوز', allergen: 'nuts' },{ word: 'فستق', allergen: 'nuts' },
  { word: 'كاجو', allergen: 'nuts' },{ word: 'بندق', allergen: 'nuts' },
  { word: 'صنوبر', allergen: 'nuts' },
  { word: 'سمسم', allergen: 'sesame' },{ word: 'طحينة', allergen: 'sesame' },
  { word: 'طحينية', allergen: 'sesame' },
  { word: 'صويا', allergen: 'soy' },{ word: 'فول الصويا', allergen: 'soy' },
];

const seen = new Set();
let total = 0;
for (const {word, allergen} of checks) {
  for (const f of all) {
    if (f.category === 'composite_meal') continue; // اتفحصت بالفعل في S64
    const key = f.id + '|' + allergen;
    if (seen.has(key)) continue;
    if (f.name_ar.includes(word) && !(f.allergens||[]).includes(allergen)) {
      // استبعاد false positives معروفة (substring collisions)
      if (word==='لوز' && (f.name_ar.includes('الوز ') || f.name_ar.startsWith('لحم الوز'))) continue;
      if (word==='جبن' && f.name_ar.includes('الحمص')) continue;
      seen.add(key);
      console.log(f.id, f.name_ar, `[${f.category}]`, `| ناقص "${allergen}" (بسبب "${word}")`, '| allergens:', f.allergens);
      total++;
    }
  }
}
console.log('\nإجمالي المرشحين:', total);
