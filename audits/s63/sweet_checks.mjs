import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const sweets = all.filter(f => f.category === 'sweet_dessert');

console.log('=== sugar_g منخفض جدًا (< 20% من carbs) لصنف اسمه حلو صراحة ===');
for (const f of sweets) {
  if (f.macros.carbs_g > 10 && f.macros.sugar_g < f.macros.carbs_g * 0.2) {
    console.log(f.id, f.name_ar, '| carbs:', f.macros.carbs_g, '| sugar:', f.macros.sugar_g);
  }
}

console.log('\n=== Atwater kcal mismatch >20% ===');
for (const f of sweets) {
  const m = f.macros;
  const computed = m.protein_g*4 + m.carbs_g*4 + m.fat_g*9;
  if (m.kcal === 0) continue;
  const diff = Math.abs(computed-m.kcal)/m.kcal;
  if (diff > 0.2) console.log(f.id, f.name_ar, '| kcal:', m.kcal, '| computed:', computed.toFixed(1), '| diff%:', (diff*100).toFixed(0));
}

console.log('\n=== أصناف بلا allergens بالمرة رغم احتوائها مكونات شائعة (مكسرات/شوفان/سمسم) بالاسم ===');
const nutWords = ['لوز','جوز','فستق','كاجو','بندق','صنوبر'];
const gluWords = ['شوفان','قمح','دقيق'];
const sesWords = ['طحين','سمسم','طحينية'];
for (const f of sweets) {
  const allergens = f.allergens || [];
  const hasNutWord = nutWords.some(w=>f.name_ar.includes(w));
  const hasGluWord = gluWords.some(w=>f.name_ar.includes(w));
  const hasSesWord = sesWords.some(w=>f.name_ar.includes(w));
  if ((hasNutWord && !allergens.includes('nuts')) || (hasGluWord && !allergens.includes('gluten')) || (hasSesWord && !allergens.includes('sesame'))) {
    console.log(f.id, f.name_ar, '| allergens:', allergens);
  }
}
