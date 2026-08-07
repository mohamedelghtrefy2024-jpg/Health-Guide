import { getAllFoods } from '../../core/food-library/food-library.js';

const foods = getAllFoods();
const comp = foods.filter(f => f.category === 'composite_meal');

// Fixed word lists — avoid "بيض" substring matching "أبيض/بيضاء" (white)
// Use regex with negative lookahead for اء/ة endings that mean "white", and negative lookbehind for أ
const eggRegex = /(?<!أ)بيض(?!اء|ه\b)/; // crude but better than plain includes
// Simpler: explicit egg word forms only
function hasEgg(name) {
  return /\bبيض\b|بيضة|بالبيض|البيض\b/.test(name) && !/(أبيض|بيضاء)/.test(name.replace(/بيضة|بالبيض|البيض/g,''));
}
// Actually simplest robust approach: check for egg word forms explicitly, exclude "أبيض"/"بيضاء" entirely first
function hasEggWord(name) {
  let cleaned = name.replace(/أبيض/g,'').replace(/بيضاء/g,'');
  return /بيض/.test(cleaned);
}

const dairyWords = ['لبن','حليب','جبن','زبادي','كريمة','قشطة','زبدة','لبنة'];
const meatFishWords = ['لحم','لحمة','فراخ','دجاج','كباب','كفتة','فيليه','ريش','ورك','بط','أرانب','حبش','رومي المحشي','سمك','بلطي','بوري','جمبري','سبيط','كاليماري','سلطعون','استاكوزا','تونة','سالمون','ماكريل','سردين','كبدة','كلاوي','مصران','قوانص','بسطرمة','سجق','لانشون','مرتديلا'];

let dietBugs = [];
for (const f of comp) {
  const n = f.name_ar;
  const suit = f.suitable_for_diets||[];
  const unsuit = f.unsuitable_for_diets||[];
  const isVegan = suit.includes('vegan');
  const isVeg = suit.includes('vegetarian');
  const hasDairy = dairyWords.some(w=>n.includes(w));
  const hasMeatFish = meatFishWords.some(w=>n.includes(w));
  const hasEgg = hasEggWord(n);

  if (isVegan && (hasDairy || hasMeatFish || hasEgg)) {
    dietBugs.push({id:f.id, name:n, problem:'tagged VEGAN but name has '+(hasDairy?'dairy ':'')+(hasMeatFish?'meat/fish ':'')+(hasEgg?'egg':''), suit, unsuit, allergens:f.allergens, cholesterol: f.macros.cholesterol_mg, calcium: f.micros.calcium_mg});
  } else if (isVeg && hasMeatFish) {
    dietBugs.push({id:f.id, name:n, problem:'tagged VEGETARIAN but name has meat/fish', suit, unsuit, allergens:f.allergens, cholesterol: f.macros.cholesterol_mg});
  }
}
console.log('Diet-tag bugs (refined):', dietBugs.length);
dietBugs.forEach(x=>console.log(x.id,'|',x.name,'|',x.problem,'| chol:',x.cholesterol,'| allergens:',JSON.stringify(x.allergens)));
