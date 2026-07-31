/**
 * ============================================================================
 * Religious / Fasting Engine
 * ============================================================================
 * على عكس Medical/Allergy، هذا القيد **سياقي وليس دائمًا**: يُفعَّل فقط عند
 * توليد وجبة لفترة صيام محددة (سحور رمضان، إفطار رمضان، الصوم المسيحي
 * بنوعيه). خارج فترات الصيام، لا يُنتج أي قيد إطلاقًا — كل الأصناف مسموحة
 * دينيًا افتراضيًا.
 * ============================================================================
 */

'use strict';

import { createConstraint, CONSTRAINT_KIND, CONSTRAINT_SOURCE } from './constraint-schema.js';
import { RELIGIOUS_TAG } from '../food-library/schema.js';

const TAG_LABEL_AR = {
  [RELIGIOUS_TAG.RAMADAN_SUHOOR]: 'سحور رمضان',
  [RELIGIOUS_TAG.RAMADAN_IFTAR]: 'إفطار رمضان',
  [RELIGIOUS_TAG.CHRISTIAN_FAST_STRICT]: 'الصوم المسيحي الصارم (بدون لحوم/دواجن/ألبان/بيض)',
  [RELIGIOUS_TAG.CHRISTIAN_FAST_FISH_ALLOWED]: 'الصوم المسيحي (مسموح فيه السمك)',
};

/**
 * @param {string|null} fastingTag - أحد قيم RELIGIOUS_TAG، أو null/NONE إن لم يكن وقت صيام
 * @returns {import('./constraint-schema.js').Constraint[]}
 */
export function buildReligiousConstraints(fastingTag) {
  if (!fastingTag || fastingTag === RELIGIOUS_TAG.NONE) {
    return []; // لا قيد ديني خارج فترات الصيام
  }

  const label = TAG_LABEL_AR[fastingTag] ?? fastingTag;
  return [
    createConstraint({
      source: CONSTRAINT_SOURCE.RELIGIOUS,
      source_detail: fastingTag,
      kind: CONSTRAINT_KIND.REQUIRE_RELIGIOUS_TAG,
      message_ar: `الوقت الحالي "${label}" — الأصناف يجب أن تكون مصنَّفة مناسبة لهذه الفترة تحديدًا`,
    }),
  ];
}
