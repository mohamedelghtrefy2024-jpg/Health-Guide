/**
 * ============================================================================
 * Diet Style Engine
 * ============================================================================
 * يحوّل نمط الحمية المختار إلى قيد توافق واحد (الصنف يجب ألا يكون مصنَّفًا
 * ضمن `unsuitable_for_diets` لهذا النمط). "عادي" (normal) لا يُنتج أي قيد.
 *
 * مستوى الالتزام (صارم/مرن) لا يُترجَم لقيد صحي هنا — حسب مستند الرؤية هو
 * يتحكم في *تنوع* الوجبات المقترحة فقط، وليس في صحة/عدم صحة الصنف من
 * الأساس، فلا يخص Decision Engine في مرحلة الفلترة القيدية. التنفيذ الفعلي
 * لتأثيره على التنوع موجود في Meal Generation Engine (باراميتر
 * `adherenceLevel` في `generateMeal()` — راجع بند 1.3 من برومبت استكمال
 * البنود الناقصة).
 * ============================================================================
 */

'use strict';

import { createConstraint, CONSTRAINT_KIND, CONSTRAINT_SOURCE } from './constraint-schema.js';
import { DIET_STYLE } from '../food-library/schema.js';

const DIET_LABEL_AR = {
  [DIET_STYLE.MEDITERRANEAN]: 'المتوسطية',
  [DIET_STYLE.KETO]: 'الكيتو',
  [DIET_STYLE.LOW_CARB]: 'قليلة الكارب',
  [DIET_STYLE.HIGH_PROTEIN]: 'عالية البروتين',
  [DIET_STYLE.VEGETARIAN]: 'النباتية',
  [DIET_STYLE.VEGAN]: 'النباتية الصرفة',
  [DIET_STYLE.PESCATARIAN]: 'البيسكيتاريان',
  [DIET_STYLE.DASH]: 'DASH',
  [DIET_STYLE.LOW_SODIUM]: 'قليلة الصوديوم',
  [DIET_STYLE.LOW_FAT]: 'قليلة الدهون',
  [DIET_STYLE.INTERMITTENT_FASTING]: 'الصيام المتقطع',
  [DIET_STYLE.CARNIVORE]: 'الكارنيفور',
};

/**
 * أنماط حمية عالية الخطورة أثناء الحمل/الرضاعة — تُستبدل تلقائيًا بالنمط
 * العادي عند بناء قيود التوافق، حتى لو المستخدمة اختارتها صراحة بالبروفايل.
 * نفس مبدأ الاستبعاد مطبَّق بشكل مستقل في Nutrition Engine (لأهداف الماكرو)
 * بدون استيراد متبادل بين الاثنين (استقلالية Nutrition Engine بالتصميم).
 */
const HIGH_RISK_DIETS_DURING_PREGNANCY = new Set([DIET_STYLE.KETO, DIET_STYLE.INTERMITTENT_FASTING]);

/**
 * يحدّد نمط الحمية "الآمن" الفعلي المستخدَم لبناء قيود التوافق: النمط
 * المختار كما هو، إلا لو كان عالي الخطورة والمستخدمة حامل/مرضعة — عندها
 * يُستبدل بالنمط العادي إلزاميًا (قيد أمان غير قابل للتجاوز من الواجهة).
 * @param {string|null} dietStyle
 * @param {string} [pregnancyStatus] - 'none'|'pregnant'|'breastfeeding'
 * @returns {{ dietStyle: string|null, overridden: boolean, reason_ar: string|null }}
 */
export function resolveEffectiveDietStyle(dietStyle, pregnancyStatus = 'none') {
  const isPregnancyOrBreastfeeding = pregnancyStatus === 'pregnant' || pregnancyStatus === 'breastfeeding';
  if (isPregnancyOrBreastfeeding && HIGH_RISK_DIETS_DURING_PREGNANCY.has(dietStyle)) {
    const label = DIET_LABEL_AR[dietStyle] ?? dietStyle;
    return {
      dietStyle: DIET_STYLE.NORMAL,
      overridden: true,
      reason_ar: `نمط الحمية "${label}" غير آمن أثناء الحمل/الرضاعة — تم استبداله تلقائيًا بالنمط العادي في فلترة الأصناف إلى حين استشارة طبية مباشرة`,
    };
  }
  return { dietStyle, overridden: false, reason_ar: null };
}

/**
 * @param {string} dietStyle - أحد قيم DIET_STYLE
 * @returns {import('./constraint-schema.js').Constraint[]}
 */
export function buildDietConstraints(dietStyle) {
  if (!dietStyle || dietStyle === DIET_STYLE.NORMAL) {
    return []; // النمط "عادي" لا يستبعد أي شيء
  }

  const label = DIET_LABEL_AR[dietStyle] ?? dietStyle;
  return [
    createConstraint({
      source: CONSTRAINT_SOURCE.DIET,
      source_detail: dietStyle,
      kind: CONSTRAINT_KIND.REQUIRE_DIET_COMPATIBLE,
      message_ar: `أصناف غير متوافقة مع نمط الحمية "${label}"`,
    }),
  ];
}
