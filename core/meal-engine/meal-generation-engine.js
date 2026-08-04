/**
 * ============================================================================
 * Meal Generation Engine
 * ============================================================================
 * يطبّق خط التوليد بالترتيب المحدد صراحة في مستند الرؤية (قسم 5):
 *
 *   قيود البروفايل (Decision Engine: مرض+حساسية+دين+حمية)
 *        ↓
 *   فلترة الجودة الدنيا المقبولة لكل صنف
 *        ↓
 *   فلترة نوع الوجبة (فطار/غدا/عشا/سناك)
 *        ↓
 *   بناء تركيبات مرشّحة (صنف واحد، أو تركيبات بروتين+كارب مع صفر/واحد/
 *   اثنين من الخضار وأحجام حصص واقعية متعددة + مكمّل دهون اختياري — تركيبات
 *   3-5 أصناف فعلية تُقيَّم كلها ويُختار أفضلها بالجودة الحقيقية، وليس حجم
 *   حصة ثابت مفترض) وتحجيمها بالجرام لتحقيق سعرات الوجبة المستهدفة
 *        ↓
 *   استبعاد أي تركيبة خارج هامش أهداف الماكرو المقبول
 *        ↓
 *   تقييم Meal Quality Score لكل تركيبة ناجية (يشمل تغطية المايكرو)
 *        ↓
 *   ترتيب واختيار أفضل تركيبة
 *
 * عند عدم وجود أي تركيبة صالحة: يُرجع تشخيصًا صريحًا يفرّق بين فشل بسبب
 * القيود الصحية/الدينية/الحمية (من Decision Engine) وفشل بسبب استحالة
 * الوصول لهدف الماكرو بالأصناف المتاحة (خاص بهذا المحرك) — حتى لا تُختلط
 * الرسالتان ويصبح التشخيص مضلِّلًا.
 * ============================================================================
 */

'use strict';

import { resolveAvailableFoods } from '../decision-engine/decision-engine.js';
import { computeMealQualityScore, classifyMealQualityScore } from './meal-quality.js';
import { DEFAULT_MEAL_SHARE } from '../nutrition-engine/nutrition-engine.js';
import { getFoodById } from '../food-library/food-library.js';
import { MEAL_PLAN_TEMPLATES } from './meal-plan-templates.js';

/** أقصى مضاعف واقعي لحجم الحصة المرجعية (100 جم) لتفادي كميات غير واقعية عند تحجيم صنف كثيف السعرات لسعرات وجبة كبيرة */
const MAX_PORTION_MULTIPLIER = 4; // أي أقصى 400 جم من الصنف الواحد

/**
 * عتبة كثافة بروتين (جم/100جم) فوقها الصنف يُعتبَر "مكمّل مركّز" (بروتين
 * مصل لبن/كازين/صويا معزول/بازلاء/أرز...) مش "طبق أساسي" — بيتاخد عادةً
 * كشيك لوحده، مش كأساس لطبق "بروتين+كارب+خضار". أعلى كثافة بروتين واقعية
 * لصنف طعام كامل (لحمة/سمك/بقوليات) بالمكتبة ~36 جم/100جم (فول الصويا
 * الجاف)؛ المكملات بتوصل لـ66-83 جم/100جم. بدون الاستبعاد ده، المكمّلات
 * (دهون شبه معدومة) بتدخل حوض "أساس الطبق" وتعتمد كليًا على مكمّل الدهون
 * التلقائي عشان توصل لهدف الدهون — وده بيكشف باج تاني مستتر (توابل جافة
 * زي الفلفل/الكركم/الكمون مصنَّفة "fat_oil" بدل "بهارات"، فمكمّل الدهون
 * بيختارها كأفضل مرشَّح رغم إنها فقيرة دهون فعليًا) فتفشل كل التركيبات في
 * تحقيق هامش الماكرو. الاستبعاد هنا نطاقه ضيق ومحدود (مكمّلات فقط) بدل ما
 * نصلح تصنيف "fat_oil" بالكامل (نطاق أوسع بيحتاج مراجعة Audit منفصلة).
 */
const PROTEIN_SUPPLEMENT_THRESHOLD_G = 50;

/**
 * S53-d (بطلب المستخدم بعد مراجعة فعلية لخطة يوم كامل): "305 جم تيمبه
 * العدس"، "154 جم شبت" كسناك كامل 3 مرات متتالية، و"دبس خروب" (شراب مكثّف
 * 300 سعرة/100جم) كـ"مشروب" — كل دي نتايج واقعية غير مقبولة رغم إنها مرّت
 * كل القيود الصحية/الدينية/هامش الماكرو تقنيًا. السبب الجذري: أي صنف مفرد
 * (`buildSingleItemCandidates`) كان مسموح يمثّل "وجبة كاملة" بمفرده بغض
 * النظر عن فئته، ومحجَّم لحد 400 جم بلا سقف مختلف حسب طبيعة الصنف.
 *
 * الفئات المسموح تبقى "وجبة/سناك قائم بذاته" (صنف واحد يمثّل الوجبة كلها):
 * وجبة مصرية مركّبة جاهزة (كشري/ملوخية..)، بروتين، بقوليات (فول مدمس/عدس
 * وجبة كاملة واقعيًا)، ألبان، فاكهة، مكسرات/بذور، مشروبات. أي فئة تانية
 * (خضار، بهارات/توابل، كارب مجرد، دهون/زيوت) لازم تظهر بس **جوّه تركيبة**
 * (`buildMacroDrivenCandidates`) مع بروتين/كارب أساسي — مش بديل عنهم.
 */
const STANDALONE_SINGLE_ITEM_CATEGORIES = new Set([
  'composite_meal', 'protein', 'legume', 'dairy', 'fruit', 'nut_seed', 'beverage',
]);

