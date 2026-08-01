/**
 * ============================================================================
 * Religious Calendar — حساب أيام الصيام تلقائيًا
 * ============================================================================
 * بند مطلوب صراحة من المستخدم: مفيش خانة ديانة، ومفيش حساب تلقائي لأيام
 * الصيام (رمضان، الاتنين والخميس، عرفة، عاشوراء للمسلمين — الصوم الكبير،
 * صوم الميلاد، صوم الرسل، صوم العدرا، الأربعاء والجمعة للمسيحيين). هذا
 * الملف بيحسب "هل النهاردة يوم صيام ولية؟" من تاريخ Gregorian + ديانة
 * البروفايل، من غير أي اتصال إنترنت أو API خارجي (الحساب كله رياضي/جدولي).
 *
 * تحذير دقة مهم (لازم يتعرض للمستخدم في الواجهة):
 * - التقويم الهجري هنا "جدولي" (tabular/arithmetic) — نفس الطريقة
 *   المستخدمة في أغلب المكتبات البرمجية، وهي تقريب حسابي، مش رصد هلال
 *   فعلي. ممكن يفرق يوم أو يومين عن الإعلان الرسمي لكل بلد.
 * - الصوم القبطي هنا مبني على حساب فصح يوليانupdate (Julian Easter) +
 *   قواعد مبسّطة لفترات الاستثناء (فرحة القيامة، الخ) — راجع دايمًا تقويم
 *   الكنيسة الرسمي لو محتاج دقة كنسية كاملة.
 * ============================================================================
 */

'use strict';

// -----------------------------------------------------------------------
// تحويل جريجوري -> رقم اليوم اليولياني (JDN) — أساس أي تحويل تقويمي
// -----------------------------------------------------------------------

function gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function dateToJDN(date) {
  return gregorianToJDN(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// -----------------------------------------------------------------------
// التقويم الهجري (جدولي/حسابي) — خوارزمية "الكويتية" الشائعة في أغلب
// المكتبات مفتوحة المصدر لتحويل جريجوري <-> هجري بدون رصد هلال فعلي
// -----------------------------------------------------------------------

const ISLAMIC_EPOCH_JDN = 1948440; // 1 محرم 1هـ

/** @returns {{ year: number, month: number, day: number }} شهر 1..12 (1=محرم)، يوم 1..30 */
function jdnToHijri(jdn) {
  let jd = jdn - ISLAMIC_EPOCH_JDN + 10632;
  const n = Math.floor((jd - 1) / 10631);
  jd = jd - 10631 * n + 354;
  const j = Math.floor((10985 - jd) / 5316) * Math.floor((50 * jd) / 17719) +
    Math.floor(jd / 5670) * Math.floor((43 * jd) / 15238);
  jd = jd - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * jd) / 709);
  const day = jd - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/**
 * @param {Date} gregorianDate
 * @returns {{ year: number, month: number, day: number }}
 */
export function gregorianToHijri(gregorianDate) {
  return jdnToHijri(dateToJDN(gregorianDate));
}

// -----------------------------------------------------------------------
// فصح يوليان (Julian Easter) — أساس حساب مواسم الصوم القبطي كلها
// (خوارزمية Meeus/Julian المعروفة، محوَّلة لتاريخ جريجوري مكافئ)
// -----------------------------------------------------------------------

/** @returns {Date} تاريخ فصح الكنيسة القبطية لسنة معيّنة، كتاريخ UTC مكافئ بتقويم جريجوري */
export function copticEasterGregorianDate(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const julianMonth = Math.floor((d + e + 114) / 31); // 3=مارس، 4=أبريل (بتقويم يوليان)
  const julianDay = ((d + e + 114) % 31) + 1;

  const century = Math.floor(year / 100);
  const offsetDays = century - Math.floor(century / 4) - 2; // فرق يوليان/جريجوري (13 يوم في القرنين 20-21)

  const result = new Date(Date.UTC(year, julianMonth - 1, julianDay));
  result.setUTCDate(result.getUTCDate() + offsetDays);
  return result;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function sameUTCDate(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

function isBetweenInclusive(date, start, end) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

// -----------------------------------------------------------------------
// حساب حالة الصيام الإسلامي ليوم معيّن
// -----------------------------------------------------------------------

/**
 * @param {Date} date - تاريخ UTC (بدون وقت — استخدم منتصف الليل UTC)
 * @param {Object} [options]
 * @param {boolean} [options.observeVoluntaryFasts=false] - هل يراعي المستخدم الصيام المستحب (الاتنين/الخميس، عرفة، عاشوراء) ولا الفرض (رمضان) بس
 * @returns {{ isFasting: boolean, mandatory: boolean, occasion: string|null, label_ar: string|null }}
 */
export function resolveIslamicFastingStatus(date, options = {}) {
  const { observeVoluntaryFasts = false } = options;
  const hijri = gregorianToHijri(date);

  if (hijri.month === 9) {
    return { isFasting: true, mandatory: true, occasion: 'ramadan', label_ar: `رمضان (${hijri.day} رمضان ${hijri.year}هـ)` };
  }

  if (!observeVoluntaryFasts) {
    return { isFasting: false, mandatory: false, occasion: null, label_ar: null };
  }

  if (hijri.month === 12 && hijri.day === 9) {
    return { isFasting: true, mandatory: false, occasion: 'arafah', label_ar: 'يوم عرفة (صيام مستحب)' };
  }
  if (hijri.month === 1 && hijri.day === 10) {
    return { isFasting: true, mandatory: false, occasion: 'ashura', label_ar: 'يوم عاشوراء (صيام مستحب)' };
  }
  if (hijri.month === 1 && hijri.day === 9) {
    return { isFasting: true, mandatory: false, occasion: 'tasua', label_ar: 'يوم تاسوعاء (صيام مستحب)' };
  }
  const weekday = date.getUTCDay(); // 0=أحد ... 1=اتنين ... 4=خميس
  if (weekday === 1 || weekday === 4) {
    return {
      isFasting: true,
      mandatory: false,
      occasion: 'monday_thursday',
      label_ar: `يوم ${weekday === 1 ? 'الاتنين' : 'الخميس'} (صيام مستحب)`,
    };
  }

  return { isFasting: false, mandatory: false, occasion: null, label_ar: null };
}

// -----------------------------------------------------------------------
// حساب حالة الصيام المسيحي (القبطي) ليوم معيّن
// -----------------------------------------------------------------------

/**
 * @param {Date} date
 * @param {Object} [options]
 * @param {boolean} [options.observeWeeklyFasts=true] - صيام الأربعاء والجمعة الأسبوعي
 * @returns {{ isFasting: boolean, occasion: string|null, label_ar: string|null, strict: boolean }}
 *  strict=true يعني بدون سمك (الصوم الكبير) — false يعني "مسموح فيه السمك"
 */
export function resolveChristianFastingStatus(date, options = {}) {
  const { observeWeeklyFasts = true } = options;
  const year = date.getUTCFullYear();
  const easterThisYear = copticEasterGregorianDate(year);

  // الصوم الكبير: يبدأ 55 يوم قبل عيد القيامة وينتهي بعيد القيامة نفسه
  const greatLentStart = addDays(easterThisYear, -55);
  if (isBetweenInclusive(date, greatLentStart, addDays(easterThisYear, -1))) {
    return { isFasting: true, occasion: 'great_lent', label_ar: 'الصوم الكبير (صارم — بدون سمك)', strict: true };
  }

  // صوم الرسل: من اليوم التالي لعيد العنصرة (فصح + 50) لحد 12 يوليو يوليانية (= 25 يوليو جريجوري)
  const pentecost = addDays(easterThisYear, 49);
  const apostlesFastStart = addDays(pentecost, 1);
  const apostlesFastEnd = new Date(Date.UTC(year, 6, 25)); // 25 يوليو
  if (apostlesFastStart.getTime() <= apostlesFastEnd.getTime() && isBetweenInclusive(date, apostlesFastStart, apostlesFastEnd)) {
    return { isFasting: true, occasion: 'apostles_fast', label_ar: 'صوم الرسل (مسموح فيه السمك)', strict: false };
  }

  // صوم العدرا (صوم السيدة العذراء): 1-15 أغسطس يوليانية (= 14-28 أغسطس جريجوري)
  const dormitionStart = new Date(Date.UTC(year, 7, 14));
  const dormitionEnd = new Date(Date.UTC(year, 7, 28));
  if (isBetweenInclusive(date, dormitionStart, dormitionEnd)) {
    return { isFasting: true, occasion: 'dormition_fast', label_ar: 'صوم العدرا (مسموح فيه السمك)', strict: false };
  }

  // صوم الميلاد: 25 نوفمبر - 6 يناير يوليانية (= 8 ديسمبر - 19 يناير جريجوري)، بيمتد لسنتين ميلاديتين
  const nativityStartThisYear = new Date(Date.UTC(year, 11, 8));
  const nativityEndNextYear = new Date(Date.UTC(year + 1, 0, 19));
  const nativityStartLastYear = new Date(Date.UTC(year - 1, 11, 8));
  const nativityEndThisYear = new Date(Date.UTC(year, 0, 19));
  if (
    isBetweenInclusive(date, nativityStartThisYear, nativityEndNextYear) ||
    isBetweenInclusive(date, nativityStartLastYear, nativityEndThisYear)
  ) {
    return { isFasting: true, occasion: 'nativity_fast', label_ar: 'صوم الميلاد (مسموح فيه السمك)', strict: false };
  }

  // الأربعاء والجمعة الأسبوعي (خارج فترة "الخماسين" — الخمسين يوم فرح من عيد القيامة لعيد العنصرة)
  const inJoyfulFifty = isBetweenInclusive(date, easterThisYear, pentecost);
  if (observeWeeklyFasts && !inJoyfulFifty) {
    const weekday = date.getUTCDay(); // 3=أربعاء، 5=جمعة
    if (weekday === 3 || weekday === 5) {
      return {
        isFasting: true,
        occasion: 'weekly_wed_fri',
        label_ar: `صيام ${weekday === 3 ? 'الأربعاء' : 'الجمعة'} الأسبوعي (مسموح فيه السمك)`,
        strict: false,
      };
    }
  }

  return { isFasting: false, occasion: null, label_ar: null, strict: false };
}

// -----------------------------------------------------------------------
// نقطة الدخول الموحّدة: من الديانة + التاريخ -> fastingTag لـReligious Engine
// -----------------------------------------------------------------------

/**
 * @param {Object} params
 * @param {Date} params.date
 * @param {string} params.religion - 'islam' | 'christianity' | 'none'
 * @param {boolean} [params.observeVoluntaryFasts=false]
 * @param {boolean} [params.manualOverrideNotFasting=false] - تجاوز يدوي: "مش صايم النهاردة" (مرض/سفر/عذر شرعي..)
 * @returns {{ isFasting: boolean, fastingTag: string|null, label_ar: string|null, mealSlotsHint: 'normal'|'suhoor_iftar' }}
 */
export function resolveDailyFastingStatus({ date, religion, observeVoluntaryFasts = false, manualOverrideNotFasting = false }) {
  if (manualOverrideNotFasting || !religion || religion === 'none') {
    return { isFasting: false, fastingTag: null, label_ar: null, mealSlotsHint: 'normal' };
  }

  if (religion === 'islam') {
    const status = resolveIslamicFastingStatus(date, { observeVoluntaryFasts });
    if (!status.isFasting) return { isFasting: false, fastingTag: null, label_ar: null, mealSlotsHint: 'normal' };
    // الوسم الديني الفعلي للأصناف موجود بالفعل على كل صنف تقريبًا (لا يوجد
    // تصنيف "ممنوع" وقت الصيام الإسلامي غير التوقيت)، فبنستخدم نفس الوسم
    // الموجود مسبقًا في مكتبة الطعام (ramadan_suhoor يمثّل أي وقت سحور/صيام
    // إسلامي، مش رمضان بس) — التفرقة الفعلية بتظهر في عدد/توقيت الوجبات
    // (mealSlotsHint) مش في نوع الصنف.
    return { isFasting: true, fastingTag: 'ramadan_suhoor', label_ar: status.label_ar, mealSlotsHint: 'suhoor_iftar' };
  }

  if (religion === 'christianity') {
    const status = resolveChristianFastingStatus(date, { observeWeeklyFasts: observeVoluntaryFasts });
    if (!status.isFasting) return { isFasting: false, fastingTag: null, label_ar: null, mealSlotsHint: 'normal' };
    const tag = status.strict ? 'christian_fast_strict' : 'christian_fast_fish_allowed';
    return { isFasting: true, fastingTag: tag, label_ar: status.label_ar, mealSlotsHint: 'normal' };
  }

  return { isFasting: false, fastingTag: null, label_ar: null, mealSlotsHint: 'normal' };
}
