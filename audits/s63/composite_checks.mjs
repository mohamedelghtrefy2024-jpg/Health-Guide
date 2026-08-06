import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const cm = all.filter(f => f.category === 'composite_meal');
console.log('عدد composite_meal:', cm.length);

console.log('\n=== 1) لحم/دجاج/سمك بالاسم لكن مُعلَّم suitable لـvegetarian/vegan ===');
const meatWords = ['لحم','دجاج','فراخ','كبدة','كبد','سمك','جمبري','روبيان','كاليماري','حبار','سجق','مرتديلا','لانشون','بسطرمة','ولحم','بط','وز','حمام','أرانب','كوارع','مقادم','كرشة'];
let c1=0;
for (const f of cm) {
  const s = f.suitable_for_diets||[];
  const hasMeatWord = meatWords.some(w=>f.name_ar.includes(w));
  if (hasMeatWord && (s.includes('vegetarian') || s.includes('vegan'))) {
    console.log(f.id, f.name_ar, '| suitable:', s);
    c1++;
  }
}
console.log('عدد:', c1);

console.log('\n=== 2) sugar_g > carbs_g ===');
let c2=0;
for (const f of cm) {
  if (f.macros.sugar_g > f.macros.carbs_g + 0.3) { console.log(f.id, f.name_ar, 'carbs:',f.macros.carbs_g,'sugar:',f.macros.sugar_g); c2++; }
}
console.log('عدد:', c2);

console.log('\n=== 3) sub-macros > fat_g*1.15 ===');
let c3=0;
for (const f of cm) {
  const sum=(f.macros.saturated_fat_g||0)+(f.macros.monounsaturated_fat_g||0)+(f.macros.polyunsaturated_fat_g||0);
  if (sum > f.macros.fat_g*1.15+0.3) { console.log(f.id, f.name_ar, 'fat:',f.macros.fat_g,'sum:',sum.toFixed(2)); c3++; }
}
console.log('عدد:', c3);

console.log('\n=== 4) Atwater kcal mismatch >20% ===');
let c4=0;
for (const f of cm) {
  const m=f.macros; const computed=m.protein_g*4+m.carbs_g*4+m.fat_g*9;
  if (m.kcal===0) continue;
  const diff=Math.abs(computed-m.kcal)/m.kcal;
  if (diff>0.2) { console.log(f.id, f.name_ar, 'kcal:',m.kcal,'computed:',computed.toFixed(1)); c4++; }
}
console.log('عدد:', c4);

console.log('\n=== 5) تناقض suitable/unsuitable (تأكيد صفر بعد S62) ===');
let c5=0;
for (const f of cm) {
  const s=new Set(f.suitable_for_diets||[]); const u=new Set(f.unsuitable_for_diets||[]);
  const overlap=[...s].filter(x=>u.has(x));
  if (overlap.length) { console.log(f.id, f.name_ar, overlap.join(',')); c5++; }
}
console.log('عدد:', c5);
