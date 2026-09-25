/**
 * @file Renders ONE walkthrough step for a given animation phase.
 * Purely presentational: WalkthroughPlayer decides the phase, this file
 * decides what each phase LOOKS like.
 *
 * LAYERS (bottom → top, all inside a box with the screenshot's exact ratio)
 *   camera     the screenshot; zoomed/panned with a CSS transform (camera.js)
 *   spotlight  a rounded "hole" over the feature; a huge box-shadow dims the rest
 *   ring       pulsing accent border around the feature (+ flash on click)
 *   cursor     animated mouse pointer that glides in and clicks  ('click' steps)
 *   caption    step number, label, text, "speaking" indicator
 *
 * WHAT EACH PHASE SHOWS
 *   enter     screenshot appears (grows out of the previous click, or fades in)
 *   overview  full screenshot, no highlight — "this is the page"
 *   focus     camera zooms into the feature, everything else dims
 *   point     pointer glides onto the feature                     (click only)
 *   narrate   caption + voice; ring pulses; pointer hovers
 *   action    click: pointer presses, ripple, ring flash · look: hold
 *   exit      click: dive into the feature · look: zoom back out
 *   done      final frame, waiting for the user
 *
 * Overlays are positioned OUTSIDE the scaled camera (using projectRegion), so
 * borders, the pointer and text stay sharp at any zoom level.
 */

import { Mic, Volume2 } from 'lucide-react';
import { formatDuration } from '@/utils';
import {
  OVERVIEW_VIEW,
  cameraTransform,
  computeFocusView,
  focusedCenter,
  projectRegion,
} from '@/utils/camera';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */
/** @typedef {import('@/types').Region} Region */

const FOCUSED_PHASES = ['focus', 'point', 'narrate', 'action', 'done'];
const CURSOR_PHASES = ['point', 'narrate', 'action', 'done', 'exit'];
const CAPTION_PHASES = ['narrate', 'action', 'done'];
/** Pointer starts off-screen at the bottom-right, like a real mouse coming in. */
const CURSOR_START = { x: 96, y: 112 };
/** Extra room around the feature so the spotlight doesn't cut its edges (px). */
const SPOTLIGHT_PADDING = 6;

/** Region (stage %) → CSS box, optionally padded by `pad` px on every side. */
function boxStyle(r, pad = 0) {
  return {
    left: `calc(${r.x}% - ${pad}px)`,
    top: `calc(${r.y}% - ${pad}px)`,
    width: `calc(${r.w}% + ${pad * 2}px)`,
    height: `calc(${r.h}% + ${pad * 2}px)`,
  };
}

/**
 * @param {{
 *   step: WalkthroughStep,
 *   stepNumber: number,
 *   phase: string,
 *   width: number,                 // stage size in px (already fitted to the ratio)
 *   height: number,
 *   enterOrigin: { x: number, y: number } | null,   // stage % the step grows from
 *   narration: { mode: string, speaking: boolean, current: number, duration: number },
 *   floatingCaption: boolean,      // false on small screens → player docks it below
 *   continued?: boolean,         // same screenshot as the previous step: camera glides, no re-entry
 * }} props
 */
