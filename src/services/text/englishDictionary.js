/**
 * @file English words → Devanagari as an Indian speaker says them, for Hindi
 * voices reading English words that hinglish.js's lists don't know.
 *
 * WHY: unknown Roman words used to go only to Google's Hindi transliteration,
 * which reads them as HINDI sounds: "barcode" → बरकड़े ("barkade"). A real
 * English word must be said the English way: बारकोड.
 *
 * HOW: the CMU Pronouncing Dictionary (~135k English words → phonemes; loaded
 * lazily, only when a Hindi voice speaks) and a phoneme → Devanagari map.
 *   - Only words of 4+ letters are trusted: the dictionary also holds names,
 *     and short ones collide with Hinglish ("tak", "jo", "lo", "de").
 *   - Compounds it lacks are split in two: "barcode" = bar + code, "pincode".
 *   - A misspelling close to exactly ONE English word is read as that word
 *     ("prablomatic" → problematic; closestEnglishWord).
 */

/** @type {Record<string, string> | null} word → "P R AA1 B L AH0 M" */
let dictionary = null;
let loading = null;

/** Loads the dictionary once (a separate ~1 MB gzipped chunk). Never rejects. */
export function loadEnglishDictionary() {
  if (!loading) {
    loading = import('cmu-pronouncing-dictionary')
      .then((module) => {
        dictionary = module.dictionary;
        byLength = null;
      })
      .catch(() => {
        loading = null; // retry next time
      });
  }
  return loading;
}

export const isDictionaryLoaded = () => dictionary !== null;

/** Shortest word trusted on its own (shorter ones collide with Hinglish). */
const MIN_TRUSTED = 4;
/** Words that look Hindi: never split into English parts or "corrected" to English. */
const HINDI_ENDING =
  /(iye|iyega|iyo|aiye|ein|ain|enge|engi|unga|ungi|oge|ogi|ega|egi|aana|ana|ane|na|ne|ni|kar|ke|wala|wali|wale)$/;

/**
 * Hinglish words the dictionary also lists (mostly as names or rare words):
 * "hone" is होने, not "hone". Found by checking common Hindi verb forms and
 * words against the dictionary.
 */
const HINDI_LOOKALIKES = new Set(
  `kara kari karen karun hone hote hoke hooge hoen hoye jana jane jani jake jaya jaye dena deen
  lena lene leta leen leya bola bole bolte bolen suni sunni lagana mila mile milo milne milke
  banda dale dali dalo dalke dalen hata chun uthe lage lago sake saki sako reha rahe pane pake
  paye pina pini pita soni soya bane banta banke banya pooch puche kahane kehne mang manga mange
  socha sochi jodi toda todo gire giren kama kamke kamen bula sikh jaan janna janke janie badal
  bach bacha bache laut lauten mana kahan kuch wala wale magar agar hain pura sara sari kise
  kiska baar mein haan`.split(/\s+/),
);

/** True if `word` (lowercase) is an English word the dictionary trusts. */
export function isEnglishWord(word) {
  return (
    !!dictionary && word.length >= MIN_TRUSTED && word in dictionary && !HINDI_LOOKALIKES.has(word)
  );
}

// ─── Phonemes → Devanagari ───────────────────────────────────────────────────

/** [letter at the start of a syllable, sign after a consonant] */
const VOWELS = {
  AA: ['आ', 'ा'],
  AE: ['ऐ', 'ै'],
  AH: ['अ', ''],
  AO: ['ऑ', 'ॉ'],
  AW: ['आउ', 'ाउ'],
  AY: ['आइ', 'ाइ'],
  EH: ['ए', 'े'],
  EY: ['ए', 'े'],
  IH: ['इ', 'ि'],
  IY: ['ई', 'ी'],
  OW: ['ओ', 'ो'],
  OY: ['ऑइ', 'ॉइ'],
  UH: ['उ', 'ु'],
  UW: ['ऊ', 'ू'],
};
const ROUNDED_A = ['ऑ', 'ॉ']; // AA spelled with "o": stop, box, option

const CONSONANTS = {
  B: 'ब',
  CH: 'च',
  D: 'ड',
  DH: 'द',
  F: 'फ़',
  G: 'ग',
  HH: 'ह',
  JH: 'ज',
  K: 'क',
  L: 'ल',
  M: 'म',
  N: 'न',
  P: 'प',
  R: 'र',
  S: 'स',
  SH: 'श',
  T: 'ट',
  TH: 'थ',
  V: 'व',
  W: 'व',
  Y: 'य',
  Z: 'ज़',
  ZH: 'ज़',
};
const HALANT = '्';
const ANUSVARA = 'ं';
/** n/m before these is written ं: "number" नंबर, "sense" सेंस. */
const NASAL_BEFORE = new Set([
  'K',
  'G',
  'CH',
  'JH',
  'T',
  'D',
  'TH',
  'DH',
  'P',
  'B',
  'S',
  'Z',
  'SH',
]);

/** Vowel letter groups of the spelling, to tell "o" (ऑ) from "a" (आ) for AA. */
function spelledVowels(word, count) {
  const groups = word.match(/[aeiou]+|y(?![aeiou])/g) || [];
  if (groups.length > count && /[^aeiou]e$/.test(word)) groups.pop(); // silent e
  return groups.length === count ? groups : null;
}

