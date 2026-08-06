import { getAllFoods } from '../core/food-library/food-library.js';

const all = getAllFoods();
const byCategory = {};
for (const f of all) {
  if (!byCategory[f.category]) byCategory[f.category] = [];
  byCategory[f.category].push(f);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(p / 100 * (sorted.length - 1));
  return sorted[idx];
}

const fields = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'cholesterol_mg'];
const outliers = [];

for (const [cat, items] of Object.entries(byCategory)) {
  for (const field of fields) {
    const values = items.map((f) => f.macros[field]).filter((v) => typeof v === 'number');
    if (values.length < 10) continue;
    const iqrLow = percentile(values, 5);
    const iqrHigh = percentile(values, 95);
    const range = iqrHigh - iqrLow || 1;
    const lowerBound = iqrLow - range * 2;
    const upperBound = iqrHigh + range * 2;
    for (const item of items) {
      const v = item.macros[field];
      if (typeof v !== 'number') continue;
      if (v < lowerBound || v > upperBound) {
        outliers.push({ id: item.id, name: item.name_ar, category: cat, field, value: v });
      }
    }
  }
}
console.log('عدد الشواذ:', outliers.length);
outliers.forEach((o) => console.log(`${o.id}\t${o.name}\t[${o.category}]\t${o.field}=${o.value}`));
