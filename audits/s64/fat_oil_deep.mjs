import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const items = all.filter(f => f.category === 'fat_oil');
console.log('عدد:', items.length);

console.log('\n=== زيوت نباتية بحتة (اسمها زيت + نبات) لكن عندها كوليسترول > 0 ===');
const animalFatWords = ['زبدة','سمن','دهن','شحم','كبد الحوت','كبد سمك'];
for (const f of items) {
  const isAnimal = animalFatWords.some(w=>f.name_ar.includes(w));
  if (isAnimal) continue;
  if ((f.macros.cholesterol_mg||0) > 0) console.log(f.id, f.name_ar, f.macros.cholesterol_mg);
}

console.log('\n=== دهون حيوانية (زبدة/سمن/دهن/شحم) لكن مُعلَّمة vegan في suitable ===');
for (const f of items) {
  const isAnimal = animalFatWords.some(w=>f.name_ar.includes(w));
  if (!isAnimal) continue;
  const s = f.suitable_for_diets||[];
  if (s.includes('vegan')) console.log(f.id, f.name_ar, s);
}

console.log('\n=== زيوت نباتية بحتة معلَّمة unsuitable لـvegan (تناقض عكسي) ===');
const plantOilWords = ['زيت زيتون','زيت جوز الهند','زيت عباد الشمس','زيت ذرة','زيت كانولا','زيت سمسم','زيت فول سوداني','زيت لب العنب','زيت الأفوكادو','زيت جوز','زيت لوز'];
for (const f of items) {
  const isPlant = plantOilWords.some(w=>f.name_ar.includes(w));
  if (!isPlant) continue;
  const u = f.unsuitable_for_diets||[];
  if (u.includes('vegan')) console.log(f.id, f.name_ar, u);
}
