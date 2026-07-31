/**
 * ============================================================================
 * Food Library — Engine
 * ============================================================================
 * الطبقة الوحيدة المسموح لأي محرك آخر (Decision Engine, Meal Generation
 * Engine, ...) بالقراءة منها. لا يوجد وصول مباشر لـ FOODS_DATA من خارج
 * هذا الملف — أي استعلام يمر من هنا لضمان اتساق منطق الفلترة في مكان واحد.
 * ============================================================================
 */

'use strict';

import { FOODS_DATA } from './foods-data.js';
import { validateFoodItem, RELIGIOUS_TAG } from './schema.js';

/**
 * BUG-S25-06: صيام "مسموح فيه السمك" (christian_fast_fish_allowed) أقل
 * تشددًا من الصيام "الصارم" (christian_fast_strict) بالتعريف — أي صنف
 * مسموح في الصارم (خالٍ من لحوم/دواجن/ألبان/بيض) مسموح تلقائيًا في
 * "مسموح فيه السمك" كمان (فوق كده مسموح فيه سمك زيادة). لكن بيانات
 * الأصناف الخام كانت بتحط الوسمين بشكل منفصل تمامًا بدون أي توريث:
 * تحقّقت فعليًا — كل الـ1309 صنف المعلَّم "christian_fast_strict" مكنش
 * حد منهم معلَّم "christian_fast_fish_allowed" كمان. النتيجة: توليد وجبة
 * وقت "مسموح فيه السمك" كان بيرجع 154 صنف بس (غالبًا أسماك فقط)، بينما
 * نفس التوليد وقت "الصارم" (المفروض يكون خيارات أقل!) كان بيرجع 1013 —
 * مقلوب تمامًا لمعنى المصطلحين. الإصلاح في نقطة التحميل الوحيدة المسموح
 * بيها (مش في بيانات الأصناف الخام نفسها ولا في منطق تقييم القيد) —
 * أي صنف معلَّم "strict" يتوسّم "fish_allowed" تلقائيًا هنا لو مش متوسّم
 * بيه بالفعل، قبل ما يدخل الفهرس.
 */
function normalizeReligiousTags(item) {
  if (
    item.religious_tags?.includes(RELIGIOUS_TAG.CHRISTIAN_FAST_STRICT) &&
    !item.religious_tags.includes(RELIGIOUS_TAG.CHRISTIAN_FAST_FISH_ALLOWED)
  ) {
    return { ...item, religious_tags: [...item.religious_tags, RELIGIOUS_TAG.CHRISTIAN_FAST_FISH_ALLOWED] };
  }
  return item;
}

// -----------------------------------------------------------------------
// تهيئة وفحص سلامة البيانات عند التحميل
// -----------------------------------------------------------------------

/**
 * يبني فهرس (index) داخلي بالمعرّف لتسريع البحث.
 * يتحقق من صحة كل عنصر عند البناء ويجمع كل الأخطاء (لا يتوقف عند أول خطأ)
 * حتى تظهر كل مشاكل البيانات دفعة واحدة أثناء التطوير.
 */
function buildLibrary(rawData) {
  const byId = new Map();
  const invalidItems = [];
  const seenIds = new Set();

  for (const rawItem of rawData) {
    const item = normalizeReligiousTags(rawItem);
    const { valid, errors } = validateFoodItem(item);
    if (!valid) {
      invalidItems.push({ id: item?.id ?? '(بدون id)', errors });
      continue; // لا يُضاف عنصر غير صالح للمكتبة النشطة
    }
    if (seenIds.has(item.id)) {
      invalidItems.push({ id: item.id, errors: [`معرّف مكرر: ${item.id}`] });
      continue;
    }
    seenIds.add(item.id);
    byId.set(item.id, item);
  }

  return { byId, invalidItems };
}

const { byId: FOOD_INDEX, invalidItems: INVALID_ITEMS } = buildLibrary(FOODS_DATA);

if (INVALID_ITEMS.length > 0) {
  // تحذير تطويري صريح — لا يُسكت أبدًا، لأن أي صنف غير صالح يعني نقص بيانات
  // قد يُنتج قرارات خاطئة لاحقًا في Decision Engine
  // eslint-disable-next-line no-console
  console.warn('[FoodLibrary] عناصر مرفوضة من المكتبة بسبب أخطاء تحقق:', INVALID_ITEMS);
}

// -----------------------------------------------------------------------
// واجهات القراءة الأساسية
// -----------------------------------------------------------------------

