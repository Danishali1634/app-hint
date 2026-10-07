/**
 * @file Finds consecutive steps whose screenshots show the SAME page — taken
 * separately (one screenshot per step), but of one screen: a menu opened, a
 * field filled, a row selected.
 *
 * WHY: the walkthrough treats a new page as a new scene (the old page dives
 * away, the new one opens, the camera starts from the whole page). Between two
 * shots of one page that reads as "animation 1 ended, animation 2 started".
 * Marked as the same page, the camera instead glides on and the focus travels
 * from the old target to the new one while the new shot crossfades in — one
 * continuous motion (services/video/timeline.transitionFor → 'swap').
 *
 * HOW: each screenshot is shrunk to a 32 × 20 grey grid; two shots are one
 * page when they have the same shape and most cells barely changed (a popup
 * or a filled form changes a part; another page changes most of it).
 * Marks: step.pageOf = the previous step's id. Never throws: unknown = no mark.
 */

const GRID_W = 32;
const GRID_H = 20;
/** A cell "changed" when its brightness moved more than this (0–1). */
const CELL_CHANGE = 0.12;
/** One page when fewer than this share of cells changed. */
const MAX_CHANGED = 0.38;
/** Shapes (width / height) further apart than this are different pages. */
const MAX_RATIO_DIFF = 0.03;

const signatures = new Map(); // image src → Promise<{ ratio, grid } | null>

function signatureOf(src) {
  if (!signatures.has(src)) {
    signatures.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = GRID_W;
            canvas.height = GRID_H;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, GRID_W, GRID_H);
            const { data } = ctx.getImageData(0, 0, GRID_W, GRID_H);
            const grid = new Float32Array(GRID_W * GRID_H);
            for (let p = 0; p < grid.length; p++) {
              grid[p] = (data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114) / 255;
            }
            resolve({ ratio: img.naturalWidth / img.naturalHeight, grid });
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      }),
    );
  }
  return signatures.get(src);
}

function looksAlike(a, b) {
  if (!a || !b || Math.abs(a.ratio - b.ratio) > MAX_RATIO_DIFF * a.ratio) return false;
  let changed = 0;
  for (let p = 0; p < a.grid.length; p++) if (Math.abs(a.grid[p] - b.grid[p]) > CELL_CHANGE) changed++;
  return changed / a.grid.length < MAX_CHANGED;
}

/**
 * The steps, with `pageOf` set on each one whose screenshot shows the same page
 * as the step before it (different image, same screen). Unchanged steps are
 * returned as they are; the array is new only if something was marked.
 * @template {{ id: string, imageData?: string | null, pageOf?: string }} T
 * @param {T[]} steps
 * @returns {Promise<T[]>}
 */
export async function markSamePages(steps) {
  if (typeof document === 'undefined') return steps;
  const sigs = await Promise.all(steps.map((s) => (s.imageData ? signatureOf(s.imageData) : null)));
  let changed = false;
  const marked = steps.map((step, i) => {
    const prev = steps[i - 1];
    const alike =
      i > 0 &&
      prev.imageData &&
      step.imageData &&
      prev.imageData !== step.imageData &&
      looksAlike(sigs[i - 1], sigs[i]);
    if (!alike || step.pageOf === prev.id) return step;
    changed = true;
    return { ...step, pageOf: prev.id };
  });
  return changed ? marked : steps;
}
