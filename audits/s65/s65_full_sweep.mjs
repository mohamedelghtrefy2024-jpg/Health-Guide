import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
console.log('إجمالي الأصناف:', all.length);

let c1=0,c2=0,c3=0,c4=0,c5=0,c6=0;

for (const f of all) {
  const s=new Set(f.suitable_for_diets||[]); const u=new Set(f.unsuitable_for_diets||[]);
  if ([...s].some(x=>u.has(x))) { console.log('تناقض حمية:', f.id, f.name_ar, '[',f.category,']'); c1++; }

  if (f.macros.sugar_g > f.macros.carbs_g + 0.3) { console.log('sugar>carbs:', f.id, f.name_ar, '[',f.category,']'); c2++; }

  const sum=(f.macros.saturated_fat_g||0)+(f.macros.monounsaturated_fat_g||0)+(f.macros.polyunsaturated_fat_g||0);
  if (sum > f.macros.fat_g*1.15+0.3) { console.log('submacro>fat:', f.id, f.name_ar, '[',f.category,']'); c3++; }

  // فيبر أكبر من الكارب (مستحيل)
  if ((f.macros.fiber_g||0) > f.macros.carbs_g + 0.3) { console.log('fiber>carbs:', f.id, f.name_ar, '[',f.category,']', f.macros.fiber_g, f.macros.carbs_g); c4++; }

  // بروتين+كارب+دهن > 100g لكل 100g مرجع (مستحيل فيزيائيًا لغالبية الأطعمة، إلا الزيوت الخالصة)
  const totalMacroWeight = f.macros.protein_g + f.macros.carbs_g + f.macros.fat_g;
  if (totalMacroWeight > 100.5 && f.reference_amount_g === 100) { console.log('مجموع الماكرو>100g:', f.id, f.name_ar, '[',f.category,']', totalMacroWeight.toFixed(1)); c5++; }

  // كوليسترول سالب أو قيم سالبة عمومًا (bug واضح)
  for (const [k,v] of Object.entries(f.macros)) {
    if (typeof v === 'number' && v < 0) { console.log('قيمة سالبة:', f.id, f.name_ar, k, v); c6++; }
  }
}
console.log('\nملخص: تناقض_حمية=',c1,'sugar>carbs=',c2,'submacro>fat=',c3,'fiber>carbs=',c4,'مجموع_ماكرو>100=',c5,'قيم_سالبة=',c6);
