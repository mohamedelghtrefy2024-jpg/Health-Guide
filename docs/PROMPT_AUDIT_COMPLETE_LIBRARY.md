# برومبت — فحص شامل كامل لمكتبة الطعام (nutrition-platform-v2)

## السياق (اقرأه كامل قبل ما تبدأ)

مكتبة الطعام في `core/food-library/foods-data.js` فيها 3006 صنف. عبر 3
جلسات فحص سابقة (S57، S59، S60 — موثَّقة بالتفصيل في `docs/SSCP_PROGRESS.md`)
اتصحح **185 صنف (~6.2%)** بسبب أخطاء بيانات حقيقية مؤكَّدة (مش تخمين —
كل تصحيح فيه دليل رقمي/منطقي واضح). **المشكلة**: الفحص ده كان جزئي —
اعتمد على ملاحظات عرَضية + بحث بكلمات مفتاحية + فحص إحصائي لعينة من الحقول،
**مش مراجعة شاملة منهجية لكل فئة بكل الأساليب المتاحة**. المطلوب دلوقتي:
تغطية كاملة — كل فئة، بكل أساليب الفحص المذكورة تحت، مش بس اللي كانت
مطبَّقة قبل كده.

**لا تكرر شغل سابق**: كل الفئات دي بالكامل أو جزئيًا اتفحصت واتصححت
قبل كده ومفيش داعي تعيد فحصها من الصفر (بس ممكن تشغّل نفس السكريبتات
عليها للتأكد مفيش حاجة فاتت):
- `fat_oil` (زيوت + توابل اتنقلت منها) — اتفحصت بعمق
- التوابل/الأعشاب بشكل عام (208 صنف) — اتفحصت وأغلبها اتصحح لـ`condiment`
- المحليات (عسل/دبس/سكر) — اتفحصت واتصححت
- 11 صنف بروتين/جبن كانوا `fruit` (S56) — اتصححت
- 95 صنف لحوم/أسماك ناقصهم استبعاد نباتي/فيجن (S55) — اتصححت
- 49 صنف "مش أكل خالص" (بادئات تخمير، حشرات، خميرة خبيز) — اتحذفوا (S57)
- 30 حلوى مبعثرة على فئات غلط — اتصححت لـ`sweet_dessert` (S59)

**التركيز المطلوب دلوقتي على الفئات دي اللي لسه ما اتفحصتش بعمق/بالكامل**:
`dairy` (99 صنف)، `sweet_dessert` (80+ صنف)، `composite_meal` (1182 صنف —
أكبر فئة، اتفحص منها بس الجزء اللي فيه توابل)، `fruit` (275 صنف — اتفحص
منه بس عينات)، `nut_seed` (152 صنف)، `vegetable` (434 صنف — اتفحص منه
عينات بس)، `legume` (82 صنف)، `protein` (184 صنف — اتفحص منه عينات)،
`beverage` (42 صنف)، `carb` (158 صنف).

---

## أدوات الفحص الجاهزة (Node.js، جرِّبها بالترتيب ده لكل فئة)

المشروع بيستورت مباشرة: `import { getAllFoods, getLibraryStats } from
'./core/food-library/food-library.js';`

### 1) فحص إحصائي للقيم الشاذة (outlier detection) — الأقوى والأشمل

```js
import { getAllFoods } from './core/food-library/food-library.js';

const all = getAllFoods();
const byCategory = {};
for (const f of all) {
  if (!byCategory[f.category]) byCategory[f.category] = [];
  byCategory[f.category].push(f);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(p / 100 * (sorted.length - 1));
  return sorted[idx];
}

// وسّع الحقول دي لو عايز (ممكن تضيف: sodium_mg, cholesterol_mg, gi, quality_score...)
const fields = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'];
const outliers = [];

for (const [cat, items] of Object.entries(byCategory)) {
  for (const field of fields) {
    const values = items.map((f) => f.macros[field]).filter((v) => typeof v === 'number');
    if (values.length < 10) continue;
    const iqrLow = percentile(values, 5);
    const iqrHigh = percentile(values, 95);
    const range = iqrHigh - iqrLow || 1;
    const lowerBound = iqrLow - range * 2;
    const upperBound = iqrHigh + range * 2;
    for (const item of items) {
      const v = item.macros[field];
      if (typeof v !== 'number') continue;
      if (v < lowerBound || v > upperBound) {
        outliers.push({ id: item.id, name: item.name_ar, category: cat, field, value: v });
      }
    }
  }
}
console.log('عدد الشواذ:', outliers.length);
outliers.forEach((o) => console.log(`${o.id}\t${o.name}\t[${o.category}]\t${o.field}=${o.value}`));
```

