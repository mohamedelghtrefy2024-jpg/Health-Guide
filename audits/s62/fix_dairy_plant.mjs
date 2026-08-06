import fs from 'fs';
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');

function getBlock(id) {
  const marker = `id: "${id}",`;
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('not found: ' + id);
  const blockStart = content.lastIndexOf('  {\n', idx);
  const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
  return { blockStart, blockEnd, text: content.slice(blockStart, blockEnd) };
}

function replaceInBlock(id, replacements) {
  const { blockStart, blockEnd, text } = getBlock(id);
  let newText = text;
  for (const [oldStr, newStr] of replacements) {
    if (!newText.includes(oldStr)) throw new Error(`pattern not found in ${id}: ${oldStr}`);
    newText = newText.replace(oldStr, newStr);
  }
  content = content.slice(0, blockStart) + newText + content.slice(blockEnd);
}

// 1) Mozzarella (3 items): إزالة "vegan" من suitable_for_diets (تناقض مباشر مع unsuitable)
for (const id of ['food_4367', 'food_4368', 'food_4646']) {
  replaceInBlock(id, [
    ['suitable_for_diets: ["vegan", "vegetarian"]', 'suitable_for_diets: ["vegetarian"]'],
  ]);
}

// 2) حليب/كريمة جوز الهند (food_4038, food_4039, food_4040): تصفير كوليسترول/ب12 المفبركة،
// إضافة vegan لـsuitable وإزالتها من unsuitable، إزالة allergen "lactose" الخاطئ
replaceInBlock('food_4038', [
  ['cholesterol_mg: 27,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.71,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose", "nuts"],', 'allergens: ["nuts"],'],
  ['unsuitable_for_diets: ["low_fat", "vegan"],', 'unsuitable_for_diets: ["low_fat"],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);
replaceInBlock('food_4039', [
  ['cholesterol_mg: 27,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.71,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose", "nuts"],', 'allergens: ["nuts"],'],
  ['unsuitable_for_diets: ["vegan"],', 'unsuitable_for_diets: [],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);
replaceInBlock('food_4040', [
  ['cholesterol_mg: 25,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.4,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose", "nuts"],', 'allergens: ["nuts"],'],
  ['unsuitable_for_diets: ["low_fat", "vegan"],', 'unsuitable_for_diets: ["low_fat"],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);

// 3) زبادي نباتي (food_4353 جوز هند - already vegan-tagged بس كوليسترول/ب12 مفبركة)
replaceInBlock('food_4353', [
  ['cholesterol_mg: 4,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.45,', 'vitamin_b12_mcg: 0,'],
]);
// food_4354 لوز، food_4355 شوفان، food_4356 صويا: نفس المنطق + إضافة vegan
replaceInBlock('food_4354', [
  ['vitamin_b12_mcg: 0.45,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose", "nuts"],', 'allergens: ["nuts"],'],
  ['unsuitable_for_diets: ["vegan"],', 'unsuitable_for_diets: [],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);
replaceInBlock('food_4355', [
  ['vitamin_b12_mcg: 0.45,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose"],', 'allergens: [],'],
  ['unsuitable_for_diets: ["keto", "vegan"],', 'unsuitable_for_diets: ["keto"],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);
replaceInBlock('food_4356', [
  ['vitamin_b12_mcg: 0.45,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose", "soy"],', 'allergens: ["soy"],'],
  ['unsuitable_for_diets: ["vegan"],', 'unsuitable_for_diets: [],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);

// 4) كفير الماء (food_4408): بلا لاكتوز أصلًا، سائل نباتي (سكر+ماء+بادئ بكتيري)
replaceInBlock('food_4408', [
  ['cholesterol_mg: 25,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.4,', 'vitamin_b12_mcg: 0,'],
  ['allergens: ["lactose"],', 'allergens: [],'],
  ['unsuitable_for_diets: ["vegan"],', 'unsuitable_for_diets: [],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);

// 5) كفير جوز الهند (food_4443, food_4822)
for (const id of ['food_4443', 'food_4822']) {
  replaceInBlock(id, [
    ['cholesterol_mg: 5,', 'cholesterol_mg: 0,'],
    ['vitamin_b12_mcg: 0.31,', 'vitamin_b12_mcg: 0,'],
    ['allergens: ["lactose", "nuts"],', 'allergens: ["nuts"],'],
    ['unsuitable_for_diets: ["vegan"],', 'unsuitable_for_diets: [],'],
    ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
  ]);
}

// 6) حليب الصويا وزبادي الصويا (food_5342, food_5343)
replaceInBlock('food_5342', [
  ['cholesterol_mg: 12,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.4,', 'vitamin_b12_mcg: 0,'],
  ['unsuitable_for_diets: ["keto", "vegan"],', 'unsuitable_for_diets: ["keto"],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);
replaceInBlock('food_5343', [
  ['cholesterol_mg: 17,', 'cholesterol_mg: 0,'],
  ['vitamin_b12_mcg: 0.4,', 'vitamin_b12_mcg: 0,'],
  ['unsuitable_for_diets: ["keto", "vegan"],', 'unsuitable_for_diets: ["keto"],'],
  ['suitable_for_diets: ["vegetarian"],', 'suitable_for_diets: ["vegan", "vegetarian"],'],
]);

fs.writeFileSync(path, content);
console.log('تم تطبيق كل التعديلات بنجاح');
