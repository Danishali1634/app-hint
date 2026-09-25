/**
 * @file Course search: normalising, ranking and "did you mean" suggestions.
 * Pure functions (no storage) so they are easy to test and reuse.
 *
 * WHY THIS EXISTS
 * Weeks later, people remember a course only vaguely ("stock recieve…").
 * Search must therefore:
 *   1. match titles AND page names, ignoring case, spacing and punctuation;
 *   2. rank the best matches first;
 *   3. when nothing matches, still suggest the closest names instead of a dead end.
 *
 * SIMILARITY: Sørensen–Dice coefficient on character bigrams. It is cheap,
 * forgiving about typos and word order ("stock receive" ≈ "Receive Stock").
 */

/** @typedef {import('@/types').Course} Course */

/**
 * "  Return   Repack! " → "return repack". Used for unique-title checks and search.
 * @param {string} text
 */
export function normalizeTitle(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Character bigrams of each word, e.g. "stock" → st, to, oc, ck. */
function bigrams(text) {
  const result = [];
  for (const word of text.split(' ')) {
    if (word.length === 1) result.push(word);
    for (let i = 0; i < word.length - 1; i++) result.push(word.slice(i, i + 2));
  }
  return result;
}

/**
 * Similarity 0 (nothing alike) … 1 (identical), order-insensitive.
 * @param {string} a normalised
 * @param {string} b normalised
 */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aGrams = bigrams(a);
  const bCounts = new Map();
  for (const g of bigrams(b)) bCounts.set(g, (bCounts.get(g) || 0) + 1);
  let overlap = 0;
  for (const g of aGrams) {
    const n = bCounts.get(g);
    if (n) {
      overlap++;
      bCounts.set(g, n - 1);
    }
  }
  const total = aGrams.length + bigrams(b).length;
  return total ? (2 * overlap) / total : 0;
}

/** Minimum similarity for a course to be offered as "Did you mean". */
const SUGGESTION_THRESHOLD = 0.3;
const MAX_SUGGESTIONS = 5;

/**
 * Relevance of one course for a query (0 = not a match).
 * Exact > starts with > contains the phrase > contains every word.
 */
function matchScore(course, query) {
  const fields = [normalizeTitle(course.title), normalizeTitle(course.pageName)];
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    if (field === query) best = Math.max(best, 100);
    else if (field.startsWith(query)) best = Math.max(best, 80);
    else if (field.includes(query)) best = Math.max(best, 60);
    else if (query.split(' ').every((word) => field.includes(word))) best = Math.max(best, 40);
  }
  return best;
}

/**
 * Searches courses by title and page name.
 * @param {Course[]} courses
 * @param {string} rawQuery
 * @returns {{ matches: Course[], suggestions: Course[] }}
 *   `matches` best first (ties: most recently updated first);
 *   `suggestions` only when there are no matches — closest names by similarity.
 */
export function searchCourses(courses, rawQuery) {
  const query = normalizeTitle(rawQuery);
  if (!query) return { matches: courses, suggestions: [] };

  const matches = courses
    .map((course) => ({ course, score: matchScore(course, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.course.updatedAt - a.course.updatedAt)
    .map((r) => r.course);

  if (matches.length > 0) return { matches, suggestions: [] };

  const suggestions = courses
    .map((course) => ({
      course,
      score: Math.max(
        similarity(query, normalizeTitle(course.title)),
        similarity(query, normalizeTitle(course.pageName)),
      ),
    }))
    .filter((r) => r.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((r) => r.course);

  return { matches: [], suggestions };
}
