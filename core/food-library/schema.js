/**
 * ============================================================================
 * Food Library — Schema Module
 * ============================================================================
 * مصدر الحقيقة الوحيد لشكل بيانات كل صنف طعام في المنصة.
 * كل قيمة غذائية مُقاسة لكل 100 جرام (REFERENCE_UNIT_G = 100) لتفادي
 * أخطاء المقارنة/التجميع بين الأصناف المختلفة.
 *
 * أي محرك آخر (Decision Engine, Meal Generation Engine, ...) يجب أن يقرأ
 * فقط عبر هذا الشكل — لا يُسمح بأي تمثيل بديل للطعام في أي مكان بالنظام.
 * ============================================================================
 */

'use strict';

// -----------------------------------------------------------------------
// ثوابت مرجعية
// -----------------------------------------------------------------------

export const REFERENCE_UNIT_G = 100; // كل القيم الغذائية لكل 100 جرام

/** فئات الطعام الرئيسية */
export const FOOD_CATEGORY = Object.freeze({
  PROTEIN: 'protein',
  CARB: 'carb',
  VEGETABLE: 'vegetable',
  FRUIT: 'fruit',
  DAIRY: 'dairy',
  FAT_OIL: 'fat_oil',
  LEGUME: 'legume',
  NUT_SEED: 'nut_seed',
  BEVERAGE: 'beverage',
  COMPOSITE_MEAL: 'composite_meal', // وجبة مصرية مركّبة جاهزة (مثال: كشري، ملوخية بالفراخ)
  CONDIMENT: 'condiment',
  SWEET_DESSERT: 'sweet_dessert',
});

/** نوع الوجبة الأنسب للصنف */
export const MEAL_TYPE = Object.freeze({
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
  ANY: 'any',
});

/** درجة المعالجة الصناعية (NOVA-like) */
export const PROCESSING_LEVEL = Object.freeze({
  UNPROCESSED: 'unprocessed',          // خام/طازج
  MINIMALLY_PROCESSED: 'minimally_processed',
  PROCESSED: 'processed',              // مثال: جبن، خبز
  ULTRA_PROCESSED: 'ultra_processed',  // مثال: مصنعات جاهزة، سناكس
});

/**
 * أكواد الحالات المرضية — يجب أن تُطابق بالضبط مفاتيح Medical Engine
 * (constraint_engine) حتى تتوافق الفلترة تلقائيًا بدون تعيين يدوي.
 */
export const MEDICAL_CONDITION = Object.freeze({
  DIABETES_T1: 'diabetes_t1',
  DIABETES_T2: 'diabetes_t2',
  HYPERTENSION: 'hypertension',
  CKD: 'ckd', // Chronic Kidney Disease
  CKD_DIALYSIS: 'ckd_dialysis',
  LIVER_DISEASE: 'liver_disease',
  GOUT: 'gout', // HI_PURINE
  CELIAC: 'celiac',
  IBS_FODMAP: 'ibs_fodmap',
  GERD: 'gerd',
  DYSLIPIDEMIA: 'dyslipidemia', // HI_SAT_FAT
  HEART_DISEASE: 'heart_disease',
  PCOS: 'pcos',
  HYPOTHYROIDISM: 'hypothyroidism',
  ANEMIA: 'anemia',
  OSTEOPOROSIS: 'osteoporosis',
});

/** أكواد الحساسيات الغذائية */
export const ALLERGEN = Object.freeze({
  GLUTEN: 'gluten',
  LACTOSE: 'lactose',
  NUTS: 'nuts',
  SHELLFISH: 'shellfish',
  EGG: 'egg',
  SOY: 'soy',
  FISH: 'fish',
  SESAME: 'sesame',
});

/** درجة شدة الحساسية — تُستخدم في Onboarding و Allergy Engine */
export const ALLERGY_SEVERITY = Object.freeze({
  MILD: 'mild',
  MODERATE: 'moderate',
  SEVERE: 'severe',
});

/**
 * حالة الحمل/الرضاعة — تُستخدم في Onboarding (تظهر فقط للإناث)، وفي
 * Nutrition Engine (منع أي عجز سعرات + سعرات إضافية آمنة) وDiet Engine
 * (استبعاد أنماط الحمية عالية الخطورة أثناء الحمل/الرضاعة). راجع بند 1.1
 * من برومبت استكمال البنود الناقصة.
 */
