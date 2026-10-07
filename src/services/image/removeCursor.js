/**
 * @file Removes a mouse pointer that was captured in a screenshot.
 *
 * WHY: the walkthrough draws its own animated pointer. A pointer that is part
 * of the screenshot would show twice, and it often hides the button.
 *
 * HOW (only inside the area the user selected, never the whole picture):
 *   1. FIND  — look for the arrow shape: a dark arrow with a light border
 *              (macOS) or a light arrow with a dark border (Windows),
 *              at several sizes (normal and Retina screenshots).
 *   2. ERASE — paint over the arrow with the colours around it
 *              (each pixel gets the mix of the nearest clean pixels
 *              left / right / above / below).
 *   If no arrow is found with high confidence, the picture is left alone.
 *
 * The core functions work on plain pixel data ({ data, width, height }, like
 * canvas ImageData), so they can be tested without a browser.
 */

/** The arrow pointer, tip at (0, 0), at size 1 (about 14 × 19 px). */
const ARROW = [
  [0, 0],
  [0, 16.5],
  [4.3, 12.7],
  [7, 19],
  [10, 17.7],
  [7.3, 11.7],
  [14, 11.7],
];

/**
 * Sizes to try (1 = the smallest 1x pointer; 2+ = Retina / large pointers).
 * Size 1 is left out on purpose: at that size small icons and letters look
 * like an arrow too often, and we must never damage the picture.
 */
const SCALES = [1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5];

/** How sure we must be before changing the picture (0–1). */
const MIN_SCORE = 0.86;
/** The quick first test on a few points may be less strict. */
const QUICK_SCORE = 0.7;

const DARK = 95; // brightness below this counts as "dark"
const LIGHT = 165; // brightness above this counts as "light"

// ─── Browser entry point ─────────────────────────────────────────────────────

/**
 * Looks for a mouse pointer inside `region` (percent of the image) and, if
 * one is found, returns a new image Blob without it. Otherwise returns null.
 * @param {Blob} imageBlob
 * @param {{ x: number, y: number, w: number, h: number }} region
 * @returns {Promise<Blob | null>}
 */
export async function removeCursorFromArea(imageBlob, region) {
  const bitmap = await createImageBitmap(imageBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const found = findCursor(image, regionToPixels(region, image));
  if (!found) return null;

  eraseCursor(image, found);
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, imageBlob.type || 'image/png'));
}

/** Region in percent → pixel rectangle (clamped to the image). */
export function regionToPixels(region, { width, height }) {
  const x0 = Math.max(0, Math.floor((region.x / 100) * width));
  const y0 = Math.max(0, Math.floor((region.y / 100) * height));
  const x1 = Math.min(width, Math.ceil(((region.x + region.w) / 100) * width));
  const y1 = Math.min(height, Math.ceil(((region.y + region.h) / 100) * height));
  return { x0, y0, x1, y1 };
}

// ─── 1. Find ─────────────────────────────────────────────────────────────────

/**
 * Finds the best-matching pointer whose tip lies in `area` (pixels).
 * @returns {{ x: number, y: number, template: object, score: number } | null}
 */
export function findCursor(image, area) {
  const { width, height } = image;
  const brightness = toBrightness(image);
  const score = (x, y, points, nearby) =>
    matchScore(brightness, width, height, x, y, points, nearby);

  // The tip may sit a little outside the selected box.
  const margin = 8;
  const x0 = Math.max(0, area.x0 - margin);
  const y0 = Math.max(0, area.y0 - margin);
  const x1 = Math.min(width - 1, area.x1 + margin);
  const y1 = Math.min(height - 1, area.y1 + margin);

  let best = null;
  for (const template of getTemplates()) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Quick test on a few points first; the full test only if it looks right.
        if (score(x, y, template.sample, true) < QUICK_SCORE) continue;

        // The inside, the tail (a plain triangle like "▶" has none) and the
        // border must ALL match. The border may be 1 pixel off (real pointers
        // differ a little from our drawing).
        const inside = score(x, y, template.inside, false);
        if (inside < MIN_SCORE) continue;
        if (score(x, y, template.tail, false) < MIN_SCORE) continue;
        const border = score(x, y, template.border, true);
        if (border < MIN_SCORE) continue;

        const total = (inside + border) / 2;
        if (!best || total > best.score) best = { x, y, template, score: total };
      }
    }
  }
  return best;
}

/**
 * Share of points whose pixel has the expected brightness (0–1).
 * nearby = true: a pixel right next to it may match instead.
 */
