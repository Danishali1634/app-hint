/**
 * @file Draws one video frame of the walkthrough onto a <canvas>.
 *
 * WHY A CANVAS RE-IMPLEMENTATION (instead of recording the page)
 *   Browsers can't screen-record a page without asking the user to pick a
 *   screen/tab. A canvas can be recorded silently with captureStream(), so the
 *   player's visuals are redrawn here with the 2D API:
 *     camera zoom · spotlight · pulsing ring · pointer + click ripples · caption.
 *
 * TWO LAYOUTS (frame.mobile, from exportVideo's format):
 *   Web     1280×720, title and margins around the picture; the caption shows
 *           the description in up to 3 lines (then …) — as always.
 *   Mobile  the phone's full screen (portrait or landscape): thin margins so
 *           the picture gets the whole area; the caption text is never cut
 *           off — the font shrinks a little to fit, and a long description is
 *           shown in parts (utils/captionParts), each while the voice says it
 *           (step.captionParts / step.captionPartStarts, from exportVideo).
 *   The maths (utils/camera.js) and timing (WALKTHROUGH_TIMING) are shared with
 *   the live player, so the video matches what people see on screen.
 *
 * COORDINATES: regions/views are in % of the stage (see utils/camera.js);
 * `stage` below is the stage rectangle in canvas pixels.
 */

import { OVERVIEW_VIEW, projectRegion, regionCenter } from '@/utils/camera';
import { captionAwareView, placeCaption } from '@/utils/captionPlacement';
import { getFocusRegion, getStepTargets, getStepTitles } from '@/utils/course';
import { partAt, splitCaptionParts } from '@/utils/captionParts';
import { formatTime } from '@/utils';
import { OUTRO_TEXT, WALKTHROUGH_TIMING } from '@/constants';
import { isClickStep, transitionFor } from './timeline';

/** @typedef {import('./timeline').TimelineSegment} TimelineSegment */

// ─── Look & feel (mirrors tailwind.config.js / index.css) ───────────────────
const COLORS = {
  background: '#08080A',
  stageBackground: '#141418',
  accent: '#1570EF',
  dim: 'rgba(8, 10, 14, 0.62)',
  captionBg: 'rgba(20, 20, 24, 0.96)',
  captionBorder: '#2A2A31',
  textStrong: '#F2F2F5',
  textSoft: '#A1A1AA',
  textFaint: '#71717A',
};
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const SPOTLIGHT_PADDING = 6;
const CURSOR_START = { x: 96, y: 112 };

// ─── Easing ──────────────────────────────────────────────────────────────────
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** ≈ CSS cubic-bezier(0.65, 0, 0.35, 1) used by .hs-camera */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** ≈ cubic-bezier(0.22, 1, 0.36, 1) used by .hs-cursor */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpView = (a, b, t) => ({
  s: lerp(a.s, b.s, t),
  tx: lerp(a.tx, b.tx, t),
  ty: lerp(a.ty, b.ty, t),
});

/** Portion of a phase an animation occupies, e.g. the 1000ms zoom inside 1100ms "focus". */
const within = (elapsed, durationMs) => clamp01(elapsed / durationMs);
const lerpRegion = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
});

// ─── Drawing helpers ─────────────────────────────────────────────────────────

/**
 * Adds a rounded rectangle to the path. Pass `append = true` to ADD it to the
 * current path instead of starting a new one — needed for the spotlight, which
 * is "full stage rectangle + rounded hole" filled with the even-odd rule.
 */
