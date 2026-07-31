/**
 * ============================================================================
 * Exercise Engine
 * ============================================================================
 * مكتبة تمارين مبنية بنفس فلسفة Food Library (بيانات مركزية + طبقة قراءة
 * موحّدة)، بالإضافة لحساب السعرات المحروقة الفعلي (مربوط بوزن المستخدم
 * الحقيقي حسب متطلب المستند) واستبعاد التمارين ذات موانع الاستخدام
 * المرتبطة بحالة المستخدم الصحية (عبر نفس أكواد MEDICAL_CONDITION من
 * Food Library schema، بلا طبقة تحويل).
 * ============================================================================
 */

'use strict';

import { MEDICAL_CONDITION } from '../food-library/schema.js';

export const MUSCLE_GROUP = Object.freeze({
  FULL_BODY: 'full_body',
  CHEST: 'chest',
  BACK: 'back',
  LEGS: 'legs',
  SHOULDERS: 'shoulders',
  ARMS: 'arms',
  CORE: 'core',
  CARDIO: 'cardio',
});

export const DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} name_ar
 * @property {string} name_en
 * @property {number} met - Metabolic Equivalent of Task
 * @property {string} muscleGroup
 * @property {string[]} equipmentNeeded
 * @property {string} difficulty
 * @property {string[]} contraindications - أكواد من MEDICAL_CONDITION
 * @property {string} warning_ar
 */

const EXERCISES_DATA = [
  { id: 'ex_0001', name_ar: 'مشي سريع', name_en: 'Brisk Walking', met: 4.3, muscleGroup: MUSCLE_GROUP.CARDIO, equipmentNeeded: [], difficulty: DIFFICULTY.BEGINNER, contraindications: [], warning_ar: '' },
  { id: 'ex_0002', name_ar: 'جري', name_en: 'Running (moderate pace)', met: 9.8, muscleGroup: MUSCLE_GROUP.CARDIO, equipmentNeeded: [], difficulty: DIFFICULTY.INTERMEDIATE, contraindications: [MEDICAL_CONDITION.HEART_DISEASE], warning_ar: 'يحتاج موافقة طبية مسبقة لمرضى القلب' },
  { id: 'ex_0003', name_ar: 'سباحة', name_en: 'Swimming (moderate)', met: 6.0, muscleGroup: MUSCLE_GROUP.FULL_BODY, equipmentNeeded: ['حمام سباحة'], difficulty: DIFFICULTY.BEGINNER, contraindications: [], warning_ar: '' },
  { id: 'ex_0004', name_ar: 'ضغط (Push-up)', name_en: 'Push-ups', met: 3.8, muscleGroup: MUSCLE_GROUP.CHEST, equipmentNeeded: [], difficulty: DIFFICULTY.BEGINNER, contraindications: [], warning_ar: '' },
  { id: 'ex_0005', name_ar: 'سكوات (Squat)', name_en: 'Bodyweight Squats', met: 5.0, muscleGroup: MUSCLE_GROUP.LEGS, equipmentNeeded: [], difficulty: DIFFICULTY.BEGINNER, contraindications: [], warning_ar: 'حذر لمن يعانون آلام الركبة' },
  { id: 'ex_0006', name_ar: 'رفعة ميتة (Deadlift)', name_en: 'Deadlift', met: 6.0, muscleGroup: MUSCLE_GROUP.BACK, equipmentNeeded: ['أثقال حرة'], difficulty: DIFFICULTY.ADVANCED, contraindications: [MEDICAL_CONDITION.HYPERTENSION, MEDICAL_CONDITION.HEART_DISEASE], warning_ar: 'يرفع ضغط الدم مؤقتًا بشدة أثناء الأداء — يحتاج إشراف لمرضى الضغط والقلب' },
  { id: 'ex_0007', name_ar: 'يوجا', name_en: 'Yoga', met: 2.5, muscleGroup: MUSCLE_GROUP.FULL_BODY, equipmentNeeded: ['سجادة يوجا'], difficulty: DIFFICULTY.BEGINNER, contraindications: [], warning_ar: '' },
  { id: 'ex_0008', name_ar: 'قفز حبل', name_en: 'Jump Rope', met: 11.0, muscleGroup: MUSCLE_GROUP.CARDIO, equipmentNeeded: ['حبل قفز'], difficulty: DIFFICULTY.INTERMEDIATE, contraindications: [MEDICAL_CONDITION.HEART_DISEASE, MEDICAL_CONDITION.OSTEOPOROSIS], warning_ar: 'تأثير عالي على المفاصل — غير موصى به لهشاشة العظام' },
  { id: 'ex_0009', name_ar: 'دراجة ثابتة', name_en: 'Stationary Cycling (moderate)', met: 5.5, muscleGroup: MUSCLE_GROUP.LEGS, equipmentNeeded: ['دراجة ثابتة'], difficulty: DIFFICULTY.BEGINNER, contraindications: [], warning_ar: '' },
  { id: 'ex_0010', name_ar: 'بلانك (Plank)', name_en: 'Plank', met: 3.3, muscleGroup: MUSCLE_GROUP.CORE, equipmentNeeded: [], difficulty: DIFFICULTY.BEGINNER, contraindications: [MEDICAL_CONDITION.HYPERTENSION], warning_ar: 'حبس النفس أثناء الأداء قد يرفع الضغط مؤقتًا — يُنصح بالتنفس المنتظم' },
];

const EXERCISE_INDEX = new Map(EXERCISES_DATA.map((e) => [e.id, e]));

export function getAllExercises() {
  return Array.from(EXERCISE_INDEX.values());
}

export function getExerciseById(id) {
  return EXERCISE_INDEX.get(id) ?? null;
}

/** يستبعد التمارين اللي عندها مانع استخدام مرتبط بأي حالة من حالات المستخدم */
export function filterExercisesForConditions(medicalConditions = []) {
  return getAllExercises().filter(
    (ex) => !ex.contraindications.some((c) => medicalConditions.includes(c))
  );
}

/**
 * السعرات المحروقة = MET × وزن الجسم (كجم) × المدة (ساعات)
 * الصيغة المعيارية المعتمدة فسيولوجيًا؛ مربوطة بوزن المستخدم الفعلي حسب
 * المتطلب الصريح بالمستند ("مرتبطة بوزن المستخدم الفعلي").
 * @param {Exercise} exercise
 * @param {number} weightKg
 * @param {number} durationMinutes
 */
export function calculateCaloriesBurned(exercise, weightKg, durationMinutes) {
  // BUG-S24-05: مفيش أي حماية من weightKg/durationMinutes سالب أو صفر أو
  // غير رقمي. تأكدت فعليًا إن ده مسار حقيقي (مش نظري فقط): ui/app.js
  // (renderExerciseTab) بيستدعيها بـ Number(currentProfile.weightKg) —
  // ولو currentProfile اتلوّث بوزن سالب/صفر (استيراد بيانات معطوب من
  // importAllData، اللي بيسجّل تحذير لكنه لسه بينجح جزئيًا في الاستيراد
  // الفعلي — راجع BUG-S24-04)، كانت النتيجة سعرات محروقة سالبة تتعرض في
  // الواجهة ("−150 سعرة / 30 دقيقة") وتتسجَّل فعليًا لو المستخدم ضغط
  // الزرار، فتلوّث إجمالي السعرات اليومي بصمت. durationMinutes ثابتة
  // حاليًا (30) من الواجهة لكن الدالة API عامة لأي مستدعي مستقبلي.
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 0;
  }
  const hours = durationMinutes / 60;
  return Math.round(exercise.met * weightKg * hours);
}