function matchScore(brightness, width, height, tipX, tipY, points, nearby) {
  let matched = 0;
  for (const { dx, dy, wantDark } of points) {
    const x = tipX + dx;
    const y = tipY + dy;
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return 0;
    const is = (i) => (wantDark ? brightness[i] < DARK : brightness[i] > LIGHT);
    const i = y * width + x;
    if (is(i) || (nearby && (is(i - 1) || is(i + 1) || is(i - width) || is(i + width)))) matched++;
  }
  return matched / points.length;
}

/** Brightness (0–255) of every pixel. */
function toBrightness({ data, width, height }) {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  }
  return out;
}

// ─── Templates (the arrow drawn as points, built once) ──────────────────────

let templates = null;

/**
 * For every size and both styles: which pixels must be dark and which light.
 *   macOS:   dark inside, light border just OUTSIDE the outline
 *   Windows: light inside, dark border just INSIDE the outline
 */
function getTemplates() {
  if (templates) return templates;
  templates = [];
  for (const scale of SCALES) {
    const shape = ARROW.map(([x, y]) => [x * scale, y * scale]);
    const borderWidth = Math.max(1, scale);
    for (const style of ['mac', 'windows']) {
      const insideIsDark = style === 'mac';
      const inside = [];
      const border = [];
      const cover = []; // every pixel the pointer covers (to erase later)
      const size = Math.ceil(19 * scale) + 6;
      for (let dy = -3; dy <= size; dy++) {
        for (let dx = -3; dx <= size; dx++) {
          const d = signedDistance(dx, dy, shape); // > 0 inside, < 0 outside
          // Erase a bit more than the pointer itself (soft edges, shadow).
          if (d > -(borderWidth + 0.75 * scale)) cover.push({ dx, dy });

          if (d > borderWidth + 0.8) {
            inside.push({ dx, dy, wantDark: insideIsDark });
          } else if (style === 'mac' && d < -0.6 && d > -borderWidth + 0.1) {
            border.push({ dx, dy, wantDark: false }); // light border outside
          } else if (style === 'windows' && d > 0.6 && d < borderWidth - 0.1) {
            border.push({ dx, dy, wantDark: true }); // dark border inside
          }
        }
      }
      const tail = inside.filter((p) => p.dy > 12 * scale); // the bottom part of the arrow
      // Too small to tell an arrow from an icon or a letter → don't use it.
      if (inside.length < 25 || tail.length < 4 || border.length < 12) continue;

      // A few inside AND border points for the quick test.
      const every = (list, count) =>
        list.filter((_, n) => n % Math.max(1, Math.floor(list.length / count)) === 0);
      templates.push({
        scale,
        style,
        inside,
        border,
        tail,
        sample: [...every(inside, 12), ...every(border, 12)],
        cover,
      });
    }
  }
  return templates;
}

/** Distance from (x, y) to the outline of `shape`: positive inside, negative outside. */
function signedDistance(x, y, shape) {
  let nearest = Infinity;
  let inside = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const [ax, ay] = shape[j];
    const [bx, by] = shape[i];
    // Inside test (ray casting).
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    // Distance to this edge.
    const lx = bx - ax;
    const ly = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * lx + (y - ay) * ly) / (lx * lx + ly * ly)));
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * lx), y - (ay + t * ly)));
  }
  return inside ? nearest : -nearest;
}

// ─── 2. Erase ────────────────────────────────────────────────────────────────

/**
 * Paints over the found pointer with the colours around it.
 * Each covered pixel = mix of the nearest clean pixels to the left, right,
 * above and below (much more of the closer ones). Works well on flat UI colours.
 */
export function eraseCursor(image, { x, y, template }) {
  const { data, width, height } = image;
  const covered = new Set();
  for (const { dx, dy } of template.cover) {
    const px = x + dx;
    const py = y + dy;
    if (px >= 0 && py >= 0 && px < width && py < height) covered.add(py * width + px);
  }

  const result = [];
  for (const index of covered) {
    const px = index % width;
    const py = Math.floor(index / width);
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (const [sx, sy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      // Walk until the first clean pixel in this direction.
      let cx = px;
      let cy = py;
      let distance = 0;
      do {
        cx += sx;
        cy += sy;
        distance++;
      } while (cx >= 0 && cy >= 0 && cx < width && cy < height && covered.has(cy * width + cx));
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      const weight = 1 / distance ** 3; // nearer clean pixels count much more
      const i = (cy * width + cx) * 4;
      r += data[i] * weight;
      g += data[i + 1] * weight;
      b += data[i + 2] * weight;
      total += weight;
    }
    if (total > 0) result.push([index, r / total, g / total, b / total]);
  }

  // Write afterwards, so every pixel is filled from the ORIGINAL clean pixels.
  for (const [index, r, g, b] of result) {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
  }
}
