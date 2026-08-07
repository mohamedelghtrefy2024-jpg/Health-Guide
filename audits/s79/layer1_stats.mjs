import { getAllFoods } from '../../core/food-library/food-library.js';

const foods = getAllFoods();
console.log('Total foods:', foods.length);

// --- Z-score outlier detection per category per numeric field ---
const numericFields = ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','gi','gl'];
const byCategory = {};
for (const f of foods) {
  (byCategory[f.category] ??= []).push(f);
}

function mean(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function std(arr,m){ return Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length); }

const zOutliers = [];
for (const [cat, items] of Object.entries(byCategory)) {
  for (const field of numericFields) {
    const vals = items.filter(i => typeof i[field] === 'number').map(i => i[field]);
    if (vals.length < 8) continue;
    const m = mean(vals);
    const s = std(vals, m);
    if (s === 0) continue;
    for (const it of items) {
      const v = it[field];
      if (typeof v !== 'number') continue;
      const z = (v - m) / s;
      if (Math.abs(z) > 3.5) {
        zOutliers.push({ id: it.id, name: it.name_ar, category: cat, field, value: v, z: +z.toFixed(2), mean: +m.toFixed(1), std: +s.toFixed(1) });
      }
    }
  }
}
console.log('\n=== Z-score outliers (|z|>3.5) ===', zOutliers.length);
for (const o of zOutliers) console.log(JSON.stringify(o));

// --- GL vs GI x carbs consistency (GL ≈ GI * carbs_per_serving / 100) ---
console.log('\n=== GL vs GI×carbs mismatches ===');
let glMismatch = 0;
for (const f of foods) {
  if (typeof f.gi !== 'number' || typeof f.gl !== 'number') continue;
  if (typeof f.carbs_g !== 'number') continue;
  // GL formula uses carbs per serving, not per 100g necessarily; use carbs_g as proxy if serving size unknown
  const expected = (f.gi * f.carbs_g) / 100;
  const diff = Math.abs(expected - f.gl);
  if (diff > Math.max(3, expected * 0.5)) {
    glMismatch++;
    console.log(JSON.stringify({ id: f.id, name: f.name_ar, gi: f.gi, carbs_g: f.carbs_g, gl: f.gl, expected: +expected.toFixed(1), diff: +diff.toFixed(1) }));
  }
}
console.log('Total GL mismatches (rough):', glMismatch);

// --- quality_score vs processing_level consistency ---
console.log('\n=== quality_score / processing_level consistency ===');
const levels = {};
for (const f of foods) {
  (levels[f.processing_level] ??= []).push(f.quality_score);
}
for (const [lvl, scores] of Object.entries(levels)) {
  const m = mean(scores);
  console.log(lvl, 'count=', scores.length, 'avg_quality=', m.toFixed(1), 'min=', Math.min(...scores), 'max=', Math.max(...scores));
}
