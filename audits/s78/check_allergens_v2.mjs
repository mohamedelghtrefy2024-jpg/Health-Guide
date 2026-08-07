import { getAllFoods } from '../../core/food-library/food-library.js';

const all = getAllFoods();

const checks = {
  gluten: {
    include: ['قمح', 'شعير', 'فريك', 'برغل', 'سميد', 'دقيق قمح', 'دقيق أبيض', 'دقيق أسمر', 'دقيق الأسمر', 'دقيق كامل', 'دقيق الكامل', 'خبز', 'عيش', 'مكرونة', 'شعرية', 'بسكويت', 'كسكس'],
    exclude: [],
  },
  lactose: {
    include: ['لبن', 'جبن', 'زبادي', 'قشطة', 'زبدة', 'قريش', 'موزاريلا', 'شيدر', 'فيتا', 'حليب'],
    exclude: ['زبدة الفول السوداني', 'زبدة لوز', 'زبدة نباتية', 'حليب جوز الهند', 'حليب لوز', 'حليب اللوز', 'حليب الصويا', 'حليب الشوفان', 'زبادي نباتي', 'زبادي الصويا', 'قشطة جوز الهند'],
  },
};

for (const [allergen, { include, exclude }] of Object.entries(checks)) {
  const results = [];
  for (const f of all) {
    const matchedWord = include.find(w => f.name_ar.includes(w));
    if (!matchedWord) continue;
    if (exclude.some(w => f.name_ar.includes(w))) continue;
    if ((f.allergens || []).includes(allergen)) continue;
    results.push({ id: f.id, name: f.name_ar, cat: f.category, matched: matchedWord, allergens: f.allergens });
  }
  console.log(`\n=== ${allergen} === ناقصين: ${results.length}`);
  results.forEach(r => console.log(' ', r.id, r.name, '| matched:', r.matched, '| cat:', r.cat, '| allergens:', JSON.stringify(r.allergens)));
}