export function WalkthroughStage({
  step,
  stepNumber,
  phase,
  width,
  height,
  enterOrigin,
  narration,
  floatingCaption,
  continued = false,
}) {
  const region = step.region;
  const isClick = !!region && step.action !== 'look';

  // ── Camera ──
  const focusView = region ? computeFocusView(region) : OVERVIEW_VIEW;
  const isFocused = !!region && (FOCUSED_PHASES.includes(phase) || (phase === 'exit' && isClick));
  const view = isFocused ? focusView : OVERVIEW_VIEW;
  const projected = region ? projectRegion(region, view) : null;
  const clickPoint = region ? focusedCenter(region) : null;

  // ── Stage enter / exit animation ──
  let stageAnimation = '';
  let stageOrigin = '50% 50%';
  if (phase === 'enter') {
    stageAnimation = enterOrigin ? 'hs-stage-emerge' : 'hs-stage-fade-in';
    if (enterOrigin) stageOrigin = `${enterOrigin.x}% ${enterOrigin.y}%`;
  } else if (phase === 'exit' && isClick) {
    stageAnimation = 'hs-stage-exit-click';
    stageOrigin = `${clickPoint.x}% ${clickPoint.y}%`;
  } else if (phase === 'exit') {
    stageAnimation = 'hs-stage-exit-fade';
  }

  // ── Pointer ──
  // On a continued screenshot the pointer travels WITH the camera during focus.
  const showCursor = isClick && (CURSOR_PHASES.includes(phase) || (continued && phase === 'focus'));
  const isPressing = isClick && phase === 'action';

  // ── Caption ──
  const showCaption = CAPTION_PHASES.includes(phase);

  return (
    <div
      className={`relative ${stageAnimation}`}
      style={{ width, height, transformOrigin: stageOrigin }}
    >
      <div className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/10 dark:ring-white/10 bg-paper-2 dark:bg-paper-2-dark">
        {/* Camera: the screenshot itself */}
        <div className="hs-camera absolute inset-0" style={{ transform: cameraTransform(view) }}>
          <img
            src={step.imageData}
            alt={step.label}
            className="w-full h-full select-none"
            draggable={false}
          />
        </div>

        {region && (
          <>
            {/* Spotlight: dims everything except the feature */}
            <div
              className="hs-follow-camera absolute rounded-xl pointer-events-none"
              style={{
                ...boxStyle(projected, SPOTLIGHT_PADDING),
                boxShadow: '0 0 0 200vmax rgba(8, 10, 14, 0.62)',
                opacity: isFocused ? 1 : 0,
              }}
            />
            {/* Ring: pulses while explaining, flashes on click */}
            <div
              key={isPressing ? 'ring-press' : 'ring'}
              className={`hs-follow-camera absolute rounded-xl border-[3px] border-accent pointer-events-none ${
                isPressing ? 'hs-ring-flash' : isFocused ? 'hs-ring-pulse' : ''
              }`}
              style={{ ...boxStyle(projected, SPOTLIGHT_PADDING), opacity: isFocused ? 1 : 0 }}
            />
          </>
        )}

        {isClick && (
          <AnimatedCursor
            x={showCursor ? clickPoint.x : CURSOR_START.x}
            y={showCursor ? clickPoint.y : CURSOR_START.y}
            visible={showCursor}
            pressing={isPressing}
          />
        )}
      </div>

      {showCaption && floatingCaption && (
        <FloatingCaption
          anchor={region ? projectRegion(region, focusView) : null}
          stageHeight={height}
        >
          <CaptionContent step={step} stepNumber={stepNumber} narration={narration} />
        </FloatingCaption>
      )}
    </div>
  );
}

/**
 * Mouse pointer whose TIP sits exactly at (x, y) % of the stage.
 * Moves with a CSS transition; presses + ripples when `pressing`.
 */
