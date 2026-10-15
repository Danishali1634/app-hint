/**
 * @file "Fix spelling" for step text — the Fix spelling buttons and auto-fix
 * while typing (DescriptionField).
 *
 * Captions show what was typed, so mistakes are fixed IN THE TEXT (the voice
 * already reads them right; see hinglish.js):
 *   1. Chat spellings → the full word:  "kre" → kare, "nhi" → nahi, "h" → hai,
 *      "k" → ke (HINGLISH_SPELLINGS; "h"/"k" only in a Hindi sentence).
 *   2. Loosely typed Hinglish → the Hindi word it sounds like: "dikai" →
 *      dikhai, "hmri" → hamari (hinglish.closestHindiWord, offline).
 *   3. Google's Hindi typing service, for words still unknown: its reading is
 *      written back in Hinglish and used only if that is a known Hindi word
 *      ("kese" → कैसे → kaise; hinglish.onlineHindiWord). Off when Settings
 *      turned online lookups off; offline it is simply skipped.
 *   4. English misspellings → the one English word they are close to:
 *      "prablomatic" → problematic (englishDictionary.closestEnglishWord).
 *      Hindi-looking words and words close to several English words are left alone.
 *   5. Google's English spell checker (googleSpellCheck — the "Did you mean"
 *      of Google Translate), run by auto-fix when the typing pauses: "pleas
 *      clik the buton" → please click the button. Only English sentences and
 *      only safe one-word swaps (see there). Off when Settings turned online
 *      lookups off; offline it simply finds nothing.
 * Capitals are kept ("Kre" → "Kare"). Undo is the caller's job.
 */

import { isDefaultLabel } from '@/utils/course';
import { getVoiceSettings } from '@/services/storage/settings';
import {
  HINGLISH_SPELLINGS,
  closestHindiWord,
  isKnownWord,
  lookUpUnknownWords,
  onlineHindiWord,
  textLanguageOf,
} from './hinglish';
import { closestEnglishWord, isEnglishWord, loadEnglishDictionary } from './englishDictionary';

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;

const keepCase = (original, word) =>
  original === original.toUpperCase() && original.length > 1
    ? word.toUpperCase()
    : original[0] === original[0].toUpperCase()
      ? word[0].toUpperCase() + word.slice(1)
      : word;

/** The fix for one word, or null (dictionary and lookups must be ready). */
function fixOf(original, hinglish) {
  if (original.includes("'") || original.includes('’')) return null;
  // Acronyms (SKU, GST) stay.
  if (original.length > 1 && original === original.toUpperCase()) return null;
  const key = original.toLowerCase();
  let to = HINGLISH_SPELLINGS[key];
  if ((key === 'h' || key === 'k') && (!hinglish || original === original.toUpperCase())) {
    to = undefined;
  }
  if (!to && !isKnownWord(key) && !isEnglishWord(key)) {
    to = closestHindiWord(key) ?? onlineHindiWord(key);
    // English typos in a Hindi sentence only when long: a short unknown word
    // there is more likely Hindi ("godaam" is not "goddam").
    if (!to && (!hinglish || key.length >= 7)) to = closestEnglishWord(key);
  }
  return to && to !== key ? keepCase(original, to) : null;
}

async function prepare(text) {
  await loadEnglishDictionary();
  if (getVoiceSettings().hinglishLookup) await lookUpUnknownWords(text);
}

/**
 * @param {string} text
 * @returns {Promise<{ text: string, changes: { from: string, to: string }[] }>}
 */
export async function fixSpelling(text) {
  await prepare(text);
  const changes = [];
  const fixed = text
    .split(/(?<=[.!?।\n])/)
    .map((sentence) => {
      const hinglish = textLanguageOf(sentence) === 'hi';
      return sentence.replace(WORD, (original) => {
        const replacement = fixOf(original, hinglish);
        if (!replacement) return original;
        changes.push({ from: original, to: replacement });
        return replacement;
      });
    })
    .join('');
  return { text: fixed, changes };
}

/**
 * Auto-fix while typing: the fix for the word just finished, or null.
 * @param {string} word  the word as typed
 * @param {string} sentence  the sentence it is in (decides "h" → hai etc.)
 * @returns {Promise<string | null>}
 */
export async function fixTypedWord(word, sentence) {
  if (!/^[A-Za-z]+$/.test(word)) return null;
  await prepare(word);
  return fixOf(word, textLanguageOf(sentence) === 'hi');
}

// ─── Google's spell checker ──────────────────────────────────────────────────

const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single';
const GOOGLE_TIMEOUT_MS = 5000;
/** Longer texts are not sent (the text travels in the URL). */
const GOOGLE_MAX_CHARS = 1500;
/** Sentences end after these; the same split as fixSpelling. */
const SENTENCE_END = /(?<=[.!?।\n])/;
/** Words with digits are matched whole so "v2" or "abc123" can be skipped, not cut. */
const TOKEN = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
/** text → result; Google is asked once per text. */
const spellCheckCache = new Map();

/**
 * Google's corrected version of the text, or null if it found nothing (or
 * could not be reached). With dt=qca the reply's [7] is
 * ["<b><i>please</i></b> …", "please click the button", [1], null, null, true]
 * when Google thinks the text is misspelled, and [] when it is fine.
 */