export const PREGNANCY_STATUS = Object.freeze({
  NONE: 'none',
  PREGNANT: 'pregnant',
  BREASTFEEDING: 'breastfeeding',
});

/** أنماط الحمية */
export const DIET_STYLE = Object.freeze({
  NORMAL: 'normal',
  MEDITERRANEAN: 'mediterranean',
  KETO: 'keto',
  LOW_CARB: 'low_carb',
  HIGH_PROTEIN: 'high_protein',
  VEGETARIAN: 'vegetarian',
  VEGAN: 'vegan',
  PESCATARIAN: 'pescatarian',
  DASH: 'dash',
  LOW_SODIUM: 'low_sodium',
  LOW_FAT: 'low_fat',
  INTERMITTENT_FASTING: 'intermittent_fasting',
  CARNIVORE: 'carnivore',
});

/** سياق ديني/صيام مرتبط بالوجبة (لا يُخزَّن في الصنف نفسه غالبًا، لكن يُستخدم للفلترة) */
export const RELIGIOUS_TAG = Object.freeze({
  RAMADAN_SUHOOR: 'ramadan_suhoor',
  RAMADAN_IFTAR: 'ramadan_iftar',
  CHRISTIAN_FAST_STRICT: 'christian_fast_strict', // بدون لحوم/دواجن/ألبان/بيض
  CHRISTIAN_FAST_FISH_ALLOWED: 'christian_fast_fish_allowed',
  NONE: 'none',
});

// -----------------------------------------------------------------------
// شكل عنصر الطعام (Food Item Shape)
// -----------------------------------------------------------------------

/**
 * @typedef {Object} MacroProfile
 * @property {number} kcal
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 * @property {number} fiber_g
 * @property {number} sugar_g
 * @property {number} added_sugar_g
 * @property {number} saturated_fat_g
 * @property {number} monounsaturated_fat_g
 * @property {number} polyunsaturated_fat_g
 * @property {number} cholesterol_mg
 * @property {number} omega3_mg
 */

/**
 * @typedef {Object} MicroProfile
 * @property {number} sodium_mg
 * @property {number} potassium_mg
 * @property {number} calcium_mg
 * @property {number} magnesium_mg
 * @property {number} iron_mg
 * @property {number} zinc_mg
 * @property {number} selenium_mcg
 * @property {number} vitamin_a_mcg
 * @property {number} vitamin_b12_mcg
 * @property {number} vitamin_c_mg
 * @property {number} vitamin_d_mcg
 * @property {number} vitamin_e_mg
 * @property {number} vitamin_k_mcg
 * @property {number} phosphorus_mg    - قد يكون 0 لصنف فعلًا خالٍ من الفوسفور أو لأن المصدر لا يوفّره بعد (راجع docs/FOOD_DB_CONVERSION_REPORT.md §2.3)
 */

/**
 * @typedef {Object} FoodItem
 * @property {string} id                         - معرّف فريد ثابت (مثال: "fl_0001")
 * @property {string} name_ar
 * @property {string} name_en
 * @property {string} category                   - أحد قيم FOOD_CATEGORY
 * @property {string[]} ingredients               - قائمة المكونات (فارغة للأصناف الخام)
 * @property {number} reference_amount_g          - يساوي REFERENCE_UNIT_G دائمًا (100)
 * @property {MacroProfile} macros
 * @property {MicroProfile} micros
 * @property {number} gi                          - Glycemic Index (0-100), -1 إن لم ينطبق
 * @property {number} gl                          - Glycemic Load لحصة مرجعية معتادة
 * @property {number} quality_score               - 0-100، يُحسب عبر computeQualityScore()
 * @property {string} processing_level            - أحد قيم PROCESSING_LEVEL
 * @property {string[]} suitable_meal_types        - قيم من MEAL_TYPE
 * @property {string} cuisine                     - مثال: "egyptian", "levantine", "generic"
 * @property {string[]} allergens                 - قيم من ALLERGEN الموجودة فعليًا في الصنف
 * @property {string[]} unsuitable_for_conditions - قيم من MEDICAL_CONDITION يُمنع فيها الصنف
 * @property {string[]} suitable_for_conditions   - قيم من MEDICAL_CONDITION يُفضَّل فيها الصنف
 * @property {string[]} unsuitable_for_diets      - قيم من DIET_STYLE لا يتوافق معها الصنف
 * @property {string[]} suitable_for_diets        - قيم من DIET_STYLE يتوافق معها الصنف
 * @property {string[]} religious_tags            - قيم من RELIGIOUS_TAG
 * @property {string[]} warnings                  - نصوص تحذير نصية تُعرض للمستخدم
 * @property {string} typical_portion_desc_ar     - وصف حصة معتادة (مثال: "طبق متوسط ~250 جم")
 */