/**
 * BUG-S54-03 (بطلب المستخدم بعد مراجعة فعلية لوجبة "220 جم ترمس مصري = 814
 * سعرة" كغداء كامل): أصناف البقوليات الجافة/النيّة اللي محتاجة نقع/سلق قبل
 * الأكل (عدس/حمص/فول/فاصوليا/لوبيا/فول صويا بحالتها الجافة، + بوادئ تخمّر
 * زي "بادئ التيمبه/الناتو/الميسو" مش أكل أصلًا) قيمها الغذائية مأخوذة صح
 * بالوزن الجاف (370 سعرة/100جم للترمس مثلًا — مطابق لمرجع USDA الحقيقي)،
 * لكن فئة "legume" مسموحة تبقى "وجبة كاملة قائمة بذاتها" (سقف 350 جم) —
 * فمحدش بياكل 220 جم بقوليات جافة نيّة كوجبة، ودي غير الحالة الواقعية
 * لبقوليات مطبوخة جاهزة (فول مدمس/عدس مسلوق موجودين كأصناف منفصلة صح).
 * الحل: استبعاد الأصناف دي تحديدًا من `buildSingleItemCandidates` بس (تفضل
 * متاحة كمكوّن داخل تركيبة `buildMacroDrivenCandidates` بكمية أصغر، زي أي
 * صنف كارب/بروتين تاني) — نفس نمط `passesStandaloneFatOilRule` بالظبط.
 * صنف واحد استُثني منها: الفول السوداني (كان مصنَّف "legume" بالغلط رغم إنه
 * بيتاكل زي المكسرات مباشرة بدون طبخ) — اتنقل لفئة `nut_seed` بدل كده، عشان
 * ياخد سقف المكسرات الواقعي (60 جم) مش سقف البقوليات (350 جم).
 */
const RAW_UNCOOKED_LEGUME_IDS = new Set([
  'food_4199', 'food_4200', 'food_4201', 'food_4203', 'food_4204', 'food_4205', 'food_4206',
  'food_4207', 'food_4208', 'food_4209', 'food_4210', 'food_4211', 'food_4213', 'food_4214',
  'food_4215', 'food_4217', 'food_4218', 'food_4219', 'food_4220', 'food_4221', 'food_4222',
  'food_4223', 'food_4224', 'food_4225', 'food_4226', 'food_4227', 'food_4231', 'food_4232',
  'food_4233', 'food_4237', 'food_4238', 'food_4239', 'food_4240', 'food_4461', 'food_4462',
  'food_4463', 'food_4513', 'food_4636', 'food_4637', 'food_4867', 'food_4997', 'food_5000',
  'food_5001', 'food_5002', 'food_5003', 'food_5005', 'food_5006', 'food_5020', 'food_5021',
  'food_5030', 'food_5031', 'food_5032',
]);

/**
 * سقف جرامات واقعي لكل فئة لما الصنف يبقى "الوجبة كاملة" بمفرده — بديل عن
 * سقف 400 جم الموحَّد اللي كان بيسمح مثلًا بـ400 جم مكسرات (~2400 سعرة من
 * المكسرات لوحدها) أو 400 جم فاكهة سكرية دفعة واحدة. الفئات غير المذكورة
 * هنا بتستخدم السقف العام (400 جم).
 */
const SINGLE_ITEM_MAX_GRAMS_BY_CATEGORY = Object.freeze({
  nut_seed: 60,     // كثافة سعرات عالية جدًا — حفنة مكسرات واقعية، مش كوب
  fruit: 300,
  dairy: 300,
  protein: 300,
  legume: 350,
  composite_meal: 500,
  beverage: 400,
});

/**
 * حد كثافة سعرات واقعي لصنف "مشروب" فعلي (~≤90 سعرة/100جم يغطي اللبن
 * والعصائر والسموذي المعتدل) — يستبعد أصنافًا موسومة `beverage` بالغلط
 * وهي فعليًا شراب مكثّف/دبس (زي دبس الخروب 300 سعرة/100جم) لا يُشرب كوب
 * كامل منه عمليًا. مشكلة توسيم بيانات حقيقية (راجع ملاحظة الدقة في
 * `cuisine-engine.js`) — الفلترة هنا دفاع هندسي مؤقت، مش تصحيح توسيم شامل.
 */
const MAX_BEVERAGE_KCAL_PER_100G = 90;

/**
 * أحجام مجمّعات الترشيح (Candidate Pools) لكل دور في التركيبة — إلزامية
 * مع مكتبة طعام كبيرة (آلاف الأصناف): بدون هذا الحد، بناء التركيبات
 * "بروتين × كارب × خضار" يتحول لضرب ديكارتي كامل بين كل أصناف كل فئة
 * (مثال: 185 بروتين × 162 كارب × 436 خضار = ملايين التركيبات) وده بيفجّر
 * الذاكرة والوقت فورًا. بدل كده، نرشّح أفضل N صنف بكل فئة (بمعيار مركّب
 * من الجودة + كثافة العنصر الغذائي المطلوب) قبل التقاطع، فيبقى حجم البحث
 * محدود ومضمون بغض النظر عن حجم المكتبة الكلي.
 */
const CANDIDATE_POOL_SIZE = Object.freeze({ PROTEIN: 15, CARB: 15, VEGETABLE: 6, FAT: 4 });

/**
 * مجمّع ترشيح أضيق يُستخدم لمّا مستوى الالتزام بالحمية = "صارم" (بند 2 من
 * مستند الرؤية، الحقل dietAdherence): يقتصر على أعلى الأصناف توافقًا مع
 * نمط الحمية/كثافة العنصر الغذائي فقط، فتقل تلقائيًا التركيبات "الحدّية"
 * أو غير النمطية اللي بتظهر مع مجمّع أوسع. عند "مرن" يُستخدم المجمّع
 * الأصلي الأوسع بدون أي تغيير (سلوك قديم كما هو). راجع بند 1.3 من برومبت
 * استكمال البنود الناقصة.
 */
const STRICT_CANDIDATE_POOL_SIZE = Object.freeze({ PROTEIN: 5, CARB: 5, VEGETABLE: 2, FAT: 2 });

/** يرتّب مصفوفة تنازليًا بمعيار مركّب ويُرجع أفضل N فقط — يحدّ حجم البحث بغض النظر عن حجم المكتبة */
function selectTopCandidates(foods, scoreFn, limit) {
  return [...foods].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, limit);
}

/**
 * يحجّم صنفًا (لكل 100 جم) لكمية جرامات تحقق سعرات مستهدفة معيّنة، بحد
 * أقصى واقعي (عام أو مخصَّص حسب الفئة عبر SINGLE_ITEM_MAX_GRAMS_BY_CATEGORY)،
 * ويُرجع الجرامات الفعلية + هل تم قصّها عن الحد الواقعي.
 */
