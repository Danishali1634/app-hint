/**
 * @file Where the instruction caption goes next to the highlighted step.
 * Pure function, no React / DOM. Used by the live player
 * (components/walkthrough/WalkthroughStage) AND the video export
 * (services/video/renderFrame), so both place the caption the same way.
 *
 * RULE: the caption must never cover the step it describes.
 *   Candidates, in order of preference:
 *     below the step → above it → right of it → left of it
 *   Each uses the caption's REAL size (measured, not guessed) and keeps `gap`
 *   pixels between the caption and the step. The first candidate that fits
 *   inside `bounds` without touching the step wins; on the cross axis the
 *   caption is centred on the step and slid back inside the bounds.
 *   If none fits (tiny stage, huge step), the corners of the bounds are tried
 *   too and the position that covers the LEAST of the step is used — the
 *   caption is never hidden or shrunk.
 *
 * MAKING ROOM: before settling for such a fallback, captionAwareView() moves
 * the walkthrough camera: first it PANS (same zoom, the step moved towards an
 * edge so the caption fits on the other side), then it zooms out step by step
 * (down to the full screenshot) — the "adjust the view" part of the rule.
 *
 * All values are pixels in one coordinate space (e.g. relative to the stage).
 */

import { computeFocusView, projectRegion } from '@/utils/camera';

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {import('@/utils/camera').CameraView} CameraView */

const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/** Area where two boxes overlap (0 when they don't). */
function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * @param {{
 *   anchor: Box,                     // the highlighted step on screen
 *   size: { w: number, h: number },  // the caption's measured size
 *   bounds: Box,                     // where the caption may go
 *   gap?: number,                    // space kept between step and caption
 * }} input
 * @returns {{ x: number, y: number, side: 'below' | 'above' | 'right' | 'left' | 'fallback',
 *            cover: number }}  top-left corner of the caption; `cover` = px² of the step it
 *                              covers (0 unless side is 'fallback')
 */
export function placeCaption({ anchor, size, bounds, gap = 18 }) {
  const minX = bounds.x;
  const maxX = bounds.x + bounds.w - size.w;
  const minY = bounds.y;
  const maxY = bounds.y + bounds.h - size.h;
  const centredX = clamp(anchor.x + anchor.w / 2 - size.w / 2, minX, maxX);
  const centredY = clamp(anchor.y + anchor.h / 2 - size.h / 2, minY, maxY);
  // The step plus the gap: the caption must stay out of this box.
  const keepClear = {
    x: anchor.x - gap,
    y: anchor.y - gap,
    w: anchor.w + gap * 2,
    h: anchor.h + gap * 2,
  };

  const candidates = [
    { side: 'below', x: centredX, y: anchor.y + anchor.h + gap },
    { side: 'above', x: centredX, y: anchor.y - gap - size.h },
    { side: 'right', x: anchor.x + anchor.w + gap, y: centredY },
    { side: 'left', x: anchor.x - gap - size.w, y: centredY },
  ];
  const fitsInside = (c) =>
    c.x >= minX - 0.5 && c.x <= maxX + 0.5 && c.y >= minY - 0.5 && c.y <= maxY + 0.5;
  const covers = (c) => overlapArea({ x: c.x, y: c.y, w: size.w, h: size.h }, keepClear);

  const clean = candidates.find((c) => fitsInside(c) && covers(c) === 0);
  if (clean) return { ...clean, cover: 0 };

  // Nothing fits cleanly: slide every candidate inside the bounds, add the
  // four corners, and take the one that covers the step the least.
  const fallbacks = [
    ...candidates.map((c) => ({ x: clamp(c.x, minX, maxX), y: clamp(c.y, minY, maxY) })),
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
  ];
  // Rank by how much of the step is covered, then by how much of the gap.
  let best = fallbacks[0];
  let bestCover = Infinity;
  let bestScore = Infinity;
  for (const c of fallbacks) {
    const box = { x: c.x, y: c.y, w: size.w, h: size.h };
    const cover = overlapArea(box, anchor);
    const score = cover * 1e6 + overlapArea(box, keepClear);
    if (score < bestScore) {
      best = c;
      bestCover = cover;
      bestScore = score;
    }
  }
  return { ...best, side: 'fallback', cover: bestCover };
}

/** How many zoom levels captionAwareView tries between the focus zoom and 1×. */
const ZOOM_OUT_STEPS = 6;
/** Margin (stage %) kept between a panned step and the stage edge. */
const PAN_EDGE_PCT = 2;

/**
 * Where the step's centre may be moved to (stage %) at a zoom level to make
 * room: against the top (caption below), bottom (caption above), left, right.
 */
function panCenters(region, zoom) {
  const halfH = (region.h * zoom) / 2 + PAN_EDGE_PCT;
  const halfW = (region.w * zoom) / 2 + PAN_EDGE_PCT;
  return [
    { x: 50, y: halfH },
    { x: 50, y: 100 - halfH },
    { x: halfW, y: 50 },
    { x: 100 - halfW, y: 50 },
  ];
}

/**
 * The camera view for a step, so that its caption fits next to it.
 * Normally this is the regular focus zoom (utils/camera.computeFocusView).
 * Only when the caption can't be placed without covering the step there,
 * the camera pans (same zoom), then zooms out in steps (panning at each
 * level) until it can; if nothing leaves room, the view where the caption
 * covers the least is used.
 * @param {{
 *   region: import('@/types').Region,
 *   stage: { w: number, h: number },   // stage size, px
 *   size: { w: number, h: number },    // caption size, px
 *   bounds: Box,                       // where the caption may go (px, stage at 0,0)
 *   gap?: number,
 * }} input
 * @returns {CameraView}
 */
export function captionAwareView({ region, stage, size, bounds, gap }) {
  const placeFor = (view) => {
    const r = projectRegion(region, view);
    return placeCaption({
      anchor: {
        x: (r.x / 100) * stage.w,
        y: (r.y / 100) * stage.h,
        w: (r.w / 100) * stage.w,
        h: (r.h / 100) * stage.h,
      },
      size,
      bounds,
      gap,
    });
  };
  const base = computeFocusView(region);
  const first = placeFor(base);
  if (first.side !== 'fallback') return base;
  let best = base;
  let bestCover = first.cover;
  const levels = [base.s];
  for (let n = 1; n <= ZOOM_OUT_STEPS && base.s > 1; n++) {
    levels.push(base.s - ((base.s - 1) * n) / ZOOM_OUT_STEPS);
  }
  for (const [n, zoom] of levels.entries()) {
    const views = [
      ...(n === 0 ? [] : [computeFocusView(region, zoom)]),
      ...panCenters(region, zoom).map((center) => computeFocusView(region, zoom, center)),
    ];
    for (const view of views) {
      const { side, cover } = placeFor(view);
      if (side !== 'fallback') return view; // fits with the full gap
      if (cover < bestCover) {
        best = view;
        bestCover = cover;
      }
    }
  }
  return best;
}
