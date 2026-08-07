import { getAllFoods } from '../../core/food-library/food-library.js';

const foods = getAllFoods();
const comp = foods.filter(f => f.category === 'composite_meal');
console.log('composite_meal total:', comp.length);

// ---- 1. Diet-tag contradiction: name signals meat/fish/poultry/dairy/egg but tagged vegan/vegetarian
const meatWords = ['لحم','فراخ','دجاج','لحمة','كبدة','كلاوي','مفروم','كباب','كفتة','فيليه','ريش','ورك','صدور دجاج','بط','أرانب','حبش','رومي'];
const fishWords = ['سمك','بلطي','بوري','جمبري','قشريات','سبيط','كاليماري','سلطعون','استاكوزا','تونة','سالمون','ماكريل','بوري','سردين'];
const dairyWords = ['جبن','لبن','زبادي','كريمة','قشطة','زبدة'];
const eggWords = ['بيض'];

let dietContradictions = [];
for (const f of comp) {
  const n = f.name_ar;
  const isVegan = (f.suitable_for_diets||[]).includes('vegan');
  const isVeg = (f.suitable_for_diets||[]).includes('vegetarian');
  const hasMeatFish = meatWords.some(w=>n.includes(w)) || fishWords.some(w=>n.includes(w));
  const hasDairyEgg = dairyWords.some(w=>n.includes(w)) || eggWords.some(w=>n.includes(w));
  if (isVegan && (hasMeatFish || hasDairyEgg)) {
    dietContradictions.push({id:f.id, name:n, issue:'vegan+meat/dairy/egg-name', diets:f.suitable_for_diets});
  } else if (isVeg && hasMeatFish) {
    dietContradictions.push({id:f.id, name:n, issue:'vegetarian+meat/fish-name', diets:f.suitable_for_diets});
  }
}
console.log('\n=== 1. Diet contradictions (name vs vegan/vegetarian tag):', dietContradictions.length, '===');
dietContradictions.forEach(x=>console.log(x.id, x.name, '|', x.issue));

// ---- 2. Allergen completeness for composite dishes
const shellfishWords=['جمبري','قشريات','سبيط','كاليماري','سلطعون','استاكوزا','حبار','قواقع','بلح البحر','محار'];
const fishWords2=['سمك','بلطي','بوري','تونة','سالمون','ماكريل','سردين','فيليه سمك'];
const lactoseWords=['جبن','لبن','زبادي','كريمة','قشطة','زبدة','بشاميل'];
const glutenWords=['دقيق','مكرونة','باستا','خبز','فينو','عيش','بقسماط','فريك','برغل','شعيرية','كنافة','فطير','رقاق'];
const eggWords2=['بيض'];
const nutsWords=['مكسرات','لوز','جوز','فستق','بندق','كاجو','صنوبر'];
const sesameWords=['سمسم','طحينة'];
const soyWords=['صويا'];

function has(arr, name){return arr.some(w=>name.includes(w));}

let allergenGaps=[];
for (const f of comp) {
  const n=f.name_ar;
  const al=f.allergens||[];
  const checks=[
    [shellfishWords,'shellfish'],
    [fishWords2,'fish'],
    [lactoseWords,'lactose'],
    [glutenWords,'gluten'],
    [eggWords2,'egg'],
    [nutsWords,'nuts'],
    [sesameWords,'sesame'],
    [soyWords,'soy'],
  ];
  for (const [words,tag] of checks) {
    if (has(words,n) && !al.includes(tag)) {
      allergenGaps.push({id:f.id, name:n, missing:tag, allergens:al});
    }
  }
}
console.log('\n=== 2. Allergen gaps (raw candidates, need manual verification):', allergenGaps.length, '===');
allergenGaps.forEach(x=>console.log(x.id, x.name, '-> missing', x.missing, '| has:', JSON.stringify(x.allergens)));

// ---- 3. Implausible calorie density for a full dish (per 100g)
let calorieOutliers = comp.filter(f => f.macros.kcal > 500 || f.macros.kcal < 40);
console.log('\n=== 3. Calorie density outliers (>500 or <40 kcal/100g):', calorieOutliers.length, '===');
calorieOutliers.forEach(f=>console.log(f.id, f.name_ar, '| kcal:', f.macros.kcal));

