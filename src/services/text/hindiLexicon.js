/**
 * @file Hindi word forms in Roman script, and matching of misspelt Hinglish.
 *
 * WHY: people type Hinglish quickly and loosely — "dikai" for dikhai, "hmri"
 * for hamari. Read letter by letter, those come out as nonsense (दिकाई, ह्म्री).
 *
 * WORD FORMS (buildLexicon): common verb stems × their endings, generated
 * with the right Devanagari ("dikh" + "ai" → dikhai दिखाई, "bata" + "iye" →
 * bataiye बताइए), plus everyday words — a few thousand forms in all.
 *
 * MATCHING (closestHindi): a word is compared by how it SOUNDS in Hinglish
 * typing, ignoring what people skip or vary:
 *   - the "h" of kh/gh/ch/jh/th/dh/ph/bh ("dikai" = dikhai), and any other
 *     "h" after the first letter ("chaiye" = chahiye)
 *   - vowels inside the word ("hmri" = hamari), doubled letters, ee/i, oo/u, w/v
 * A misspelling is read as a word only when both have the same consonants
 * and are a short edit apart, and no other word is as close.
 */

/** [roman, Devanagari] verb stems. */
const STEMS = [
  ['kar', 'कर'],
  ['dekh', 'देख'],
  ['dikh', 'दिख'],
  ['dikha', 'दिखा'],
  ['bata', 'बता'],
  ['samajh', 'समझ'],
  ['samjha', 'समझा'],
  ['chal', 'चल'],
  ['chala', 'चला'],
  ['khol', 'खोल'],
  ['khul', 'खुल'],
  ['bhej', 'भेज'],
  ['daal', 'डाल'],
  ['dal', 'डाल'],
  ['rakh', 'रख'],
  ['likh', 'लिख'],
  ['padh', 'पढ़'],
  ['sun', 'सुन'],
  ['bol', 'बोल'],
  ['ja', 'जा'],
  ['aa', 'आ'],
  ['de', 'दे'],
  ['le', 'ले'],
  ['mil', 'मिल'],
  ['laga', 'लगा'],
  ['lag', 'लग'],
  ['chun', 'चुन'],
  ['bhar', 'भर'],
  ['daba', 'दबा'],
  ['ruk', 'रुक'],
  ['ban', 'बन'],
  ['bana', 'बना'],
  ['hata', 'हटा'],
  ['nikal', 'निकाल'],
  ['nikaal', 'निकाल'],
  ['jod', 'जोड़'],
  ['chhod', 'छोड़'],
  ['ghuma', 'घुमा'],
  ['badal', 'बदल'],
  ['bach', 'बच'],
  ['bacha', 'बचा'],
  ['sudhar', 'सुधार'],
  ['mita', 'मिटा'],
  ['kaat', 'काट'],
  ['dhoondh', 'ढूंढ'],
  ['dhundh', 'ढूंढ'],
  ['ho', 'हो'],
  ['rah', 'रह'],
  ['reh', 'रह'],
  ['sak', 'सक'],
  ['chah', 'चाह'],
  ['pooch', 'पूछ'],
  ['puch', 'पूछ'],
  ['soch', 'सोच'],
  ['jaan', 'जान'],
  ['seekh', 'सीख'],
  ['sikha', 'सिखा'],
  ['utha', 'उठा'],
  ['rok', 'रोक'],
  ['gin', 'गिन'],
  ['bhool', 'भूल'],
  ['bula', 'बुला'],
  ['jama', 'जमा'],
  ['chuk', 'चुक'],
  ['pahunch', 'पहुंच'],
  ['lauta', 'लौटा'],
  ['bigad', 'बिगड़'],
  ['kheench', 'खींच'],
  ['dabaa', 'दबा'],
  ['chhap', 'छप'],
  ['chhaap', 'छाप'],
  ['tay', 'तय'],
];

