/**
 * @file The walkthrough's ONE focus, as geometry. Pure functions, no React.
 * Used by the live player (hooks/useFocusMotion), the video export
 * (services/video/renderFrame) and the pace demo, so all three move the focus
 * the same way.
 *
 * MODEL
 *   The focus is not owned by a step: it is a single "attention window" that
 *   lives for the whole walkthrough. A step only says WHERE it should be (its
 *   target boxes, in image %) and how the camera frames it (a CameraView).
 *   Going to the next step never removes the focus and creates another one —
 *   the same boxes morph (x, y, w, h) while the camera moves, both driven by
 *   ONE eased progress value, so the focus stays locked onto the screenshot:
 *
 *     parent → child   the window contracts inward      (zooming attention)
 *     child → parent   it expands outward
 *     sibling → sibling / overlapping / far away        it travels directly
 *
 *   Boxes live in IMAGE space and are projected through the camera each frame
 *   (utils/camera.projectRegion), so the ring never drifts off its target
 *   mid-move the way two independent CSS transitions would.
 */

/** @typedef {import('@/types').Region} Region */
/** @typedef {import('./camera').CameraView} CameraView */
/** @typedef {{ view: CameraView, boxes: Region[] }} FocusFrame */

export const lerp = (a, b, t) => a + (b - a) * t;

/** ≈ CSS cubic-bezier(0.65, 0, 0.35, 1): calm at both ends, no overshoot. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** @returns {Region} */
export const lerpRegion = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
});

/**
 * Camera between two views. The zoom is interpolated in log space (each
 * moment zooms by the same factor, so it feels even) and the centre of the
 * visible window linearly. The window never leaves the image: its width is the
 * geometric mean of the two widths, never wider than the linear blend of two
 * windows that both fit.
 * @param {CameraView} a
 * @param {CameraView} b
 * @param {number} t  eased progress 0–1
 * @returns {CameraView}
 */
export function interpolateView(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), t));
  // Image point shown at the stage centre: 50 = p * s + t  →  p = (50 - t) / s
  const cx = lerp((50 - a.tx) / a.s, (50 - b.tx) / b.s, t);
  const cy = lerp((50 - a.ty) / a.s, (50 - b.ty) / b.s, t);
  return { s, tx: 50 - cx * s, ty: 50 - cy * s };
}

const centreDistance = (a, b) =>
  Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
const nearest = (boxes, to) =>
  boxes.reduce((best, b) => (centreDistance(b, to) < centreDistance(best, to) ? b : best));

/**
 * Which box morphs into which. The first box is THE focus and always becomes
 * the next first box. A step with more targets grows its extra boxes out of
 * the nearest current one; a step with fewer lets the extra boxes contract
 * into the nearest new one (and drops them once they have arrived). So boxes
 * are never faded in or out — only reshaped.
 * @param {Region[]} from
 * @param {Region[]} to
 * @returns {{ from: Region, to: Region }[]}
 */
export function matchFocusBoxes(from, to) {
  if (!from.length) return to.map((b) => ({ from: b, to: b }));
  if (!to.length) return from.map((b) => ({ from: b, to: b }));
  const pairs = to.map((b, i) => ({ from: from[i] ?? nearest(from, b), to: b }));
  for (let i = to.length; i < from.length; i++) {
    pairs.push({ from: from[i], to: nearest(to, from[i]) });
  }
  return pairs;
}

/**
 * The focus at eased progress `t` between two frames.
 * @param {FocusFrame} from
 * @param {FocusFrame} to
 * @param {number} t
 * @param {{ from: Region, to: Region }[]} [pairs]  matchFocusBoxes(from.boxes, to.boxes)
 * @returns {FocusFrame}
 */
export function focusFrameAt(from, to, t, pairs = matchFocusBoxes(from.boxes, to.boxes)) {
  if (t >= 1) return to;
  return {
    view: interpolateView(from.view, to.view, t),
    boxes: pairs.map((p) => lerpRegion(p.from, p.to, t)),
  };
}

/** Corner radius of the focus (px): 12, smaller for tiny boxes so it stays a box. */
export const focusRadius = (wPx, hPx) => Math.max(2, Math.min(12, wPx / 2, hPx / 2));
