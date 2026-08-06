/**
 * ============================================================================
 * Meal Plan Templates — البرنامج الغذائي المتكامل (كل المستويات)
 * ============================================================================
 * مبني من ملف إكسل رفعه المستخدم (البرنامج الغذائي الأصلي بتاعه، 7 مستويات
 * سعرات: 1200–2500، أسبوع كامل لكل مستوى). كل مكوّن اتربط بصنف فعلي من
 * مكتبة الطعام (food_id) — التفاصيل الكاملة لكل قرار مطابقة (تطابق تام،
 * بديل أقرب، تقسيم صنف مركّب) موثَّقة في docs/S53_MEAL_PLAN_TEMPLATE_MAPPING_REPORT.md
 *
 * مهم: الجرامات هنا ثابتة (مأخوذة من خطة المستخدم الأصلية بعد تحويل
 * الوحدات لجرامات) — مش متولّدة من محرك القرارات. يعني القوالب دي
 * بتتجاهل قيود المستخدم الطبية/الدينية الحالية عمدًا (هي خطة جاهزة
 * بالكامل من مصدر خارجي، مش توليد ديناميكي) — لازم تُعرَض كـ"مرجع/قالب
 * جاهز" واضح، مش كناتج توليد آمن مضمون التوافق مع كل قيود البروفايل.
 * السعرات الفعلية المحسوبة (من ماكروز المكتبة الحقيقية) قريبة من مستوى
 * السعرات المُسمّى بهامش ~4-7% على مستوى اليوم الكامل (تحقَّق منه فعليًا)،
 * لكن ممكن تفرق أكتر على مستوى الوجبة المفردة — طبيعي، لأن قاعدة البيانات
 * هنا مصدرها مختلف عن مصدر الأرقام الأصلية في ملف الإكسل.
 * ============================================================================
 */

'use strict';

export const MEAL_PLAN_CALORIE_LEVELS = [1200, 1400, 1600, 1800, 2000, 2200, 2500];

export const MEAL_PLAN_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** أقرب مستوى سعرات جاهز لهدف سعرات معيّن — لتفعيل "اقترح المستوى المناسب ليّا" بالواجهة */
export function nearestCalorieLevel(targetKcal) {
  return MEAL_PLAN_CALORIE_LEVELS.reduce((closest, level) =>
    Math.abs(level - targetKcal) < Math.abs(closest - targetKcal) ? level : closest
  , MEAL_PLAN_CALORIE_LEVELS[0]);
}