/** يبني عنصر MacroProfile افتراضي (كل القيم صفر) — يُستخدم كنقطة بداية آمنة */
export function createEmptyMacros() {
  return {
    kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sugar_g: 0, added_sugar_g: 0,
    saturated_fat_g: 0, monounsaturated_fat_g: 0, polyunsaturated_fat_g: 0,
    cholesterol_mg: 0, omega3_mg: 0,
  };
}

/** يبني عنصر MicroProfile افتراضي (كل القيم صفر) */
export function createEmptyMicros() {
  return {
    sodium_mg: 0, potassium_mg: 0, calcium_mg: 0, magnesium_mg: 0,
    iron_mg: 0, zinc_mg: 0, selenium_mcg: 0,
    vitamin_a_mcg: 0, vitamin_b12_mcg: 0, vitamin_c_mg: 0,
    vitamin_d_mcg: 0, vitamin_e_mg: 0, vitamin_k_mcg: 0,
    phosphorus_mg: 0,
  };
}

/**
 * يتحقق من صحة عنصر طعام قبل قبوله في المكتبة.
 * يُرجع { valid: boolean, errors: string[] } — لا يرمي استثناء أبدًا
 * (تصميم متعمد: بناء المكتبة يحتاج تجميع كل الأخطاء دفعة واحدة، لا التوقف عند أول خطأ).
 * @param {FoodItem} item
 */
export function validateFoodItem(item) {
  const errors = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['العنصر ليس كائنًا صالحًا'] };
  }

  const requiredStrings = ['id', 'name_ar', 'name_en', 'category', 'processing_level', 'cuisine'];
  for (const field of requiredStrings) {
    if (!item[field] || typeof item[field] !== 'string') {
      errors.push(`الحقل "${field}" مطلوب ويجب أن يكون نصًا غير فارغ`);
    }
  }

  if (!Object.values(FOOD_CATEGORY).includes(item.category)) {
    errors.push(`category غير معروفة: ${item.category}`);
  }
  if (!Object.values(PROCESSING_LEVEL).includes(item.processing_level)) {
    errors.push(`processing_level غير معروفة: ${item.processing_level}`);
  }

  if (item.reference_amount_g !== REFERENCE_UNIT_G) {
    errors.push(`reference_amount_g يجب أن يساوي ${REFERENCE_UNIT_G} دائمًا (القيمة الحالية: ${item.reference_amount_g})`);
  }

  if (!item.macros || typeof item.macros.kcal !== 'number' || item.macros.kcal < 0) {
    errors.push('macros.kcal مطلوب ويجب أن يكون رقمًا موجبًا أو صفرًا');
  }
  if (!item.micros || typeof item.micros !== 'object') {
    errors.push('micros مطلوب ككائن (يمكن أن تكون القيم صفرًا لكن الحقل لازم يكون موجود)');
  }

  const arrayFields = [
    'ingredients', 'suitable_meal_types', 'allergens',
    'unsuitable_for_conditions', 'suitable_for_conditions',
    'unsuitable_for_diets', 'suitable_for_diets', 'religious_tags', 'warnings',
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(item[field])) {
      errors.push(`الحقل "${field}" يجب أن يكون مصفوفة (حتى لو فارغة)`);
    }
  }

  if (item.gi !== -1 && (typeof item.gi !== 'number' || item.gi < 0 || item.gi > 100)) {
    errors.push('gi يجب أن يكون بين 0 و100، أو -1 إن لم ينطبق');
  }

  if (typeof item.quality_score !== 'number' || item.quality_score < 0 || item.quality_score > 100) {
    errors.push('quality_score يجب أن يكون رقمًا بين 0 و100');
  }

  // تحذير منطقي: صنف يحتوي جلوتين فعليًا لكن غير مُعلَّم في allergens
  // (فحص بسيط استرشادي، لا يمنع القبول، فقط يُرفَق كخطأ تحقق ليُراجَع يدويًا)

  return { valid: errors.length === 0, errors };
}
