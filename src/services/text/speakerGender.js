/**
 * @file Makes Hindi first-person verb forms match the narrator's gender.
 *
 * WHY: in Hindi the speaker's gender is in the verb — "main karunga" (man) vs
 * "main karungi" (woman). A female AI voice saying "karunga" sounds wrong, so
 * the walkthrough rewrites the speaker's OWN forms to match the chosen voice,
 * in captions and speech alike (services/sharing/share applies it to steps the
 * AI voice reads; a step with a recorded human voice keeps its text).
 *
 * WHAT CHANGES — only forms that are certainly the SPEAKER's ("I"):
 *   1. Future "-unga ⇄ -ungi": always first person singular.
 *        karunga ⇄ karungi, jaunga ⇄ jaungi, करूंगा ⇄ करूंगी
 *   2. A GENDERED word right before "hoon / hun / hu / हूं" (am):
 *        kar raha hoon ⇄ kar rahi hoon, thak gaya hu ⇄ thak gayi hu
 *   3. GENDERED words in a clause whose subject is "main / mai / मैं":
 *        main office gaya tha ⇄ main office gayi thi
 *   Not changed: "maine" / "mujhe" clauses (the verb agrees with the object:
 *   "maine khana khaya"), other people's verbs ("woh karega"), names
 *   ("main Priya hoon"), and words outside the GENDERED list.
 *
 * Roman and Devanagari, capitals kept. Idempotent; male → female → male gives
 * back the original.
 */

/** [male, female] pairs — verbs, auxiliaries and adjectives that follow the speaker. */
const GENDERED = [
  ['tha', 'thi'],
  ['raha', 'rahi'],
  ['gaya', 'gayi'],
  ['hua', 'hui'],
  ['sakta', 'sakti'],
  ['chahta', 'chahti'],
  ['karta', 'karti'],
  ['jaata', 'jaati'],
  ['jata', 'jati'],
  ['aata', 'aati'],
  ['deta', 'deti'],
  ['leta', 'leti'],
  ['rehta', 'rehti'],
  ['rahta', 'rahti'],
  ['sochta', 'sochti'],
  ['samajhta', 'samajhti'],
  ['dekhta', 'dekhti'],
  ['chuka', 'chuki'],
  ['paata', 'paati'],
  ['lagta', 'lagti'],
  ['baitha', 'baithi'],
  ['thaka', 'thaki'],
  ['wala', 'wali'],
  ['accha', 'acchi'],
  ['acha', 'achi'],
  ['bhookha', 'bhookhi'],
  ['bhukha', 'bhukhi'],
  ['pyaasa', 'pyaasi'],
  ['akela', 'akeli'],
  ['bura', 'buri'],
  ['aaya', 'aayi'],
  ['aya', 'ayi'],
  ['gaya', 'gayi'],
  ['kiya', 'kiya'],
  ['था', 'थी'],
  ['रहा', 'रही'],
  ['गया', 'गई'],
  ['हुआ', 'हुई'],
  ['सकता', 'सकती'],
  ['चाहता', 'चाहती'],
  ['करता', 'करती'],
  ['जाता', 'जाती'],
  ['आता', 'आती'],
  ['देता', 'देती'],
  ['लेता', 'लेती'],
  ['रहता', 'रहती'],
  ['सोचता', 'सोचती'],
  ['समझता', 'समझती'],
  ['देखता', 'देखती'],
  ['चुका', 'चुकी'],
  ['पाता', 'पाती'],
  ['लगता', 'लगती'],
  ['बैठा', 'बैठी'],
  ['थका', 'थकी'],
  ['वाला', 'वाली'],
  ['अच्छा', 'अच्छी'],
  ['भूखा', 'भूखी'],
  ['प्यासा', 'प्यासी'],
  ['अकेला', 'अकेली'],
  ['आया', 'आई'],
].filter(([m, f]) => m !== f);

const TO_FEMALE = new Map(GENDERED.map(([m, f]) => [m, f]));
const TO_MALE = new Map(GENDERED.map(([m, f]) => [f, m]));

/** Future endings, [male, female]. */
const FUTURE = [
  ['unga', 'ungi'],
  ['oonga', 'oongi'],
  ['ूंगा', 'ूंगी'],
  ['ूँगा', 'ूँगी'],
  ['ऊंगा', 'ऊंगी'],
  ['ऊँगा', 'ऊँगी'],
];

/** "am": the word before it describes the speaker. */
const AM = new Set(['hoon', 'hun', 'hu', 'hoo', 'हूं', 'हूँ', 'हू']);
/** Nominative "I": the clause's verbs follow the speaker. */
const I_WORDS = new Set(['main', 'mai', 'm', 'मैं', 'मै']); // "m": chat shorthand for main
/** Words that start a new clause, which may have a new subject. */
const CLAUSE_JOINERS = new Set([
  'aur',
  'lekin',
  'magar',
  'kyunki',
  'jabki',
  'and',
  'but',
  'और',
  'लेकिन',
  'क्योंकि',
]);

const WORD = /^[A-Za-z\p{Script=Devanagari}]+$/u;
const TOKENS = /[A-Za-z\p{Script=Devanagari}]+|\s+|[^A-Za-z\p{Script=Devanagari}\s]+/gu;

/** Keeps a leading capital ("Raha" → "Rahi"). */
const likeCase = (original, word) =>
  original[0] !== original[0].toLowerCase() ? word[0].toUpperCase() + word.slice(1) : word;

function flipWord(word, gender) {
  const swapped = (gender === 'female' ? TO_FEMALE : TO_MALE).get(word.toLowerCase());
  return swapped ? likeCase(word, swapped) : word;
}

function flipFuture(word, gender) {
  for (const [male, female] of FUTURE) {
    const [from, to] = gender === 'female' ? [male, female] : [female, male];
    if (word.toLowerCase().endsWith(from)) return word.slice(0, -from.length) + to;
  }
  return word;
}

/**
 * @param {string} text
 * @param {'male' | 'female' | null | undefined} gender  the narrator; nothing changes without one
 * @returns {string}
 */
export function matchSpeakerGender(text, gender) {
  if (!text || (gender !== 'male' && gender !== 'female')) return text;
  const tokens = text.match(TOKENS) || [];
  const wordAt = tokens.map((t, i) => (WORD.test(t) ? i : -1)).filter((i) => i >= 0);

  let subjectIsI = false;
  wordAt.forEach((i, n) => {
    const lower = tokens[i].toLowerCase();
    // Sentence ends and commas between this word and the previous one close the clause.
    const gap = tokens.slice((wordAt[n - 1] ?? -1) + 1, i).join('');
    if (/[.!?।,;:\n]/.test(gap) || CLAUSE_JOINERS.has(lower)) subjectIsI = false;
    if (I_WORDS.has(lower)) subjectIsI = true;

    const next = wordAt[n + 1];
    const beforeAm = next !== undefined && AM.has(tokens[next].toLowerCase());
    if (subjectIsI || beforeAm) tokens[i] = flipWord(tokens[i], gender); // rules 2 and 3
    tokens[i] = flipFuture(tokens[i], gender); // rule 1
  });
  return tokens.join('');
}
