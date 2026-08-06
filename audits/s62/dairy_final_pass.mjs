import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const dairy = all.filter(f => f.category === 'dairy');

console.log('=== كوليسترول = 0 في منتج ألبان حيواني حقيقي (مش نباتي) — مشبوه ===');
const plantKeywords = ['جوز الهند','صويا','لوز','شوفان','نباتي','كفير الماء'];
for (const f of dairy) {
  const isPlantByName = plantKeywords.some(k => f.name_ar.includes(k));
  if (isPlantByName) continue;
  if ((f.macros.cholesterol_mg||0) === 0 && f.macros.fat_g > 2) {
    console.log(f.id, f.name_ar, '| fat_g:', f.macros.fat_g, '| cholesterol:', f.macros.cholesterol_mg);
  }
}

console.log('\n=== sub-macros تتجاوز fat_g بهامش >15% ===');
for (const f of dairy) {
  const sum = (f.macros.saturated_fat_g||0)+(f.macros.monounsaturated_fat_g||0)+(f.macros.polyunsaturated_fat_g||0);
  if (sum > f.macros.fat_g * 1.15 + 0.5) {
    console.log(f.id, f.name_ar, '| fat_g:', f.macros.fat_g, '| sum:', sum.toFixed(2));
  }
}

console.log('\n=== Atwater kcal mismatch >20% ===');
for (const f of dairy) {
  const m = f.macros;
  const computed = m.protein_g*4 + m.carbs_g*4 + m.fat_g*9;
  if (m.kcal === 0) continue;
  const diff = Math.abs(computed-m.kcal)/m.kcal;
  if (diff > 0.2) console.log(f.id, f.name_ar, '| kcal:', m.kcal, '| computed:', computed.toFixed(1), '| diff%:', (diff*100).toFixed(0));
}

console.log('\n=== sugar_g > carbs_g (مستحيل) ===');
for (const f of dairy) {
  if (f.macros.sugar_g > f.macros.carbs_g + 0.3) {
    console.log(f.id, f.name_ar, '| carbs:', f.macros.carbs_g, '| sugar:', f.macros.sugar_g);
  }
}