/** @type {Record<number, Record<string, Record<string, Array<{food_id: string, grams: number}>>>>} */
export const MEAL_PLAN_TEMPLATES = {
  1200: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 81 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 116 }, { food_id: 'food_5359', grams: 163 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 8 }],
      'سناك': [{ food_id: 'food_5456', grams: 144 }, { food_id: 'food_5386', grams: 10 }],
      'عشاء': [{ food_id: 'food_5309', grams: 112 }, { food_id: 'food_5305', grams: 77 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 46 }, { food_id: 'food_5451', grams: 206 }, { food_id: 'food_5272', grams: 81 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 124 }, { food_id: 'food_5359', grams: 125 }, { food_id: 'food_5452', grams: 177 }, { food_id: 'food_5341', grams: 8 }],
      'سناك': [{ food_id: 'food_5308', grams: 94 }, { food_id: 'food_5274', grams: 112 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 48 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5457', grams: 208 }, { food_id: 'food_5305', grams: 92 }, { food_id: 'food_5364', grams: 30 }],
      'غداء': [{ food_id: 'food_5301', grams: 210 }, { food_id: 'food_5359', grams: 163 }, { food_id: 'food_5341', grams: 20 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 24 }, { food_id: 'food_5107', grams: 13 }],
      'عشاء': [{ food_id: 'food_4033', grams: 189 }, { food_id: 'food_5305', grams: 66 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 60 }, { food_id: 'food_5450', grams: 42 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 264 }, { food_id: 'food_5459', grams: 48 }, { food_id: 'food_4554', grams: 137 }, { food_id: 'food_5430', grams: 7 }],
      'سناك': [{ food_id: 'food_5456', grams: 156 }, { food_id: 'food_5107', grams: 8 }],
      'عشاء': [{ food_id: 'food_2410', grams: 102 }, { food_id: 'food_3673', grams: 79 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5280', grams: 90 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 116 }, { food_id: 'food_5372', grams: 167 }, { food_id: 'food_4904', grams: 212 }, { food_id: 'food_5430', grams: 14 }],
      'سناك': [{ food_id: 'food_4033', grams: 149 }, { food_id: 'food_5456', grams: 60 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 111 }, { food_id: 'food_4554', grams: 93 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 73 }, { food_id: 'food_5309', grams: 140 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 277 }, { food_id: 'food_4554', grams: 206 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 86 }, { food_id: 'food_5456', grams: 96 }],
      'عشاء': [{ food_id: 'food_5309', grams: 140 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 30 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 42 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 81 }, { food_id: 'food_5319', grams: 103 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 264 }, { food_id: 'food_5454', grams: 87 }, { food_id: 'food_4554', grams: 137 }],
      'سناك': [{ food_id: 'food_5281', grams: 16 }, { food_id: 'food_5386', grams: 9 }, { food_id: 'food_4033', grams: 80 }],
      'عشاء': [{ food_id: 'food_5308', grams: 140 }, { food_id: 'food_5460', grams: 9 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
  1400: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 158 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 136 }, { food_id: 'food_5359', grams: 190 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 11 }],
      'سناك': [{ food_id: 'food_5456', grams: 168 }, { food_id: 'food_5386', grams: 12 }],
      'عشاء': [{ food_id: 'food_5309', grams: 131 }, { food_id: 'food_5305', grams: 90 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 54 }, { food_id: 'food_5451', grams: 240 }, { food_id: 'food_5272', grams: 94 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 144 }, { food_id: 'food_5359', grams: 146 }, { food_id: 'food_5452', grams: 207 }, { food_id: 'food_5341', grams: 9 }],
      'سناك': [{ food_id: 'food_5308', grams: 109 }, { food_id: 'food_5274', grams: 131 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 56 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 100 }, { food_id: 'food_5457', grams: 242 }, { food_id: 'food_5305', grams: 107 }, { food_id: 'food_5364', grams: 30 }],
      'غداء': [{ food_id: 'food_5301', grams: 245 }, { food_id: 'food_5359', grams: 190 }, { food_id: 'food_5341', grams: 20 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 24 }, { food_id: 'food_5107', grams: 15 }],
      'عشاء': [{ food_id: 'food_4033', grams: 220 }, { food_id: 'food_5305', grams: 77 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 60 }, { food_id: 'food_5450', grams: 48 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 308 }, { food_id: 'food_5459', grams: 56 }, { food_id: 'food_4554', grams: 160 }, { food_id: 'food_5430', grams: 7 }],
      'سناك': [{ food_id: 'food_5456', grams: 182 }, { food_id: 'food_5107', grams: 9 }],
      'عشاء': [{ food_id: 'food_2410', grams: 119 }, { food_id: 'food_3673', grams: 92 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 100 }, { food_id: 'food_5280', grams: 105 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 136 }, { food_id: 'food_5372', grams: 195 }, { food_id: 'food_4904', grams: 247 }, { food_id: 'food_5430', grams: 14 }],
      'سناك': [{ food_id: 'food_4033', grams: 173 }, { food_id: 'food_5456', grams: 70 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 129 }, { food_id: 'food_4554', grams: 108 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 86 }, { food_id: 'food_5309', grams: 164 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 323 }, { food_id: 'food_4554', grams: 240 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 101 }, { food_id: 'food_5456', grams: 112 }],
      'عشاء': [{ food_id: 'food_5309', grams: 164 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 30 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 49 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 94 }, { food_id: 'food_5319', grams: 120 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 308 }, { food_id: 'food_5454', grams: 102 }, { food_id: 'food_4554', grams: 160 }],
      'سناك': [{ food_id: 'food_5281', grams: 24 }, { food_id: 'food_5386', grams: 10 }, { food_id: 'food_4033', grams: 93 }],
      'عشاء': [{ food_id: 'food_5308', grams: 164 }, { food_id: 'food_5460', grams: 11 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
  1600: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 236 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 155 }, { food_id: 'food_5359', grams: 217 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 13 }],
      'سناك': [{ food_id: 'food_5456', grams: 192 }, { food_id: 'food_5386', grams: 13 }],
      'عشاء': [{ food_id: 'food_5309', grams: 150 }, { food_id: 'food_5305', grams: 103 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 62 }, { food_id: 'food_5451', grams: 274 }, { food_id: 'food_5272', grams: 108 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 165 }, { food_id: 'food_5359', grams: 167 }, { food_id: 'food_5452', grams: 236 }, { food_id: 'food_5341', grams: 11 }],
      'سناك': [{ food_id: 'food_5308', grams: 125 }, { food_id: 'food_5274', grams: 150 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 64 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 100 }, { food_id: 'food_5457', grams: 277 }, { food_id: 'food_5305', grams: 122 }, { food_id: 'food_5364', grams: 30 }],
      'غداء': [{ food_id: 'food_5301', grams: 280 }, { food_id: 'food_5359', grams: 217 }, { food_id: 'food_5341', grams: 20 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 32 }, { food_id: 'food_5107', grams: 18 }],
      'عشاء': [{ food_id: 'food_4033', grams: 251 }, { food_id: 'food_5305', grams: 88 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 90 }, { food_id: 'food_5450', grams: 55 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 352 }, { food_id: 'food_5459', grams: 64 }, { food_id: 'food_4554', grams: 183 }, { food_id: 'food_5430', grams: 7 }],
      'سناك': [{ food_id: 'food_5456', grams: 208 }, { food_id: 'food_5107', grams: 10 }],
      'عشاء': [{ food_id: 'food_2410', grams: 137 }, { food_id: 'food_3673', grams: 105 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 100 }, { food_id: 'food_5280', grams: 120 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 155 }, { food_id: 'food_5372', grams: 223 }, { food_id: 'food_4904', grams: 282 }, { food_id: 'food_5430', grams: 14 }],
      'سناك': [{ food_id: 'food_4033', grams: 198 }, { food_id: 'food_5456', grams: 80 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 147 }, { food_id: 'food_4554', grams: 123 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 98 }, { food_id: 'food_5309', grams: 187 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 369 }, { food_id: 'food_4554', grams: 274 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 115 }, { food_id: 'food_5456', grams: 128 }],
      'عشاء': [{ food_id: 'food_5309', grams: 187 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 30 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 56 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 108 }, { food_id: 'food_5319', grams: 137 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 352 }, { food_id: 'food_5454', grams: 116 }, { food_id: 'food_4554', grams: 183 }],
      'سناك': [{ food_id: 'food_5281', grams: 24 }, { food_id: 'food_5386', grams: 12 }, { food_id: 'food_4033', grams: 107 }],
      'عشاء': [{ food_id: 'food_5308', grams: 187 }, { food_id: 'food_5460', grams: 12 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
  1800: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 314 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 175 }, { food_id: 'food_5359', grams: 244 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 15 }],
      'سناك': [{ food_id: 'food_5456', grams: 216 }, { food_id: 'food_5386', grams: 15 }],
      'عشاء': [{ food_id: 'food_5309', grams: 168 }, { food_id: 'food_5305', grams: 116 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 69 }, { food_id: 'food_5451', grams: 309 }, { food_id: 'food_5272', grams: 121 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 186 }, { food_id: 'food_5359', grams: 188 }, { food_id: 'food_5452', grams: 266 }, { food_id: 'food_5341', grams: 12 }],
      'سناك': [{ food_id: 'food_5308', grams: 140 }, { food_id: 'food_5274', grams: 169 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 73 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 100 }, { food_id: 'food_5457', grams: 312 }, { food_id: 'food_5305', grams: 138 }, { food_id: 'food_5364', grams: 60 }],
      'غداء': [{ food_id: 'food_5301', grams: 315 }, { food_id: 'food_5359', grams: 244 }, { food_id: 'food_5341', grams: 20 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 32 }, { food_id: 'food_5107', grams: 20 }],
      'عشاء': [{ food_id: 'food_4033', grams: 283 }, { food_id: 'food_5305', grams: 99 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 90 }, { food_id: 'food_5450', grams: 62 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 396 }, { food_id: 'food_5459', grams: 72 }, { food_id: 'food_4554', grams: 206 }, { food_id: 'food_5430', grams: 8 }],
      'سناك': [{ food_id: 'food_5456', grams: 234 }, { food_id: 'food_5107', grams: 12 }],
      'عشاء': [{ food_id: 'food_2410', grams: 154 }, { food_id: 'food_3673', grams: 119 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 100 }, { food_id: 'food_5280', grams: 135 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 175 }, { food_id: 'food_5372', grams: 251 }, { food_id: 'food_4904', grams: 318 }, { food_id: 'food_5430', grams: 14 }],
      'سناك': [{ food_id: 'food_4033', grams: 223 }, { food_id: 'food_5456', grams: 90 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 166 }, { food_id: 'food_4554', grams: 139 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 110 }, { food_id: 'food_5309', grams: 210 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 415 }, { food_id: 'food_4554', grams: 309 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 130 }, { food_id: 'food_5456', grams: 144 }],
      'عشاء': [{ food_id: 'food_5309', grams: 210 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 30 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 62 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 121 }, { food_id: 'food_5319', grams: 154 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 396 }, { food_id: 'food_5454', grams: 131 }, { food_id: 'food_4554', grams: 206 }],
      'سناك': [{ food_id: 'food_5281', grams: 24 }, { food_id: 'food_5386', grams: 13 }, { food_id: 'food_4033', grams: 120 }],
      'عشاء': [{ food_id: 'food_5308', grams: 211 }, { food_id: 'food_5460', grams: 14 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
  2000: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 392 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 194 }, { food_id: 'food_5359', grams: 271 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 17 }],
      'سناك': [{ food_id: 'food_5456', grams: 240 }, { food_id: 'food_5386', grams: 17 }],
      'عشاء': [{ food_id: 'food_5309', grams: 187 }, { food_id: 'food_5305', grams: 129 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 77 }, { food_id: 'food_5451', grams: 343 }, { food_id: 'food_5272', grams: 135 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 207 }, { food_id: 'food_5359', grams: 208 }, { food_id: 'food_5452', grams: 295 }, { food_id: 'food_5341', grams: 14 }],
      'سناك': [{ food_id: 'food_5308', grams: 156 }, { food_id: 'food_5274', grams: 188 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 81 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 100 }, { food_id: 'food_5457', grams: 346 }, { food_id: 'food_5305', grams: 153 }, { food_id: 'food_5364', grams: 60 }],
      'غداء': [{ food_id: 'food_5301', grams: 350 }, { food_id: 'food_5359', grams: 271 }, { food_id: 'food_5341', grams: 40 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 40 }, { food_id: 'food_5107', grams: 22 }],
      'عشاء': [{ food_id: 'food_4033', grams: 314 }, { food_id: 'food_5305', grams: 110 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 90 }, { food_id: 'food_5450', grams: 69 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 440 }, { food_id: 'food_5459', grams: 80 }, { food_id: 'food_4554', grams: 229 }, { food_id: 'food_5430', grams: 10 }],
      'سناك': [{ food_id: 'food_5456', grams: 260 }, { food_id: 'food_5107', grams: 13 }],
      'عشاء': [{ food_id: 'food_2410', grams: 171 }, { food_id: 'food_3673', grams: 132 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 100 }, { food_id: 'food_5280', grams: 150 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 194 }, { food_id: 'food_5372', grams: 279 }, { food_id: 'food_4904', grams: 353 }, { food_id: 'food_5430', grams: 14 }],
      'سناك': [{ food_id: 'food_4033', grams: 248 }, { food_id: 'food_5456', grams: 100 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 184 }, { food_id: 'food_4554', grams: 154 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 122 }, { food_id: 'food_5309', grams: 234 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 462 }, { food_id: 'food_4554', grams: 343 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 144 }, { food_id: 'food_5456', grams: 160 }],
      'عشاء': [{ food_id: 'food_5309', grams: 234 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 30 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 69 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 135 }, { food_id: 'food_5319', grams: 171 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 440 }, { food_id: 'food_5454', grams: 145 }, { food_id: 'food_4554', grams: 229 }],
      'سناك': [{ food_id: 'food_5281', grams: 32 }, { food_id: 'food_5386', grams: 15 }, { food_id: 'food_4033', grams: 133 }],
      'عشاء': [{ food_id: 'food_5308', grams: 234 }, { food_id: 'food_5460', grams: 16 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
  2200: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 470 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 213 }, { food_id: 'food_5359', grams: 299 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 20 }],
      'سناك': [{ food_id: 'food_5456', grams: 264 }, { food_id: 'food_5386', grams: 18 }],
      'عشاء': [{ food_id: 'food_5309', grams: 206 }, { food_id: 'food_5305', grams: 141 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 85 }, { food_id: 'food_5451', grams: 377 }, { food_id: 'food_5272', grams: 148 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 227 }, { food_id: 'food_5359', grams: 230 }, { food_id: 'food_5452', grams: 324 }, { food_id: 'food_5341', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 172 }, { food_id: 'food_5274', grams: 206 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 89 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 150 }, { food_id: 'food_5457', grams: 381 }, { food_id: 'food_5305', grams: 168 }, { food_id: 'food_5364', grams: 60 }],
      'غداء': [{ food_id: 'food_5301', grams: 385 }, { food_id: 'food_5359', grams: 299 }, { food_id: 'food_5341', grams: 40 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 40 }, { food_id: 'food_5107', grams: 24 }],
      'عشاء': [{ food_id: 'food_4033', grams: 346 }, { food_id: 'food_5305', grams: 121 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 120 }, { food_id: 'food_5450', grams: 76 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 484 }, { food_id: 'food_5459', grams: 88 }, { food_id: 'food_4554', grams: 251 }, { food_id: 'food_5430', grams: 10 }],
      'سناك': [{ food_id: 'food_5456', grams: 286 }, { food_id: 'food_5107', grams: 14 }],
      'عشاء': [{ food_id: 'food_2410', grams: 188 }, { food_id: 'food_3673', grams: 145 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 150 }, { food_id: 'food_5280', grams: 165 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 213 }, { food_id: 'food_5372', grams: 307 }, { food_id: 'food_4904', grams: 388 }, { food_id: 'food_5430', grams: 15 }],
      'سناك': [{ food_id: 'food_4033', grams: 272 }, { food_id: 'food_5456', grams: 110 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 203 }, { food_id: 'food_4554', grams: 170 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 135 }, { food_id: 'food_5309', grams: 257 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 508 }, { food_id: 'food_4554', grams: 377 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 158 }, { food_id: 'food_5456', grams: 176 }],
      'عشاء': [{ food_id: 'food_5309', grams: 257 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 30 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 76 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 148 }, { food_id: 'food_5319', grams: 189 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 484 }, { food_id: 'food_5454', grams: 160 }, { food_id: 'food_4554', grams: 251 }],
      'سناك': [{ food_id: 'food_5281', grams: 32 }, { food_id: 'food_5386', grams: 16 }, { food_id: 'food_4033', grams: 147 }],
      'عشاء': [{ food_id: 'food_5308', grams: 257 }, { food_id: 'food_5460', grams: 17 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
  2500: {
    'الأحد': {
      'فطار': [{ food_id: 'food_5304', grams: 50 }, { food_id: 'food_5309', grams: 587 }, { food_id: 'food_5430', grams: 7 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_5300', grams: 242 }, { food_id: 'food_5359', grams: 339 }, { food_id: 'food_5455', grams: 150 }, { food_id: 'food_5430', grams: 22 }],
      'سناك': [{ food_id: 'food_5456', grams: 300 }, { food_id: 'food_5386', grams: 21 }],
      'عشاء': [{ food_id: 'food_5309', grams: 234 }, { food_id: 'food_5305', grams: 161 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
    },
    'الاثنين': {
      'فطار': [{ food_id: 'food_4178', grams: 96 }, { food_id: 'food_5451', grams: 429 }, { food_id: 'food_5272', grams: 169 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_5458', grams: 258 }, { food_id: 'food_5359', grams: 261 }, { food_id: 'food_5452', grams: 369 }, { food_id: 'food_5341', grams: 17 }],
      'سناك': [{ food_id: 'food_5308', grams: 195 }, { food_id: 'food_5274', grams: 234 }, { food_id: 'food_5390', grams: 14 }],
      'عشاء': [{ food_id: 'food_4205', grams: 101 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الثلاثاء': {
      'فطار': [{ food_id: 'food_5449', grams: 150 }, { food_id: 'food_5457', grams: 433 }, { food_id: 'food_5305', grams: 191 }, { food_id: 'food_5364', grams: 60 }],
      'غداء': [{ food_id: 'food_5301', grams: 438 }, { food_id: 'food_5359', grams: 339 }, { food_id: 'food_5341', grams: 40 }, { food_id: 'food_5455', grams: 100 }],
      'سناك': [{ food_id: 'food_5281', grams: 48 }, { food_id: 'food_5107', grams: 28 }],
      'عشاء': [{ food_id: 'food_4033', grams: 393 }, { food_id: 'food_5305', grams: 138 }, { food_id: 'food_5364', grams: 30 }],
    },
    'الأربعاء': {
      'فطار': [{ food_id: 'food_5364', grams: 120 }, { food_id: 'food_5450', grams: 87 }, { food_id: 'food_5435', grams: 20 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_5230', grams: 50 }],
      'غداء': [{ food_id: 'food_2456', grams: 550 }, { food_id: 'food_5459', grams: 100 }, { food_id: 'food_4554', grams: 286 }, { food_id: 'food_5430', grams: 11 }],
      'سناك': [{ food_id: 'food_5456', grams: 325 }, { food_id: 'food_5107', grams: 16 }],
      'عشاء': [{ food_id: 'food_2410', grams: 213 }, { food_id: 'food_3673', grams: 165 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الخميس': {
      'فطار': [{ food_id: 'food_5304', grams: 150 }, { food_id: 'food_5280', grams: 188 }, { food_id: 'food_5364', grams: 60 }, { food_id: 'food_4872', grams: 100 }],
      'غداء': [{ food_id: 'food_5453', grams: 242 }, { food_id: 'food_5372', grams: 349 }, { food_id: 'food_4904', grams: 441 }, { food_id: 'food_5430', grams: 18 }],
      'سناك': [{ food_id: 'food_4033', grams: 310 }, { food_id: 'food_5456', grams: 125 }, { food_id: 'food_5391', grams: 14 }],
      'عشاء': [{ food_id: 'food_3347', grams: 230 }, { food_id: 'food_4554', grams: 193 }, { food_id: 'food_5364', grams: 30 }, { food_id: 'food_5430', grams: 7 }],
    },
    'الجمعة': {
      'فطار': [{ food_id: 'food_5449', grams: 50 }, { food_id: 'food_5305', grams: 153 }, { food_id: 'food_5309', grams: 292 }, { food_id: 'food_2706', grams: 45 }, { food_id: 'food_5231', grams: 50 }, { food_id: 'food_2759', grams: 50 }],
      'غداء': [{ food_id: 'food_2407', grams: 577 }, { food_id: 'food_4554', grams: 429 }, { food_id: 'food_5461', grams: 15 }],
      'سناك': [{ food_id: 'food_5308', grams: 180 }, { food_id: 'food_5456', grams: 200 }],
      'عشاء': [{ food_id: 'food_5309', grams: 292 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5364', grams: 60 }],
    },
    'السبت': {
      'فطار': [{ food_id: 'food_4178', grams: 87 }, { food_id: 'food_5304', grams: 50 }, { food_id: 'food_5272', grams: 169 }, { food_id: 'food_5319', grams: 214 }, { food_id: 'food_5435', grams: 20 }],
      'غداء': [{ food_id: 'food_2464', grams: 550 }, { food_id: 'food_5454', grams: 182 }, { food_id: 'food_4554', grams: 286 }],
      'سناك': [{ food_id: 'food_5281', grams: 32 }, { food_id: 'food_5386', grams: 18 }, { food_id: 'food_4033', grams: 167 }],
      'عشاء': [{ food_id: 'food_5308', grams: 292 }, { food_id: 'food_5460', grams: 19 }, { food_id: 'food_5435', grams: 20 }],
    },
  },
};