**قاعدة إلزامية**: كل نتيجة شاذة لازم تُراجَع يدويًا واحدة واحدة قبل أي
تصحيح — كتير من الشواذ تشتت طبيعي حقيقي (زي لبن مكثف محلى بسكر عالي فعلي،
أو مكسرات بدهون طبيعية عالية). **الباج الحقيقي هو اللي مالوش تفسير غذائي
منطقي** (زي سكر=95% لطبق مالح، أو دهون=0 لصنف اسمه "زيت").

### 2) فحص "قيمة الملعقة/الحصة اتحطت غلط في خانة الـ100 جم" (الباج الأخطر
اللي اتكرر 3 مرات فعليًا: زيوت، عسل، توابل)

الطريقة: لأي صنف بيتوقّع تكون قيمته الغذائية عالية الكثافة (زيوت، سكريات/
عسل/دبس، توابل جافة مطحونة، مكسرات، دهون حيوانية زي سمن/زبدة) لكن
`kcal`/`fat_g`/`carbs_g` طالعة قليلة جدًا (أقل من عُشر القيمة المتوقَّعة) —
غالبًا القيمة دي محسوبة لحصة صغيرة (ملعقة ~14 جم، ملعقة صغيرة ~4.5 جم،
كوب ~200 مل) بدل الـ100 جم المفروضة. **علامة تأكيدية**: دوّر على صنف
تاني بنفس الاسم بالظبط أو قريب جدًا بمكان تاني بالمكتبة — لو لقيت نسخة
"طبيعية" بقيم أعلى بمقياس ~7x (لملعقة كبيرة) أو ~22x (لملعقة صغيرة)،
يبقى مؤكَّد. **لا تخترع قيم بنفسك** — انسخ macros الصنف الصحيح الشقيق
حرفيًا (زي ما اتعمل في S59/S60).

```js
// مثال: دوّر على كل الأصناف اللي اسمها بيتكرر أكتر من مرة بقيم macros مختلفة جدًا
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const byName = {};
for (const f of all) {
  if (!byName[f.name_ar]) byName[f.name_ar] = [];
  byName[f.name_ar].push(f);
}
for (const [name, items] of Object.entries(byName)) {
  if (items.length < 2) continue;
  const kcals = items.map((f) => f.macros.kcal);
  const maxK = Math.max(...kcals), minK = Math.min(...kcals);
  if (minK > 0 && maxK / minK > 5) {
    console.log(name, '| نسخ متعددة بفارق كبير:', items.map((f) => `${f.id}=${f.macros.kcal}kcal`).join(', '));
  }
}
```

### 3) فحص تناسق sub-macros (مطبَّق جزئيًا بس مش شامل)

الدهون المشبعة + الأحادية + المتعددة لازم تكون ≤ إجمالي `fat_g` (بهامش
معقول، مش لازم تساوي بالظبط بسبب التقريب):

```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const bad = all.filter((f) => {
  const sum = (f.macros.saturated_fat_g||0) + (f.macros.monounsaturated_fat_g||0) + (f.macros.polyunsaturated_fat_g||0);
  return sum > f.macros.fat_g * 1.15; // هامش تسامح 15%
});
console.log('عدد الأصناف اللي مجموع دهونها الفرعية أكبر من الإجمالي:', bad.length);
bad.forEach((f) => console.log(f.id, f.name_ar, '| fat_g:', f.macros.fat_g, '| sum sub:', f.macros.saturated_fat_g + f.macros.monounsaturated_fat_g + f.macros.polyunsaturated_fat_g));
```

### 4) فحص kcal مقابل حساب الماكرو (بروتين×4 + كارب×4 + دهون×9)

```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const mismatches = [];
for (const f of all) {
  const m = f.macros;
  const computed = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
  if (m.kcal === 0 && computed === 0) continue;
  const diffPct = m.kcal > 0 ? Math.abs(computed - m.kcal) / m.kcal : 1;
  if (diffPct > 0.20) mismatches.push({ id: f.id, name: f.name_ar, category: f.category, kcal: m.kcal, computed: Math.round(computed), diffPct: Math.round(diffPct * 100) });
}
console.log('عدد الأصناف بفارق >20% بين kcal المخزَّن والمحسوب:', mismatches.length);
mismatches.forEach((m) => console.log(JSON.stringify(m)));
```