/** يُرجع كل الأصناف الصالحة في المكتبة (نسخة مصفوفة، لا مرجع مباشر للـ Map) */
export function getAllFoods() {
  return Array.from(FOOD_INDEX.values());
}

/** يُرجع صنفًا واحدًا بالمعرّف، أو null إن لم يوجد */
export function getFoodById(id) {
  return FOOD_INDEX.get(id) ?? null;
}

/** عدد الأصناف الصالحة المحمّلة فعليًا + عدد المرفوض (للتشخيص أثناء التطوير) */
export function getLibraryStats() {
  return {
    total_valid: FOOD_INDEX.size,
    total_invalid: INVALID_ITEMS.length,
    invalid_items: INVALID_ITEMS,
  };
}

// -----------------------------------------------------------------------
// فلترة بالخصائص — البحث الذكي المطلوب في المستند
// -----------------------------------------------------------------------

/**
 * يفلتر قائمة أصناف حسب مجموعة شروط اختيارية. كل شرط غير مُمرَّر يُتجاهل.
 * هذه الدالة "أممية" — Decision Engine يبني فوقها منطق التقاطع الخاص به،
 * لكن الفلترة الفعلية على البيانات الخام تحدث هنا فقط.
 *
 * @param {Object} criteria
 * @param {string} [criteria.category]
 * @param {string[]} [criteria.mealType]              - يطابق أي قيمة من suitable_meal_types
 * @param {string[]} [criteria.excludeAllergens]       - يستبعد أي صنف يحتوي أيًا من هذه الحساسيات
 * @param {string[]} [criteria.excludeConditions]      - يستبعد أي صنف ممنوع لأي من هذه الحالات
 * @param {string[]} [criteria.requireDiets]           - يبقي فقط الأصناف المتوافقة مع كل هذه الأنماط
 * @param {string[]} [criteria.religiousTags]          - يطابق أي وسم ديني من هذه القائمة
 * @param {number}   [criteria.minQualityScore]
 * @param {number}   [criteria.maxSodiumMg]
 * @param {number}   [criteria.maxGi]
 * @param {number}   [criteria.minProteinG]
 * @param {number}   [criteria.minCalciumMg]
 * @returns {import('./schema.js').FoodItem[]}
 */
export function filterFoods(criteria = {}) {
  let results = getAllFoods();

  if (criteria.category) {
    results = results.filter((f) => f.category === criteria.category);
  }

  if (criteria.mealType?.length) {
    results = results.filter((f) =>
      f.suitable_meal_types.some((mt) => criteria.mealType.includes(mt))
    );
  }

  if (criteria.excludeAllergens?.length) {
    results = results.filter((f) =>
      !f.allergens.some((a) => criteria.excludeAllergens.includes(a))
    );
  }

  if (criteria.excludeConditions?.length) {
    results = results.filter((f) =>
      !f.unsuitable_for_conditions.some((c) => criteria.excludeConditions.includes(c))
    );
  }

  if (criteria.requireDiets?.length) {
    results = results.filter((f) =>
      criteria.requireDiets.every((d) => !f.unsuitable_for_diets.includes(d))
    );
  }

  if (criteria.religiousTags?.length) {
    results = results.filter((f) =>
      f.religious_tags.some((t) => criteria.religiousTags.includes(t))
    );
  }

  if (typeof criteria.minQualityScore === 'number') {
    results = results.filter((f) => f.quality_score >= criteria.minQualityScore);
  }

  if (typeof criteria.maxSodiumMg === 'number') {
    results = results.filter((f) => f.micros.sodium_mg <= criteria.maxSodiumMg);
  }

  if (typeof criteria.maxGi === 'number') {
    results = results.filter((f) => f.gi === -1 || f.gi <= criteria.maxGi);
  }

  if (typeof criteria.minProteinG === 'number') {
    results = results.filter((f) => f.macros.protein_g >= criteria.minProteinG);
  }

  if (typeof criteria.minCalciumMg === 'number') {
    results = results.filter((f) => f.micros.calcium_mg >= criteria.minCalciumMg);
  }

  return results;
}

/**
 * بحث نصي بسيط بالاسم (عربي/إنجليزي)، غير حساس لحالة الأحرف.
 * ملاحظة: نسخة مبدئية — التطبيع الكامل (توحيد الهمزات، إزالة التشكيل)
 * يُبنى لاحقًا كوظيفة منفصلة قابلة لإعادة الاستخدام في كل النظام.
 */
export function searchFoodsByName(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getAllFoods().filter(
    (f) => f.name_ar.toLowerCase().includes(q) || f.name_en.toLowerCase().includes(q)
  );
}
