# برومبت — فحص شامل ودقيق لكل النظام (مش بس مكتبة الطعام)
### (nutrition-platform-v2 — نقطة انطلاق: بعد S77)

## ⚠️ اقرأ القسم ده الأول قبل أي حاجة
البرومبت ده بديل كامل لأي برومبت فحص سابق رفعته قبل كده (خصوصًا
`PROMPT_AUDIT_COMPLETE_LIBRARY.md`) — ده كان مبني على حالة قديمة من
المشروع (لحد S60، 185 صنف مُصحَّح) وبقى **متخطَّى بالكامل**. الحالة
الحقيقية دلوقتي (بعد S77):

- **2821 صنف** في مكتبة الطعام (مش 3006 — 185 صنف اتحذفوا في S57 لأنهم
  مش أكل حقيقي، والباقي اتصحح/اتصنَّف)
- **التوزيع الحالي بالفئة**: condiment=242، vegetable=405، legume=82،
  fruit=239، dairy=105، nut_seed=150، carb=150، fat_oil=116،
  sweet_dessert=110، beverage=42، protein=178، composite_meal=1002
- **فحوصات منهجية سابقة اتعملت بالفعل (S57 لحد S77) — لازم تتقرأ الأقسام
  دي بالكامل في `docs/SSCP_PROGRESS.md` قبل ما تبدأ عشان متكررش شغل**:
  حذف أصناف مش أكل، إعادة تصنيف شاملة (فواكه/خضار/بروتين/ألبان/توابل/
  زيوت/حلويات)، باج "قيمة الملعقة بدل الـ100جم" (زيوت+توابل+دبس)، تناقض
  حمية (vegan/vegetarian) عبر كل المكتبة، كوليسترول/B12 مفبركة في نباتات،
  sub-macros>fat_g، fiber_g>carbs_g، مجموع macro>100g، allergens ناقصة،
  اتساق GI/GL رياضيًا، تدقيق cuisine، ترجمة name_en حقيقية، تصنيف بذور/
  أعشاب (S77).

**لو لقيت نتيجة تطابق حاجة من القائمة دي بالظبط، ده معناه إنك بتعيد فحص
اتعمل قبل كده — راجع الملف تاني، ملقتش الفرق يبقى فعلاً حاجة جديدة.**

---

## الفرق الجوهري عن البرومبت القديم
البرومبت القديم كان مركَّز **بس على بيانات مكتبة الطعام نفسها** (macros،
category، الاسم). الفحص المطلوب دلوقتي **أوسع بكتير** — يغطي كل طبقات
النظام: بيانات الأصناف، العلاقات بين الملفات، محركات الحساب، محرك
التوليد، وتغطية الاختبارات. لو حاجة مش موجودة فعليًا في الكود (زي حقل
مش مستخدَم، أو حالة طبية بلا أثر)، سجِّلها كملاحظة بدل ما تتجاهلها.

---

## الطبقة 1: سلامة قيم الأصناف الفردية (نفس منهجية S57-S77، لكن بفحوصات
إضافية لسه ما اتجرَّبتش)

شغّل السكريبتات دي (كلها موجودة أصلًا كأمثلة، وسّعها لو احتجت):

### 1.1 فحص Z-score بدل IQR (أدق من فحص S60/S77 للقيم المتطرفة الخفيفة)
```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const byCategory = {};
for (const f of all) (byCategory[f.category] ||= []).push(f);
const fields = ['kcal','protein_g','carbs_g','fat_g','fiber_g','sugar_g',
  'saturated_fat_g','cholesterol_mg'];
for (const [cat, items] of Object.entries(byCategory)) {
  for (const field of fields) {
    const values = items.map(f=>f.macros[field]).filter(v=>typeof v==='number');
    if (values.length < 15) continue;
    const mean = values.reduce((a,b)=>a+b,0)/values.length;
    const std = Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length) || 1;
    for (const item of items) {
      const v = item.macros[field];
      if (typeof v !== 'number') continue;
      const z = (v - mean) / std;
      if (Math.abs(z) > 3.5) console.log(`${item.id}\t${item.name_ar}\t[${cat}]\t${field}=${v}\tz=${z.toFixed(2)}`);
    }
  }
}
```

### 1.2 فحص الحقول اللي لسه ما اتفحصتش إحصائيًا خالص
كل الفحوصات السابقة ركّزت على macros الأساسية بس. وسّع لـ:
`sodium_mg`, `potassium_mg`, `iron_mg`, `calcium_mg`, `gi`, `gl`,
`quality_score` — نفس منطق IQR/Z-score من فوق، طبَّقه على الحقول دي.
**تنبيه**: `gi` لازم يكون بين 0-100 دايمًا (فحص حد صارم مش إحصائي) —
أي قيمة خارج المدى ده باج مؤكَّد بلا نقاش.