function scaleFoodToCalories(food, targetKcal) {
  // BUG-S24-03 (دفاع بطبقة ثانية): targetKcal<=0/غير منطقي يُصحَّح أصلًا عند
  // مدخل generateMeal، لكن هذه دالة داخلية قد تُستدعى مباشرة مستقبلًا —
  // حصة مرجعية آمنة بدل جرامات صفر/سالبة صامتة.
  if (!Number.isFinite(targetKcal) || targetKcal <= 0) return { grams: 100, capped: false };
  if (food.macros.kcal <= 0) return { grams: 100, capped: false }; // صنف بلا سعرات (نادر) — حصة مرجعية ثابتة
  const rawGrams = (targetKcal / food.macros.kcal) * 100;
  const maxGrams = SINGLE_ITEM_MAX_GRAMS_BY_CATEGORY[food.category] ?? (100 * MAX_PORTION_MULTIPLIER);
  const grams = Math.min(rawGrams, maxGrams);
  return { grams: Math.round(grams), capped: rawGrams > maxGrams };
}

/**
 * قاعدة أمان بند 1.4 (LIMIT-01 الموثَّق في SSCP_PROGRESS.md): عند غياب
 * `macroTargets` (السيناريو اللي بيفتح باب صنف واحد فقط كوجبة كاملة عبر
 * `buildSingleItemCandidates`)، يُستبعَد أي صنف من فئة "دهون/زيوت" لو كان
 * هو الصنف الوحيد في التركيبة — زيت زيتون مثلًا مايعديش كـ"وجبة كاملة"
 * غير واقعية. لا تأثير على التركيبات المدفوعة بالماكرو (فيها أصلًا بروتين
 * كأساس دائمًا)، ولا على أي صنف من فئة تانية غير دهون/زيوت.
 */
function passesStandaloneFatOilRule(candidate, macroTargets) {
  if (macroTargets) return true; // القاعدة تخص فقط سيناريو غياب أهداف الماكرو
  if (candidate.items.length !== 1) return true;
  return candidate.items[0].food.category !== 'fat_oil';
}

/** يتحقق إن كانت ماكروهات تركيبة معيّنة داخل هامش مقبول من الهدف */
function isWithinMacroMargin(totals, macroTargets, marginPct) {
  if (!macroTargets) return true;
  const checks = ['protein_g', 'carb_g', 'fat_g'];
  for (const key of checks) {
    const target = macroTargets[key];
    if (!target) continue;
    const actual = key === 'carb_g' ? totals.carbs_g : key === 'protein_g' ? totals.protein_g : totals.fat_g;
    const lowerBound = target * (1 - marginPct);
    const upperBound = target * (1 + marginPct * 1.5); // هامش أعلى أوسع (تجاوز بسيط أهون من نقص شديد)
    if (actual < lowerBound || actual > upperBound) return false;
  }
  return true;
}

/**
 * يبني كل تركيبات صنف واحد الممكنة من قائمة أصناف متاحة لنوع وجبة معيّن —
 * مقصور على الفئات اللي منطقيًا ممكن تمثّل وجبة/سناك قائم بذاته
 * (STANDALONE_SINGLE_ITEM_CATEGORIES)، مع استبعاد أي "مشروب" مكثّف
 * السعرات مش شراب فعليًا (دبس/شراب مركّز يمر بالغلط بفئة beverage).
 */
function buildSingleItemCandidates(foods, mealType, targetKcal) {
  return foods
    .filter((f) => f.suitable_meal_types.includes(mealType) || f.suitable_meal_types.includes('any'))
    .filter((f) => STANDALONE_SINGLE_ITEM_CATEGORIES.has(f.category))
    .filter((f) => !RAW_UNCOOKED_LEGUME_IDS.has(f.id)) // BUG-S54-03: بقوليات جافة/نيّة مش وجبة قائمة بذاتها
    .filter((f) => f.category !== 'beverage' || f.macros.kcal <= MAX_BEVERAGE_KCAL_PER_100G)
    .map((food) => {
      const { grams, capped } = scaleFoodToCalories(food, targetKcal);
      return { items: [{ food, grams }], capped };
    });
}

/**
 * أحجام حصص واقعية تُجرَّب لكل صنف خضار (بدل حصة ثابتة 100 جم) — كل حجم
 * يُنتج تركيبة مرشّحة منفصلة، ويُقيَّم Quality Score/هامش الماكرو لكل واحدة
 * بشكل مستقل لاحقًا، فيختار النظام فعليًا أنسب حجم بدل افتراض حجم واحد.
 */
const VEG_PORTION_OPTIONS_G = Object.freeze([50, 100, 150]);

/** أقصى عدد أصناف خضار تُدمَج معًا في تركيبة واحدة (لتنويع الألياف/الألوان) */
const MAX_VEG_ITEMS_PER_COMBO = 2;

/**
 * يبني تركيبات "مدفوعة بالماكرو": يختار صنف بروتين ويحجّمه ليحقق هدف
 * البروتين، ثم صنف كارب ويحجّمه ليغطي الكارب المتبقي بعد خصم مساهمة صنف
 * البروتين فيه، ثم يبني فعليًا **مجموعة تركيبات خضار متعددة الاحتمالات**
 * (صنف خضار واحد بأحجام حصص واقعية مختلفة، أو صنفي خضار معًا لتنويع
 * الألياف/الألوان — تحقيقًا لبند "دعم تركيبات 3+ أصناف بمحسّن حقيقي" بدل
 * الاكتفاء بحصة خضار ثابتة واحدة)، مع نسخة اختيارية لكل تركيبة بإضافة
 * مكمّل دهون. كل هذه المتغيّرات تُقيَّم لاحقًا بـQuality Score الحقيقي
 * ويُختار أفضلها فعليًا — التنويع هنا هو "المحسّن": نولّد الاحتمالات
 * الواقعية المعقولة ونترك التقييم الفعلي (لا افتراض مسبق) يحدد الأفضل.
 * هذا أدق من التقسيم العشوائي للسعرات لأنه يستهدف الماكرو مباشرة بدل
 * الاعتماد على تطابق الصدفة بين نسبة سعرات الصنف ونسبة الحمية المطلوبة.
 */
