import fs from 'fs';
const path = 'core/food-library/foods-data.js';
let content = fs.readFileSync(path, 'utf8');
const id = 'food_4381';
const idx = content.indexOf(`id: "${id}",`);
const blockStart = content.lastIndexOf('  {\n', idx);
const blockEnd = content.indexOf('  },\n', idx) + '  },\n'.length;
let block = content.slice(blockStart, blockEnd);

block = block.replace('suitable_for_diets: ["vegan", "vegetarian"],', 'suitable_for_diets: [],');
block = block.replace('unsuitable_for_diets: ["carnivore", "low_fat"],', 'unsuitable_for_diets: ["carnivore", "low_fat", "vegan", "vegetarian"],');
block = block.replace('allergens: [],', 'allergens: ["fish"],');

content = content.slice(0, blockStart) + block + content.slice(blockEnd);
fs.writeFileSync(path, content);
console.log('تم تصحيح food_4381 زيت كبد الحوت');
