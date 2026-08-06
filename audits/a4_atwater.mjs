import { getAllFoods } from '../core/food-library/food-library.js';
const all = getAllFoods();
// Atwater: kcal ≈ protein*4 + carbs*4 + fat*9 + fiber*2 (fiber contributes less)
// نسمح بهامش أوسع لأن كتير من الأصناف فيها كحول/عضويات تأثر على الحساب، لكن الانحراف الكبير = شبهة
const bad = [];
for (const f of all) {
  const { protein_g, carbs_g, fat_g, fiber_g, kcal } = f.macros;
  const netCarbs = Math.max(0, carbs_g - (fiber_g||0));
  const estimated = protein_g * 4 + netCarbs * 4 + fat_g * 9 + (fiber_g||0) * 2;
  if (kcal < 5 && estimated < 5) continue; // negligible items (water, etc.)
  const diffRatio = Math.abs(kcal - estimated) / Math.max(kcal, estimated, 1);
  if (diffRatio > 0.35 && Math.abs(kcal - estimated) > 30) {
    bad.push({ id: f.id, name: f.name_ar, category: f.category, kcal, estimated: estimated.toFixed(1), diffRatio: (diffRatio*100).toFixed(0) });
  }
}
console.log('عدد الأصناف بانحراف كبير بين kcal المعلن والمقدَّر من الماكروز (Atwater):', bad.length);
bad.forEach(b => console.log(`${b.id}\t${b.name}\t[${b.category}]\tkcal=${b.kcal}\tمقدر=${b.estimated}\tانحراف=${b.diffRatio}%`));