/** [roman, after a consonant, after a vowel] — null: doesn't follow that kind of stem. */
const ENDINGS = [
  ['', '', ''],
  ['o', 'ो', 'ओ'],
  ['na', 'ना', 'ना'],
  ['ne', 'ने', 'ने'],
  ['ni', 'नी', 'नी'],
  ['ta', 'ता', 'ता'],
  ['te', 'ते', 'ते'],
  ['ti', 'ती', 'ती'],
  ['ke', 'के', 'के'],
  ['kar', 'कर', 'कर'],
  ['e', 'े', 'ए'],
  ['ein', 'ें', 'एं'],
  ['en', 'ें', 'एं'],
  ['iye', 'िए', 'इए'],
  ['ie', 'िए', 'इए'],
  ['ega', 'ेगा', 'एगा'],
  ['egi', 'ेगी', 'एगी'],
  ['enge', 'ेंगे', 'एंगे'],
  ['oge', 'ोगे', 'ओगे'],
  ['unga', 'ूंगा', 'ऊंगा'],
  ['ungi', 'ूंगी', 'ऊंगी'],
  ['a', 'ा', null],
  ['i', 'ी', 'ई'],
  ['ya', null, 'या'],
  ['yi', null, 'ई'],
  ['ye', null, 'ए'],
  ['iyega', 'िएगा', 'इएगा'],
  // Causatives (dikhai, dikhao) come from their own stems (dikha), not endings.
];

/** Everyday words the stems don't cover (they count as Hindi words, like hinglish.HINDI_WORDS). */
export const EVERYDAY_WORDS = {
  hamari: 'हमारी',
  hamare: 'हमारे',
  humara: 'हमारा',
  humari: 'हमारी',
  humare: 'हमारे',
  tumhari: 'तुम्हारी',
  tumhare: 'तुम्हारे',
  inka: 'इनका',
  inki: 'इनकी',
  inke: 'इनके',
  jinka: 'जिनका',
  jiska: 'जिसका',
  jiski: 'जिसकी',
  jiske: 'जिसके',
  kiska: 'किसका',
  kiski: 'किसकी',
  kisi: 'किसी',
  kise: 'किसे',
  sabse: 'सबसे',
  zyada: 'ज़्यादा',
  jyada: 'ज़्यादा',
  thoda: 'थोड़ा',
  thodi: 'थोड़ी',
  thode: 'थोड़े',
  dobara: 'दोबारा',
  dubara: 'दुबारा',
  bilkul: 'बिल्कुल',
  hamesha: 'हमेशा',
  kabhi: 'कभी',
  tabhi: 'तभी',
  jabhi: 'जभी',
  yahin: 'यहीं',
  wahin: 'वहीं',
  sahi: 'सही',
  galti: 'गलती',
  zaroorat: 'ज़रूरत',
  jaroorat: 'ज़रूरत',
  zaruri: 'ज़रूरी',
  jaruri: 'ज़रूरी',
  tarah: 'तरह',
  taraf: 'तरफ़',
  jagah: 'जगह',
  cheez: 'चीज़',
  cheezein: 'चीज़ें',
  khali: 'खाली',
  poora: 'पूरा',
  puri: 'पूरी',
  pure: 'पूरे',
  alag: 'अलग',
  ekdum: 'एकदम',
  aasan: 'आसान',
  asaan: 'आसान',
  mushkil: 'मुश्किल',
  dhyan: 'ध्यान',
  dhyaan: 'ध्यान',
  madad: 'मदद',
  jaankari: 'जानकारी',
  sujhav: 'सुझाव',
  vikalp: 'विकल्प',
  suchi: 'सूची',
  hisaab: 'हिसाब',
  hisab: 'हिसाब',
  ginti: 'गिनती',
  kul: 'कुल',
  bacha: 'बचा',
  baki: 'बाकी',
  baaki: 'बाकी',
  neeche: 'नीचे',
  upar: 'ऊपर',
  andar: 'अंदर',
  bahar: 'बाहर',
  saamne: 'सामने',
  samne: 'सामने',
  beech: 'बीच',
  baad: 'बाद',
  pehle: 'पहले',
  turant: 'तुरंत',
  fauran: 'फ़ौरन',
  dhire: 'धीरे',
  dheere: 'धीरे',
  jaldi: 'जल्दी',
  abhi: 'अभी',
  hamein: 'हमें',
  aapko: 'आपको',
  unko: 'उनको',
  inko: 'इनको',
  jisse: 'जिससे',
  isse: 'इससे',
  usse: 'उससे',
  taaki: 'ताकि',
  taki: 'ताकि',
  kyunki: 'क्योंकि',
  isliye: 'इसलिए',
  varna: 'वरना',
  warna: 'वरना',
  // de / le / ho join their endings differently ("dega", not "deega")
  dega: 'देगा',
  degi: 'देगी',
  denge: 'देंगे',
  dein: 'दें',
  di: 'दी',
  dijiye: 'दीजिए',
  lega: 'लेगा',
  legi: 'लेगी',
  lenge: 'लेंगे',
  lein: 'लें',
  lijiye: 'लीजिए',
  li: 'ली',
  hoga: 'होगा',
  hogi: 'होगी',
  honge: 'होंगे',
  hoon: 'हूं',
  hua: 'हुआ',
  hui: 'हुई',
  hue: 'हुए',
};

