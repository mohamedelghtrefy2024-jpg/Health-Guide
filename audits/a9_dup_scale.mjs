import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
const byName = {};
for (const f of all) {
  const key = f.name_ar.trim();
  if (!byName[key]) byName[key] = [];
  byName[key].push(f);
}
const dups = Object.entries(byName).filter(([k, v]) => v.length > 1);
const totalRedundant = dups.reduce((sum, [k, v]) => sum + (v.length - 1), 0);
// عدد الأزواج اللي كل بياناتها متطابقة 100% (نفس kcal/protein/carbs/fat) - يعني تكرار حرفي مش نسخ مختلفة بالغلط
let exactDupPairs = 0;
let exactDupItems = 0;
for (const [name, items] of dups) {
  const sig = items.map(f => `${f.macros.kcal}|${f.macros.protein_g}|${f.macros.carbs_g}|${f.macros.fat_g}`);
  const allSame = sig.every(s => s === sig[0]);
  if (allSame) { exactDupPairs++; exactDupItems += items.length - 1; }
}
console.log('مجموعات الأسماء المكررة:', dups.length);
console.log('إجمالي العناصر الزائدة (نسخ إضافية):', totalRedundant);
console.log('مجموعات متطابقة الماكروز 100% (تكرار حرفي فعلي):', exactDupPairs);
console.log('عناصر التكرار الحرفي الفعلي (تقدر تُحذف بأمان لو الID مش متستخدم في مكان تاني):', exactDupItems);