function buildMacroDrivenCandidates(foods, mealType, macroTargets, adherenceLevel = 'flexible') {
  if (!macroTargets) return [];
  const isSuitable = (f) => f.suitable_meal_types.includes(mealType) || f.suitable_meal_types.includes('any');
  const maxGrams = 100 * MAX_PORTION_MULTIPLIER;
  const MAX_FAT_TOPPER_GRAMS = 30; // أقصى حصة واقعية لزيت/دهن مضاف (~ملعقتين كبيرتين)
  const poolSize = adherenceLevel === 'strict' ? STRICT_CANDIDATE_POOL_SIZE : CANDIDATE_POOL_SIZE;

  const proteinFoodsAll = foods.filter((f) => (f.category === 'protein' || f.category === 'legume') && isSuitable(f) && f.macros.protein_g > 0 && f.macros.protein_g <= PROTEIN_SUPPLEMENT_THRESHOLD_G);
  const carbFoodsAll = foods.filter((f) => f.category === 'carb' && isSuitable(f) && f.macros.carbs_g > 0);
  const vegFoodsAll = foods.filter((f) => f.category === 'vegetable' && isSuitable(f));
  const fatFoodsAll = foods.filter((f) => f.category === 'fat_oil' && isSuitable(f) && f.macros.fat_g > 0);

  // ترشيح لأفضل N صنف لكل دور (معيار مركّب: نصف الجودة + نصف كثافة العنصر
  // المطلوب لهذا الدور تحديدًا) — يضمن حجم بحث محدود مهما كبرت المكتبة.
  // N نفسها تعتمد على مستوى الالتزام (poolSize): صارم = أضيق وأعلى جودة فقط.
  const proteinFoods = selectTopCandidates(proteinFoodsAll, (f) => f.quality_score * 0.5 + f.macros.protein_g * 0.5, poolSize.PROTEIN);
  const carbFoods = selectTopCandidates(carbFoodsAll, (f) => f.quality_score * 0.5 + f.macros.carbs_g * 0.5, poolSize.CARB);
  const vegFoods = selectTopCandidates(vegFoodsAll, (f) => f.quality_score, poolSize.VEGETABLE);
  const fatFoods = selectTopCandidates(fatFoodsAll, (f) => f.quality_score, poolSize.FAT);

  /** يضيف نسخة بمكمّل دهون لقائمة تركيبات لو الدهون الحالية أقل بوضوح من الهدف */
  function withOptionalFatTopper(baseItems, currentFatG) {
    const variants = [baseItems];
    const fatGap = (macroTargets.fat_g ?? 0) - currentFatG;
    if (fatGap > 3 && fatFoods.length > 0) {
      for (const fatFood of fatFoods) {
        const rawGrams = (fatGap * 100) / fatFood.macros.fat_g;
        const grams = Math.round(Math.min(rawGrams, MAX_FAT_TOPPER_GRAMS));
        if (grams >= 3) variants.push([...baseItems, { food: fatFood, grams }]);
      }
    }
    return variants;
  }

  const candidates = [];

  for (const proteinFood of proteinFoods) {
    const rawProteinGrams = macroTargets.protein_g > 0
      ? (macroTargets.protein_g * 100) / proteinFood.macros.protein_g
      : 100;
    const proteinGrams = Math.round(Math.min(rawProteinGrams, maxGrams));
    const cappedProtein = rawProteinGrams > maxGrams;
    const carbFromProtein = (proteinFood.macros.carbs_g * proteinGrams) / 100;
    const fatFromProtein = (proteinFood.macros.fat_g * proteinGrams) / 100;

    // بروتين فقط (+ مكمّل دهون عند الحاجة) — مفيد لو مفيش كارب مناسب، أو لحميات لو-كارب/كيتو
    for (const variant of withOptionalFatTopper([{ food: proteinFood, grams: proteinGrams }], fatFromProtein)) {
      candidates.push({ items: variant, capped: cappedProtein });
    }

    for (const carbFood of carbFoods) {
      const remainingCarb = Math.max(0, (macroTargets.carb_g ?? 0) - carbFromProtein);
      const rawCarbGrams = remainingCarb > 0 ? (remainingCarb * 100) / carbFood.macros.carbs_g : 0;
      const carbGrams = Math.round(Math.min(rawCarbGrams, maxGrams));
      // S53-d: كارب أقل من 15 جم (زي "3 جم برغل") مش حصة واقعية تُعرَض
      // كصنف مستقل في الوجبة — أهون نستبعد المتغيّر ده بدل ما نظهره كأنه
      // "طبق برغل" بحصة تافهة عمليًا
      if (carbGrams < 15) continue;

      const baseItems = [{ food: proteinFood, grams: proteinGrams }, { food: carbFood, grams: carbGrams }];
      const cappedPair = cappedProtein || rawCarbGrams > maxGrams;
      const totalFatSoFar = fatFromProtein + (carbFood.macros.fat_g * carbGrams) / 100;

      for (const variant of withOptionalFatTopper(baseItems, totalFatSoFar)) {
        candidates.push({ items: variant, capped: cappedPair });
      }

      // نسخ بصنف خضار واحد على أحجام حصص واقعية متعددة (بدل حصة ثابتة
      // 100 جم) — كل حجم يُقيَّم بشكل مستقل بـQuality Score الحقيقي لاحقًا
      for (const vegFood of vegFoods) {
        for (const vegGrams of VEG_PORTION_OPTIONS_G) {
          const withVeg = [...baseItems, { food: vegFood, grams: vegGrams }];
          const totalFatWithVeg = totalFatSoFar + (vegFood.macros.fat_g * vegGrams) / 100;
          for (const variant of withOptionalFatTopper(withVeg, totalFatWithVeg)) {
            candidates.push({ items: variant, capped: cappedPair });
          }
        }
      }

      // نسخ حقيقية بصنفي خضار معًا (تنويع ألوان/ألياف/مايكرو — تركيبة
      // 4-5 أصناف فعلية: بروتين+كارب+خضارين(+دهن)) — حصة أصغر لكل صنف
      // (75 جم) لتفادي تضخيم السعرات الكلي بلا داعٍ. يقتصر على أفضل
      // أصناف الخضار المرشَّحة أصلًا (vegFoods) تفاديًا لانفجار التركيبات.
      if (MAX_VEG_ITEMS_PER_COMBO >= 2) {
        for (let i = 0; i < vegFoods.length; i += 1) {
          for (let j = i + 1; j < vegFoods.length; j += 1) {
            const veg1 = vegFoods[i];
            const veg2 = vegFoods[j];
            const twoVegGrams = 75;
            const withTwoVeg = [
              ...baseItems,
              { food: veg1, grams: twoVegGrams },
              { food: veg2, grams: twoVegGrams },
            ];
            const totalFatWithTwoVeg = totalFatSoFar
              + (veg1.macros.fat_g * twoVegGrams) / 100
              + (veg2.macros.fat_g * twoVegGrams) / 100;
            for (const variant of withOptionalFatTopper(withTwoVeg, totalFatWithTwoVeg)) {
              candidates.push({ items: variant, capped: cappedPair });
            }
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * يعيد حساب تركيبة وجبة قائمة بعد تعديل يدوي لحجم حصة صنف واحد فيها بالجرام
 * من الواجهة (LIMIT-05: "مفيش تعديل يدوي لحجم حصة الوجبة") — بدون إعادة
 * توليد أو استبدال أي صنف، فقط إعادة تحجيم الكمية وإعادة حساب الماكرو/الجودة
 * فورًا. بخلاف `replaceMealItem` (اللي بيغيّر الصنف نفسه)، هنا نفس الصنف
 * بكمية مختلفة.
 * @param {MealCandidate} currentMeal
 * @param {number} itemIndex
 * @param {number} newGrams
 * @param {Object} [microTargets]
 * @returns {{ success: boolean, candidate: MealCandidate|null, diagnosis_ar: string|null }}
 */
export function updateMealItemPortion(currentMeal, itemIndex, newGrams, microTargets = null) {
  if (!currentMeal.items[itemIndex]) {
    return { success: false, candidate: null, diagnosis_ar: 'updateMealItemPortion: itemIndex غير صالح' };
  }
  if (typeof newGrams !== 'number' || !Number.isFinite(newGrams) || newGrams <= 0) {
    return { success: false, candidate: null, diagnosis_ar: 'كمية غير صالحة — لازم تكون رقم أكبر من صفر' };
  }

  const newItems = currentMeal.items.map((it, i) => (i === itemIndex ? { ...it, grams: Math.round(newGrams) } : it));
  const { score, totals } = computeMealQualityScore(newItems, microTargets);

  return {
    success: true,
    candidate: {
      items: newItems,
      qualityScore: score,
      qualityLabel: classifyMealQualityScore(score),
      totals,
      portionCapped: false, // تعديل يدوي مقصود من المستخدم — مش تحجيم تلقائي، فمفيش داعي لعلامة "capped"
    },
    diagnosis_ar: null,
  };
}

/**
 * @typedef {Object} MealGenerationRequest
 * @property {import('../decision-engine/decision-engine.js').ConstraintProfile} constraintProfile
 * @property {string} mealType - أحد قيم MEAL_TYPE
 * @property {number} targetKcal - سعرات هذه الوجبة تحديدًا (وليس اليوم كله)
 * @property {Object} [macroTargets] - { protein_g, carb_g, fat_g } لهذه الوجبة تحديدًا
 * @property {Object} [microTargets] - أهداف المايكرو اليومية (لحساب مكافأة التغطية)
 * @property {number} [minFoodQualityScore=0] - حد أدنى quality_score لكل صنف مفرد قبل الدخول في أي تركيبة
 * @property {number} [macroMarginPct=0.25] - هامش قبول الماكرو (٪)
 * @property {string} [adherenceLevel='flexible'] - 'strict'|'flexible' — مستوى الالتزام بالحمية (بند 2 بالمستند)؛ يتحكم في تنوع الترشيح فقط، لا في القيود الصحية/الدينية/الحساسية
 */

/**
 * @typedef {Object} MealCandidate
 * @property {Array<{food: import('../food-library/schema.js').FoodItem, grams: number}>} items
 * @property {number} qualityScore
 * @property {string} qualityLabel
 * @property {Object} totals
 * @property {boolean} portionCapped
 */

/**
 * نقطة الدخول الرئيسية: يولّد أفضل تركيبات وجبة ممكنة، أو تشخيصًا دقيقًا
 * عند الفشل.
 * @param {MealGenerationRequest} request
 * @returns {{ success: boolean, candidates: MealCandidate[], diagnosis: Object|null }}
 */
export function generateMeal(request) {
  const {
    constraintProfile, mealType, targetKcal, macroTargets = null, microTargets = null,
    minFoodQualityScore = 0, macroMarginPct = 0.25, adherenceLevel = 'flexible',
    categoryFilter = null, // مثال: ['beverage'] — يُستخدم في توليد "خطة اليوم" لسلوت مشروب مخصّص
    excludeFoodIds = null, // S53-d: أصناف مُستخدَمة بالفعل في سلوتات سابقة من نفس خطة اليوم — تفاديًا لتكرار نفس الصنف بالظبط في أكتر من وجبة/سناك
  } = request;

  // BUG-S24-03: targetKcal<=0 (أو غير رقمي) كان يمر بدون أي فحص، فيوصل
  // لـ scaleFoodToCalories() اللي كانت بترجع جرامات صفر أو حتى سالبة
  // (rawGrams = targetKcal/kcal*100)، وبيتقيَّم بعدين في computeMealQualityScore
  // كـ"وجبة" شكلها سليم — تأكدت فعليًا إن النتيجة بتوصل لأعلى تركيبة بجودة
  // 88-100/100 ("ممتاز") وهي فعليًا "جرجير 0 جرام" أو "بصل سكري -750 جرام"،
  // بدون أي تحذير. updateMealItemPortion (تعديل يدوي) عنده نفس الحراسة من
  // قبل، لكن generateMeal (مسار التوليد الأساسي) ما كانتش عنده أي حراسة —
  // نفس فئة الباج (بيانات غير منطقية بتوصل لمحرك تقييم يفترض مدخلات سليمة).
  if (typeof targetKcal !== 'number' || !Number.isFinite(targetKcal) || targetKcal <= 0) {
    return {
      success: false,
      candidates: [],
      diagnosis: {
        stage: 'invalid_input',
        message_ar: 'سعرات الوجبة المستهدفة (targetKcal) يجب أن تكون رقمًا أكبر من صفر',
        details: null,
      },
    };
  }

  // المرحلة 1: قيود البروفايل عبر Decision Engine
  const decision = resolveAvailableFoods(constraintProfile, { minimumRequired: 1 });
  if (!decision.sufficient) {
    return {
      success: false,
      candidates: [],
      diagnosis: {
        stage: 'constraint_filtering',
        message_ar: 'لا توجد أصناف كافية تحقق كل القيود الصحية/الدينية/الحموية مجتمعة',
        details: decision.diagnosis,
      },
    };
  }

  // المرحلة 2: فلترة الجودة الدنيا لكل صنف مفرد
  let qualifiedFoods = decision.availableFoods.filter((f) => f.quality_score >= minFoodQualityScore);
  if (qualifiedFoods.length === 0) {
    return {
      success: false,
      candidates: [],
      diagnosis: {
        stage: 'quality_filtering',
        message_ar: `لا توجد أصناف بجودة ≥ ${minFoodQualityScore} ضمن الأصناف المسموحة (${decision.availableFoods.length} صنف متاح قبل فلترة الجودة)`,
        details: null,
      },
    };
  }

  // فلترة فئة اختيارية (سلوت مشروب في خطة اليوم مثلًا) — بعد قيود
  // البروفايل والجودة، وقبل بناء التركيبات، حتى تظهر رسالة تشخيص خاصة بيها
  // لو صفّرت النتيجة بدل الخلط مع "لا توجد أصناف بجودة كافية"
  if (Array.isArray(categoryFilter) && categoryFilter.length > 0) {
    qualifiedFoods = qualifiedFoods.filter((f) => categoryFilter.includes(f.category));
    if (qualifiedFoods.length === 0) {
      return {
        success: false,
        candidates: [],
        diagnosis: {
          stage: 'category_filtering',
          message_ar: `لا توجد أصناف من فئة (${categoryFilter.join('، ')}) ضمن الأصناف المسموحة دينيًا/صحيًا حاليًا`,
          details: null,
        },
      };
    }
  }

  // استبعاد أصناف مُستخدَمة في سلوتات سابقة من نفس خطة اليوم (S53-d) — لو
  // الاستبعاد هيصفّر النتيجة (مكتبة ضيقة بعد كل القيود)، نتجاهله بدل ما
  // نفشّل السلوت بالكامل: تكرار صنف أهون من سلوت فاشل تمامًا
  if (Array.isArray(excludeFoodIds) && excludeFoodIds.length > 0) {
    const excludeSet = new Set(excludeFoodIds);
    const withoutExcluded = qualifiedFoods.filter((f) => !excludeSet.has(f.id));
    if (withoutExcluded.length > 0) qualifiedFoods = withoutExcluded;
  }

  // المرحلة 3+4: بناء التركيبات المرشّحة (صنف واحد دائمًا + تركيبات مدفوعة
  // بأهداف الماكرو إن وُجدت)، مُحجَّمة على السعرات/الماكرو المستهدفة
  const singleCandidates = buildSingleItemCandidates(qualifiedFoods, mealType, targetKcal);
  const macroDrivenCandidates = buildMacroDrivenCandidates(qualifiedFoods, mealType, macroTargets, adherenceLevel);
  const allCandidatesRaw = [...singleCandidates, ...macroDrivenCandidates];

  // بند 1.4 (LIMIT-01): استبعاد صنف دهون/زيت منفرد كوجبة كاملة عند غياب أهداف الماكرو
  const allCandidates = allCandidatesRaw.filter((c) => passesStandaloneFatOilRule(c, macroTargets));

  if (allCandidates.length === 0) {
    return {
      success: false,
      candidates: [],
      diagnosis: {
        stage: 'meal_type_filtering',
        message_ar: allCandidatesRaw.length > 0
          ? `تم استبعاد كل التركيبات المرشّحة لأنها أصناف دهون/زيوت منفردة فقط (غير واقعية كوجبة كاملة بدون أهداف ماكرو محددة) — أضف هدف ماكرو أو أصناف من فئات تانية`
          : `لا توجد أصناف مصنَّفة مناسبة لنوع الوجبة "${mealType}" ضمن الأصناف المسموحة والمجوَّدة`,
        details: null,
      },
    };
  }

  // المرحلة 5: استبعاد ما يخرج عن هامش الماكرو
  const withinMargin = allCandidates.filter((c) => {
    const { totals } = computeMealQualityScore(c.items, microTargets);
    return isWithinMacroMargin(totals, macroTargets, macroMarginPct);
  });

  if (withinMargin.length === 0) {
    return {
      success: false,
      candidates: [],
      diagnosis: {
        stage: 'macro_fit',
        message_ar: `تم بناء ${allCandidates.length} تركيبة مرشّحة، لكن ولا واحدة حققت أهداف الماكرو ضمن هامش ${Math.round(macroMarginPct * 100)}% — جرّب توسيع الهامش أو إضافة مزيد من الأصناف لهذه الفئة في Food Library`,
        details: { attemptedCandidateCount: allCandidates.length },
      },
    };
  }

  // المرحلة 6+7: تقييم الجودة وترتيب أفضل التركيبات
  const scored = withinMargin.map((c) => {
    const { score, totals } = computeMealQualityScore(c.items, microTargets);
    return {
      items: c.items,
      qualityScore: score,
      qualityLabel: classifyMealQualityScore(score),
      totals,
      portionCapped: c.capped,
    };
  });

  scored.sort((a, b) => b.qualityScore - a.qualityScore);

  return { success: true, candidates: scored, diagnosis: null };
}

/**
 * يستبدل صنفًا واحدًا داخل تركيبة وجبة قائمة بصنف بديل، من غير إعادة توليد
 * الوجبة كلها (الميزة المطلوبة صراحة في المستند: "مسح صنف وتوليد بديل له فقط").
 * @param {MealCandidate} currentMeal
 * @param {number} itemIndex - فهرس الصنف المطلوب استبداله داخل currentMeal.items
 * @param {import('../decision-engine/decision-engine.js').ConstraintProfile} constraintProfile
 * @param {Object} [microTargets]
 */
export function replaceMealItem(currentMeal, itemIndex, constraintProfile, microTargets = null) {
  // BUG-S25-02: كانت بترمي Exception (`throw`) لو itemIndex غير صالح (خارج
  // الحدود أو currentMeal.items فاضية) — غير متسقة مع باقي دوال الملف كله
  // (generateMeal/updateMealItemPortion) اللي بترجع {success:false,
  // diagnosis_ar} دايمًا بدل رمي استثناء. الدالة دي مش متوصّلة بالواجهة حاليًا
  // (مفيش أي نداء لها في ui/app.js رغم إنها الميزة الموثَّقة "مسح صنف وتوليد
  // بديل له فقط")، لكن لو اتوصّلت مستقبلًا، أي نداء بـitemIndex غلط كان هيطلع
  // Exception غير مُمسوك يوقف الواجهة كلها بدل رسالة تشخيص عادية زي كل مسار
  // فشل تاني في نفس الملف.
  const itemToReplace = currentMeal?.items?.[itemIndex];
  if (!itemToReplace) {
    return { success: false, candidate: null, diagnosis_ar: 'replaceMealItem: itemIndex غير صالح أو الوجبة الحالية فاضية' };
  }
  const decision = resolveAvailableFoods(constraintProfile, { minimumRequired: 1 });
  const targetKcal = itemToReplace.food.macros.kcal * (itemToReplace.grams / 100);

  const alternatives = decision.availableFoods
    .filter((f) => f.category === itemToReplace.food.category && f.id !== itemToReplace.food.id)
    .filter((f) => f.suitable_meal_types.some((mt) => itemToReplace.food.suitable_meal_types.includes(mt)));

  if (alternatives.length === 0) {
    return { success: false, candidate: null, diagnosis_ar: `لا يوجد بديل متاح من نفس فئة "${itemToReplace.food.category}" ضمن الأصناف المسموحة` };
  }

  const scoredAlternatives = alternatives.map((food) => {
    const { grams } = scaleFoodToCalories(food, targetKcal);
    const newItems = [...currentMeal.items];
    newItems[itemIndex] = { food, grams };
    const { score, totals } = computeMealQualityScore(newItems, microTargets);
    return { items: newItems, qualityScore: score, qualityLabel: classifyMealQualityScore(score), totals };
  });

  scoredAlternatives.sort((a, b) => b.qualityScore - a.qualityScore);
  return { success: true, candidate: scoredAlternatives[0], diagnosis_ar: null };
}

// -----------------------------------------------------------------------
// توليد خطة يوم كامل — بند مطلوب صراحة: "مش بس وجبة واحدة، عايز نظام يوم
// كامل على حسب عدد السعرات وعدد السناكس/المشروبات"
// -----------------------------------------------------------------------

/** حصة سعرات ثابتة تقريبية لكل سلوت "مشروب" — مشروبات منخفضة السعرات افتراضيًا (شاي/قهوة سادة، مياه منكّهة..) */
const DRINK_SLOT_KCAL = 80;
/** أقل حصة سعرات مقبولة لأي سلوت وجبة/سناك بعد التوزيع — نفس فلسفة MIN_MEAL_TARGET_KCAL في Nutrition Engine */
const MIN_SLOT_KCAL = 80;

/**
 * يبني قائمة السلوتات (نوع + نصيب من السعرات) لليوم بالكامل، حسب حالة
 * الصيام وعدد السناكس/المشروبات المطلوبة. هذه الدالة "توزيع" فقط — التوليد
 * الفعلي لكل سلوت بيحصل في generateDayPlan.
 * @param {Object} params
 * @param {boolean} params.isFasting
 * @param {'normal'|'suhoor_iftar'} params.mealSlotsHint
 * @param {number} params.snacksCount
 * @param {number} params.drinksCount
 * @returns {Array<{ type: string, label_ar: string, share: number, isBeverage: boolean, fixedKcal: number|null }>}
 */
export function buildDayPlanSlots({ isFasting, mealSlotsHint, snacksCount = 0, drinksCount = 0 }) {
  const slots = [];

  if (isFasting && mealSlotsHint === 'suhoor_iftar') {
    // يوم صيام إسلامي: وجبتان أساسيتان بس (سحور قبل الفجر، إفطار بعد المغرب)
    // + سناكس اختيارية بين الإفطار والسحور لو المستخدم طلب عدد أكبر من صفر
    const nonMealShare = Math.min(0.20, snacksCount * 0.05);
    const mealShare = 1 - nonMealShare;
    slots.push({ type: 'breakfast', label_ar: 'سحور', share: mealShare * 0.42, isBeverage: false, fixedKcal: null });
    slots.push({ type: 'dinner', label_ar: 'إفطار', share: mealShare * 0.58, isBeverage: false, fixedKcal: null });
    for (let i = 0; i < snacksCount; i++) {
      slots.push({ type: 'snack', label_ar: `سناك ${i + 1} (بين الإفطار والسحور)`, share: nonMealShare / Math.max(1, snacksCount), isBeverage: false, fixedKcal: null });
    }
  } else {
    // يوم عادي (بما فيه أيام الصيام المسيحي — القيد على نوع الصنف مش عدد
    // الوجبات، فتوزيع الوجبات الطبيعي بيفضل زي ما هو)
    const baseShares = { breakfast: DEFAULT_MEAL_SHARE.breakfast, lunch: DEFAULT_MEAL_SHARE.lunch, dinner: DEFAULT_MEAL_SHARE.dinner };
    const snackPoolShare = snacksCount > 0 ? DEFAULT_MEAL_SHARE.snack : 0;
    // لو مفيش سناكس، نصيب "سناك" الافتراضي يترد على الوجبات التلاتة الأساسية بنفس نسبتها النسبية
    const baseTotal = baseShares.breakfast + baseShares.lunch + baseShares.dinner;
    const redistribution = snacksCount > 0 ? 0 : DEFAULT_MEAL_SHARE.snack;

    slots.push({ type: 'breakfast', label_ar: 'فطار', share: baseShares.breakfast + redistribution * (baseShares.breakfast / baseTotal), isBeverage: false, fixedKcal: null });
    slots.push({ type: 'lunch', label_ar: 'غداء', share: baseShares.lunch + redistribution * (baseShares.lunch / baseTotal), isBeverage: false, fixedKcal: null });
    slots.push({ type: 'dinner', label_ar: 'عشاء', share: baseShares.dinner + redistribution * (baseShares.dinner / baseTotal), isBeverage: false, fixedKcal: null });
    for (let i = 0; i < snacksCount; i++) {
      slots.push({ type: 'snack', label_ar: `سناك ${i + 1}`, share: snackPoolShare / snacksCount, isBeverage: false, fixedKcal: null });
    }
  }

  for (let i = 0; i < drinksCount; i++) {
    slots.push({ type: 'snack', label_ar: `مشروب ${i + 1}`, share: 0, isBeverage: true, fixedKcal: DRINK_SLOT_KCAL });
  }

  return slots;
}

/**
 * نقطة الدخول الرئيسية لخطة اليوم الكامل: تولّد كل سلوتات اليوم (وجبات
 * أساسية + سناكس + مشروبات)، بالترتيب، كل سلوت بيستخدم `generateMeal`
 * الموجودة بالفعل. مشروبات الخطة بتُقيَّد بفئة "beverage" فقط عبر
 * categoryFilter. فشل سلوت واحد ما بيوقّفش باقي السلوتات — كل سلوت له
 * تشخيصه المستقل، وبنرجّع ملخص شامل (نجح كام من كام) بدل "فشل الكل أو نجح
 * الكل" فقط.
 * @param {Object} params
 * @param {import('../decision-engine/decision-engine.js').ConstraintProfile} params.constraintProfile
 * @param {number} params.dailyCalorieTarget
 * @param {{protein_g:number, carb_g:number, fat_g:number}} params.dailyMacroTargets
 * @param {Object} [params.microTargets]
 * @param {boolean} params.isFasting
 * @param {'normal'|'suhoor_iftar'} params.mealSlotsHint
 * @param {number} [params.snacksCount=0]
 * @param {number} [params.drinksCount=0]
 * @param {string} [params.adherenceLevel='flexible']
 * @param {number} [params.minFoodQualityScore=30]
 * @returns {{ slots: Array<Object>, successCount: number, totalCount: number, totals: Object, dailyCalorieTarget: number }}
 */
export function generateDayPlan({
  constraintProfile, dailyCalorieTarget, dailyMacroTargets, microTargets = null,
  isFasting = false, mealSlotsHint = 'normal', snacksCount = 0, drinksCount = 0,
  adherenceLevel = 'flexible', minFoodQualityScore = 30,
}) {
  const planSlots = buildDayPlanSlots({ isFasting, mealSlotsHint, snacksCount, drinksCount });
  const drinksKcalTotal = planSlots.filter((s) => s.isBeverage).length * DRINK_SLOT_KCAL;
  const kcalForSharedSlots = Math.max(0, dailyCalorieTarget - drinksKcalTotal);

  const results = [];
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  let successCount = 0;
  const usedFoodIds = []; // S53-d: تفاديًا لتكرار نفس الصنف بالظبط في أكتر من سلوت في نفس اليوم (كان بيحصل: نفس الصنف في 3 سناكس متتالية)

  for (const slot of planSlots) {
    const targetKcal = slot.isBeverage
      ? slot.fixedKcal
      : Math.max(MIN_SLOT_KCAL, Math.round(kcalForSharedSlots * slot.share));

    const macroTargets = slot.isBeverage ? null : {
      protein_g: Math.round(dailyMacroTargets.protein_g * slot.share),
      carb_g: Math.round(dailyMacroTargets.carb_g * slot.share),
      fat_g: Math.round(dailyMacroTargets.fat_g * slot.share),
    };

    const result = generateMeal({
      constraintProfile,
      mealType: slot.type,
      targetKcal,
      macroTargets,
      microTargets,
      minFoodQualityScore,
      adherenceLevel,
      categoryFilter: slot.isBeverage ? ['beverage'] : null,
      excludeFoodIds: usedFoodIds,
    });

    if (result.success) {
      successCount++;
      const best = result.candidates[0];
      totals.kcal += best.totals.kcal;
      totals.protein_g += best.totals.protein_g;
      totals.carbs_g += best.totals.carbs_g;
      totals.fat_g += best.totals.fat_g;
      usedFoodIds.push(...best.items.map((i) => i.food.id));
      results.push({ slotType: slot.type, label_ar: slot.label_ar, isBeverage: slot.isBeverage, success: true, meal: best, diagnosis: null });
    } else {
      results.push({ slotType: slot.type, label_ar: slot.label_ar, isBeverage: slot.isBeverage, success: false, meal: null, diagnosis: result.diagnosis });
    }
  }

  return {
    slots: results,
    successCount,
    totalCount: planSlots.length,
    totals: {
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g),
      carbs_g: Math.round(totals.carbs_g),
      fat_g: Math.round(totals.fat_g),
    },
    dailyCalorieTarget,
  };
}

// -----------------------------------------------------------------------
// قوالب البرنامج الغذائي الجاهز (S53-e) — خطة أسبوعية جاهزة من 1200 لـ2500
// سعرة، مرفوعة من المستخدم، مربوطة بمكتبة الطعام الفعلية. راجع تحذير
// meal-plan-templates.js: دي قوالب ثابتة جاهزة، مش توليد ديناميكي يراعي
// قيود البروفايل الحالية — لازم تُعرَض للمستخدم كمرجع/قالب واضح.
// -----------------------------------------------------------------------

const MEAL_LABEL_AR = { 'فطار': 'فطار', 'غداء': 'غداء', 'سناك': 'سناك', 'عشاء': 'عشاء' };

/**
 * يحوّل يوم كامل من قالب جاهز (food_id + جرامات ثابتة) لنفس شكل نتيجة
 * `generateDayPlan` (slots بها meal بشكل candidate كامل) — عشان الواجهة
 * تقدر تستخدم نفس منطق العرض/التسجيل للاتنين بدون ازدواجية كود.
 * @param {number} calorieLevel - أحد قيم MEAL_PLAN_CALORIE_LEVELS
 * @param {string} day - أحد أيام MEAL_PLAN_DAYS
 * @returns {{ slots: Array<Object>, totals: Object, calorieLevel: number, day: string } | null} null لو المستوى/اليوم غير موجودين
 */
export function resolveMealPlanTemplateDay(calorieLevel, day) {
  const levelData = MEAL_PLAN_TEMPLATES[calorieLevel];
  if (!levelData || !levelData[day]) return null;

  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const slots = [];

  for (const [mealKey, entries] of Object.entries(levelData[day])) {
    const items = entries
      .map((e) => ({ food: getFoodById(e.food_id), grams: e.grams }))
      .filter((i) => i.food); // صنف اتشال من المكتبة بعدين (نادر) — يتجاهل بدل ما يكسر الشاشة كلها

    if (items.length === 0) continue;

    const result = computeMealQualityScore(items, null);
    const candidate = { items, qualityScore: result.score, qualityLabel: classifyMealQualityScore(result.score), totals: result.totals };

    totals.kcal += result.totals.kcal;
    totals.protein_g += result.totals.protein_g;
    totals.carbs_g += result.totals.carbs_g;
    totals.fat_g += result.totals.fat_g;

    slots.push({ slotType: mealKey, label_ar: MEAL_LABEL_AR[mealKey] ?? mealKey, isBeverage: false, success: true, meal: candidate, diagnosis: null });
  }

  return {
    slots,
    totals: { kcal: Math.round(totals.kcal), protein_g: Math.round(totals.protein_g), carbs_g: Math.round(totals.carbs_g), fat_g: Math.round(totals.fat_g) },
    calorieLevel,
    day,
  };
}