**تنبيه مهم**: القائمة دي (خصوصًا للأعشاب/البهارات الجافة) اتفحصت قبل
كده وطلع إن التفسير الأرجح لمعظمها هو معامل Atwater المخفَّض للألياف
العالية — **مش باج بالضرورة**. **لا تُعدَّل هذه القيم آليًا** — تحتاج
مراجعة تغذوية بشرية بمرجع مباشر (USDA أو مشابه). سجِّلها بس كملاحظة.

### 5) فحص تكرار الميكرونيوترنتس الحرفي (كشف بيانات مفبركة/نسخ-لصق)

```js
import { getAllFoods } from './core/food-library/food-library.js';
const all = getAllFoods();
const byMicroSignature = {};
for (const f of all) {
  const sig = JSON.stringify(f.micros);
  if (!byMicroSignature[sig]) byMicroSignature[sig] = [];
  byMicroSignature[sig].push(f);
}
// نفحص بس المجموعات اللي فيها أصناف من فئات مختلفة تمامًا بنفس الميكرونيوترنتس
// بالظبط — ده مؤشر تفتيش (مش دليل قاطع لوحده، لازم مراجعة يدوية) لأن تكرار
// نفس الميكرونيوترنتس داخل نفس الفئة/المجموعة الغذائية طبيعي وشائع ومقبول.
const suspicious = Object.values(byMicroSignature).filter((g) => {
  if (g.length < 3) return false;
  const cats = new Set(g.map((f) => f.category));
  return cats.size >= 2; // فئات مختلفة بنفس البصمة = مشبوه أكتر
});
console.log('مجموعات مشبوهة (فئات مختلفة، نفس الميكرونيوترنتس):', suspicious.length);
suspicious.forEach((g) => console.log(g.map((f) => `${f.id}(${f.category}):${f.name_ar}`).join(' | ')));
```

### 6) فحص تصنيف كل فئة مقابل منطق الاستخدام الفعلي في محرك التوليد

راجع `core/meal-engine/meal-generation-engine.js` (خصوصًا
`STANDALONE_SINGLE_ITEM_CATEGORIES` و`SINGLE_ITEM_MAX_GRAMS_BY_CATEGORY`
و`buildMacroDrivenCandidates`) عشان تعرف مين بيدخل حوض التوليد الفعلي.
لو فئة زي `condiment`/`sweet_dessert` (مش مستخدَمة في أي حوض حاليًا)،
أي صنف غلط فيها مش هيأثر على التوليد التلقائي مباشرة (بس لسه غلط
للبحث اليدوي وعرض البيانات). لو فئة زي `protein`/`carb`/`vegetable`/
`fat_oil`/`legume`/`dairy`/`fruit`/`nut_seed`/`beverage`/`composite_meal`،
أي غلط فيها بيأثر مباشرة على جودة التوليد — **أولوية أعلى**.

### 7) فحص خاص بكل فئة (heuristics إضافية حسب نوع الفئة)

- **`dairy`**: كل صنف لازم يكون منتج ألبان حقيقي (لبن/جبن/زبادي/قشطة/
  زبدة/كفير مشتق من حيوان أو نبات موسوم صراحةً "نباتي"). أي صنف
  `protein_g` و`fat_g` وصفر تقريبًا مع `carbs_g` عالي مشبوه (مش منتج
  ألبان حقيقي).
- **`sweet_dessert`**: كل صنف حلوى/كيك/بسكويت/آيس كريم حقيقي. راجع كل
  صنف `sugar_g` = 0 بالظبط (نادر لحلوى حقيقية إلا لو دايت صراحةً).
