import { getAllFoods } from '../../core/food-library/food-library.js';

const foods = getAllFoods();
const comp = foods.filter(f => f.category === 'composite_meal');

// Tokenize word-by-word and strip common Arabic prefixes, then exact-match against curated roots.
// This avoids substring false positives like "بالحمص" containing "لحم", "بطاطس" containing "بط", "قبطي" containing "بط".
function tokenize(name) {
  return name.split(/[\s\-\(\)\/,]+/).filter(Boolean);
}
function stripPrefixes(tok) {
  // iteratively strip leading connective prefixes: و ف ب ل ال (and combos like بال، وال، فال، للـ)
  let t = tok;
  const prefixes = ['بال','وال','فال','كال','لل','بـ','وا','فا','با','ولل','و','ف','ب','ل','ا'];
  let changed = true;
  let guard = 0;
  while (changed && guard < 3) {
    changed = false; guard++;
    for (const p of ['بال','وال','فال','كال','لل']) {
      if (t.startsWith(p) && t.length > p.length + 1) { t = t.slice(p.length); changed = true; break; }
    }
  }
  // strip single-char connectives و ف ب ل ا (once)
  for (const p of ['و','ف','ب','ل']) {
    if (t.startsWith(p) && t.length > 2) { t = t.slice(1); break; }
  }
  return t;
}

const dairyRoots = new Set(['لبن','لبنة','حليب','جبن','جبنة','زبادي','كريمة','قشطة','زبدة']);
const meatFishRoots = new Set(['لحم','لحمة','فراخ','دجاج','كباب','كفتة','فيليه','ريش','ورك','بط','أرانب','حبش','سمك','بلطي','بوري','جمبري','سبيط','كاليماري','سلطعون','استاكوزا','تونة','سالمون','ماكريل','سردين','كبدة','كلاوي','مصران','قوانص','بسطرمة','سجق','لانشون','مرتديلا']);
const eggRoots = new Set(['بيض','بيضة']);

function classify(name) {
  const toks = tokenize(name);
  let dairy=false, meatfish=false, egg=false;
  for (const raw of toks) {
    const stripped = stripPrefixes(raw);
    for (const cand of [raw, stripped]) {
      if (dairyRoots.has(cand)) dairy = true;
      if (meatFishRoots.has(cand)) meatfish = true;
      if (eggRoots.has(cand)) egg = true;
    }
  }
  return {dairy, meatfish, egg};
}

let bugs = [];
for (const f of comp) {
  const {dairy, meatfish, egg} = classify(f.name_ar);
  const suit = f.suitable_for_diets||[];
  const isVegan = suit.includes('vegan');
  const isVeg = suit.includes('vegetarian');
  if (isVegan && (dairy||meatfish||egg)) {
    bugs.push({id:f.id,name:f.name_ar,tag:'vegan',reason:[dairy&&'dairy',meatfish&&'meat/fish',egg&&'egg'].filter(Boolean).join('+'),allergens:f.allergens});
  } else if (isVeg && meatfish) {
    bugs.push({id:f.id,name:f.name_ar,tag:'vegetarian',reason:'meat/fish',allergens:f.allergens});
  }
}
console.log('Confirmed candidates:', bugs.length);
bugs.forEach(b=>console.log(b.id,'|',b.name,'| tagged',b.tag,'but has',b.reason,'| allergens:',JSON.stringify(b.allergens)));
