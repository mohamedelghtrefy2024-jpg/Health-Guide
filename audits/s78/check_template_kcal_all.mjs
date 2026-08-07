import { MEAL_PLAN_TEMPLATES, MEAL_PLAN_CALORIE_LEVELS, MEAL_PLAN_DAYS } from '../../core/meal-engine/meal-plan-templates.js';
import { getFoodById } from '../../core/food-library/food-library.js';

let rows = [];

for (const level of MEAL_PLAN_CALORIE_LEVELS) {
  const daysObj = MEAL_PLAN_TEMPLATES[level];
  for (const day of MEAL_PLAN_DAYS) {
    const meals = daysObj[day];
    let totalKcal = 0;
    for (const mealName of Object.keys(meals)) {
      for (const item of meals[mealName]) {
        const food = getFoodById(item.food_id);
        if (!food) continue;
        totalKcal += (food.macros.kcal * item.grams) / 100;
      }
    }
    const diffPct = ((totalKcal - level) / level) * 100;
    rows.push({ level, day, totalKcal: Math.round(totalKcal), diffPct: +diffPct.toFixed(1) });
  }
}

rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
rows.slice(0, 15).forEach(r => console.log(r));
