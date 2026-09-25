/**
 * @file "Improve text" for step descriptions.
 *
 * TWO LEVELS
 *   polishText()        — always available, offline: tidies spacing,
 *                         punctuation and capitals so the voice reads it cleanly.
 *   improveWithClaude() — OPTIONAL: rewrites the text with Claude so it is
 *                         clear, friendly and natural to hear (keeps the
 *                         author's language, incl. Hinglish). Needs the user's
 *                         own Anthropic API key (Settings), because this app has
 *                         no server of its own.
 *
 * WHY THE SDK IS LOADED LAZILY: import('@anthropic-ai/sdk') runs only when
 * someone actually clicks "Improve with AI", so nobody else downloads it.
 *
 * SECURITY: `dangerouslyAllowBrowser` is required to call the API from a web
 * page. It is acceptable here only because the key is the USER'S OWN key,
 * entered by them and kept in their browser — never ship a shared key like this.
 */

const MODEL = 'claude-opus-5';

const SYSTEM_PROMPT = `You rewrite one step of a software walkthrough. The text is shown as a caption and read aloud by a voice while an animation highlights the feature on screen.

Rewrite the step so it is clear, friendly and natural to hear:
- Keep the author's language exactly as it is mixed: if they wrote Hinglish (Hindi in Latin script mixed with English), answer in Hinglish; if English, in English.
- Keep every button, menu and field name exactly as written, including capitalisation.
- 1 or 2 short sentences, spoken style, no bullet points, no emojis, no quotes around the answer.
- If the step is a click, say what to click and what it does; if it is a look step, say what the viewer is looking at.
- Do not invent features or numbers that are not in the original.

Reply with the rewritten text only.`;

/**
 * Offline clean-up: whitespace, spacing around punctuation, sentence capitals,
 * final full stop. Never changes the words themselves.
 * @param {string} text
 */
export function polishText(text) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  t = t
    .replace(/\s+([,.!?;:।])/g, '$1') // no space before punctuation
    .replace(/([,.!?;:])(?=[^\s\d.,!?)"'])/g, '$1 ') // one space after
    .replace(/([.!?])\1+/g, '$1') // "!!" → "!"
    .replace(/(^|[.!?।]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase()); // sentence capitals
  if (!/[.!?।]$/.test(t)) t += '.';
  return t;
}

/**
 * Rewrites a step description with Claude.
 * @param {string} text
 * @param {{ apiKey: string, label?: string, pageName?: string, action?: 'click' | 'look' }} context
 * @returns {Promise<string>}
 * @throws {Error} with a user-readable message
 */
export async function improveWithClaude(text, { apiKey, label, pageName, action }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const userMessage = [
    pageName && `Page: ${pageName}`,
    label && `Step title: ${label}`,
    `Step type: ${action === 'look' ? 'look (the viewer just looks at this area)' : 'click (the viewer clicks this area)'}`,
    `Text to rewrite:\n${text}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // A short rewrite: keep thinking light for speed.
      output_config: { effort: 'low' },
      // If the request is declined, retry on a fallback model automatically.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The AI could not rewrite this text. Try rephrasing it yourself.');
    }
    const rewritten = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
      .replace(/^["“]|["”]$/g, '');
    if (!rewritten) throw new Error('The AI returned an empty answer. Please try again.');
    return rewritten;
  } catch (error) {
    // Most specific first; show messages people can act on.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Your Anthropic API key was rejected. Check it in Settings.');
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new Error(
        'This API key is not allowed to use the model. Check your Anthropic account.',
      );
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
