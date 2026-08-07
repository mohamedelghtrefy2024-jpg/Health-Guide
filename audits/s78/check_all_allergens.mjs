import { getAllFoods } from '../../core/food-library/food-library.js';

const all = getAllFoods();

// كل نمط: كلمات دالة + كلمات استبعاد معروفة (فخ substring)
const checks = {
  gluten: {
    include: ['قمح', 'شعير', 'فريك', 'برغل', 'سميد', 'دقيق', 'خبز', 'عيش', 'مكرونة', 'شعرية', 'بسكويت', 'كسكس', 'جلوتين'],
    exclude: [], // نتحقق يدويًا من أي نتيجة
  },
  lactose: {
    include: ['لبن', 'جبن', 'زبادي', 'قشطة', 'زبدة', 'قريش', 'موزاريلا', 'شيدر', 'فيتا', 'حليب'],
    exclude: ['زبدة الفول السوداني', 'حليب جوز الهند', 'حليب اللوز', 'حليب الصويا', 'حليب الشوفان'],
  },
  egg: {
    include: ['بيض'],
    exclude: ['أبيض', 'بيضاء', 'بياض'], // فخ معروف موثَّق من قبل
  },
  soy: {
    include: ['صويا'],
    exclude: [],
  },
  fish: {
    include: ['سمك', 'تونة', 'سلمون', 'بلطي', 'بوري', 'جمبري', 'بساريا', 'فيليه', 'رنجة', 'ماكريل', 'سردين'],
    exclude: ['جمبري'], // جمبري قشريات مش سمك -> يتفحص جوا shellfish
  },
  shellfish: {
    include: ['جمبري', 'كابوريا', 'استاكوزا', 'محار', 'بلح البحر', 'قواقع', 'حبار', 'سبيط'],
    exclude: [],
  },
  sesame: {
    include: ['سمسم', 'طحينة', 'طحين السمسم'],
    exclude: [],
  },
  nuts: {
    include: ['لوز', 'جوز', 'فستق', 'كاجو', 'بندق', 'مكاديميا', 'بقان'],
    exclude: ['جوز الهند', 'جوز هند', 'الوزغة', 'عجوز', 'الوز البلدي', 'الوز الرومي', 'أوزة'],
  },
};

for (const [allergen, { include, exclude }] of Object.entries(checks)) {
  const candidates = all.filter(f => {
    const hasInclude = include.some(w => f.name_ar.includes(w));
    if (!hasInclude) return false;
    const hasExclude = exclude.some(w => f.name_ar.includes(w));
    return !hasExclude;
  });
  const missing = candidates.filter(f => !(f.allergens || []).includes(allergen));
  console.log(`\n=== ${allergen} === مرشحين: ${candidates.length} | ناقصين الوسم: ${missing.length}`);
  missing.forEach(f => console.log(' ', f.id, f.name_ar, '| cat:', f.category, '| allergens:', JSON.stringify(f.allergens)));
}
