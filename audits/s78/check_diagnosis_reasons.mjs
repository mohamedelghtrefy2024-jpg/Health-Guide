import { generateMeal } from '../../core/meal-engine/meal-generation-engine.js';
import { MEDICAL_CONDITION, ALLERGEN, RELIGIOUS_TAG } from '../../core/food-library/schema.js';

// 1) قيد طبي: كل الحالات الـ16 مجتمعة (سيناريو متطرف عمدًا لضمان استبعاد شبه كامل)
const r1 = generateMeal({
  constraintProfile: { medicalConditions: Object.values(MEDICAL_CONDITION) },
  mealType: 'غداء',
  targetKcal: 500,
});
console.log('1) قيد طبي متطرف -> success:', r1.success, '| stage:', r1.diagnosis?.stage);

// 2) قيد حساسية: كل الحساسيات الـ8 مجتمعة
const r2 = generateMeal({
  constraintProfile: { allergies: Object.values(ALLERGEN).map(a => ({ allergen: a, severity: 'severe' })) },
  mealType: 'غداء',
  targetKcal: 500,
});
console.log('2) قيد حساسية متطرف -> success:', r2.success, '| stage:', r2.diagnosis?.stage);

// 3) قيد ديني: الصيام المسيحي الصارم + فلترة فئة "protein" فقط (فرض تعارض واضح)
const r3 = generateMeal({
  constraintProfile: { fastingTag: RELIGIOUS_TAG.CHRISTIAN_FAST_STRICT },
  mealType: 'غداء',
  targetKcal: 500,
  categoryFilter: ['protein'],
});
console.log('3) قيد ديني (صيام صارم) + فئة بروتين فقط -> success:', r3.success, '| stage:', r3.diagnosis?.stage);

// 4) عدم توفر ماكرو مناسب: هدف ماكرو مستحيل (بروتين عالي جدًا + هامش ضيق جدًا)
const r4 = generateMeal({
  constraintProfile: {},
  mealType: 'غداء',
  targetKcal: 500,
  macroTargets: { protein_g: 400, carb_g: 1, fat_g: 1 }, // مستحيل فيزيائيًا مع سعرات 500
  macroMarginPct: 0.02,
});
console.log('4) هدف ماكرو مستحيل -> success:', r4.success, '| stage:', r4.diagnosis?.stage);

console.log('\n--- رسائل التشخيص الكاملة ---');
[r1, r2, r3, r4].forEach((r, i) => console.log(`${i + 1}:`, r.diagnosis?.message_ar));