### 1.3 فحص التسلسل المنطقي quality_score مقابل processing_level
صنف `processing_level: "ultra_processed"` بـ`quality_score` > 70 مشبوه
(المفروض المعالجة العالية تقلل الجودة). وصنف `unprocessed` بـ
`quality_score` < 30 مشبوه بنفس المنطق العكسي.
```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const mismatches = all.filter(f =>
  (f.processing_level === 'ultra_processed' && f.quality_score > 70) ||
  (f.processing_level === 'unprocessed' && f.quality_score < 30)
);
console.log('عدد التناقضات:', mismatches.length);
mismatches.forEach(f => console.log(f.id, f.name_ar, f.processing_level, f.quality_score));
```

### 1.4 فحص gl مقابل gi×carbs_g/100 (العلاقة الرياضية المعروفة)
GL المفروض ≈ GI × كارب/100. أي انحراف كبير (>40%) عن الصيغة دي بدون
تفسير واضح (زي كارب منخفض جدًا بيخلي GL صغير طبيعيًا) يستاهل مراجعة.
```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const bad = all.filter(f => {
  if (!f.gi || !f.gl || f.macros.carbs_g === 0) return false;
  const expected = f.gi * f.macros.carbs_g / 100;
  if (expected < 1) return false; // تجاهل قيم صغيرة جدًا (تقريب طبيعي)
  const diff = Math.abs(f.gl - expected) / expected;
  return diff > 0.4;
});
console.log('عدد:', bad.length);
bad.forEach(f => console.log(f.id, f.name_ar, 'gi:', f.gi, 'carbs:', f.macros.carbs_g, 'gl مسجَّل:', f.gl, 'gl متوقَّع:', (f.gi*f.macros.carbs_g/100).toFixed(1)));
```
**ملحوظة**: S66 فحص اتساق GI/GL قبل كده — لو النتيجة صفر أو نفس الأصناف
اللي اتصححت وقتها، يبقى مفيش جديد.

---

## الطبقة 2: العلاقات المرجعية عبر الملفات (لم تُفحص منهجيًا قبل كده
بالكامل — دي أهم إضافة في البرومبت ده)

### 2.1 كل `food_id` مُشار له في القوالب/أي ملف تاني لازم يكون موجود فعليًا
```js
import { getAllFoods } from './core/food-library/food-library.js';
import fs from 'fs';
const ids = new Set(getAllFoods().map(f => f.id));
const files = [
  'core/meal-engine/meal-plan-templates.js',
  // أضف أي ملف تاني بيستخدم food_id كنص ثابت
];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const refs = [...src.matchAll(/food_id:\s*['"]?(food_\d+)['"]?/g)].map(m => m[1]);
  const orphans = refs.filter(id => !ids.has(id));
  console.log(file, '| مراجع:', refs.length, '| orphans:', orphans.length, orphans);
}
```

### 2.2 كل حالة طبية معرَّفة في schema.js لها استخدام فعلي في Medical Engine
راجع `MEDICAL_CONDITION` في `schema.js` وقارنها بـ`core/decision-engine/`
(أو أي ملف بيطبّق قيود الحالات الطبية) — أي حالة معرَّفة بس بلا أي قاعدة
فلترة فعلية هي "حالة ميتة" (نفس اكتشاف S67-S70، لكن راجع تاني تتأكد
كل الـ16 حالة اتغطّت فعلًا دلوقتي، مش بس الـ8 اللي اتذكروا).

### 2.3 كل ALLERGEN/DIET_STYLE/RELIGIOUS_TAG معرَّف في schema.js مستخدَم
فعليًا في محرك الفلترة، ومفيش قيمة بتتفلتر في الكود مش معرَّفة في الـenum
(العكس بالعكس — قيمة "يتيمة" في الكود متطابقاش أي enum بيبقى باج صامت).
```js
// دوّر يدويًا: grep -n "ALLERGEN\." core/decision-engine/*.js
// وقارن بكل مفاتيح ALLERGEN في schema.js
```

