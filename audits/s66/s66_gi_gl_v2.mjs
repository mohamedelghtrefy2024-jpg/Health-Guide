import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
// تصحيح المنهجية: GL = GI × كارب كلي ÷ 100 (مش net carb - ده الصيغة الفعلية المستخدمة في المكتبة)
let mismatches = 0;
for (const f of all) {
  if (!f.gi || f.gi === -1) continue;
  if (!f.gl || f.gl === -1) continue;
  const computedGL = (f.gi * f.macros.carbs_g) / 100;
  const diff = Math.abs(computedGL - f.gl);
  if (diff > Math.max(1, computedGL*0.1)) {
    console.log(f.id, f.name_ar, '| gi:', f.gi, '| carb:', f.macros.carbs_g, '| gl_مسجل:', f.gl, '| gl_محسوب:', computedGL.toFixed(1));
    mismatches++;
  }
}
console.log('\nإجمالي التعارضات الحقيقية (بالصيغة الصحيحة GI×carb/100):', mismatches);
