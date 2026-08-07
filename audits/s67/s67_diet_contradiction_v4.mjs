import { getAllFoods } from '../../core/food-library/food-library.js';

const foods = getAllFoods();
const comp = foods.filter(f => f.category === 'composite_meal');

function tokenize(name) { return name.split(/[\s\-\(\)\/,]+/).filter(Boolean); }
function stripPrefixes(tok) {
  let t = tok;
  for (const p of ['بال','وال','فال','كال','لل']) {
    if (t.startsWith(p) && t.length > p.length + 1) { t = t.slice(p.length); break; }
  }
  for (const p of ['و','ف','ب','ل']) {
    if (t.startsWith(p) && t.length > 2) { t = t.slice(1); break; }
  }
  return t;
}
const dairyRoots = new Set(['لبن','لبنة','حليب','جبن','جبنة','زبادي','كريمة','قشطة','زبدة']);
const meatFishRoots = new Set(['لحم','لحمة','فراخ','دجاج','كباب','كفتة','فيليه','ريش','ورك','بط','أرانب','حبش','سمك','بلطي','بوري','جمبري','سبيط','كاليماير','كاليماري','سلطعون','استاكوزا','تونة','سالمون','ماكريل','سردين','كبدة','كلاوي','مصران','قوانص','بسطرمة','سجق','لانشون','مرتديلا']);

function classify(name) {
  const toks = tokenize(name);
  let dairy=false, meatfish=false;
  for (const raw of toks) {
    const stripped = stripPrefixes(raw);
    for (const cand of [raw, stripped]) {
      if (dairyRoots.has(cand)) dairy = true;
      if (meatFishRoots.has(cand)) meatfish = true;
    }
  }
  return {dairy, meatfish};
}

// plant-milk qualifiers: if dairy word appears but immediately followed by a plant qualifier, treat as plant-based
const plantQualifiers = ['لوز','اللوز','جوز الهند','صويا','الصويا','شوفان','الشوفان'];
function isPlantMilkContext(name) {
  return plantQualifiers.some(q => name.includes('حليب '+q) || name.includes('لبن '+q) || name.includes('بحليب '+q) || name.includes('بلبن '+q));
}

let bugsA = []; // genuine dairy/meat mistakenly vegan
let bugsB = []; // plant-milk correctly vegan but check cholesterol contamination

for (const f of comp) {
  const {dairy, meatfish} = classify(f.name_ar);
  const suit = f.suitable_for_diets||[];
  if (!suit.includes('vegan')) continue;
  if (meatfish) {
    bugsA.push(f);
    continue;
  }
  if (dairy) {
    if (isPlantMilkContext(f.name_ar)) {
      bugsB.push(f);
    } else {
      bugsA.push(f);
    }
  }
}

console.log('=== BUCKET A: genuine dairy/meat wrongly tagged vegan:', bugsA.length, '===');
bugsA.forEach(f=>console.log(f.id,'|',f.name_ar,'| chol:',f.macros.cholesterol_mg,'| allergens:',JSON.stringify(f.allergens)));

console.log('\n=== BUCKET B: plant-milk (correctly vegan) - check cholesterol template contamination:', bugsB.length, '===');
bugsB.forEach(f=>console.log(f.id,'|',f.name_ar,'| chol:',f.macros.cholesterol_mg,'| sat_fat:',f.macros.saturated_fat_g,'| allergens:',JSON.stringify(f.allergens)));
