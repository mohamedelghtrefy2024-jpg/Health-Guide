/**
 * ============================================================================
 * Challenge / Gamification Engine
 * ============================================================================
 * تحديات محددة وقابلة للقياس + حساب الـStreak (أيام متتالية محققة للهدف)
 * كمؤشر نفسي رئيسي للاستمرارية حسب المستند. يعتمد على بيانات Tracking
 * Engine كمصدر وحيد للحقيقة — لا يُعيد حساب أي شيء بمنطق مختلف.
 * ============================================================================
 */

'use strict';

import { STORE, putRecord, getAllRecords, uniqueIdSuffix } from '../storage/storage-engine.js';

export const CHALLENGE_TYPE = Object.freeze({
  CALORIE_STREAK: 'calorie_streak',      // N يوم متتالي بدون تجاوز السعرات
  WATER_STREAK: 'water_streak',          // N يوم متتالي ماء مكتمل
  WEIGHT_MILESTONE: 'weight_milestone',  // الوصول لخسارة/زيادة وزن معينة
  HEALTHY_MEAL_COUNT: 'healthy_meal_count', // N وجبة بجودة عالية (Quality Score >= حد معيّن)
});

/** قوالب التحديات الجاهزة المذكورة صراحة في المستند */
export const CHALLENGE_TEMPLATES = [
  { id: 'ch_calorie_30', type: CHALLENGE_TYPE.CALORIE_STREAK, targetValue: 30, title_ar: '30 يوم بدون تجاوز السعرات' },
  { id: 'ch_water_7', type: CHALLENGE_TYPE.WATER_STREAK, targetValue: 7, title_ar: '7 أيام ماء مكتمل' },
  { id: 'ch_healthy_100', type: CHALLENGE_TYPE.HEALTHY_MEAL_COUNT, targetValue: 100, title_ar: '100 وجبة صحية (جودة ≥70)' },
];

/**
 * يبدأ تحديًا جديدًا للمستخدم من قالب جاهز أو مخصّص.
 * @param {string} templateId - أحد قيم CHALLENGE_TEMPLATES.id، أو null لتحدي مخصّص
 * @param {Object} [customChallenge] - { type, targetValue, title_ar } لو templateId=null
 */
export async function startChallenge(templateId, customChallenge = null) {
  const template = templateId ? CHALLENGE_TEMPLATES.find((t) => t.id === templateId) : customChallenge;
  if (!template) throw new Error('startChallenge: قالب التحدي غير موجود');

  const record = {
    id: `${template.type}_${uniqueIdSuffix()}`, // BUG-S23-03 — نفس فئة تصادم Date.now() في Tracking Engine
    type: template.type,
    targetValue: template.targetValue,
    title_ar: template.title_ar,
    startedAt: new Date().toISOString(),
    currentProgress: 0,
    completed: false,
    completedAt: null,
  };
  await putRecord(STORE.CHALLENGES, record);
  return record;
}

/** يحدّث تقدّم تحدٍّ معيّن ويعلّمه مكتملًا لو وصل للهدف */
export async function updateChallengeProgress(challengeId, newProgress) {
  const all = await getAllRecords(STORE.CHALLENGES);
  const challenge = all.find((c) => c.id === challengeId);
  if (!challenge) throw new Error('updateChallengeProgress: التحدي غير موجود');

  challenge.currentProgress = newProgress;
  if (!challenge.completed && newProgress >= challenge.targetValue) {
    challenge.completed = true;
    challenge.completedAt = new Date().toISOString();
  }
  await putRecord(STORE.CHALLENGES, challenge);
  return challenge;
}

/**
 * يحسب الـStreak الحالي: عدد الأيام المتتالية (من الأحدث للأقدم) اللي
 * حققت الشرط في `dailyResultsDescending` (true = محقَّق، مرتّبة من أحدث
 * يوم للأقدم). يتوقف عند أول يوم غير محقَّق أو أول فجوة (يوم مفقود).
 * @param {boolean[]} dailyResultsDescending
 */
export function calculateStreak(dailyResultsDescending) {
  let streak = 0;
  for (const dayAchieved of dailyResultsDescending) {
    if (dayAchieved) streak += 1;
    else break;
  }
  return streak;
}
