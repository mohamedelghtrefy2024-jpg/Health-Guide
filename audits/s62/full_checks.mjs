import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();

console.log('=== sugar_g > carbs_g عبر كل المكتبة ===');
let c1=0;
for (const f of all) {
  if (f.macros.sugar_g > f.macros.carbs_g + 0.3) { console.log(f.id, f.name_ar, '[',f.category,']', 'carbs:', f.macros.carbs_g, 'sugar:', f.macros.sugar_g); c1++; }
}
console.log('عدد:', c1);

console.log('\n=== sub-macros > fat_g*1.15 عبر كل المكتبة ===');
let c2=0;
for (const f of all) {
  const sum = (f.macros.saturated_fat_g||0)+(f.macros.monounsaturated_fat_g||0)+(f.macros.polyunsaturated_fat_g||0);
  if (sum > f.macros.fat_g * 1.15 + 0.3) { console.log(f.id, f.name_ar, '[',f.category,']', 'fat:', f.macros.fat_g, 'sum:', sum.toFixed(2)); c2++; }
}
console.log('عدد:', c2);

console.log('\n=== تناقض suitable/unsuitable لنفس الدايت عبر كل المكتبة ===');
let c3=0;
for (const f of all) {
  const s = new Set(f.suitable_for_diets||[]);
  const u = new Set(f.unsuitable_for_diets||[]);
  const overlap = [...s].filter(x=>u.has(x));
  if (overlap.length) { console.log(f.id, f.name_ar, '[',f.category,']', overlap.join(',')); c3++; }
}
console.log('عدد:', c3);
