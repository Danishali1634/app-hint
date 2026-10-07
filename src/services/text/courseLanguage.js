/**
 * @file Switches a course's step texts to the narrator's language: English,
 * Hinglish (Roman) or हिंदी (Hindi script) — when the language or the voice
 * changes in the editor (Narrator panel, header switch).
 *
 * WHAT: each step's text, its extra target texts and a custom title (not
 * "Step 3"), when written in another language. Steps with a recorded voice
 * keep their text (it is the caption of that recording).
 *
 * HOW, per text, from what it is written in now:
 *   → English   translated (translate.translateTexts)
 *   → Hinglish  English is translated; Hindi script is written in Roman (toHinglish)
 *   → हिंदी      English is translated; Hinglish is written in Hindi script, word by word
 *
 * EVERY VERSION IS KEPT (step.translations = { en, hi, deva }, keyed "text",
 * "label", "extra:0" …). Switching back restores the author's own words
 * instead of translating a translation — unless the text was edited since,
 * then it is converted afresh.
 */

import { isDefaultLabel } from '@/utils/course';
import { loadEnglishDictionary } from './englishDictionary';
import { textLanguageOf, toDevanagariAsync, toHinglish } from './hinglish';
import { translateTexts } from './translate';

/** Language id → its key in step.translations ('hi' = Hinglish, as saved before हिंदी existed). */
const SAVED_KEY = { en: 'en', hinglish: 'hi', hindi: 'deva' };

/** What a text is written in now. */
function formOf(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hindi';
  return textLanguageOf(text) === 'hi' ? 'hinglish' : 'en';
}

/** Converts texts that are all written in `from` into `to`. */
async function convert(texts, from, to) {
  if (to === 'en') return translateTexts(texts, 'en');
  if (to === 'hinglish')
    return from === 'hindi' ? texts.map(toHinglish) : translateTexts(texts, 'hi');
  if (from === 'en') return translateTexts(texts, 'hi-deva');
  const out = [];
  for (const t of texts)
    out.push((await toDevanagariAsync(t)).replace(/(^|[^\d])\.(?=\s|$)/g, '$1।'));
  return out;
}

/** [key, text] of every translatable text of a step. */
function fieldsOf(step) {
  const fields = [];
  if (step.text?.trim()) fields.push(['text', step.text]);
  if (!isDefaultLabel(step.label)) fields.push(['label', step.label]);
  (step.extraTexts || []).forEach((t, i) => t?.trim() && fields.push([`extra:${i}`, t]));
  return fields;
}

function withField(step, key, value) {
  if (key === 'text' || key === 'label') return { ...step, [key]: value };
  const i = Number(key.slice(6));
  const extraTexts = [...(step.extraTexts || [])];
  extraTexts[i] = value;
  return { ...step, extraTexts };
}

/**
 * @param {import('@/types').Step[]} steps
 * @param {'en' | 'hinglish' | 'hindi' | 'hi'} target  ('hi' = Hinglish)
 * @returns {Promise<{ patched: Map<string, import('@/types').Step>, translated: number, restored: number }>}
 *   patched: step id → the step in the new language (only steps that changed)
 */
export async function convertStepsLanguage(steps, target) {
  await loadEnglishDictionary();
  const to = target === 'hi' ? 'hinglish' : target;
  const toKey = SAVED_KEY[to];
  const jobs = []; // { stepIndex, key, original, from }
  const restores = []; // { stepIndex, key, original, from, value }
  steps.forEach((step, stepIndex) => {
    if (step.audioId) return;
    const saved = step.translations || {};
    for (const [key, original] of fieldsOf(step)) {
      const from = formOf(original);
      if (from === to) continue;
      const fromKey = SAVED_KEY[from];
      if (saved[fromKey]?.[key] === original && saved[toKey]?.[key] != null) {
        restores.push({ stepIndex, key, original, from, value: saved[toKey][key] });
      } else jobs.push({ stepIndex, key, original, from });
    }
  });

  // One conversion per source language (each is a different kind of change).
  const answers = new Map();
  for (const from of ['en', 'hinglish', 'hindi']) {
    const group = jobs.filter((j) => j.from === from);
    if (!group.length) continue;
    const converted = await convert(
      group.map((j) => j.original),
      from,
      to,
    );
    group.forEach((job, i) => answers.set(job, converted[i]));
  }
  const changes = [...restores, ...jobs.map((job) => ({ ...job, value: answers.get(job) }))];

  const patched = new Map();
  for (const { stepIndex, key, original, from, value } of changes) {
    const base = steps[stepIndex];
    let step = patched.get(base.id) ?? base;
    const saved = step.translations || {};
    const fromKey = SAVED_KEY[from];
    step = withField(step, key, value);
    step.translations = {
      ...saved,
      [fromKey]: { ...saved[fromKey], [key]: original },
      [toKey]: { ...saved[toKey], [key]: value },
    };
    patched.set(base.id, step);
  }
  return { patched, translated: jobs.length, restored: restores.length };
}
