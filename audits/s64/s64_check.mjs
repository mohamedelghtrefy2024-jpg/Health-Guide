import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const cats = ['condiment','fat_oil'];

for (const cat of cats) {
  const items = all.filter(f => f.category === cat);
  console.log(`\n########## ${cat} (${items.length} صنف) ##########`);

  let c1=0;
  for (const f of items) {
    const s=new Set(f.suitable_for_diets||[]); const u=new Set(f.unsuitable_for_diets||[]);
    if ([...s].some(x=>u.has(x))) { console.log('تناقض حمية:', f.id, f.name_ar); c1++; }
  }

  let c2=0;
  for (const f of items) if (f.macros.sugar_g > f.macros.carbs_g + 0.3) { console.log('sugar>carbs:', f.id, f.name_ar, f.macros.carbs_g, f.macros.sugar_g); c2++; }

  let c3=0;
  for (const f of items) {
    const sum=(f.macros.saturated_fat_g||0)+(f.macros.monounsaturated_fat_g||0)+(f.macros.polyunsaturated_fat_g||0);
    if (sum > f.macros.fat_g*1.15+0.3) { console.log('submacro>fat:', f.id, f.name_ar, f.macros.fat_g, sum.toFixed(2)); c3++; }
  }

  const meatWords = ['دجاج','فراخ','لحم','سمك','جمبري','روبيان','كبد','سجق','بسطرمة','حمام','أرانب','كاليماري','محار','استاكوزا','سلطعون'];
  let c4=0;
  for (const f of items) {
    const s = f.suitable_for_diets||[];
    const hasMeat = meatWords.some(w=>f.name_ar.includes(w)) && !f.name_ar.includes('حمص');
    if (hasMeat && (s.includes('vegan')||s.includes('vegetarian'))) { console.log('لحم-vegan:', f.id, f.name_ar, s); c4++; }
  }

  // كوليسترول > 0 لصنف نباتي (زيوت/توابل بحتة) - مفروض صفر
  let c5=0;
  for (const f of items) {
    if ((f.macros.cholesterol_mg||0) > 0) { console.log('كوليسترول في نباتي:', f.id, f.name_ar, f.macros.cholesterol_mg); c5++; }
  }

  console.log(`ملخص ${cat}: تناقض=${c1} sugar>carbs=${c2} submacro=${c3} لحم-vegan=${c4} كوليسترول-نباتي=${c5}`);
}
