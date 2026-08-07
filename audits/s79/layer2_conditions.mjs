import { getAllFoods } from '../../core/food-library/food-library.js';
import { MEDICAL_CONDITION } from '../../core/food-library/schema.js';

const foods = getAllFoods();
const allConditions = Object.values(MEDICAL_CONDITION);

console.log('=== 2.3: MEDICAL_CONDITION usage in food-library unsuitable_for_conditions/suitable_for_conditions ===');
for (const cond of allConditions) {
  const unsuitableCount = foods.filter(f => (f.unsuitable_for_conditions||[]).includes(cond)).length;
  const suitableCount = foods.filter(f => (f.suitable_for_conditions||[]).includes(cond)).length;
  console.log(cond, '-> unsuitable:', unsuitableCount, ', suitable:', suitableCount);
}
