# منصة إدارة الصحة والتغذية الشخصية — نظرة عامة

مشروع جديد من الصفر (خلاصة عن [مرشدك الصحي](../morshidak) القديم) بمعمارية
Engines لا صفحات، ومصدر حقيقة واحد لكل قرار (Decision Engine). راجع
`docs/منصة_التغذية_الجديدة_برومبت_الرؤية_الشامل.md` للرؤية الكاملة، و
`docs/SSCP_PROGRESS.md` لسجل التطوير الكامل بكل الجلسات.

---

## تشغيل المشروع

```bash
npm install          # يجيب fake-indexeddb و jsdom (لازمين للاختبارات بس، مش للتشغيل الفعلي)
npm run serve         # سيرفر محلي بسيط على http://localhost:8080
```

بعدين افتح `http://localhost:8080/ui/` في المتصفح. **لازم سيرفر محلي** — فتح
`ui/index.html` مباشرة بـ`file://` مش هيشتغل لأن المتصفحات بتمنع ES Modules
عبر بروتوكول `file://`.

**التشغيل الفعلي (production) محتاج فقط متصفح حديث** — مفيش أي build step،
مفيش framework، مفيش dependency فعلية غير `fake-indexeddb`/`jsdom` وهما
لأغراض الاختبار الآلي فقط.

## النشر على GitHub Pages

1. ارفع المشروع كامل (بما فيه `index.html` في الجذر) لريبو على GitHub.
2. Settings → Pages → Source: اختار الفرع (عادةً `main`) والمجلد **`/ (root)`**.
3. بعد شوية دقايق، الموقع هيبقى شغّال على `https://<username>.github.io/<repo-name>/`.

`index.html` الموجود في جذر المشروع هو مجرد تحويل فوري (redirect) لـ
`ui/index.html` — التطبيق الفعلي شغّال بالكامل من غير أي سيرفر أو backend
(كل حاجة IndexedDB محليًا في المتصفح، زي أي استضافة محلية). ملف `.nojekyll`
موجود عمدًا في الجذر عشان يمنع GitHub من معالجة الملفات بمحرك Jekyll
(مش لازم لموقع Static عادي زي ده، ومحتمل يسبب تعارضات غير متوقعة لو اتفعّل).

**تنبيه مهم**: بيانات المستخدم (البروفايل، السجلات، التتبع) بتتخزّن محليًا
في IndexedDB الخاص بالمتصفح **لكل نطاق (origin) على حدة** — يعني لو الموقع
اتنقل من نطاق GitHub Pages لنطاق تاني (دومين خاص مثلًا)، البيانات القديمة
مش هتتنقل تلقائيًا؛ المستخدم لازم يستخدم زر "تصدير البيانات" في الإعدادات
قبل أي نقل نطاق، ثم "استيراد" على النطاق الجديد.

## تشغيل الاختبارات

```bash
npm test          # اختبار تراجعي لكل الـEngines (بدون واجهة) — شغّله بعد أي تعديل في الكود أو البيانات
npm run test:ui    # اختبار محاكاة كامل للواجهة (Onboarding → Dashboard → توليد → تسجيل → تتبع → تحديات)
npm run test:all   # الاثنين مع بعض
```

**مهم جدًا**: بعد أي تعديل على `foods-data.js` (خصوصًا لما تدمج قاعدة بيانات
جديدة)، شغّل `npm test` فورًا. لو فشل أي اختبار، ده معناه إن البيانات
الجديدة كسرت افتراضًا كان قائم عليه محرك ما — التفاصيل في رسالة الفشل.

---

## حالة المشروع الحالية

**كل الـ Engines الأساسية (بما فيها Recommendation Engine وAnalytics Engine) +
طبقة التخزين + واجهة مستخدم فعلية شغّالة ومُختبرة بالكامل، بما فيها
Meal Generation Engine بمحسّن تركيبات 3+ أصناف حقيقي (S20) والتوصيات
التفاعلية لثبات الوزن (S19)**
**(220 اختبار ناجح إجمالًا: 158 core-regression + 62 ui-smoke-test، صفر
Regression)**. راجع `docs/SSCP_PROGRESS.md` لتفاصيل كل جلسة. لا يوجد حاليًا
أي بند مفتوح موثَّق من مستند الرؤية الأصلي.

