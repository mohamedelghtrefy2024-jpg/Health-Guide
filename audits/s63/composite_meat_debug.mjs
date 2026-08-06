import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const cm = all.filter(f => f.category === 'composite_meal');
const meatWords = ['لحم','دجاج','فراخ','كبدة','كبد','سمك','جمبري','روبيان','كاليماري','حبار','سجق','مرتديلا','لانشون','بسطرمة','بط','وز ','حمام','أرانب','كوارع','مقادم','كرشة','بطلينوس'];
let results = [];
for (const f of cm) {
  const s = f.suitable_for_diets||[];
  if (!(s.includes('vegetarian') || s.includes('vegan'))) continue;
  const matched = meatWords.filter(w=>f.name_ar.includes(w));
  if (matched.length) results.push({id:f.id, name:f.name_ar, matched, suitable:s});
}
console.log('عدد:', results.length);
results.forEach(r=>console.log(r.id, r.name, '| matched:', r.matched.join(','), '| suitable:', r.suitable.join(',')));
