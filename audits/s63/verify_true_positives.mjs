import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const cm = all.filter(f => f.category === 'composite_meal');

// قائمة منقّحة يدويًا (بعد استبعاد كل false positives من substring collision)
const realMeatIds = ['food_2454','food_2457','food_2458','food_2465','food_2467','food_2471','food_2474',
'food_2475','food_2477','food_2481','food_2483','food_2486','food_2487','food_2490','food_2492','food_2499',
'food_2500','food_2502','food_2503','food_2505','food_2517','food_2532','food_2544','food_2545','food_2552',
'food_2553','food_2554','food_2606','food_2617','food_2618','food_2619','food_2631','food_2634','food_2635',
'food_2636','food_2641','food_2649','food_2650','food_2652','food_2653','food_2666','food_2700','food_2719',
'food_2737','food_2752','food_2808','food_2837','food_2850','food_2874','food_2896','food_3030','food_3043',
'food_3058','food_3075','food_3136','food_3139','food_3140','food_3141','food_3244','food_3249','food_3250',
'food_3253','food_3400','food_3410','food_3415','food_3422','food_3435'];

const dairyOnlyIds = ['food_2921','food_2922','food_2962','food_3003','food_3247','food_3319'];

console.log('=== التحقق من قائمة اللحوم/الأسماك الحقيقية ===');
for (const id of realMeatIds) {
  const f = cm.find(x=>x.id===id);
  if (!f) { console.log('⚠️ مش موجود:', id); continue; }
  console.log(f.id, f.name_ar, '| suitable:', f.suitable_for_diets);
}
console.log('\n=== التحقق من قائمة الألبان بس ===');
for (const id of dairyOnlyIds) {
  const f = cm.find(x=>x.id===id);
  if (!f) { console.log('⚠️ مش موجود:', id); continue; }
  console.log(f.id, f.name_ar, '| suitable:', f.suitable_for_diets);
}
console.log('\nعدد اللحوم:', realMeatIds.length, '| عدد الألبان:', dairyOnlyIds.length);