/** "P R AA1 B L AH0 M" → Devanagari. */
function phonemesToDevanagari(phones, word) {
  // ER = AH + R: "scanner" स्कैनर, "first" फ़र्स्ट. Stress digits kept aside.
  const parts = phones.split(' ').flatMap((phone) => {
    const base = phone.replace(/\d/g, '');
    const stress = phone.match(/\d/)?.[0] ?? null;
    return base === 'ER'
      ? [
          ['AH', stress],
          ['R', null],
        ]
      : [[base, stress]];
  });
  const list = parts.map(([p]) => p);
  const vowelCount = list.filter((p) => p in VOWELS).length;
  const spelled = spelledVowels(word, vowelCount);
  let out = '';
  let afterConsonant = false;
  let vowelIndex = 0;
  list.forEach((p, i) => {
    const next = list[i + 1];
    if (p in VOWELS) {
      let [letter, sign] = VOWELS[p];
      const group = spelled?.[vowelIndex];
      const unstressed = parts[i][1] === '0';
      if (p === 'AA' && group?.startsWith('o')) [letter, sign] = ROUNDED_A;
      // Unstressed "e" of the first syllable is "i" in Indian English:
      // select सिलेक्ट, receive रिसीव, remove रिमूव, event इवेंट.
      if (unstressed && group === 'e' && vowelIndex === 0 && vowelCount > 1) {
        [letter, sign] = ['इ', 'ि'];
      }
      // "-ed" / "-es" endings: selected सिलेक्टेड, added ऐडेड, boxes बॉक्सेज़.
      if (
        unstressed &&
        group === 'e' &&
        vowelIndex === vowelCount - 1 &&
        vowelCount > 1 &&
        i === list.length - 2 &&
        ['D', 'Z', 'S'].includes(next)
      ) {
        [letter, sign] = ['ए', 'े'];
      }
      vowelIndex += 1;
      // A final schwa is long: "data" डेटा, "camera" कैमरा.
      if (p === 'AH' && next === undefined) [letter, sign] = ['आ', 'ा'];
      // i + vowel glides through य: "media" मीडिया.
      const prev = list[i - 1];
      if ((prev === 'IY' || prev === 'IH') && !afterConsonant) {
        if (out.endsWith('ी')) out = out.slice(0, -1) + 'ि';
        out += 'य' + sign;
        afterConsonant = false;
        return;
      }
      out += afterConsonant ? sign : letter;
      afterConsonant = false;
      return;
    }
    if (p === 'NG') {
      out += ANUSVARA;
      if (next !== 'K' && next !== 'G') {
        out += 'ग'; // "thing" थिंग
        afterConsonant = true;
      } else afterConsonant = false;
      return;
    }
    const letter = CONSONANTS[p];
    if (!letter) return;
    if ((p === 'N' || p === 'M') && !afterConsonant && out && NASAL_BEFORE.has(next)) {
      out += ANUSVARA;
      return;
    }
    if (afterConsonant) out += HALANT;
    out += letter;
    afterConsonant = true;
  });
  return out;
}

const spoken = new Map(); // word → Devanagari | null (memo)

/**
 * Devanagari for an English word: a trusted dictionary word or a compound of
 * two dictionary words ("barcode"). null if it isn't English.
 * @param {string} word lowercase a–z
 */
export function englishToDevanagari(word) {
  if (!dictionary) return null;
  if (spoken.has(word)) return spoken.get(word);
  let result = null;
  if (isEnglishWord(word)) result = phonemesToDevanagari(dictionary[word], word);
  else if (word.length >= 6 && !HINDI_ENDING.test(word)) {
    // Compound: the split whose shorter part is longest ("bar|code").
    let best = null;
    for (let i = 3; i <= word.length - 3; i++) {
      const left = word.slice(0, i);
      const right = word.slice(i);
      if (!(left in dictionary) || !(right in dictionary)) continue;
      const score = Math.min(left.length, right.length);
      if (!best || score > best.score) best = { left, right, score };
    }
    if (best) {
      result =
        phonemesToDevanagari(dictionary[best.left], best.left) +
        phonemesToDevanagari(dictionary[best.right], best.right);
    }
  }
  spoken.set(word, result);
  return result;
}

// ─── Spelling ────────────────────────────────────────────────────────────────

/** Dictionary words by length (built on first spelling check). */
let byLength = null;

function wordsOfLength(n) {
  if (!byLength) {
    byLength = new Map();
    for (const w of Object.keys(dictionary)) {
      if (!/^[a-z]+$/.test(w)) continue;
      if (!byLength.has(w.length)) byLength.set(w.length, []);
      byLength.get(w.length).push(w);
    }
  }
  return byLength.get(n) || [];
}

/** Edit distance with swaps ("teh" → "the" = 1), or max+1 once it exceeds max. */
function distance(a, b, max) {
  const rows = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

const corrections = new Map(); // memo

/**
 * The English word a misspelling most likely meant, or null when the word is
 * fine, looks Hindi, or is close to several words (never guesses).
 * "prablomatic" → "problematic".
 * @param {string} word lowercase a–z
 */
export function closestEnglishWord(word) {
  if (!dictionary || word.length < 5 || word in dictionary || HINDI_ENDING.test(word)) return null;
  if (corrections.has(word)) return corrections.get(word);
  const max = word.length >= 8 ? 2 : 1;
  let best = max + 1;
  let found = [];
  for (let n = word.length - max; n <= word.length + max; n++) {
    for (const candidate of wordsOfLength(n)) {
      if (candidate.length < 5) continue;
      const d = distance(word, candidate, Math.min(best, max));
      if (d < best) {
        best = d;
        found = [candidate];
      } else if (d === best) found.push(candidate);
    }
  }
  // Several equally close: keep only those sharing the first and last letter.
  if (found.length > 1) found = found.filter((c) => c[0] === word[0] && c.at(-1) === word.at(-1));
  const result = best <= max && found.length === 1 ? found[0] : null;
  corrections.set(word, result);
  return result;
}