### 2.4 كل صنف بيدخل حوض توليد فعلي (protein/carb/vegetable/fat_oil/
legume/dairy/fruit/nut_seed/beverage/composite_meal) — تأكد إن كل
الحقول اللي محرك التوليد بيعتمد عليها فعليًا (`suitable_meal_types`،
`unsuitable_for_conditions`، إلخ) موجودة ومليانة صح، مش `undefined` أو
array فاضي بالخطأ لصنف كان المفروض يكون فيه قيود.
```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const missing = all.filter(f =>
  !Array.isArray(f.suitable_meal_types) || f.suitable_meal_types.length === 0
);
console.log('أصناف بلا suitable_meal_types:', missing.length);
missing.slice(0,20).forEach(f=>console.log(f.id, f.name_ar, f.category));
```

### 2.5 تناسق ثنائي: صنف فيه `unsuitable_for_conditions` يحتوي حالة، لازم
نفس الحالة **مش** موجودة كمان في `suitable_for_conditions` لنفس الصنف
(تناقض منطقي مباشر — لسه ما اتفحصش صراحة).
```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const bad = all.filter(f => {
  const u = new Set(f.unsuitable_for_conditions || []);
  const s = new Set(f.suitable_for_conditions || []);
  return [...u].some(c => s.has(c));
});
console.log('تناقض suitable/unsuitable للحالات الطبية:', bad.length);
bad.forEach(f=>console.log(f.id, f.name_ar));
```
نفس الفحص بالظبط لازم يتعمل لـ`suitable_for_diets`/`unsuitable_for_diets`
(S62 عمل نسخة من الفحص ده — تأكد النتيجة لسه صفر بعد كل التعديلات
اللاحقة، مش افتراض).

---

## الطبقة 3: محرك الحسابات (BMR/TDEE/الماكرو) — لم يُراجَع رياضيًا من
البداية من أي جلسة فحص سابقة (كل الجلسات ركّزت على مكتبة الطعام بس)

### 3.1 تحقق يدوي من صيغة Mifflin-St Jeor وKatch-McArdle
افتح `core/nutrition-engine/` (أو مكانها الفعلي) وقارن الصيغة المطبَّقة
حرفيًا بالصيغة المرجعية المعروفة:
- Mifflin-St Jeor (رجل): `10×وزن(كجم) + 6.25×طول(سم) - 5×عمر + 5`
- Mifflin-St Jeor (ست): نفس الصيغة `- 161` بدل `+5`
- Katch-McArdle: `370 + 21.6×(وزن×(1-نسبة الدهون))`
احسب يدويًا بحالة اختبار بسيطة (رجل 30 سنة، 80كجم، 175سم) وقارن بالناتج
الفعلي من الكود.

### 3.2 التأكد من TEF/NEAT/EAT بيجمعوا فعلًا لـTDEE الكلي بلا تقريب تراكمي
راجع أي fix سابق لمشكلة "exact-sum rounding" (اتذكرت في S4) — تأكد لسه
شغالة بعد كل التعديلات اللاحقة، بحالة اختبار جديدة.

### 3.3 حدود الأمان (safety caps) على العجز/الفائض السعري
تأكد الحدود الصارمة (أقل سعرات مسموحة، أقصى عجز/فائض) لسه مطبَّقة صح
ومفيش حالة فيها المستخدم يقدر يدخل قيمة تكسر الحد (زي معدل نشاط شاذ أو
وزن هدف غير واقعي يطلع رقم سالب أو صفر).

### 3.4 ماكرو التارجت — الحد الأدنى للبروتين
تأكد "enforced minimum protein floor" (S4) لسه شغال لكل نمط حمية، وإن
مفيش نمط حمية بيقدر يطلع بروتين أقل من الحد الأدنى الآمن.

---

## الطبقة 4: محرك التوليد (meal-generation-engine.js) — فحص جودة/تحيز

### 4.1 توزيع اختيار الأصناف فعليًا (فحص تحيز، زي باج S58 القديم)
شغّل توليد 50-100 وجبة عشوائية (بروفايلات مستخدم متنوعة) وسجِّل تكرار
كل `food_id` تم اختياره. لو صنف واحد أو اتنين بيتكرروا في **أغلبية ساحقة**
من النتائج (زي أكتر من 40% من كل الحالات) رغم وجود بدائل كتير مؤهَّلة
بنفس الفئة، ده مؤشر تحيز في خوارزمية الترتيب (نفس نمط باج S58).

### 4.2 كل مسار فشل (failure diagnosis) بيرجّع فعلًا السبب الصحيح
اعمل 4 حالات اختبار متعمَّدة، كل واحدة تفشل بسبب مختلف (قيد طبي، قيد
حساسية، قيد ديني، عدم توفر ماكرو مناسب) — تأكد الرسالة المرجَّعة بتحدد
السبب الصح مش رسالة عامة (نفس المطلوب الأصلي من وثيقة الرؤية).

