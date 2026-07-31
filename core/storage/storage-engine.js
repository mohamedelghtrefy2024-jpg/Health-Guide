/**
 * ============================================================================
 * Storage Engine — IndexedDB الفعلي
 * ============================================================================
 * تخزين محلي بالكامل حسب متطلب المستند (لا سيرفر مركزي). طبقة وحيدة
 * لأي وصول لـIndexedDB في المنصة — لا محرك آخر يفتح اتصال IndexedDB
 * مباشرة، الكل يمر من هنا لضمان اتساق أسماء الـStores والمخطط.
 * ============================================================================
 */

'use strict';

export const DB_NAME = 'nutrition_platform_v2';
export const DB_VERSION = 1;

/** أسماء الـObject Stores — كل سجل فيها لازم يحتوي حقل `id` (keyPath) */
export const STORE = Object.freeze({
  PROFILE: 'profile',           // بروفايل المستخدم (سجل واحد فقط، id ثابت 'current')
  CUSTOM_FOODS: 'custom_foods', // أصناف أضافها المستخدم يدويًا (غير الموجودة في Food Library الأساسية)
  MEAL_LOGS: 'meal_logs',       // كل وجبة اتسجلت فعليًا (id = `${date}_${mealType}_${uuid}`)
  DAILY_TRACKING: 'daily_tracking', // سجل تتبع يومي مجمّع (id = التاريخ 'YYYY-MM-DD')
  EXERCISE_LOGS: 'exercise_logs',
  CHALLENGES: 'challenges',     // تحديات المستخدم النشطة/المكتملة
  SETTINGS: 'settings',
});

let _dbPromise = null;

// -----------------------------------------------------------------------
// معرّف فريد مقاوم لتصادم نفس المللي ثانية
// -----------------------------------------------------------------------

/**
 * BUG-S23-03: `Date.now()` وحده كان يُستخدم كجزء من الـid في عدة أماكن
 * (logMeal/logExercise/logEatingOutMeal/startChallenge) — نداءان في نفس
 * المللي ثانية بالظبط (نقرتين سريعتين جدًا أو تسجيل تلقائي) بينتجوا نفس
 * الـid، و`store.put()` بيستبدل السجل الأول بصمت من غير أي خطأ أو تحذير.
 * عداد مُتزايد دايمًا (لا يتصفّر) بيضمن تفرّد الجزء ده من الـid حتى لو
 * `Date.now()` نفسه اتكرر، من غير الاعتماد على `crypto.randomUUID` (مش
 * متاح في كل بيئات الاختبار/المتصفحات القديمة).
 */
let _idCounter = 0;

/** يرجّع لاحقة فريدة (`${timestamp}_${counter}`) لاستخدامها في تركيب أي id */
export function uniqueIdSuffix() {
  _idCounter += 1;
  return `${Date.now()}_${_idCounter}`;
}

/** يفتح (أو ينشئ) قاعدة البيانات — نتيجة مخبَّأة (singleton) لتفادي فتح اتصالات متعددة */
export function openDatabase() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('openDatabase: IndexedDB غير متاح في هذه البيئة'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const storeName of Object.values(STORE)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return _dbPromise;
}

/** لأغراض الاختبار فقط — يصفّر الاتصال المخبَّأ عشان اختبار يفتح قاعدة نظيفة */
export function _resetConnectionCache() {
  _dbPromise = null;
}

function withStore(storeName, mode, executor) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = executor(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

/** يحفظ سجلًا (إنشاء أو تحديث كامل) — السجل لازم يحتوي `id` */
export function putRecord(storeName, record) {
  if (!record || !record.id) throw new Error('putRecord: السجل لازم يحتوي حقل id');
  return withStore(storeName, 'readwrite', (store) => store.put(record));
}

/** يقرأ سجلًا واحدًا بالـid، أو undefined إن لم يوجد */
export function getRecord(storeName, id) {
  return withStore(storeName, 'readonly', (store) => store.get(id));
}

/** يقرأ كل السجلات في Store معيّن */
export function getAllRecords(storeName) {
  return withStore(storeName, 'readonly', (store) => store.getAll());
}

/** يحذف سجلًا بالـid */
export function deleteRecord(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => store.delete(id));
}

