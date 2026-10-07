/**
 * @file Translates step text when the narrator's language changes
 * (English voice ⇄ Hindi voice), so captions and speech match the voice.
 *
 *   textLanguage(text)                → 'en' | 'hi'   (Hinglish and Hindi script count as 'hi')
 *   translateTexts(texts, 'en' | 'hi' | 'hi-deva') → same order; 'hi' answers are
 *     Roman Hinglish, 'hi-deva' answers are Hindi script
 *
 * TWO ENGINES
 *   With an Anthropic key (Settings): Claude — natural Hinglish ("Save pe click
 *     karein"), button and field names kept exactly as written.
 *   Without: Google's free web translator (translate.googleapis.com, keyless and
 *     unofficial, so it may change). Hinglish is first converted to Hindi script
 *     (hinglish.toDevanagariAsync), which Google understands far better; Hindi
 *     answers come back in Hindi script and are written as Roman Hinglish
 *     (hinglish.toHinglish). Its Hindi is more formal ("चयन करें").
 * PRIVACY: the step texts are sent to the chosen service (whole sentences,
 * unlike the one-word Hinglish lookups).
 */

import { getAiKey, getVoiceSettings } from '@/services/storage/settings';
import { loadEnglishDictionary } from './englishDictionary';
import { fixSpelling } from './fixText';
import { textLanguageOf, toDevanagariAsync, toHinglish } from './hinglish';

const MODEL = 'claude-opus-5-5';
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single';
const GOOGLE_TIMEOUT_MS = 8000;

/**
 * The language a step text is written in. Needs the English dictionary for
 * the best answer, so it is loaded first.
 * @param {string} text
 * @returns {Promise<'en' | 'hi'>}
 */
export async function textLanguage(text) {
  await loadEnglishDictionary();
  return textLanguageOf(text);
}

/**
 * @param {string[]} texts
 * @param {'en' | 'hi' | 'hi-deva'} to
 * @returns {Promise<string[]>}
 * @throws {Error} with a user-readable message
 */
export async function translateTexts(texts, to) {
  if (!texts.length) return [];
  const apiKey = getAiKey();
  return apiKey ? translateWithClaude(texts, to, apiKey) : translateWithGoogle(texts, to);
}

// ─── Claude ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You translate the steps of a software walkthrough. Each text is shown as a caption and read aloud by a voice.

- "en": write natural, simple English.
- "hi": write Hinglish the way people in India type it: Hindi in Roman (Latin) letters, with common English words kept in English ("Save button pe click karein"). Never use Hindi (Devanagari) script.
- "hi-deva": write simple, everyday spoken Hindi in Devanagari script; common English words people use as they are (क्लिक, बटन, रिपोर्ट) stay, written in Devanagari.
- Keep every button, menu, field and product name exactly as written, including capitals.
- Keep the meaning and the length; don't add or drop information.
- Return exactly one translation per input text, in the same order.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
  additionalProperties: false,
};

async function translateWithClaude(texts, to, apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // A plain translation: keep thinking light for speed.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      // If the request is declined, retry on a fallback model automatically.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Translate into "${to}":\n${JSON.stringify(texts)}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal')
      throw new Error('The AI could not translate these steps.');
    if (response.stop_reason === 'max_tokens')
      throw new Error('Too much text to translate at once.');
    const json = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const { translations } = JSON.parse(json);
    if (!Array.isArray(translations) || translations.length !== texts.length) {
      throw new Error('The AI returned an incomplete translation. Please try again.');
    }
    return translations.map((t) => String(t).trim());
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Your Anthropic API key was rejected. Check it in Settings.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Too many requests right now — wait a moment and try again.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new Error('Could not reach the AI service. Check your internet connection.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`The AI service returned an error (${error.status}). Please try again.`);
    }
    throw error;
  }
}

// ─── Google ──────────────────────────────────────────────────────────────────

async function googleTranslate(text, from, to) {
  const params = new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q: text });
  let response;
  try {
    response = await fetch(`${GOOGLE_URL}?${params}`, {
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Could not reach the translator. Check your internet connection.');
  }
  if (response.status === 429) {
    throw new Error(
      'The free translator is busy right now. Wait a minute and try again, or add a Claude key in Settings.',
    );
  }
  if (!response.ok) throw new Error(`The translator returned an error (${response.status}).`);
  const data = await response.json();
  const sentences = Array.isArray(data?.[0]) ? data[0] : [];
  const out = sentences.map((part) => part?.[0] ?? '').join('');
  if (!out.trim()) throw new Error('The translator returned nothing. Please try again.');
  return out.trim();
}

async function translateWithGoogle(texts, to) {
  const results = [];
  for (const text of texts) {
    if (to === 'en') {
      // Hinglish → Hindi script first: Google reads it far better.
      const hindi = await toDevanagariAsync(text);
      results.push(await googleTranslate(hindi, 'hi', 'en'));
    } else if (to === 'hi-deva') {
      results.push(await googleTranslate(text, 'en', 'hi'));
    } else {
      const hinglish = toHinglish(await googleTranslate(text, 'en', 'hi'));
      results.push(hinglish.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase()));
    }
  }
  return results;
}

/**
 * The step text box's "Convert to" buttons.
 *   hinglish  Hindi script → Roman Hinglish; English → translated; typed
 *             Hinglish → its spelling fixed (fixText).
 *   english   translated, unless it already is English.
 *   hindi     Hinglish → Hindi script word by word (what the Hindi voice reads);
 *             English → translated into Hindi.
 * @param {string} text
 * @param {'hinglish' | 'english' | 'hindi'} target
 * @returns {Promise<string>}
 */
export async function convertTextTo(text, target) {
  const lang = await textLanguage(text);
  const hasHindiScript = /[ऀ-ॿ]/.test(text);
  if (target === 'english') {
    return lang === 'en' && !hasHindiScript ? text : (await translateTexts([text], 'en'))[0];
  }
  if (target === 'hindi') {
    return lang === 'en' && !hasHindiScript
      ? (await translateTexts([text], 'hi-deva'))[0]
      : (await toDevanagariAsync(text, { lookup: getVoiceSettings().hinglishLookup })).replace(
          /(^|[^\d])\.(?=\s|$)/g,
          '$1।',
        );
  }
  // Only typed Hinglish is spell-fixed: translated or converted text is already
  // proper Hindi, and "fixing" unfamiliar words would damage it.
  if (hasHindiScript) return toHinglish(text);
  if (lang === 'en') return (await translateTexts([text], 'hi'))[0];
  return (await fixSpelling(text)).text;
}
