import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
// GL = GI × كارب صافي (كارب - ألياف) ÷ 100 (تقريبًا)
// مفروض تقريبًا يتطابق مع القيمة المسجَّلة لو gi موجود وموجب
let mismatches = 0;
for (const f of all) {
  if (f.gi === undefined || f.gi === -1 || f.gi === null) continue;
  const netCarb = Math.max(0, f.macros.carbs_g - (f.macros.fiber_g||0));
  const computedGL = (f.gi * netCarb) / 100;
  if (f.gl === undefined || f.gl === -1 || f.gl === null) continue;
  const diff = Math.abs(computedGL - f.gl);
  if (diff > Math.max(2, computedGL*0.25)) {
    console.log(f.id, f.name_ar, `[${f.category}]`, '| gi:', f.gi, '| carb:', f.macros.carbs_g, '| fiber:', f.macros.fiber_g, '| gl_مسجل:', f.gl, '| gl_محسوب:', computedGL.toFixed(1));
    mismatches++;
  }
}
console.log('\nإجمالي التعارضات:', mismatches, 'من أصل', all.filter(f=>f.gi&&f.gi>0).length, 'صنف عنده gi');