function roundRectPath(ctx, x, y, w, h, r, append = false) {
  const radius = Math.min(r, w / 2, h / 2);
  if (!append) ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Stage-% rectangle → canvas pixels, padded by `pad` px. */
function toPixels(stage, r, pad = 0) {
  return {
    x: stage.x + (r.x / 100) * stage.w - pad,
    y: stage.y + (r.y / 100) * stage.h - pad,
    w: (r.w / 100) * stage.w + pad * 2,
    h: (r.h / 100) * stage.h + pad * 2,
  };
}

/** A word wider than maxWidth (e.g. a long link), broken into pieces that fit. */
function breakWord(ctx, word, maxWidth) {
  if (ctx.measureText(word).width <= maxWidth) return [word];
  const pieces = [];
  let piece = '';
  for (const char of word) {
    if (piece && ctx.measureText(piece + char).width > maxWidth) {
      pieces.push(piece);
      piece = char;
    } else {
      piece += char;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Splits text into lines no wider than maxWidth (max `maxLines`, with …).
 * `breakLong`: a word wider than a line is broken (Mobile captions, which keep
 * every word and have no `maxLines`).
 */
function wrapText(ctx, text, maxWidth, maxLines = Infinity, breakLong = false) {
  const words = (text || '')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (breakLong ? breakWord(ctx, word, maxWidth) : [word]));
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

/** The mouse pointer, tip at (x, y). Same shape as the SVG in WalkthroughStage. */
function drawCursor(ctx, x, y, scale, alpha) {
  const k = 1.45 * scale; // 24-unit SVG path → ~35px
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-3, -2); // path tip is at (3, 2)
  ctx.beginPath();
  ctx.moveTo(3, 2);
  ctx.lineTo(3, 19.5);
  ctx.lineTo(7.8, 15.2);
  ctx.lineTo(11, 22);
  ctx.lineTo(14.2, 20.6);
  ctx.lineTo(11.1, 13.9);
  ctx.lineTo(17.6, 13.9);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8 / k;
  ctx.shadowOffsetY = 3 / k;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#111827';
  ctx.stroke();
  ctx.restore();
}

/** Expanding click rings at (x, y). `elapsed` = ms since the click started. */
function drawRipples(ctx, x, y, elapsed) {
  const rings = [
    { delay: 0, radius: 56, width: 5, color: COLORS.accent, fill: false },
    { delay: 150, radius: 56, width: 4, color: '#ffffff', fill: false },
    { delay: 60, radius: 32, width: 0, color: 'rgba(21,112,239,0.5)', fill: true },
  ];
  for (const ring of rings) {
    const q = clamp01((elapsed - ring.delay) / 900);
    if (q <= 0 || q >= 1) continue;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - q);
    ctx.beginPath();
    ctx.arc(x, y, ring.radius * (0.1 + 0.9 * easeOut(q)), 0, Math.PI * 2);
    if (ring.fill) {
      ctx.fillStyle = ring.color;
      ctx.fill();
    } else {
      ctx.lineWidth = ring.width;
      ctx.strokeStyle = ring.color;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Where things go in a frame. Web: as always. Mobile: thin margins, small
 * title and progress bar, so the picture fills the phone's screen.
 */
const WEB_GEO = {
  mobile: false,
  side: 40,
  top: 68,
  bottom: 56,
  title: { x: 40, y: 34, size: 18 },
  bar: { x: 40, bottom: 26 },
  bounds: { side: 16, top: 60, bottom: 40 },
};
const MOBILE_GEO = {
  mobile: true,
  side: 8,
  top: 38,
  bottom: 22,
  title: { x: 12, y: 19, size: 14 },
  bar: { x: 12, bottom: 11 },
  bounds: { side: 8, top: 34, bottom: 20 },
};

const CAPTION_PAD = 18;
const CAPTION_BADGE = 28;
const LABEL_LINE = 21;
/** Description font sizes to try (px), largest first, and the lines each part may use. */
const CAPTION_TEXT_SIZES = [15, 14, 13, 12];
const CAPTION_MAX_LINES = 5;
/** Room for the "part 2 of 3" dots under the text. */
const PART_DOTS_SPACE = 14;

/** Mobile: the caption parts of a step (exportVideo passes them; else made from the text). */
const partsOf = (step) => step.captionParts ?? splitCaptionParts(step.text);

/** Mobile: the part the caption shows in this phase: the one being said, later the last. */
function captionPartFor(step, phase, elapsed) {
  const count = partsOf(step).length;
  if (count < 2) return 0;
  if (phase === 'narrate') return partAt(step.captionPartStarts ?? [0], elapsed);
  return ['action', 'done', 'exit'].includes(phase) ? count - 1 : 0;
}

/**
 * Caption layout for a given width: wrapped lines and the card's height.
 * Web: label up to 2 lines, text up to 3 (then …), as always.
 * Mobile: every part wrapped in the largest font that fits each part in
 * CAPTION_MAX_LINES (smallest font: as many lines as needed — nothing is ever
 * cut). The card is as tall as its LONGEST part, so it keeps its size and
 * place while the parts change.
 */
function layoutCaption(ctx, { width, step, mobile }) {
  const { label } = step;
  const textWidth = width - (CAPTION_PAD + CAPTION_BADGE + 12) - CAPTION_PAD;
  if (!mobile) {
    const { text } = step;
    ctx.save();
    ctx.font = `600 17px ${FONT}`;
    const labelLines = label ? wrapText(ctx, label, textWidth, 2) : [];
    ctx.font = `400 15px ${FONT}`;
    const textLines = text ? wrapText(ctx, text, textWidth, 3) : [];
    ctx.restore();
    const height =
      CAPTION_PAD * 2 + Math.max(CAPTION_BADGE, labelLines.length * 22 + textLines.length * 21);
    return {
      labelLines,
      labelFont: `600 17px ${FONT}`,
      labelLine: 22,
      partLines: [textLines],
      textSize: 15,
      lineHeight: 21,
      parts: [text],
      height,
    };
  }
  const parts = partsOf(step);
  ctx.save();
  ctx.font = `600 16px ${FONT}`;
  const labelLines = label ? wrapText(ctx, label, textWidth, Infinity, true) : [];
  let textSize = CAPTION_TEXT_SIZES[0];
  let partLines = [];
  for (const size of CAPTION_TEXT_SIZES) {
    textSize = size;
    ctx.font = `400 ${size}px ${FONT}`;
    partLines = parts.map((part) => wrapText(ctx, part, textWidth, Infinity, true));
    if (Math.max(0, ...partLines.map((lines) => lines.length)) <= CAPTION_MAX_LINES) break;
  }
  ctx.restore();
  const lineHeight = Math.round(textSize * 1.4);
  const maxLines = Math.max(0, ...partLines.map((lines) => lines.length));
  const dots = parts.length > 1 ? PART_DOTS_SPACE : 0;
  const height =
    CAPTION_PAD * 2 +
    Math.max(CAPTION_BADGE, labelLines.length * LABEL_LINE + maxLines * lineHeight + dots);
  return {
    labelLines,
    labelFont: `600 16px ${FONT}`,
    labelLine: LABEL_LINE,
    partLines,
    textSize,
    lineHeight,
    parts,
    height,
  };
}

/**
 * Caption card: number badge, label, description (Mobile: the part being
 * said, `part`). Returns its height.
 */
function drawCaption(ctx, { x, y, width, stepNumber, step, mobile, part = 0, alpha }) {
  const pad = CAPTION_PAD;
  const badge = CAPTION_BADGE;
  const textX = x + pad + badge + 12;
  const { labelLines, labelFont, labelLine, partLines, textSize, lineHeight, parts, height } =
    layoutCaption(ctx, { width, step, mobile });
  const current = Math.min(part, Math.max(0, parts.length - 1));

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, x, y, width, height, 16);
  ctx.fillStyle = COLORS.captionBg;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.captionBorder;
  ctx.stroke();

  // Number badge
  ctx.beginPath();
  ctx.arc(x + pad + badge / 2, y + pad + badge / 2, badge / 2, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.accent;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(stepNumber), x + pad + badge / 2, y + pad + badge / 2 + 1);

  // Label + text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let lineY = y + pad + 2;
  ctx.font = labelFont;
  ctx.fillStyle = COLORS.textStrong;
  for (const line of labelLines) {
    ctx.fillText(line, textX, lineY);
    lineY += labelLine;
  }
  ctx.font = `400 ${textSize}px ${FONT}`;
  ctx.fillStyle = COLORS.textSoft;
  for (const line of partLines[current] ?? []) {
    ctx.fillText(line, textX, lineY);
    lineY += lineHeight;
  }

  // Mobile: which part this is: one dot per part, the current one long (bottom of the card).
  if (mobile && parts.length > 1) {
    let dotX = textX;
    const dotY = y + height - pad - 4;
    parts.forEach((_, k) => {
      const w = k === current ? 12 : 4;
      roundRectPath(ctx, dotX, dotY, w, 4, 2);
      ctx.fillStyle = k === current ? COLORS.accent : 'rgba(161,161,170,0.4)';
      ctx.fill();
      dotX += w + 4;
    });
  }
  ctx.restore();
  return height;
}

/**
 * Caption card width (px). Web: from the stage. Mobile: from the frame, so a
 * narrow phone screenshot in a landscape video still gets a readable card.
 */
const captionWidthFor = (stage, width, geo) =>
  geo.mobile ? Math.min(380, width * 0.8) : Math.min(420, stage.w * 0.8);
/** Where the caption may go: the whole frame between the title and the progress bar. */
const captionBounds = (width, height, geo) => ({
  x: geo.bounds.side,
  y: geo.bounds.top,
  w: width - geo.bounds.side * 2,
  h: height - geo.bounds.top - geo.bounds.bottom,
});
const CAPTION_GAP = 18 + SPOTLIGHT_PADDING;

/**
 * A step's zoomed-in camera view: the normal focus zoom, zoomed out only as far
 * as needed for its caption to fit beside the feature (same rule as the live
 * player — utils/captionPlacement.captionAwareView).
 */
function stepFocusView(ctx, step, stage, width, height, geo) {
  const captionWidth = captionWidthFor(stage, width, geo);
  const { height: captionHeight } = layoutCaption(ctx, {
    width: captionWidth,
    step,
    mobile: geo.mobile,
  });
  const bounds = captionBounds(width, height, geo);
  return captionAwareView({
    region: getFocusRegion(step),
    stage: { w: stage.w, h: stage.h },
    size: { w: captionWidth, h: captionHeight },
    bounds: { ...bounds, x: bounds.x - stage.x, y: bounds.y - stage.y }, // stage at 0,0
    gap: CAPTION_GAP,
  });
}

/** Several targets: after gliding to the next one, the pointer presses this much later
 *  (same as the live player). */
const PRESS_AFTER_GLIDE_MS = 320;

/** Typing speed for 'type' steps (same values as the live player's TypingField). */
const TYPE_CHAR_MS = 75;
const TYPE_MAX_MS = 2200;

/**
 * 'type' steps: a filled field inside the area with the typed value and a
 * blinking caret; without a value, a caret and three "typing" dots.
 * Long values keep their end visible, like a real input.
 */
function drawTypingField(ctx, { box: area, value, time, alpha }) {
  const fontSize = Math.max(11, Math.min(20, area.h * 0.45));
  const padX = fontSize * 0.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `500 ${fontSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const textW = value ? ctx.measureText(value).width : 0;
  const dotsW = value ? 0 : fontSize * 1.5;
  // Same rule as the live player (WalkthroughStage TypingField): a small box
  // (an input field) is filled; a bigger area only gets a compact typing pill
  // in its middle, so what is highlighted stays visible.
  const fills = area.h <= fontSize * 2.4;
  const pillW = Math.max(0, area.w - 12); // full width of the selection, one line high
  const pillH = Math.min(area.h, fontSize * 2);
  const box = fills
    ? area
    : {
        x: area.x + (area.w - pillW) / 2,
        y: area.y + (area.h - pillH) / 2,
        w: pillW,
        h: pillH,
      };
  roundRectPath(ctx, box.x, box.y, box.w, box.h, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
  ctx.clip();

  const midY = box.y + box.h / 2;
  // Scroll left once the text is wider than the field.
  const startX = Math.min(box.x + padX, box.x + box.w - padX - 3 - textW - dotsW);
  if (value) {
    ctx.fillStyle = '#111827';
    ctx.fillText(value, startX, midY);
  } else {
    for (let n = 0; n < 3; n++) {
      const bounce = Math.max(0, Math.sin(((time - n * 160) / 960) * Math.PI * 2));
      ctx.beginPath();
      ctx.arc(
        startX + n * fontSize * 0.5 + fontSize * 0.18,
        midY - bounce * fontSize * 0.12,
        fontSize * 0.17,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(107, 114, 128, ${0.45 + 0.55 * bounce})`;
      ctx.fill();
    }
  }
  if (Math.floor(time / 530) % 2 === 0) {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(startX + textW + dotsW + 1, midY - fontSize * 0.575, 2, fontSize * 1.15);
  }
  ctx.restore();
}

// ─── Frame ───────────────────────────────────────────────────────────────────

/**
 * Draws the frame for one moment of the timeline.
 *
 * ONE PIECE: when a new screen enters, the previous screen is drawn underneath
 * in its "exit" phase (fading / diving into the clicked button) — the two
 * overlap, so the video never flashes an empty frame between steps. Steps on the
 * same screen glide the camera from the old area to the new one.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   width: number, height: number,
 *   title: string,
 *   steps: import('@/types').WalkthroughStep[],
 *   images: Record<string, { img: HTMLImageElement, ratio: number }>,  // by step id
 *   segment: TimelineSegment,
 *   progress: number,     // 0–1 within the segment
 *   elapsed: number,      // ms within the segment
 *   time: number,         // ms since the start of the video (for pulses)
 *   total: number,        // ms, length of the whole video (progress bar)
 * }} frame
 */
export function renderFrame(ctx, frame) {
  const { width, height, title, steps, images, segment, elapsed, time, total } = frame;
  const geo = frame.mobile ? MOBILE_GEO : WEB_GEO;
  const i = segment.stepIndex;
  const starts = frame.segments ? stepStarts(frame.segments, steps.length) : null;
  // STEPS PANEL — disabled for now (kept for later): the downloaded video shows
  // only the walkthrough, full width. To bring the panel back, restore this line
  // and the drawStepsPanel call below.
  // Steps panel on the right (like the player's); the picture gets the rest.
  // const panelX = steps.length > 1 && starts ? width - PANEL.margin - PANEL.w : width;
  const panelX = width;

  // Background + title + one continuous progress bar, divided per step.
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `600 ${geo.title.size}px ${FONT}`;
  ctx.fillStyle = COLORS.textStrong;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // (Mobile: a narrow screen — a long title is shortened to one line.)
  const titleText = geo.mobile ? clipLine(ctx, title, width - geo.title.x * 2) : title;
  ctx.fillText(titleText, geo.title.x, geo.title.y);
  drawProgressBar(ctx, width, height, time, total, starts, geo);

  const layer = (index, phase, layerElapsed, extra = {}) =>
    drawStep(ctx, {
      width: panelX,
      height,
      step: steps[index],
      prev: steps[index - 1] || null,
      stepNumber: index + 1,
      image: images[steps[index].id],
      phase,
      elapsed: layerElapsed,
      time,
      enterOrigin: null,
      continued: false,
      geo,
      ...extra,
    });

  // The previous screen leaves underneath the new one.
  if (segment.phase === 'enter' && i > 0) layer(i - 1, 'exit', elapsed);
  const swapping = transitionFor(steps, i) === 'swap';
  const stepStart = frame.segments?.find((s) => s.stepIndex === i)?.start ?? segment.start;
  layer(i, segment.phase, elapsed, {
    enterOrigin: segment.enterOrigin,
    continued: !!segment.continued,
    ...(swapping ? { fadeFrom: images[steps[i - 1].id], fadeElapsed: time - stepStart } : {}),
  });
  // STEPS PANEL — disabled for now (kept for later), see panelX above.
  // if (panelX < width) {
  //   drawStepsPanel(ctx, { x: panelX, height, steps, images, index: i, time, starts, total });
  // }
  // Ending: a warm "you're all set" card over the last frame.
  if (segment.phase === 'done' && elapsed > OUTRO_DELAY_MS) {
    drawOutro(ctx, width, height, elapsed - OUTRO_DELAY_MS, title, steps.length, geo);
  }
}

/** The ending card starts this long after the last step finished. */
const OUTRO_DELAY_MS = 900;

/**
 * Ending card: the screen dims, a check mark draws itself inside a glowing
 * circle, sparkles drift up, then "You're all set!" + what was learned.
 */
function drawOutro(ctx, width, height, t, title, stepCount, geo) {
  const fade = easeOut(within(t, 600));
  ctx.save();
  ctx.fillStyle = `rgba(9, 9, 11, ${0.78 * fade})`;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2 - 40;

  // Sparkles rising around the badge
  for (let n = 0; n < 18; n++) {
    const angle = (n / 18) * Math.PI * 2;
    const life = (t / 1600 + n * 0.37) % 1;
    const radius = 70 + life * 150;
    const sx = cx + Math.cos(angle) * radius;
    const sy = cy + Math.sin(angle) * radius * 0.7 - life * 40;
    ctx.globalAlpha = fade * (1 - life) * 0.9;
    ctx.fillStyle = n % 3 === 0 ? '#FFFFFF' : n % 3 === 1 ? COLORS.accent : '#2DD4BF';
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5 + (n % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  // Glowing circle that pops in
  const pop = easeOut(within(t - 150, 500));
  const r = 54 * (0.6 + 0.4 * pop);
  ctx.globalAlpha = fade;
  ctx.shadowColor = 'rgba(21, 112, 239, 0.8)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Check mark drawing itself
  const draw = easeInOut(within(t - 450, 500));
  if (draw > 0) {
    const pts = [
      [cx - 22, cy + 2],
      [cx - 6, cy + 18],
      [cx + 24, cy - 16],
    ];
    const firstLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    const secondLen = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    let remaining = draw * (firstLen + secondLen);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    const a = Math.min(1, remaining / firstLen);
    ctx.lineTo(lerp(pts[0][0], pts[1][0], a), lerp(pts[0][1], pts[1][1], a));
    remaining -= firstLen;
    if (remaining > 0) {
      const b = Math.min(1, remaining / secondLen);
      ctx.lineTo(lerp(pts[1][0], pts[2][0], b), lerp(pts[1][1], pts[2][1], b));
    }
    ctx.stroke();
  }

  // Text rises in
  const textIn = easeOut(within(t - 700, 700));
  ctx.globalAlpha = fade * textIn;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(OUTRO_TEXT.heading, cx, cy + 110 + 14 * (1 - textIn));
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  // (Mobile: a narrow portrait screen needs the full width for this line.)
  const learned = wrapText(ctx, OUTRO_TEXT.learned(title), width - (geo.mobile ? 48 : 240), 2);
  learned.forEach((line, n) => ctx.fillText(line, cx, cy + 160 + n * 28 + 10 * (1 - textIn)));
  const tagIn = easeOut(within(t - 1300, 700));
  ctx.globalAlpha = fade * tagIn;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(OUTRO_TEXT.tagline(stepCount), cx, cy + 170 + learned.length * 28 + 18);
  ctx.restore();
}

/** One step's screen, camera, spotlight, pointer and caption for one phase. */
function drawStep(ctx, layer) {
  const { width, height, step, prev, stepNumber, image, phase, elapsed, time, geo } = layer;
  const showCaption = ['narrate', 'action', 'done'].includes(phase);
  const captionAlpha = phase === 'narrate' ? easeOut(within(elapsed, 450)) : 1;

  // Text-only step
  if (!image) {
    const cardWidth = Math.min(620, width - (geo.mobile ? 32 : 120));
    const enterAlpha = phase === 'enter' ? easeOut(within(elapsed, 650)) : 1;
    drawCaption(ctx, {
      x: (width - cardWidth) / 2,
      y: height / 2 - 60,
      width: cardWidth,
      stepNumber,
      step,
      mobile: geo.mobile,
      part: geo.mobile ? captionPartFor(step, phase, elapsed) : 0,
      alpha: enterAlpha * (phase === 'exit' ? 1 - within(elapsed, 450) : 1),
    });
    return;
  }

  // Stage rectangle: largest box with the image's ratio inside the frame.
  const area = {
    x: geo.side,
    y: geo.top,
    w: width - geo.side * 2,
    h: height - geo.top - geo.bottom,
  };
  const stageW = Math.min(area.w, area.h * image.ratio);
  const stageH = stageW / image.ratio;
  const stage = {
    x: area.x + (area.w - stageW) / 2,
    y: area.y + (area.h - stageH) / 2,
    w: stageW,
    h: stageH,
  };

  // All targets are highlighted together; the camera frames the box around them.
  const targets = getStepTargets(step);
  const region = getFocusRegion(step);
  const isClick = isClickStep(step);
  const focusView = region ? stepFocusView(ctx, step, stage, width, height, geo) : OVERVIEW_VIEW;
  // The pointer clicks every target in turn: one press per WALKTHROUGH_TIMING.clickAction.
  const clickPoints = targets.map((t) => regionCenter(projectRegion(t, focusView)));
  const lastClick = Math.max(0, clickPoints.length - 1);
  const clickIndex =
    phase === 'action'
      ? Math.min(lastClick, Math.floor(elapsed / WALKTHROUGH_TIMING.clickAction))
      : phase === 'exit' || phase === 'done'
        ? lastClick
        : 0;
  const clickPoint = clickPoints[clickIndex] ?? null;
  // ms since the current press began (presses after the first wait for the glide)
  const pressDelay = clickIndex > 0 ? PRESS_AFTER_GLIDE_MS : 0;
  const pressElapsed = elapsed - clickIndex * WALKTHROUGH_TIMING.clickAction - pressDelay;

  // Camera view + spotlight strength for this phase.
  // (only used when `prev` shows the same screenshot, i.e. the same stage)
  const prevView = getFocusRegion(prev)
    ? stepFocusView(ctx, prev, stage, width, height, geo)
    : OVERVIEW_VIEW;
  const prevSingle = getStepTargets(prev).length === 1;
  let view = OVERVIEW_VIEW;
  let spotlight = 0;
  let spotRegion = region;
  if (region) {
    if (phase === 'focus' && layer.continued) {
      // Same screen as the step before: glide from its area straight to this one.
      const e = easeInOut(within(elapsed, 1000));
      view = lerpView(prevView, focusView, e);
      spotlight = prev?.region ? 1 : within(elapsed, 600);
      // One target → one target: the hole glides; otherwise the holes move with the camera.
      spotRegion = prevSingle && targets.length === 1 ? lerpRegion(prev.region, region, e) : region;
    } else if (phase === 'focus') {
      const e = easeInOut(within(elapsed, 1000));
      view = lerpView(OVERVIEW_VIEW, focusView, e);
      spotlight = within(elapsed, 600);
    } else if (
      ['point', 'narrate', 'action', 'done'].includes(phase) ||
      (phase === 'exit' && isClick)
    ) {
      view = focusView;
      spotlight = 1;
    } else if (phase === 'exit') {
      const e = easeInOut(within(elapsed, 1000));
      view = lerpView(focusView, OVERVIEW_VIEW, e);
      spotlight = 1 - within(elapsed, 600);
    }
  }

  // Whole-stage enter/exit transform (grow from the clicked button / dive in).
  ctx.save();
  let stageAlpha = 1;
  if (phase === 'enter') {
    const q = clamp01(elapsed / 750);
    const origin = layer.enterOrigin;
    if (origin) {
      const e = 1 - Math.pow(1 - q, 3);
      const scale = lerp(0.06, 1, e);
      stageAlpha = clamp01(q / 0.55);
      const ox = stage.x + (origin.x / 100) * stage.w;
      const oy = stage.y + (origin.y / 100) * stage.h;
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      ctx.translate(-ox, -oy);
    } else {
      const e = easeOut(within(elapsed, 650));
      const scale = lerp(0.97, 1, e);
      stageAlpha = e;
      const cx = stage.x + stage.w / 2;
      const cy = stage.y + stage.h / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
  } else if (phase === 'exit' && isClick) {
    const q = clamp01(elapsed / 500);
    const e = q * q * q;
    // Dive into the LAST target clicked.
    const ox = stage.x + (clickPoints[lastClick].x / 100) * stage.w;
    const oy = stage.y + (clickPoints[lastClick].y / 100) * stage.h;
    ctx.translate(ox, oy);
    ctx.scale(lerp(1, 1.35, e), lerp(1, 1.35, e));
    ctx.translate(-ox, -oy);
    stageAlpha = 1 - e;
  } else if (phase === 'exit') {
    stageAlpha = 1 - easeOut(within(elapsed, 600)); // look step: fade while the next screen grows
  }
  ctx.globalAlpha = stageAlpha;

  // Screenshot through the camera, clipped to the rounded stage.
  ctx.save();
  roundRectPath(ctx, stage.x, stage.y, stage.w, stage.h, 16);
  ctx.fillStyle = COLORS.stageBackground;
  ctx.fill();
  ctx.clip();
  // Best scaling filter: screenshots are usually much larger than the stage,
  // and the default (low) filter makes small text blurry / jagged.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const drawThroughCamera = (img) =>
    ctx.drawImage(
      img,
      stage.x + (view.tx / 100) * stage.w,
      stage.y + (view.ty / 100) * stage.h,
      stage.w * view.s,
      stage.h * view.s,
    );
  drawThroughCamera(image.img);
  // Another screenshot of the same Global Step: the previous one fades out on
  // top, through the SAME moving camera — one page changing state, no cut.
  if (layer.fadeFrom && layer.fadeElapsed < WALKTHROUGH_TIMING.crossfade) {
    ctx.save();
    ctx.globalAlpha =
      stageAlpha * (1 - easeInOut(within(layer.fadeElapsed, WALKTHROUGH_TIMING.crossfade)));
    drawThroughCamera(layer.fadeFrom.img);
    ctx.restore();
  }

  if (region && spotlight > 0) {
    // One hole per target (a single target keeps its gliding spotRegion).
    const holes = (targets.length === 1 ? [spotRegion] : targets).map((t) =>
      toPixels(stage, projectRegion(t, view), SPOTLIGHT_PADDING),
    );

    // Dim everything except the targets (even-odd fill = rectangle with holes).
    ctx.save();
    ctx.globalAlpha = stageAlpha * spotlight;
    ctx.beginPath();
    ctx.rect(stage.x, stage.y, stage.w, stage.h);
    for (const hole of holes) roundRectPath(ctx, hole.x, hole.y, hole.w, hole.h, 12, true);
    ctx.fillStyle = COLORS.dim;
    ctx.fill('evenodd');

    // Rings: pulsing glow while explaining, flash on the target being clicked.
    const pulse = 0.5 + 0.5 * Math.sin((time / 1600) * Math.PI * 2);
    ctx.shadowColor = 'rgba(21, 112, 239, 0.65)';
    ctx.shadowBlur = 14 + 14 * pulse;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.accent;
    for (const hole of holes) {
      roundRectPath(ctx, hole.x, hole.y, hole.w, hole.h, 12);
      ctx.stroke();
    }
    const hole = holes[Math.min(clickIndex, holes.length - 1)];
    if (phase === 'action' && isClick && pressElapsed >= 0) {
      const q = clamp01(pressElapsed / 450);
      const grow = 18 * easeOut(q);
      ctx.globalAlpha = stageAlpha * (1 - q);
      ctx.shadowColor = 'transparent';
      roundRectPath(
        ctx,
        hole.x - grow,
        hole.y - grow,
        hole.w + grow * 2,
        hole.h + grow * 2,
        12 + grow,
      );
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }
  // 'type' steps: the value is typed into the field (same as the live player).
  if (region && step.action === 'type' && ['narrate', 'action', 'done'].includes(phase)) {
    const value = step.typeValue || '';
    const stepMs = value ? Math.min(TYPE_CHAR_MS, TYPE_MAX_MS / value.length) : 0;
    const typed = phase === 'narrate' ? Math.floor(elapsed / (stepMs || 1)) : value.length;
    for (const target of targets) {
      drawTypingField(ctx, {
        box: toPixels(stage, projectRegion(target, view)),
        value: value.slice(0, Math.min(value.length, typed)),
        time,
        alpha: stageAlpha * (phase === 'narrate' ? easeOut(within(elapsed, 300)) : 1),
      });
    }
  }
  ctx.restore(); // clip

  // Pointer (click steps).
  const cursorGlides = phase === 'focus' && layer.continued;
  if (isClick && (cursorGlides || ['point', 'narrate', 'action', 'done', 'exit'].includes(phase))) {
    let pos = clickPoint;
    let alpha = 1;
    if (cursorGlides) {
      // Pointer travels with the camera from the previous button to this one.
      const prevTargets = getStepTargets(prev);
      const from = isClickStep(prev)
        ? regionCenter(projectRegion(prevTargets[prevTargets.length - 1], prevView))
        : CURSOR_START;
      const e = easeInOut(within(elapsed, 1000));
      pos = { x: lerp(from.x, clickPoint.x, e), y: lerp(from.y, clickPoint.y, e) };
      alpha = isClickStep(prev) ? 1 : within(elapsed, 300);
    } else if (phase === 'point') {
      const e = easeOut(within(elapsed, 900));
      pos = { x: lerp(CURSOR_START.x, clickPoint.x, e), y: lerp(CURSOR_START.y, clickPoint.y, e) };
      alpha = within(elapsed, 300);
    }
    let px = stage.x + (pos.x / 100) * stage.w;
    let py = stage.y + (pos.y / 100) * stage.h;
    let scale = 1;
    if (phase === 'narrate' || phase === 'done') {
      const bob = Math.sin((elapsed / 1400) * Math.PI * 2);
      px -= 1 + bob;
      py -= 2 + 2 * bob;
    }
    if (phase === 'action' && clickIndex > 0) {
      // Glide on from the previous target, then press.
      const from = clickPoints[clickIndex - 1];
      const e = easeOut(within(elapsed - clickIndex * WALKTHROUGH_TIMING.clickAction, 450));
      px = stage.x + (lerp(from.x, clickPoint.x, e) / 100) * stage.w;
      py = stage.y + (lerp(from.y, clickPoint.y, e) / 100) * stage.h;
    }
    if (phase === 'action' && pressElapsed >= 0) {
      drawRipples(ctx, px, py, pressElapsed);
      const q = clamp01(pressElapsed / 420);
      scale = q < 0.35 ? lerp(1, 0.78, q / 0.35) : lerp(0.78, 1, (q - 0.35) / 0.65);
    }
    drawCursor(ctx, px, py, scale, alpha * stageAlpha);
  }

  // Caption next to the feature, never covering it (same rule as the live
  // player: utils/captionPlacement, using the caption's real height).
  if (showCaption) {
    const captionWidth = captionWidthFor(stage, width, geo);
    const { height: captionHeight } = layoutCaption(ctx, {
      width: captionWidth,
      step,
      mobile: geo.mobile,
    });
    let cx = stage.x + stage.w / 2 - captionWidth / 2;
    let cy = stage.y + stage.h - 150;
    if (region) {
      const placed = placeCaption({
        anchor: toPixels(stage, projectRegion(region, focusView)),
        size: { w: captionWidth, h: captionHeight },
        bounds: captionBounds(width, height, geo),
        gap: CAPTION_GAP,
      });
      cx = placed.x;
      cy = placed.y;
    }
    const lift = phase === 'narrate' ? 10 * (1 - captionAlpha) : 0;
    drawCaption(ctx, {
      x: cx,
      y: cy + lift,
      width: captionWidth,
      stepNumber,
      step,
      mobile: geo.mobile,
      part: geo.mobile ? captionPartFor(step, phase, elapsed) : 0,
      alpha: captionAlpha * stageAlpha,
    });
  }
  ctx.restore(); // stage transform
}

/**
 * The progress bar: one continuous fill across a segment per step (2px gaps
 * where steps begin), like the player's timeline.
 * @param {number[] | null} starts  ms at which each step begins
 */
function drawProgressBar(ctx, width, height, time, total, starts, geo) {
  const x = geo.bar.x;
  const w = width - geo.bar.x * 2;
  const y = height - geo.bar.bottom;
  const fraction = total ? clamp01(time / total) : 0;
  const edges = starts && total ? [...starts.map((t) => t / total), 1] : [0, 1];
  for (let k = 0; k < edges.length - 1; k++) {
    const left = x + w * edges[k];
    const right = x + w * edges[k + 1] - (k < edges.length - 2 ? 2 : 0);
    if (right - left < 1) continue;
    roundRectPath(ctx, left, y - 2, right - left, 4, 2);
    ctx.fillStyle = '#2A2A31';
    ctx.fill();
    const played = Math.min(right, x + w * fraction) - left;
    if (played <= 0) continue;
    roundRectPath(ctx, left, y - 2, Math.max(4, played), 4, 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
  }
}

// ─── Steps panel (same content as the player's StepList) ────────────────────

const PANEL = {
  w: 300,
  margin: 24,
  top: 60,
  bottom: 48,
  header: 40,
  row: 68,
  thumbW: 88,
  thumbH: 55,
};
/** Readable accent on the dark panel (heading of the current step). */
const ACCENT_TEXT = '#A5A0FF';

/** ms at which each step begins, from the timeline (cached per timeline). */
const startsCache = new WeakMap();
function stepStarts(segments, count) {
  let starts = startsCache.get(segments);
  if (!starts) {
    starts = Array.from(
      { length: count },
      (_, k) => segments.find((s) => s.stepIndex === k)?.start ?? 0,
    );
    startsCache.set(segments, starts);
  }
  return starts;
}

/** Step numbers + headings (cached per step list). */
const titlesCache = new WeakMap();
function titlesOf(steps) {
  let titles = titlesCache.get(steps);
  if (!titles) {
    titles = getStepTitles(steps);
    titlesCache.set(steps, titles);
  }
  return titles;
}

/** A small, pre-scaled copy of a screenshot (cover, top-aligned), made once. */
const thumbCache = new WeakMap();
function thumbnailOf(img) {
  let thumb = thumbCache.get(img);
  if (!thumb) {
    const scale = 2; // sharp when the frame is scaled up
    thumb = document.createElement('canvas');
    thumb.width = PANEL.thumbW * scale;
    thumb.height = PANEL.thumbH * scale;
    const c = thumb.getContext('2d');
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const cover = Math.max(thumb.width / iw, thumb.height / ih);
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, (thumb.width - iw * cover) / 2, 0, iw * cover, ih * cover);
    thumbCache.set(img, thumb);
  }
  return thumb;
}

/** One line cut to maxWidth with "…" (for a single word longer than the line). */
function clipLine(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/**
 * The steps panel: thumbnail, heading (2 lines, then …) and "Step 4.1 · 0:08"
 * per step; the current step highlighted and scrolled to the middle (a short
 * glide when a step begins).
 * Currently not drawn in the video (disabled in renderFrame, kept for later).
 */
// eslint-disable-next-line no-unused-vars
function drawStepsPanel(ctx, { x, height, steps, images, index, time, starts }) {
  const titles = titlesOf(steps);
  const y = PANEL.top;
  const w = PANEL.w;
  const h = height - PANEL.top - PANEL.bottom;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = COLORS.stageBackground;
  ctx.fill();
  ctx.strokeStyle = COLORS.captionBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = COLORS.textStrong;
  ctx.fillText('Steps', x + 16, y + PANEL.header / 2);
  const labelWidth = ctx.measureText('Steps ').width;
  ctx.font = `400 14px ${FONT}`;
  ctx.fillStyle = COLORS.textFaint;
  ctx.fillText(String(steps.length), x + 16 + labelWidth, y + PANEL.header / 2);
  ctx.fillStyle = COLORS.captionBorder;
  ctx.fillRect(x, y + PANEL.header, w, 1);

  // List (clipped), scrolled so the current step sits in the middle.
  const listY = y + PANEL.header + 6;
  const listH = h - PANEL.header - 12;
  const maxScroll = Math.max(0, steps.length * PANEL.row - listH);
  const scrollFor = (k) =>
    Math.max(0, Math.min(maxScroll, k * PANEL.row - (listH - PANEL.row) / 2));
  const glide = easeInOut(within(time - starts[index], 500));
  const scroll = lerp(scrollFor(Math.max(0, index - 1)), scrollFor(index), index > 0 ? glide : 1);
  ctx.beginPath();
  ctx.rect(x, listY, w, listH);
  ctx.clip();

  const textX = x + 14 + PANEL.thumbW + 12;
  const textW = x + w - 14 - textX;
  steps.forEach((step, k) => {
    const rowY = listY + k * PANEL.row - scroll;
    if (rowY + PANEL.row < listY || rowY > listY + listH) return;
    const active = k === index;
    const { number, heading } = titles[k];
    if (active) {
      roundRectPath(ctx, x + 6, rowY + 2, w - 12, PANEL.row - 4, 10);
      ctx.fillStyle = 'rgba(21, 112, 239, 0.16)';
      ctx.fill();
    }

    // Thumbnail
    const tx = x + 14;
    const ty = rowY + (PANEL.row - PANEL.thumbH) / 2;
    ctx.save();
    roundRectPath(ctx, tx, ty, PANEL.thumbW, PANEL.thumbH, 6);
    ctx.fillStyle = COLORS.background;
    ctx.fill();
    const image = images[step.id];
    if (image) {
      ctx.clip();
      ctx.drawImage(thumbnailOf(image.img), tx, ty, PANEL.thumbW, PANEL.thumbH);
    } else {
      ctx.font = `700 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.textFaint;
      ctx.fillText(number, tx + PANEL.thumbW / 2, ty + PANEL.thumbH / 2);
    }
    ctx.restore();
    roundRectPath(ctx, tx, ty, PANEL.thumbW, PANEL.thumbH, 6);
    ctx.strokeStyle = active ? COLORS.accent : COLORS.captionBorder;
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    // Heading (2 lines, then …) + "Step 4.1 · 0:08"
    ctx.textAlign = 'left';
    ctx.font = `600 13px ${FONT}`;
    const lines = wrapText(ctx, heading || `Step ${number}`, textW, 2).map((line) =>
      clipLine(ctx, line, textW),
    );
    const blockH = lines.length * 17 + 16;
    let lineY = rowY + (PANEL.row - blockH) / 2 + 8;
    ctx.fillStyle = active ? ACCENT_TEXT : COLORS.textStrong;
    for (const line of lines) {
      ctx.fillText(line, textX, lineY);
      lineY += 17;
    }
    ctx.font = `400 11px ${FONT}`;
    ctx.fillStyle = COLORS.textFaint;
    const meta = `${heading ? `Step ${number} · ` : ''}${formatTime(starts[k])}`;
    ctx.fillText(clipLine(ctx, meta, textW), textX, lineY + 1);
  });
  ctx.restore();
}