/**
 * Roman → Devanagari for every generated form and word (first spelling wins).
 * @returns {Map<string, string>}
 */
export function buildLexicon() {
  const lexicon = new Map(Object.entries(EVERYDAY_WORDS));
  for (const [stem, dev] of STEMS) {
    const endsInVowel = /[aeiou]$/.test(stem);
    for (const [roman, afterConsonant, afterVowel] of ENDINGS) {
      const sign = endsInVowel ? afterVowel : afterConsonant;
      if (sign == null) continue;
      // de/le/ho + a vowel ending are irregular (EVERYDAY_WORDS has them): only "dena", "dekar" …
      if (/[eo]$/.test(stem) && /^[aeiouy]/.test(roman)) continue;
      const word = stem + roman;
      if (word.length >= 3 && !lexicon.has(word)) lexicon.set(word, dev + sign);
    }
  }
  return lexicon;
}

// ─── Sound-alike matching ────────────────────────────────────────────────────

/** How a Hinglish spelling sounds, with the usual variations removed. */
export function soundOf(word) {
  return word
    .toLowerCase()
    .replace(/chh/g, 'c')
    .replace(/sh/g, 's')
    .replace(/([kgcjtdpb])h/g, '$1')
    .replace(/ph|f/g, 'p')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(?!^)h/g, '') // a silent "h" anywhere else: "chaiye" = chahiye
    .replace(/(.)\1+/g, '$1');
}

/** Consonants only (a leading vowel is kept as one mark): "hamari" → "hmr". */
const skeletonOf = (sound) => (/^[aeiou]/.test(sound) ? '_' : '') + sound.replace(/[aeiou]/g, '');

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

/**
 * Index of known Hindi words by skeleton, for closestHindi.
 * @param {Iterable<[string, string]>} entries  [Roman word, Devanagari]
 */
export function indexBySound(entries) {
  const index = new Map();
  for (const [word, dev] of entries) {
    const sound = soundOf(word);
    const key = skeletonOf(sound);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ word, sound, dev });
  }
  return index;
}

/**
 * The known Hindi word a misspelling most likely means, or null.
 * "dikai" → dikhai, "hmri" → hamari.
 * @param {string} word lowercase
 * @param {Map<string, { word: string, sound: string }[]>} index from indexBySound
 */
export function closestHindi(word, index) {
  // Short words are too easy to mistake ("but" is not "baat").
  if (word.length < 4) return null;
  const sound = soundOf(word);
  const skeleton = skeletonOf(sound);
  const candidates = index.get(skeleton);
  if (!candidates || skeleton.replace('_', '').length < 2) return null;
  // Same consonants: only vowels differ, which loose typing drops or changes.
  const max = sound.length >= 7 ? 3 : 2;
  let best = max + 1;
  let found = [];
  for (const c of candidates) {
    const d = c.sound === sound ? 0 : distance(sound, c.sound);
    if (d < best) {
      best = d;
      found = [c];
    } else if (d === best) found.push(c);
  }
  if (best > max) return null;
  // Several equally close spellings of ONE word (hamari / humari → हमारी) are fine.
  return new Set(found.map((c) => c.dev)).size === 1 ? found[0].word : null;
}