function AnimatedCursor({ x, y, visible, pressing }) {
  return (
    <div
      className="hs-cursor absolute pointer-events-none z-10"
      style={{ left: `${x}%`, top: `${y}%`, opacity: visible ? 1 : 0 }}
    >
      {pressing && (
        <>
          <span className="hs-ripple absolute left-0 top-0 w-28 h-28 rounded-full border-[5px] border-accent" />
          <span
            className="hs-ripple absolute left-0 top-0 w-28 h-28 rounded-full border-4 border-white"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="hs-ripple absolute left-0 top-0 w-16 h-16 rounded-full bg-accent/50"
            style={{ animationDelay: '60ms' }}
          />
        </>
      )}
      <div
        key={pressing ? 'press' : 'idle'}
        className={pressing ? 'hs-cursor-press' : 'hs-cursor-idle'}
        style={{ transformOrigin: '0 0' }}
      >
        {/* Arrow pointer; path tip is at (3,2) → offset so the tip is at (x, y) */}
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          className="-ml-[4px] -mt-[3px] drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]"
          aria-hidden="true"
        >
          <path
            d="M3 2 L3 19.5 L7.8 15.2 L11 22 L14.2 20.6 L11.1 13.9 L17.6 13.9 Z"
            fill="#ffffff"
            stroke="#111827"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Positions the caption next to the feature: below it when there's room,
 * otherwise above. Without a region it sits at the bottom of the stage.
 */
function FloatingCaption({ anchor, stageHeight, children }) {
  let style;
  if (!anchor) {
    style = { left: '50%', bottom: '4%', transform: 'translateX(-50%)' };
  } else {
    const centerX = Math.min(80, Math.max(20, anchor.x + anchor.w / 2));
    const spaceBelowPx = ((100 - (anchor.y + anchor.h)) / 100) * stageHeight;
    const placeBelow = spaceBelowPx > 130;
    style = placeBelow
      ? { left: `${centerX}%`, top: `calc(${anchor.y + anchor.h}% + 18px)` }
      : { left: `${centerX}%`, bottom: `calc(${100 - anchor.y}% + 18px)` };
    style.transform = 'translateX(-50%)';
  }

  return (
    <div className="absolute z-20 w-[min(380px,88%)]" style={style}>
      <div className="hs-caption-in">{children}</div>
    </div>
  );
}

/**
 * The caption card: numbered badge, label, description, speaking indicator.
 * Exported so the player can dock it under the stage on small screens.
 */
export function CaptionContent({ step, stepNumber, narration, compact = false }) {
  if (compact) {
    // Small embeds: one tight row, text clamped to two lines.
    return (
      <div className="flex items-start gap-2 rounded-xl bg-panel/95 dark:bg-panel-dark/95 backdrop-blur-md border border-line dark:border-line-dark shadow-xl px-2.5 py-2">
        <span className="w-5 h-5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {stepNumber}
        </span>
        <p className="text-xs leading-snug text-ink dark:text-ink-soft-dark line-clamp-2">
          {step.label && <strong className="font-semibold">{step.label}. </strong>}
          {step.text}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-panel/95 dark:bg-panel-dark/95 backdrop-blur-md border border-line dark:border-line-dark shadow-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {stepNumber}
        </span>
        <div className="min-w-0 flex-1">
          {step.label && (
            <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark leading-snug">
              {step.label}
            </p>
          )}
          {step.text && (
            <p className="text-sm text-ink-soft dark:text-ink-soft-dark leading-relaxed mt-0.5">
              {step.text}
            </p>
          )}
        </div>
      </div>
      {narration.mode !== 'none' && (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-ink-faint dark:text-ink-faint-dark">
          {narration.mode === 'recorded' ? (
            <Mic className="w-3.5 h-3.5 text-teal dark:text-teal-dark" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-violet dark:text-violet-dark" />
          )}
          <SpeakingBars active={narration.speaking} />
          {narration.mode === 'recorded' && narration.duration > 0 && (
            <span className="font-mono">
              {formatDuration(narration.current)} / {formatDuration(narration.duration)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Little equalizer that moves while the voice is playing. */
function SpeakingBars({ active }) {
  return (
    <span className="flex items-end gap-[3px] h-3.5" aria-hidden="true">
      {[0, 150, 300, 450].map((delay) => (
        <span
          key={delay}
          className={`w-[3px] h-full rounded-full bg-accent ${active ? 'hs-eq-bar' : 'opacity-40 scale-y-50'}`}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Stage for a step WITHOUT a screenshot (text/voice only).
 * @param {{ step: WalkthroughStep, stepNumber: number, narration: object }} props
 */
export function TextOnlyStage({ step, stepNumber, narration }) {
  return (
    <div className="hs-stage-fade-in w-[min(560px,100%)]">
      <CaptionContent step={step} stepNumber={stepNumber} narration={narration} />
    </div>
  );
}
