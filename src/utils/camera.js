/**
 * @file Camera math for the walkthrough zoom. Pure functions, no React.
 * Used by the live player (components/walkthrough) AND the video export
 * (services/video), so both zoom to exactly the same spot.
 *
 * MODEL
 *   The stage has exactly the screenshot's aspect ratio. Inside it, a "camera"
 *   layer holds the image and is moved with:
 *       transform: translate(tx%, ty%) scale(s);   transform-origin: 0 0
 *   so an image point p (in % of the image) appears on screen at  p * s + t.
 *   (translate % is relative to the layer itself = the stage size.)
 *
 *   Overview → { s: 1, tx: 0, ty: 0 }   (whole screenshot visible)
 *   Focus    → zoomed so the region fills ~FOCUS_FILL of the stage and sits
 *              near FOCUS_CENTER, without ever showing empty space past the
 *              image edges.
 */

/** @typedef {import('@/types').Region} Region */
/** @typedef {{ s: number, tx: number, ty: number }} CameraView */

/** How much of the stage the focused region should fill (percent). Leaves
 *  enough surrounding page visible that the viewer keeps their bearings. */
const FOCUS_FILL = 42;
/** Where the focused region's centre should land (percent of stage). Slightly
 *  above the middle, leaving room for the caption bubble underneath. */
const FOCUS_CENTER = { x: 50, y: 42 };
/** Never zoom more than this — screenshots get blurry beyond ~2.5×. */
const MAX_ZOOM = 2.5;

/** @type {CameraView} */
export const OVERVIEW_VIEW = { s: 1, tx: 0, ty: 0 };

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Camera view that zooms onto a region.
 * @param {Region} region
 * @param {number} [zoom]  use this zoom instead of the normal one (clamped to 1–MAX_ZOOM)
 * @param {{ x: number, y: number }} [center]  where the region's centre should land
 *                         (stage %) instead of FOCUS_CENTER. Both overrides are used by
 *                         utils/captionPlacement.captionAwareView to make room for the caption.
 * @returns {CameraView}
 */
export function computeFocusView(region, zoom, center = FOCUS_CENTER) {
  const largestSide = Math.max(region.w, region.h, 1);
  const s = clamp(zoom ?? FOCUS_FILL / largestSide, 1, MAX_ZOOM);

  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;

  // Place the region centre at FOCUS_CENTER, then clamp so the zoomed image
  // still covers the whole stage (t between 100 - 100*s and 0).
  const minT = 100 - 100 * s;
  return {
    s,
    tx: clamp(center.x - centerX * s, minT, 0),
    ty: clamp(center.y - centerY * s, minT, 0),
  };
}

/**
 * Where a region appears on the stage for a given camera view (percent).
 * Overlays (spotlight, ring, cursor, caption) are drawn OUTSIDE the scaled
 * camera layer using this, so borders and text stay crisp at any zoom.
 * @param {Region} region
 * @param {CameraView} view
 * @returns {Region}
 */
export function projectRegion(region, view) {
  return {
    x: region.x * view.s + view.tx,
    y: region.y * view.s + view.ty,
    w: region.w * view.s,
    h: region.h * view.s,
  };
}

/** CSS transform string for the camera layer. */
export function cameraTransform(view) {
  return `translate(${view.tx}%, ${view.ty}%) scale(${view.s})`;
}

/** Centre of a region, in the same units as the region. */
export function regionCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Where the focused feature ends up on the stage (%): the point the pointer
 * clicks and the point the next step grows out of.
 * @param {Region} region
 */
export function focusedCenter(region) {
  return regionCenter(projectRegion(region, computeFocusView(region)));
}
