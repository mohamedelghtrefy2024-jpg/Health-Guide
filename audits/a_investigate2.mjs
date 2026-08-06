import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
// all تتبيلة items
console.log('--- كل التتبيلات ---');
all.filter(f=>f.name_ar.includes('تتبيلة')).forEach(f=>console.log(`${f.id}\t${f.name_ar}\tchol=${f.macros.cholesterol_mg}\tb12=${f.micros.vitamin_b12_mcg}\tprotein=${f.macros.protein_g}`));
console.log('--- لسان الحمل ---');
console.log(JSON.stringify(all.find(f=>f.id==='food_4588'), null, 2));
console.log('--- مقارنة قرفة عود مع قرفة مصرية ---');
all.filter(f=>f.name_ar.includes('قرفة')).forEach(f=>console.log(`${f.id}\t${f.name_ar}\tkcal=${f.macros.kcal}\tchol=${f.macros.cholesterol_mg}\tb12=${f.micros.vitamin_b12_mcg}`));
console.log('--- بلح البحر (محار) - كل النسخ ---');
all.filter(f=>f.name_ar.includes('بلح البحر') || f.name_ar.includes('وزم البلح')).forEach(f=>console.log(`${f.id}\t${f.name_ar}\t[${f.category}]\tkcal=${f.macros.kcal}\tprotein=${f.macros.protein_g}`));