// -----------------------------------------------------------------------
// تصدير/استيراد كامل البروفايل (JSON) — النقل اليدوي بين الأجهزة حسب المستند
// -----------------------------------------------------------------------

/** يصدّر كل بيانات المستخدم من كل الـStores في كائن JSON واحد */
export async function exportAllData() {
  const result = { exported_at: new Date().toISOString(), db_version: DB_VERSION, stores: {} };
  for (const storeName of Object.values(STORE)) {
    result.stores[storeName] = await getAllRecords(storeName);
  }
  return result;
}

/**
 * يستورد بيانات مُصدَّرة مسبقًا — يمسح كل الـStores الموجودة في الملف
 * ويعيد كتابتها بالكامل (استبدال، وليس دمج) لتفادي تعارضات id قديمة/جديدة.
 * @param {Object} exportedData - ناتج exportAllData() سابقًا
 * @returns {{ success: boolean, importedCounts: Object, errors: string[] }}
 */
export async function importAllData(exportedData) {
  const errors = [];
  if (!exportedData || typeof exportedData !== 'object' || !exportedData.stores) {
    return { success: false, importedCounts: {}, errors: ['ملف الاستيراد غير صالح: لا يحتوي على stores'] };
  }

  const importedCounts = {};
  const db = await openDatabase();

  for (const [storeName, records] of Object.entries(exportedData.stores)) {
    if (!Object.values(STORE).includes(storeName)) {
      errors.push(`Store غير معروف تم تجاهله: ${storeName}`);
      continue;
    }
    if (!Array.isArray(records)) {
      errors.push(`بيانات Store "${storeName}" ليست مصفوفة صالحة — تم تجاهلها`);
      continue;
    }

    if (storeName === STORE.PROFILE) {
      for (const record of records) {
        if (!record) continue;
        if (record.heightCm !== undefined && (!Number.isFinite(record.heightCm) || record.heightCm <= 0 || record.heightCm > 300)) {
          errors.push(`بيانات الطول في البروفايل غير منطقية (${record.heightCm}) — راجع الملف المستورد`);
        }
        if (record.weightKg !== undefined && (!Number.isFinite(record.weightKg) || record.weightKg <= 0 || record.weightKg > 500)) {
          errors.push(`بيانات الوزن في البروفايل غير منطقية (${record.weightKg}) — راجع الملف المستورد`);
        }
        if (record.age !== undefined && (!Number.isFinite(record.age) || record.age <= 0 || record.age > 130)) {
          errors.push(`بيانات العمر في البروفايل غير منطقية (${record.age}) — راجع الملف المستورد`);
        }
      }
    }

    // BUG-S24-04: سجلات بدون `id` كانت تُتجاهَل بصمت في حلقة store.put() هنا،
    // لكن importedCounts[storeName] كان لسه بيساوي records.length الكلي —
    // يعني تقرير استيراد يقول "اتسجّل 50 سجل، صفر أخطاء" بينما الفعلي
    // أقل (تأكدت فعليًا: 2 سجل، 1 بدون id → success:true, importedCounts:2,
    // errors:[] رغم إن سجل واحد بس اتخزَّن فعليًا). دلوقتي: عدّ فعلي لكل
    // سجل اتكتب + رسالة خطأ صريحة لكل سجل مُتجاهَل.
    let actuallyWritten = 0;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of records) {
        if (record && record.id) {
          store.put(record);
          actuallyWritten += 1;
        } else {
          errors.push(`سجل بدون id في Store "${storeName}" تم تجاهله (لم يُستورَد)`);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    importedCounts[storeName] = actuallyWritten;
  }

  return { success: errors.length === 0, importedCounts, errors };
}