---

## هيكل المجلدات

```
core/
├── storage/                طبقة IndexedDB الفعلية الوحيدة في المشروع
│   └── storage-engine.js      CRUD عام لكل الـStores + تصدير/استيراد JSON كامل
│
├── food-library/            مصدر الحقيقة الوحيد لبيانات الطعام
│   ├── schema.js               المخطط الموحّد + كل الثوابت
│   ├── foods-data.js           بيانات 3055 صنف (مولَّدة آليًا من قاعدة بيانات المستخدم — لا تُعدَّل يدويًا)
│   └── food-library.js         طبقة القراءة الوحيدة
│
├── decision-engine/         قلب النظام — تقاطع كل القيود
│   ├── constraint-schema.js
│   ├── medical-engine.js / allergy-engine.js / religious-engine.js / diet-engine.js
│   └── decision-engine.js      تجميع + تطبيق + تشخيص عند الفشل
│
├── nutrition-engine/        BMR/TDEE/أهداف الماكرو والمايكرو
│   └── nutrition-engine.js
│
├── meal-engine/              يربط كل ما سبق لتوليد وجبة فعلية
│   ├── meal-quality.js
│   └── meal-generation-engine.js
│
├── exercise-engine/          مكتبة تمارين + سعرات محروقة + موانع استخدام طبية
│   └── exercise-engine.js
│
├── tracking-engine/          تسجيل وجبات/تمارين فعلية + إجماليات يومية + مؤشر التزام
│   └── tracking-engine.js
│
├── gamification-engine/      تحديات + Streak
│   └── gamification-engine.js
│
├── analytics-engine/         اتجاهات + مقارنة أفضل/أسوأ أسبوع
│   └── analytics-engine.js
│
└── recommendation-engine/    توصيات فورية + نصائح عامة/حسب الحالة + رسالة مؤشر التزام
    └── recommendation-engine.js

ui/
├── index.html                 هيكل كل الصفحات (Onboarding/Dashboard/Meal Gen/Exercise/Tracking/Challenges/Settings)
├── app.js                     الطبقة الرابطة — Vanilla JS، بدون framework
└── styles.css

tests/
├── core-regression.mjs        اختبار كل الـEngines (بدون DOM) — `npm test`
└── ui-smoke-test.mjs          اختبار محاكاة كامل للواجهة عبر jsdom — `npm run test:ui`

scripts/
└── convert-food-database.py   سكربت تحويل قاعدة بيانات طعام خام (JSON) لشكل FoodItem — عدّل هنا لو محتاج تعيد توليد foods-data.js من مصدر بيانات جديد

docs/
├── SSCP_PROGRESS.md                     سجل تقدم كامل بكل الجلسات، القرارات المعمارية، الاختبارات، الـbugs
├── FOOD_DB_CONVERSION_REPORT.md         تقرير تحويل قاعدة البيانات الحالية (3055 صنف) — قرارات heuristic، تحذيرات، حالات تحتاج مراجعة يدوية
└── منصة_التغذية_الجديدة_برومبت_الرؤية_الشامل.md   مستند الرؤية الأصلي
```

---

## كيف تتصل الأجزاء ببعض

```
Storage (IndexedDB) ──> بروفايل المستخدم محفوظ محليًا
        │
        ▼
Food Library ──┐
               ├──> Decision Engine ──┐
Profile ───────┘                     ├──> Meal Generation Engine ──> وجبة + Quality Score ──> Storage (meal_logs)
               Nutrition Engine ──────┘

Tracking Engine ──(يقرأ meal_logs + exercise_logs)──> إجماليات يومية + Adherence Score
Analytics Engine ──(يقرأ نفس السجلات)──> اتجاهات + مقارنة أسابيع
Gamification Engine ──(مستقل، يقرأ challenges store)──> تحديات + Streak
Exercise Engine ──(يستخدم MEDICAL_CONDITION من Food Library schema)──> موانع استخدام
Recommendation Engine ──(يقرأ Tracking + Nutrition، ومستقل عن التخزين)──> توصيات فورية + نصائح للـDashboard
```

