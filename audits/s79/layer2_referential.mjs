import { getAllFoods, getFoodById } from '../../core/food-library/food-library.js';
import { MEAL_PLAN_TEMPLATES } from '../../core/meal-engine/meal-plan-templates.js';

const foods = getAllFoods();
const foodIds = new Set(foods.map(f => f.id));

console.log('=== 2.1: food_id references in MEAL_PLAN_TEMPLATES ===');
let totalRefs = 0, missingRefs = 0;
const missingList = new Set();
for (const [level, days] of Object.entries(MEAL_PLAN_TEMPLATES)) {
  for (const [day, meals] of Object.entries(days)) {
    for (const [meal, items] of Object.entries(meals)) {
      for (const item of items) {
        totalRefs++;
        if (!foodIds.has(item.food_id)) {
          missingRefs++;
          missingList.add(item.food_id + ` (level=${level}, day=${day}, meal=${meal})`);
        }
      }
    }
  }
}
console.log('Total refs:', totalRefs, 'Missing:', missingRefs);
for (const m of missingList) console.log(' MISSING:', m);

console.log('\n=== 2.2: suitable/unsuitable contradiction (same condition on both lists) ===');
let condContradictions = 0, dietContradictions = 0;
for (const f of foods) {
  const su = new Set(f.suitable_for_conditions || []);
  const un = new Set(f.unsuitable_for_conditions || []);
  const overlapCond = [...su].filter(x => un.has(x));
  if (overlapCond.length) {
    condContradictions++;
    console.log(' COND CONTRADICTION:', f.id, f.name_ar, overlapCond);
  }
  const sd = new Set(f.suitable_for_diets || []);
  const ud = new Set(f.unsuitable_for_diets || []);
  const overlapDiet = [...sd].filter(x => ud.has(x));
  if (overlapDiet.length) {
    dietContradictions++;
    console.log(' DIET CONTRADICTION:', f.id, f.name_ar, overlapDiet);
  }
}
console.log('Condition contradictions:', condContradictions, 'Diet contradictions:', dietContradictions);
