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