- **`composite_meal`** (أكبر فئة، 1182 صنف): مش كل حاجة فيها لازم تتفحص
  واحدة واحدة (كتير أوي)، لكن ركّز على: (أ) أي صنف اسمه قصير (كلمة/
  كلمتين) بدل اسم طبق كامل — احتمال يكون مكوّن خام مش طبق، (ب) أي صنف
  `cuisine: "egyptian"` باسم أجنبي واضح (بيتزا، سوشي، تاكو، لازانيا...)،
  (ج) أي صنف بقيم micros متطابقة حرفيًا مع أصناف تانية (فحص #5).
- **`fruit`**: كل صنف فاكهة حقيقية. أي صنف `protein_g` > 15 أو `fat_g`
  > 20 مشبوه (غالبًا بذرة/مكسرة أو منتج مصنَّع مش فاكهة).
- **`nut_seed`**: كل صنف مكسرات/بذور حقيقية. أي صنف `carbs_g` > 40 مع
  `fat_g` < 10 مشبوه (المكسرات/البذور عادةً عالية الدهون).
- **`vegetable`**: كل صنف خضار حقيقي (طازج أو مطبوخ). أي صنف
  `protein_g` > 15 أو اسمه بيوحي بلحم/سمك/مأكولات بحرية (زي ما لقينا
  مع "استاكوزا") مشبوه جدًا.
- **`legume`**: كل صنف بقوليات حقيقية (فول/عدس/حمص/لوبيا/ترمس...).
- **`protein`**: كل صنف مصدر بروتين حقيقي (لحم/سمك/دجاج/بيض/بروتين
  نباتي مركَّز). أي صنف `protein_g` < 5 مشبوه جدًا (زي ما لقينا مع
  التتبيلات والصلصات).
- **`beverage`**: كل صنف مشروب حقيقي (سائل بيُشرب). أي صنف `kcal` >
  150/100مل مشبوه (كثافة عالية جدًا لمشروب عادي، إلا لو smoothie/شيك).
- **`carb`**: كل صنف مصدر كارب حقيقي (حبوب/نشويات/خبز/معكرونة...). أي
  صنف `carbs_g` < 10 مشبوه جدًا (زي ما لقينا مع الستيفيا).

---

## قواعد إلزامية أثناء التنفيذ (زي كل الجلسات السابقة بالظبط)

1. **دليل حقيقي قبل أي تعديل** — لازم تشوف القيمة الفعلية بعينك (macros
   كاملة، مش بس الحقل المشبوه) قبل ما تقرر إنها باج.
2. **لو محتاج تصحح قيمة رقمية (مش بس فئة)**: دوّر على صنف شقيق حقيقي
   بنفس الاسم/النوع بمكان تاني بالمكتبة وانسخ الـ`macros` منه حرفيًا —
   **متخترعش قيم بنفسك أبدًا**.
3. **لو معندكش صنف شقيق مرجعي وواثق إن القيمة غلط**: سجِّلها كملاحظة
   "تحتاج مراجعة بشرية" **بدل** ما تخترع رقم.
4. **بعد كل دفعة تصحيح**: شغّل `npm run test:all` — لازم يفضل **430/430**
   (أو أكتر لو ضفت اختبارات). لو فيه فشل، افحص السبب زي منهجية S58
   (كان فيه تفاعل غير متوقَّع بين تصحيح فئة ومحرك التوليد — راجع الـ
   checkpoint ده في `SSCP_PROGRESS.md` كمرجع لنوع المشاكل المحتملة).
5. **نفّذ التعديلات بسكريبت Node.js يقرأ/يعدّل النص مباشرة** (زي الأسلوب
   المتَّبع في كل الجلسات السابقة — بحث عن `id: "food_XXXX",` وتحديد حدود
   الـblock بـ`  {\n` و`  },\n`)، **مش يدويًا بـstr_replace لكل صنف لوحده**
   لو العدد كبير — أسرع وأقل عرضة للخطأ.
6. **وثّق كل حاجة** في `docs/SSCP_PROGRESS.md` بنفس فورمات checkpoints
   S57-S60 (السياق، الدليل، التصحيح، التحقق، العدد الإجمالي).
7. **ماتحذفش/تعدّلش** بيانات الأعشاب/البهارات الجافة الخاصة بفارق kcal
   (فحص #4) بدون مراجعة بشرية — قرار سابق متكرر من نفس المستخدم.

## عند الانتهاء

حدِّث جدول ملخَّص في `SSCP_PROGRESS.md` بإجمالي الأصناف المُصحَّحة في
كل فئة، وأضف عدد الأصناف الكلي المُصحَّح عبر كل الجلسات (كان 185 لحد
S60). ابدأ الجلسة الجديدة بذكر الرقم ده كنقطة انطلاق.
