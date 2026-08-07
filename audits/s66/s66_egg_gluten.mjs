import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();

console.log('=== egg ناقص (بيض بالاسم) ===');
let c1=0;
for (const f of all) {
  if (f.category === 'composite_meal') continue; // اتفحصت جزئيًا بالفعل
  if (f.name_ar.includes('بيض') && !f.name_ar.includes('بيضاء') && !f.name_ar.includes('بيضا') && !(f.allergens||[]).includes('egg')) {
    console.log(f.id, f.name_ar, `[${f.category}]`, '| allergens:', f.allergens);
    c1++;
  }
}
console.log('عدد:', c1);

console.log('\n=== gluten ناقص (قمح/دقيق/شعير/برغل/فريك بالاسم) ===');
const gluWords = ['دقيق القمح','قمح','شعير','برغل','فريك','مكرونة','معكرونة','خبز','عيش','توست'];
let c2=0;
for (const f of all) {
  if (f.category === 'composite_meal') continue;
  const hasGlu = gluWords.some(w=>f.name_ar.includes(w));
  if (hasGlu && !(f.allergens||[]).includes('gluten')) {
    console.log(f.id, f.name_ar, `[${f.category}]`, '| allergens:', f.allergens);
    c2++;
  }
}
console.log('عدد:', c2);