الواجهة (`ui/app.js`) هي المستهلك الوحيد لكل الـEngines مع بعض — أي منطق
تجاري (business logic) موجود في `core/` فقط، مفيش أي حساب أو قرار متبني
داخل `app.js` نفسه غير ربط النتائج بالـDOM.

---

## ⚠️ الأهم: Food Library الآن 3055 صنف (اتحدّثت من قاعدة بيانات المستخدم)

`foods-data.js` بقى **مولَّد آليًا** من `food_database.json` (قاعدة بيانات
المستخدم، 3055 صنف بمعايير USDA جزئيًا) عبر `scripts/convert-food-database.py`
— مش بيانات يدوية بعد كده. **لا تُعدّل `foods-data.js` مباشرة** — أي تعديل
لازم يبقى في سكربت التحويل أو في المصدر الخام، وإلا هيضيع عند إعادة التوليد.

**راجع `docs/FOOD_DB_CONVERSION_REPORT.md` بالكامل قبل أي اعتماد طبي
حقيقي على البيانات** — يوثّق كل قرار تحويل، وتحديدًا:
- **الحساسيات مُستنتَجة heuristically** (المصدر الأصلي مفيهوش حقل حساسية
  صريح) — تحتاج مراجعة يدوية لحالات الحساسية الشديدة قبل الاعتماد الكامل
- 4 أصناف "كفتة نباتية" كانت متعلّمة بالغلط `contains_meat` في المصدر
  رغم كونها صيامي فعليًا — اتحلّت تلقائيًا بإعطاء أولوية لعلامة "صيامي"
- حقل الفوسفور موجود بالمصدر لكن مش في مخططنا الحالي (مهم لدقة قيود
  الكلى) — قرار إضافته للمستخدم

### درس مهم اتعلّمناه من الدمج (بُنية، مش بيانات)
خوارزمية Meal Generation الأصلية كانت مبنية ومُختبرة على 33 صنف بس،
وكانت بتعمل تقاطع كامل (بروتين×كارب×خضار) بدون أي حد أقصى — لما اتطبّقت
على 3055 صنف، انفجرت الذاكرة فورًا (185 بروتين × 162 كارب × 436 خضار =
ملايين التركيبات). **اتصلح** بإضافة `CANDIDATE_POOL_SIZE` في
`meal-generation-engine.js` — بيرشّح أفضل 15 بروتين/15 كارب/6 خضار/4 دهون
بس (بمعيار مركّب من الجودة + كثافة العنصر الغذائي المطلوب) قبل التقاطع،
فحجم البحث بيفضل محدود بغض النظر عن حجم المكتبة. زمن التوليد الفعلي دلوقتي
**~100ms** لكل وجبة حتى مع قيود صحية متعددة.

---

## ⚠️ لو هتوسّع Food Library تاني مستقبلًا

البيانات الحالية (`foods-data.js`) **3055 صنف** (مولَّدة من قاعدة بيانات
المستخدم، راجع القسم أعلاه). لو هتضيف مصدر بيانات إضافي تاني لاحقًا، لازم
يتحول لنفس شكل `FoodItem` بالظبط (معرَّف في `core/food-library/schema.js`):

1. **كل القيم لكل 100 جرام** (`reference_amount_g = 100` دايمًا)
2. **الحقول الإلزامية** كاملة (راجع `validateFoodItem()`)
3. **أكواد الأمراض/الحساسيات/الحميات لازم تطابق بالظبط** `MEDICAL_CONDITION`
   (16 قيمة) / `ALLERGEN` (8 قيم) / `DIET_STYLE` (13 قيمة) في `schema.js` —
   أي كود جديد لازم يتضاف للثوابت أولًا
4. **`unsuitable_for_conditions` / `unsuitable_for_diets` / `allergens`** هي
   أساس عمل Decision Engine بالكامل — أي نقص فيها بينعكس مباشرة على دقة
   الفلترة الطبية

**بعد أي دمج بيانات جديدة**: شغّل `npm test` فورًا. أول اختبار في الملف
بيتأكد إن `getLibraryStats().total_invalid === 0` — لو ظهر أي صنف مرفوض،
هتلاقي تفاصيله في نفس رسالة الفشل.
