/**
 * @file Draws one video frame of the walkthrough onto a <canvas>.
 *
 * WHY A CANVAS RE-IMPLEMENTATION (instead of recording the page)
 *   Browsers can't screen-record a page without asking the user to pick a
 *   screen/tab. A canvas can be recorded silently with captureStream(), so the
 *   player's visuals are redrawn here with the 2D API:
 *     camera zoom · spotlight · pulsing ring · pointer + click ripples · caption.
 *   The maths (utils/camera.js) and timing (WALKTHROUGH_TIMING) are shared with
 *   the live player, so the video matches what people see on screen.
 *
 * COORDINATES: regions/views are in % of the stage (see utils/camera.js);
 * `stage` below is the stage rectangle in canvas pixels.
 */

import { OVERVIEW_VIEW, computeFocusView, focusedCenter, projectRegion } from '@/utils/camera';
import { isClickStep } from './timeline';

/** @typedef {import('./timeline').TimelineSegment} TimelineSegment */

// ─── Look & feel (mirrors tailwind.config.js / index.css) ───────────────────
const COLORS = {
  background: '#08080A',
  stageBackground: '#141418',
  accent: '#635BFF',
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

/** Splits text into lines no wider than maxWidth (max `maxLines`, with …). */
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = (text || '').split(/\s+/).filter(Boolean);
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
    { delay: 60, radius: 32, width: 0, color: 'rgba(99,91,255,0.5)', fill: true },
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

/** Caption card: number badge, label, description. Returns nothing. */
function drawCaption(ctx, { x, y, width, stepNumber, label, text, alpha }) {
  const pad = 18;
  const badge = 28;
  const textX = x + pad + badge + 12;
  const textWidth = width - (textX - x) - pad;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 17px ${FONT}`;
  const labelLines = label ? wrapText(ctx, label, textWidth, 2) : [];
  ctx.font = `400 15px ${FONT}`;
  const textLines = text ? wrapText(ctx, text, textWidth, 3) : [];
  const height = pad * 2 + Math.max(badge, labelLines.length * 22 + textLines.length * 21);

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
  ctx.font = `600 17px ${FONT}`;
  ctx.fillStyle = COLORS.textStrong;
  for (const line of labelLines) {
    ctx.fillText(line, textX, lineY);
    lineY += 22;
  }
  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = COLORS.textSoft;
  for (const line of textLines) {
    ctx.fillText(line, textX, lineY);
    lineY += 21;
  }
  ctx.restore();
  return height;
}

// ─── Frame ───────────────────────────────────────────────────────────────────

/**
 * Draws the frame for one moment of the timeline.
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
 * }} frame
 */
export function renderFrame(ctx, frame) {
  const { width, height, title, steps, images, segment, elapsed, time } = frame;
  const step = steps[segment.stepIndex];
  const phase = segment.phase;

  // Background + header
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = COLORS.textStrong;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, 40, 34);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(`Step ${segment.stepIndex + 1} / ${steps.length}`, width - 40, 34);
  drawProgressDots(ctx, width, height, steps.length, segment.stepIndex);

  const showCaption = ['narrate', 'action', 'done'].includes(phase);
  const captionAlpha = phase === 'narrate' ? easeOut(within(elapsed, 450)) : 1;
  const image = images[step.id];

  // Text-only step
  if (!image) {
    const cardWidth = Math.min(620, width - 120);
    const enterAlpha = phase === 'enter' ? easeOut(within(elapsed, 650)) : 1;
    drawCaption(ctx, {
      x: (width - cardWidth) / 2,
      y: height / 2 - 60,
      width: cardWidth,
      stepNumber: segment.stepIndex + 1,
      label: step.label,
      text: step.text,
      alpha: enterAlpha * (phase === 'exit' ? 1 - within(elapsed, 450) : 1),
    });
    return;
  }

  // Stage rectangle: largest box with the image's ratio inside the frame.
  const area = { x: 40, y: 68, w: width - 80, h: height - 68 - 56 };
  const stageW = Math.min(area.w, area.h * image.ratio);
  const stageH = stageW / image.ratio;
  const stage = {
    x: area.x + (area.w - stageW) / 2,
    y: area.y + (area.h - stageH) / 2,
    w: stageW,
    h: stageH,
  };

  const region = step.region;
  const isClick = isClickStep(step);
  const focusView = region ? computeFocusView(region) : OVERVIEW_VIEW;
  const clickPoint = region ? focusedCenter(region) : null;

  // Camera view + spotlight strength for this phase.
  let view = OVERVIEW_VIEW;
  let spotlight = 0;
  if (region) {
    if (phase === 'focus') {
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
    const origin = segment.enterOrigin;
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
    const ox = stage.x + (clickPoint.x / 100) * stage.w;
    const oy = stage.y + (clickPoint.y / 100) * stage.h;
    ctx.translate(ox, oy);
    ctx.scale(lerp(1, 1.35, e), lerp(1, 1.35, e));
    ctx.translate(-ox, -oy);
    stageAlpha = 1 - e;
  }
  ctx.globalAlpha = stageAlpha;

  // Screenshot through the camera, clipped to the rounded stage.
  ctx.save();
  roundRectPath(ctx, stage.x, stage.y, stage.w, stage.h, 16);
  ctx.fillStyle = COLORS.stageBackground;
  ctx.fill();
  ctx.clip();
  ctx.drawImage(
    image.img,
    stage.x + (view.tx / 100) * stage.w,
    stage.y + (view.ty / 100) * stage.h,
    stage.w * view.s,
    stage.h * view.s,
  );

  if (region && spotlight > 0) {
    const hole = toPixels(stage, projectRegion(region, view), SPOTLIGHT_PADDING);

    // Dim everything except the feature (even-odd fill = rectangle with a hole).
    ctx.save();
    ctx.globalAlpha = stageAlpha * spotlight;
    ctx.beginPath();
    ctx.rect(stage.x, stage.y, stage.w, stage.h);
    roundRectPath(ctx, hole.x, hole.y, hole.w, hole.h, 12, true);
    ctx.fillStyle = COLORS.dim;
    ctx.fill('evenodd');

    // Ring: pulsing glow while explaining, flash on click.
    const pulse = 0.5 + 0.5 * Math.sin((time / 1600) * Math.PI * 2);
    ctx.shadowColor = 'rgba(99, 91, 255, 0.65)';
    ctx.shadowBlur = 14 + 14 * pulse;
    roundRectPath(ctx, hole.x, hole.y, hole.w, hole.h, 12);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.accent;
    ctx.stroke();
    if (phase === 'action' && isClick) {
      const q = clamp01(elapsed / 450);
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
  ctx.restore(); // clip

  // Pointer (click steps).
  if (isClick && ['point', 'narrate', 'action', 'done', 'exit'].includes(phase)) {
    let pos = clickPoint;
    let alpha = 1;
    if (phase === 'point') {
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
    if (phase === 'action') {
      drawRipples(ctx, px, py, elapsed);
      const q = clamp01(elapsed / 420);
      scale = q < 0.35 ? lerp(1, 0.78, q / 0.35) : lerp(0.78, 1, (q - 0.35) / 0.65);
    }
    drawCursor(ctx, px, py, scale, alpha * stageAlpha);
  }

  // Caption, placed below the feature when there's room, else above.
  if (showCaption) {
    const captionWidth = Math.min(420, stage.w * 0.8);
    let cx = stage.x + stage.w / 2 - captionWidth / 2;
    let cy = stage.y + stage.h - 150;
    if (region) {
      const anchor = toPixels(stage, projectRegion(region, focusView));
      const centerX = anchor.x + anchor.w / 2;
      cx = Math.min(
        stage.x + stage.w - captionWidth - 12,
        Math.max(stage.x + 12, centerX - captionWidth / 2),
      );
      const spaceBelow = stage.y + stage.h - (anchor.y + anchor.h);
      cy =
        spaceBelow > 150 ? anchor.y + anchor.h + 18 : Math.max(stage.y + 12, anchor.y - 18 - 120);
    }
    const lift = phase === 'narrate' ? 10 * (1 - captionAlpha) : 0;
    drawCaption(ctx, {
      x: cx,
      y: cy + lift,
      width: captionWidth,
      stepNumber: segment.stepIndex + 1,
      label: step.label,
      text: step.text,
      alpha: captionAlpha * stageAlpha,
    });
  }
  ctx.restore(); // stage transform
}

function drawProgressDots(ctx, width, height, count, current) {
  const y = height - 26;
  const gap = 8;
  const widths = Array.from({ length: count }, (_, i) => (i === current ? 32 : 8));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (count - 1);
  let x = (width - total) / 2;
  widths.forEach((w, i) => {
    roundRectPath(ctx, x, y - 4, w, 8, 4);
    ctx.fillStyle = i === current ? COLORS.accent : i < current ? 'rgba(99,91,255,0.5)' : '#2A2A31';
    ctx.fill();
    x += w + gap;
  });
}