async function googleCorrection(text) {
  const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'hi', q: text });
  params.append('dt', 't');
  params.append('dt', 'qca');
  const response = await fetch(`${GOOGLE_URL}?${params}`, {
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google spell check: ${response.status}`);
  const data = await response.json();
  const corrected = Array.isArray(data?.[7]) ? data[7][1] : null;
  return typeof corrected === 'string' && corrected.trim() ? corrected : null;
}

/** Letters to add, drop or change to turn `a` into `b` (Levenshtein). */
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Lines Google's corrected text up with the typed text word by word and keeps
 * only the swaps that cannot hurt. Exported for tests.
 *   - English sentences only: Google's English checker turns Hinglish into
 *     English words ("karo" → "car"), so 'hi' sentences are never touched.
 *   - A sentence whose word count changed (Google split or joined words) is
 *     skipped: we cannot tell which word became which.
 *   - Words the user wrote on purpose stay: acronyms and Capitalised names
 *     mid-sentence (OTP, Save, GSTIN), words with digits, and words that are
 *     in our own word lists (Google sometimes "corrects" valid words in
 *     context); a word only the big dictionary knows may change by 1–2 letters.
 * @param {string} text  what was typed
 * @param {string} corrected  Google's version of it
 * @returns {{ from: string, to: string, start: number }[]}
 */
export function alignCorrection(text, corrected) {
  const sentences = text.split(SENTENCE_END);
  const fixedSentences = corrected.split(SENTENCE_END);
  // Different sentence breaks: nothing lines up safely.
  if (sentences.length !== fixedSentences.length) return [];
  const changes = [];
  let offset = 0;
  sentences.forEach((sentence, i) => {
    const sentenceStart = offset;
    offset += sentence.length;
    if (textLanguageOf(sentence) !== 'en') return;
    const words = [...sentence.matchAll(TOKEN)];
    const fixedWords = fixedSentences[i].match(TOKEN) || [];
    if (words.length !== fixedWords.length) return;
    words.forEach((match, w) => {
      const original = match[0];
      const fixed = fixedWords[w];
      if (original.toLowerCase() === fixed.toLowerCase()) return;
      if (/\d/.test(original) || /\d/.test(fixed)) return;
      // Capitals: only the usual capital of a sentence's first word is allowed.
      const rest = w === 0 ? original.slice(1) : original;
      if (/[A-Z]/.test(rest)) return;
      const key = original.toLowerCase();
      // Our own word lists always win. The big pronouncing dictionary also holds
      // names and rare forms ("chek", "feild", "pleas"), so there Google's
      // reading wins when it is only a letter or two away (a typo, not a rewrite).
      if (isKnownWord(key)) return;
      if (isEnglishWord(key) && editDistance(key, fixed.toLowerCase()) > 2) return;
      changes.push({
        from: original,
        to: keepCase(original, fixed.toLowerCase()),
        start: sentenceStart + match.index,
      });
    });
  });
  return changes;
}

/**
 * Google Translate's "Did you mean" spelling correction for English text,
 * reduced to safe one-word fixes (alignCorrection). Never throws: offline,
 * slow (5 s), blocked or switched off in Settings → no changes.
 * @param {string} text
 * @returns {Promise<{ text: string, changes: { from: string, to: string, start: number }[] }>}
 *   text: the input with the changes applied; start: the index of `from` in the input
 */
export async function googleSpellCheck(text) {
  const none = { text, changes: [] };
  if (!text?.trim() || text.length > GOOGLE_MAX_CHARS) return none;
  if (!getVoiceSettings().hinglishLookup) return none;
  // Nothing English to check: don't ask.
  if (!text.split(SENTENCE_END).some((s) => textLanguageOf(s) === 'en')) return none;
  if (spellCheckCache.has(text)) return spellCheckCache.get(text);
  try {
    await loadEnglishDictionary();
    const corrected = await googleCorrection(text);
    const changes = corrected ? alignCorrection(text, corrected) : [];
    let fixed = text;
    // From the end, so earlier starts stay valid.
    for (const c of [...changes].reverse()) {
      fixed = fixed.slice(0, c.start) + c.to + fixed.slice(c.start + c.from.length);
    }
    const result = { text: fixed, changes };
    // Every typing pause is a new text: keep only the recent ones.
    if (spellCheckCache.size >= 200) spellCheckCache.delete(spellCheckCache.keys().next().value);
    spellCheckCache.set(text, result);
    return result;
  } catch {
    return none; // not cached: try again next time
  }
}

/**
 * fixSpelling for a whole course: every step's text, extra target texts and
 * custom title ("Step 3" titles are left alone), sub-steps included.
 * @param {import('@/types').Step[]} steps
 * @returns {Promise<{ patched: Map<string, import('@/types').Step>, changes: { from: string, to: string }[] }>}
 *   patched: step id → the fixed step (only steps that changed)
 */
export async function fixStepsSpelling(steps) {
  const patched = new Map();
  const changes = [];
  for (const step of steps) {
    let next = step;
    const fix = async (value) => {
      if (!value?.trim()) return value;
      const result = await fixSpelling(value);
      changes.push(...result.changes);
      return result.text;
    };
    const text = await fix(step.text);
    if (text !== step.text) next = { ...next, text };
    if (!isDefaultLabel(step.label)) {
      const label = await fix(step.label);
      if (label !== step.label) next = { ...next, label };
    }
    if (step.extraTexts?.length) {
      const extraTexts = [];
      for (const t of step.extraTexts) extraTexts.push(await fix(t));
      if (extraTexts.some((t, i) => t !== step.extraTexts[i])) next = { ...next, extraTexts };
    }
    if (next !== step) patched.set(step.id, next);
  }
  return { patched, changes };
}
