import { generateMeal } from '../../core/meal-engine/meal-generation-engine.js';
import { MEDICAL_CONDITION, DIET_STYLE } from '../../core/food-library/schema.js';
import { calculateMacroTargets } from '../../core/nutrition-engine/nutrition-engine.js';

const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
const dietStyles = [null, DIET_STYLE.NORMAL, DIET_STYLE.VEGETARIAN, DIET_STYLE.VEGAN, DIET_STYLE.HIGH_PROTEIN, DIET_STYLE.MEDITERRANEAN];
const conditionSets = [
  [], [MEDICAL_CONDITION.DIABETES_T2], [MEDICAL_CONDITION.HYPERTENSION], [MEDICAL_CONDITION.DYSLIPIDEMIA],
];
const kcalOptions = [300, 400, 500, 600, 700];

function pick(arr, i) { return arr[i % arr.length]; }

const idCounts = {};
let totalItems = 0;
let successCount = 0;
const N = 90;

for (let i = 0; i < N; i++) {
  const mealType = pick(mealTypes, i);
  const dietStyle = pick(dietStyles, i * 3 + 1);
  const medicalConditions = pick(conditionSets, i * 5 + 2);
  const targetKcal = pick(kcalOptions, i * 7 + 3);

  const weightKg = 60 + (i % 40); // تنويع وزن المستخدم 60-99كجم
  const macros = calculateMacroTargets(targetKcal, dietStyle ?? 'normal', weightKg, null, medicalConditions);
  const macroTargets = { protein_g: macros.protein_g, carb_g: macros.carb_g, fat_g: macros.fat_g };

  const result = generateMeal({
    constraintProfile: { medicalConditions, dietStyle: dietStyle ?? undefined },
    mealType,
    targetKcal,
    macroTargets,
    minFoodQualityScore: 40,
  });

  if (!result.success || result.candidates.length === 0) continue;
  successCount++;
  const best = result.candidates[0];
  for (const item of best.items) {
    const foodId = item.food.id;
    idCounts[foodId] = (idCounts[foodId] || 0) + 1;
    totalItems++;
  }
}

console.log(`إجمالي المحاولات: ${N} | ناجحة: ${successCount} | إجمالي الأصناف المختارة: ${totalItems}`);

const sorted = Object.entries(idCounts).sort((a, b) => b[1] - a[1]);
console.log('\nأعلى 15 صنف تكرارًا:');
sorted.slice(0, 15).forEach(([id, count]) => {
  const pct = ((count / successCount) * 100).toFixed(1);
  console.log(` ${id}: ${count} مرة (${pct}% من الوجبات الناجحة)`);
});

const dominant = sorted.filter(([, count]) => count / successCount > 0.4);
console.log(`\nأصناف تظهر في أكثر من 40% من كل الوجبات الناجحة: ${dominant.length}`);
dominant.forEach(([id, count]) => console.log(` ${id}: ${((count / successCount) * 100).toFixed(1)}%`));