### 4.3 القوالب الأسبوعية الجاهزة (meal-plan-templates.js) — دقة السعرات
لكل مستوى سعرات (1500-2400 مثلًا) ولكل يوم، احسب مجموع kcal الفعلي
لكل الوجبات وقارنه بمستوى السعرات المستهدَف. أي يوم بفارق أكبر من
±20% (الهامش الموثَّق من S54) يستاهل مراجعة — **الفحص ده متعمَلش
منهجيًا بعد تعديلات S73-S76** (تغيير بصل مقرمش ومحشي كوسة/ورق عنب أثَّر
على السعرات الفعلية لبعض الأيام، محتاج إعادة حساب).
```js
import { MEAL_PLAN_CALORIE_LEVELS, MEAL_PLAN_DAYS } from './core/meal-engine/meal-plan-templates.js';
import { getFoodById } from './core/food-library/food-library.js';
// لكل مستوى/يوم: اجمع kcal كل item (grams/100 × kcal) وقارن بالمستوى المستهدف
```

### 4.4 اختبار "استبدال صنف واحد" (replaceMealItem) بحالات حافة
صنف مستبدَل بصنف من فئة مختلفة، أو صنف مستبدَل وهو آخر عنصر في الوجبة،
أو استبدال بصنف مش موجود — تأكد كل الحالات دي بترجع سلوك متوقَّع مش
crash أو نتيجة غير منطقية.

---

## الطبقة 5: تغطية الاختبارات نفسها (مش الكود المُختبَر — الاختبارات
ذات نفسها)

### 5.1 هل فيه كود بيتنفَّذ فعليًا بدون أي اختبار يغطّيه؟
راجع كل دالة exported من كل ملف core/ وتأكد كل واحدة ليها test case
واحد على الأقل في tests/*.mjs. ركّز خصوصًا على أي دالة اتضافت في
S69/S70/S71 (liver_disease، hypothyroidism، anemia، "طبق حقيقي + صنف
جانبي") — دول أحدث إضافات وأكتر عرضة تكون ناقصة تغطية.

### 5.2 هل فيه اختبار بيتحقق من قيمة ثابتة (hardcoded) بدل ما يتحقق من
سلوك؟ (اختبار هش ممكن يفضل "ناجح" حتى لو المنطق اتغيّر غلط)

---

## قواعد إلزامية أثناء التنفيذ (نفس قواعد S57-S77 بالظبط — متتغيّرش)

1. **دليل حقيقي قبل أي تعديل** — شوف القيمة الفعلية كاملة قبل ما تقرر
   إنها باج.
2. **تصحيح قيمة رقمية**: انسخ من صنف شقيق حقيقي حرفيًا. معندكش شقيق
   ومحتاج قيمة مرجعية: دوّر على مرجع موثوق (USDA وما شابه) زي S63/S65،
   وثِّق المصدر. معندكش أي مرجع: سجِّل "يحتاج مراجعة بشرية" بدل ما تخترع.
3. **بعد كل دفعة تصحيح**: `npm run test:all` لازم يفضل **468/468**
   (أو أكتر لو ضفت اختبارات جديدة في الطبقة 5).
4. **نفّذ بسكريبت Node.js يقرأ/يعدّل النص مباشرة** لو العدد كبير (زي
   أسلوب كل الجلسات من S57).
5. **وثّق في `docs/SSCP_PROGRESS.md`** بنفس فورمات checkpoints S57-S77
   (السياق، الدليل، التصحيح، التحقق، العدد الإجمالي) — رقّم الجلسة
   الجديدة **S78** فما فوق (مش تبدأ من S1 تاني).
6. **حدِّث الرقم التراكمي** في نهاية كل checkpoint (كان 10 إضافية في
   S77 — استمر من هنا).
7. **الطبقات 3-5 (الحسابات/التوليد/الاختبارات) أهم من الطبقة 1** —
   مكتبة الطعام اتفحصت 10+ مرة، لكن محرك الحسابات والتوليد نفسهم
   ما اتراجعوش رياضيًا/منهجيًا من قبل خالص. ابدأ بيهم لو الوقت محدود.

## عند الانتهاء
حدِّث جدول ملخَّص في `SSCP_PROGRESS.md` بكل طبقة اتفحصت ونتيجتها (حتى
لو "صفر مشاكل" — ده نتيجة قيّمة برضه، وثِّقها). لو طبقة كاملة رجعت صفر
مشاكل بعد فحص حقيقي (مش تخمين)، اذكر ده صراحة كـ"تأكيد إيجابي" زي نمط
S65 — مش لازم كل جلسة تلاقي باج عشان تكون مفيدة.
