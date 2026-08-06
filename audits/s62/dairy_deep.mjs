import { getAllFoods } from '/home/claude/project/core/food-library/food-library.js';
const all = getAllFoods();
const dairy = all.filter(f => f.category === 'dairy');

console.log('=== 1) تناقض منطقي: نفس الوسم في suitable و unsuitable مع بعض ===');
for (const f of dairy) {
  const s = new Set(f.suitable_for_diets||[]);
  const u = new Set(f.unsuitable_for_diets||[]);
  const overlap = [...s].filter(x => u.has(x));
  if (overlap.length) console.log(f.id, f.name_ar, '| تعارض في:', overlap.join(','));
}

console.log('\n=== 2) أصناف نباتية بالاسم (جوز هند/صويا/لوز/شوفان/نباتي) بكوليسترول أو ب12 > 0 ===');
const plantKeywords = ['جوز الهند','صويا','لوز','شوفان','نباتي','كفير الماء'];
for (const f of dairy) {
  const isPlantByName = plantKeywords.some(k => f.name_ar.includes(k)) || (f.name_en && f.name_en.toLowerCase().includes('coconut'));
  if (!isPlantByName) continue;
  const chol = f.macros.cholesterol_mg || 0;
  const b12 = f.micros.vitamin_b12_mcg || 0;
  if (chol > 0 || b12 > 0) {
    console.log(f.id, f.name_ar, '(', f.name_en, ') | cholesterol:', chol, '| b12:', b12, '| suitable:', f.suitable_for_diets, '| unsuitable:', f.unsuitable_for_diets);
  }
}

console.log('\n=== 3) نفس الأصناف النباتية دي لكن مش عندها vegan في suitable_for_diets ===');
for (const f of dairy) {
  const isPlantByName = plantKeywords.some(k => f.name_ar.includes(k)) || (f.name_en && f.name_en.toLowerCase().includes('coconut'));
  if (!isPlantByName) continue;
  const suitable = f.suitable_for_diets || [];
  const unsuitable = f.unsuitable_for_diets || [];
  if (!suitable.includes('vegan')) {
    console.log(f.id, f.name_ar, '(', f.name_en, ') | suitable:', suitable, '| unsuitable:', unsuitable, '| allergens:', f.allergens);
  }
}

console.log('\n=== 4) أصناف ألبان حيوانية حقيقية (جبن/لبن بقري/جاموسي/إلخ) لكن مصنَّفة vegan في suitable ===');
for (const f of dairy) {
  const suitable = f.suitable_for_diets || [];
  const isPlantByName = plantKeywords.some(k => f.name_ar.includes(k)) || (f.name_en && f.name_en.toLowerCase().includes('coconut')) || f.name_ar.includes('صويا');
  if (isPlantByName) continue;
  if (suitable.includes('vegan')) {
    console.log(f.id, f.name_ar, '| suitable:', suitable, '| unsuitable:', f.unsuitable_for_diets);
  }
}
