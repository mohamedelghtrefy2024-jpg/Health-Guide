import { MEAL_PLAN_TEMPLATES, MEAL_PLAN_CALORIE_LEVELS, MEAL_PLAN_DAYS } from '../../core/meal-engine/meal-plan-templates.js';
import { getFoodById } from '../../core/food-library/food-library.js';

let violations = [];
let checked = 0;

for (const level of MEAL_PLAN_CALORIE_LEVELS) {
  const daysObj = MEAL_PLAN_TEMPLATES[level];
  if (!daysObj) { console.log('MISSING LEVEL', level); continue; }
  for (const day of MEAL_PLAN_DAYS) {
    const meals = daysObj[day];
    if (!meals) { console.log('MISSING DAY', level, day); continue; }
    let totalKcal = 0;
    let brokenRefs = [];
    for (const mealName of Object.keys(meals)) {
      for (const item of meals[mealName]) {
        const food = getFoodById(item.food_id);
        if (!food) { brokenRefs.push(item.food_id); continue; }
        totalKcal += (food.macros.kcal * item.grams) / 100;
      }
    }
    checked++;
    const diffPct = ((totalKcal - level) / level) * 100;
    if (brokenRefs.length) {
      console.log(`BROKEN REF level=${level} day=${day}:`, brokenRefs);
    }
    if (Math.abs(diffPct) > 20) {
      violations.push({ level, day, totalKcal: Math.round(totalKcal), diffPct: diffPct.toFixed(1) });
    }
  }
}

console.log(`فحص ${checked} يوم/مستوى`);
console.log(`مخالفات (فرق أكبر من ±20%): ${violations.length}`);
violations.forEach(v => console.log(v));
