/**
 * @file Renders ONE walkthrough step for a given animation phase.
 * Purely presentational: WalkthroughPlayer decides the phase, this file
 * decides what each phase LOOKS like.
 *
 * LAYERS (bottom → top, all inside a box with the screenshot's exact ratio)
 *   camera     the screenshot; zoomed/panned with a transform (camera.js).
 *              Sub-steps of one Global Step are one page: when the screenshot
 *              changes, the new one crossfades in INSIDE the gliding camera.
 *   focus      ONE persistent focus for the page (FocusCamera): a dim with a
 *              rounded hole + a pulsing accent ring per target. Between steps
 *              of the same page it is never recreated or faded: its geometry
 *              morphs to the next target, on the same clock as the camera.
 *   cursor     animated mouse pointer that glides in and clicks  ('click' steps;
 *              with several targets it clicks them one after another)
 *   typing     the value being typed into the area, with a caret  ('type' steps)
 *   caption    step number, label, text, "speaking" indicator. Mobile view:
 *              a long text is shown in parts (utils/captionParts), each while
 *              the voice says it — never cut off with "…"
 *
 * WHAT EACH PHASE SHOWS
 *   enter     screenshot appears (grows out of the previous click, or fades in)
 *   overview  full screenshot, no highlight — "this is the page"
 *   focus     camera zooms into the feature, everything else dims; on the same
 *             page the focus morphs from the previous target to this one
 *   point     pointer glides onto the feature                     (click only)
 *   narrate   caption + voice; ring pulses; pointer hovers
 *   narrate   … 'type' steps: the value starts typing into the area
 *   action    click: pointer presses, ripple, ring flash · look / type: hold
 *   exit      click: dive into the feature · look: zoom back out
 *   done      final frame, waiting for the user
 *
 * Overlays are positioned OUTSIDE the scaled camera (using projectRegion), so
 * borders, the pointer and text stay sharp at any zoom level.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { formatDuration } from '@/utils';
import { captionAwareView, placeCaption } from '@/utils/captionPlacement';
import { getFocusRegion, getStepTargets, isClickAction } from '@/utils/course';
import { splitCaptionParts } from '@/utils/captionParts';
import { WALKTHROUGH_TIMING } from '@/constants';
import { pacedTiming } from '@/utils/pace';
import {
  OVERVIEW_VIEW,
  computeFocusView,
  projectRegion,
  regionCenter,
  glideMs,
} from '@/utils/camera';
import { FocusCamera } from './FocusCamera';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */
/** @typedef {import('@/types').Region} Region */

const FOCUSED_PHASES = ['focus', 'point', 'narrate', 'action', 'done'];
const CURSOR_PHASES = ['point', 'narrate', 'action', 'done', 'exit'];
const CAPTION_PHASES = ['narrate', 'action', 'done'];
/** 'type' steps: the typed value is shown in these phases (typing starts at narrate). */
const TYPING_PHASES = ['narrate', 'action', 'done'];
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
 *   fromRegion?: import('@/types').Region | null,  // continued: the previous step's area (the
 *                                // caption enters from the direction the focus came from)
 *   pace?: number,               // the course's pace: camera and pointer move slower/faster
 *   areaSize?: { width: number, height: number },  // the box the stage is centred in; the
 *                                                  // caption may use its free space too
 *   compactCaption?: boolean,    // small embeds: the one-line caption card
 *   reserveBottom?: number,      // px at the bottom of the area the caption must avoid
 *                                // (the compact player's control bar)
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
  fromRegion = null,
  pace = 1,
  areaSize,
  compactCaption = false,
  reserveBottom = 0,
}) {
  // All targets are highlighted together; the camera frames the box around them.
  const targets = getStepTargets(step);
  const region = getFocusRegion(step);
  const isClick = !!region && isClickAction(step);
  const isType = !!region && step.action === 'type';

  // ── Caption size (measured up front by an invisible copy, see below) ──
  const captionLayout = floatingCaption
    ? getCaptionLayout({ width, height, areaSize, compact: compactCaption, reserveBottom })
    : null;
  const measureRef = useRef(null);
  const [captionSize, setCaptionSize] = useState(null);
  const measuring = floatingCaption && !!region;
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.offsetWidth, h: el.offsetHeight };
      setCaptionSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measuring]);

  // ── Camera ──
  // Normally the regular focus zoom; zoomed out only as far as needed when the
  // caption would otherwise have to cover the feature (utils/captionPlacement).
  const focusView = !region
    ? OVERVIEW_VIEW
    : measuring && captionSize
      ? captionAwareView({
          region,
          stage: { w: width, h: height },
          size: captionSize,
          bounds: captionLayout.bounds,
          gap: CAPTION_GAP_PX,
        })
      : computeFocusView(region);
  const isFocused = !!region && (FOCUSED_PHASES.includes(phase) || (phase === 'exit' && isClick));
  // The focus is ONE persistent object for the whole page (FocusCamera): on the
  // same page it is never faded out and rebuilt — its geometry morphs from the
  // previous target to this one (inward for a child, outward for a parent,
  // straight across for a sibling). Opacity only brings it in on a new screen.
  const ringOn = isFocused;
  // Motion system (index.css): enter = first focus on this screen; arrive = the
  // target receives attention once the focus has settled on it.
  const focusEntering = phase === 'focus' && !continued;
  const focusArriving = phase === (isClick ? 'point' : 'narrate');
  const ringMotion = focusEntering
    ? 'hs-focus-enter'
    : focusArriving
      ? 'hs-focus-arrive'
      : isFocused
        ? 'hs-ring-pulse'
        : '';
  // The dim fades in softly behind a first focus; quickly otherwise.
  const dimFade = focusEntering
    ? { '--hs-fade': '900ms', '--hs-fade-delay': '200ms' }
    : { '--hs-fade': '350ms' };

  // One move per step change, its length set by the course's pace.
  const glide = glideMs(pacedTiming(pace).focus);
  const view = isFocused ? focusView : OVERVIEW_VIEW;
  // The caption slides in from the direction the focus travelled (same page).
  const captionEnterFrom = (() => {
    if (!continued || !fromRegion || !region) return null;
    const a = regionCenter(fromRegion);
    const b = regionCenter(region);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: Math.round((-dx / len) * 14), y: Math.round((-dy / len) * 14) };
  })();
  const projectedTargets = targets.map((t) => projectRegion(t, view));
  // Where the pointer clicks: each target in turn (one target → its centre).
  const clickPoints = targets.map((t) => regionCenter(projectRegion(t, focusView)));
  const clickIndex = useClickSequence(phase, isClick ? clickPoints.length : 0);
  const clickPoint = clickPoints[clickIndex] ?? null;
  const [layers, onLayerLoaded] = useScreenCrossfade(step.imageData);

  // ── Stage enter / exit animation ──
  let stageAnimation = '';
  let stageOrigin = '50% 50%';
  if (phase === 'enter') {
    stageAnimation = enterOrigin ? 'hs-stage-emerge' : 'hs-stage-fade-in';
    if (enterOrigin) stageOrigin = `${enterOrigin.x}% ${enterOrigin.y}%`;
  } else if (phase === 'exit' && isClick) {
    // The next screen opens out of the LAST target clicked.
    const origin = clickPoints[clickPoints.length - 1];
    stageAnimation = 'hs-stage-exit-click';
    stageOrigin = `${origin.x}% ${origin.y}%`;
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
      style={{
        width,
        height,
        transformOrigin: stageOrigin,
        '--hs-glide': `${glide}ms`,
        '--hs-point': `${pacedTiming(pace).point}ms`,
      }}
    >
      <div className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/10 dark:ring-white/10 bg-paper-2 dark:bg-paper-2-dark">
        {/* Camera + the one persistent focus (spotlight holes and rings) */}
        <FocusCamera
          view={view}
          boxes={targets}
          duration={glide}
          width={width}
          height={height}
          padding={SPOTLIGHT_PADDING}
          visible={ringOn}
          fadeStyle={dimFade}
          ringClass={ringMotion}
          ringKey={String(clickIndex)}
          pressIndex={isPressing ? clickIndex : -1}
        >
          {/* Screenshot layers: a new screenshot of the same page fades in over
              the previous one INSIDE the moving camera (see useScreenCrossfade) */}
          {layers.map((layer, n) => (
            <img
              key={layer.key}
              src={layer.src}
              alt={n === layers.length - 1 ? step.label : ''}
              aria-hidden={n === layers.length - 1 ? undefined : 'true'}
              onLoad={() => onLayerLoaded(layer.key)}
              // A keyframe animation (not a transition) so the fade always plays,
              // even when a cached screenshot is ready in the very same frame.
              className={`absolute inset-0 w-full h-full select-none ${
                layer.shown && layer.key > 0 ? 'hs-screen-in' : ''
              }`}
              style={layer.shown ? undefined : { opacity: 0 }}
              draggable={false}
            />
          ))}
        </FocusCamera>

        {isType &&
          TYPING_PHASES.includes(phase) &&
          projectedTargets.map((box, n) => (
            <TypingField key={n} box={box} stageHeight={height} value={step.typeValue || ''} />
          ))}

        {isClick && (
          <AnimatedCursor
            x={showCursor ? clickPoint.x : CURSOR_START.x}
            y={showCursor ? clickPoint.y : CURSOR_START.y}
            visible={showCursor}
            pressing={isPressing}
            pressKey={clickIndex}
          />
        )}
      </div>

      {/* Invisible copy of the caption: its size is known before it appears,
          so the camera can already make room for it while zooming in. */}
      {measuring && (
        <div
          ref={measureRef}
          aria-hidden="true"
          className={`absolute left-0 top-0 invisible pointer-events-none ${
            compactCaption ? '' : CAPTION_WIDTH_CLASS
          }`}
          style={{ width: captionLayout.width }}
        >
          <CaptionContent
            step={step}
            stepNumber={stepNumber}
            narration={narration}
            compact={compactCaption}
          />
        </div>
      )}

      {showCaption && floatingCaption && (
        <FloatingCaption
          enterFrom={captionEnterFrom}
          anchor={region ? projectRegion(region, focusView) : null}
          stageWidth={width}
          stageHeight={height}
          layout={captionLayout}
          size={captionSize}
          compact={compactCaption}
        >
          <CaptionContent
            step={step}
            stepNumber={stepNumber}
            narration={narration}
            compact={compactCaption}
          />
        </FloatingCaption>
      )}
    </div>
  );
}

/** Typing speed; long values speed up so typing never takes longer than TYPE_MAX_MS. */
const TYPE_CHAR_MS = 75;
const TYPE_MAX_MS = 2200;

/**
 * 'type' steps: a filled field inside the highlighted area; the value appears
 * character by character with a blinking caret. Without a value, a caret and
 * "typing" dots show that something is entered here. Long values scroll like a
 * real input (the end stays visible).
 */
function TypingField({ box, stageHeight, value }) {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(value.length);
      return;
    }
    const stepMs = Math.min(TYPE_CHAR_MS, TYPE_MAX_MS / value.length);
    const timer = setInterval(() => {
      setTyped((n) => {
        if (n + 1 >= value.length) clearInterval(timer);
        return Math.min(value.length, n + 1);
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [value]);

  const boxPx = (box.h / 100) * stageHeight;
  const fontSize = Math.max(11, Math.min(20, boxPx * 0.45));
  // A small box (an input field) is filled like a real field. A bigger area
  // gets a typing bar across its FULL width but only one line high, centred,
  // so the typing spans the whole selection while what is highlighted above
  // and below it stays visible (filling it all would blank the area white).
  const pillHeight = Math.min(boxPx, fontSize * 2);
  const fills = boxPx <= fontSize * 2.4;
  return (
    <div
      className={`hs-follow-camera absolute pointer-events-none z-[5] flex items-center ${
        fills ? '' : 'justify-center'
      }`}
      style={boxStyle(box)}
    >
      <div
        className={`hs-caption-in max-h-full rounded-md bg-white/95 ring-1 ring-black/10 shadow-sm overflow-hidden flex flex-row-reverse justify-end items-center px-[0.5em] gap-[1px] ${
          fills ? 'w-full h-full' : 'w-[calc(100%-12px)]'
        }`}
        style={{ fontSize, height: fills ? undefined : pillHeight }}
      >
        {/* row-reverse: caret first = right of the text; overflow hides the start */}
        <span className="hs-caret w-[2px] h-[1.15em] bg-accent flex-shrink-0" />
        {value ? (
          <span className="whitespace-pre text-[#111827] font-medium flex-shrink-0">
            {value.slice(0, typed)}
          </span>
        ) : (
          <span
            className="flex items-center gap-[0.25em] pr-[0.35em] flex-shrink-0"
            aria-hidden="true"
          >
            {[0, 160, 320].map((delay) => (
              <span
                key={delay}
                className="hs-type-dot w-[0.35em] h-[0.35em] rounded-full bg-[#6B7280]"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Screenshot layers for a crossfade. When the stage (same page, same camera)
 * gets a new screenshot, it is added ON TOP, invisible; once it has decoded it
 * fades in (WALKTHROUGH_TIMING.crossfade) while the camera keeps gliding, and
 * the layers below are dropped afterwards. The previous screenshot stays fully
 * visible until then, so there is never a blank frame or a jump.
 * @returns {[{ src: string, key: number, shown: boolean }[], (key: number) => void]}
 */
function useScreenCrossfade(src) {
  const [layers, setLayers] = useState(() => [{ src, key: 0, shown: true }]);
  const nextKey = useRef(1);

  useEffect(() => {
    setLayers((prev) => {
      if (prev[prev.length - 1].src === src) return prev;
      // Keep only what is visible now (at most one layer) under the new one.
      const visible = prev.filter((l) => l.shown).slice(-1);
      return [...visible, { src, key: nextKey.current++, shown: false }];
    });
  }, [src]);

  // Once the top layer has faded in, the ones below are no longer needed.
  const top = layers[layers.length - 1];
  useEffect(() => {
    if (!top.shown || layers.length < 2) return;
    const timer = setTimeout(
      () => setLayers((prev) => prev.slice(-1)),
      WALKTHROUGH_TIMING.crossfade + 50,
    );
    return () => clearTimeout(timer);
  }, [top.shown, top.key, layers.length]);

  const onLoaded = useCallback((key) => {
    setLayers((prev) =>
      prev.some((l) => l.key === key && !l.shown)
        ? prev.map((l) => (l.key === key ? { ...l, shown: true } : l))
        : prev,
    );
  }, []);
  return [layers, onLoaded];
}

/** Several targets: the pointer glides on, then presses this long after moving. */
const PRESS_AFTER_GLIDE_MS = 320;

/**
 * Which target the pointer is at: the first one until the "action" phase,
 * then the next one every WALKTHROUGH_TIMING.clickAction ms (the player gives
 * the phase that much time per target), staying on the last one afterwards.
 */
function useClickSequence(phase, count) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2) {
      setIndex(0);
      return;
    }
    if (phase === 'exit' || phase === 'done') {
      setIndex(count - 1);
      return;
    }
    setIndex(0);
    if (phase !== 'action') return;
    const timer = setInterval(
      () => setIndex((i) => Math.min(count - 1, i + 1)),
      WALKTHROUGH_TIMING.clickAction,
    );
    return () => clearInterval(timer);
  }, [phase, count]);
  return Math.min(index, Math.max(0, count - 1));
}

/**
 * Mouse pointer whose TIP sits exactly at (x, y) % of the stage.
 * Moves with a CSS transition; presses + ripples when `pressing`.
 */
function AnimatedCursor({ x, y, visible, pressing, pressKey = 0 }) {
  // Presses after the first wait for the pointer to arrive at the next target.
  const delay = pressKey > 0 ? PRESS_AFTER_GLIDE_MS : 0;
  return (
    <div
      className="hs-cursor absolute pointer-events-none z-10"
      style={{ left: `${x}%`, top: `${y}%`, opacity: visible ? 1 : 0 }}
    >
      {pressing && (
        <span key={`ripples-${pressKey}`} style={{ '--hs-delay': `${delay}ms` }}>
          <span
            className="hs-ripple absolute left-0 top-0 w-28 h-28 rounded-full border-[5px] border-accent"
            style={{ animationDelay: 'var(--hs-delay)' }}
          />
          <span
            className="hs-ripple absolute left-0 top-0 w-28 h-28 rounded-full border-4 border-white"
            style={{ animationDelay: 'calc(var(--hs-delay) + 150ms)' }}
          />
          <span
            className="hs-ripple absolute left-0 top-0 w-16 h-16 rounded-full bg-accent/50"
            style={{ animationDelay: 'calc(var(--hs-delay) + 60ms)' }}
          />
        </span>
      )}
      <div
        key={pressing ? `press-${pressKey}` : 'idle'}
        className={pressing ? 'hs-cursor-press' : 'hs-cursor-idle'}
        style={{ transformOrigin: '0 0', animationDelay: pressing ? `${delay}ms` : undefined }}
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

/** Space kept between the highlighted feature (incl. its ring) and the caption, px. */
const CAPTION_GAP_PX = 18 + SPOTLIGHT_PADDING;
/** Distance the caption keeps from the edges of the available area, px. */
const CAPTION_EDGE_PX = 8;
/** Width of the regular floating caption card (relative to the stage). */
const CAPTION_WIDTH_CLASS = 'w-[min(380px,88%)]';

/**
 * Where the caption may go (px, stage at 0,0): the stage plus the free space
 * around it inside the player, minus the edges and `reserveBottom`. The compact
 * card is as wide as that whole area allows (px); the regular one uses its class.
 */
function getCaptionLayout({ width, height, areaSize, compact, reserveBottom }) {
  const extraX = areaSize ? Math.max(0, (areaSize.width - width) / 2) : 0;
  const extraY = areaSize ? Math.max(0, (areaSize.height - height) / 2) : 0;
  return {
    bounds: {
      x: -extraX + CAPTION_EDGE_PX,
      y: -extraY + CAPTION_EDGE_PX,
      w: width + extraX * 2 - CAPTION_EDGE_PX * 2,
      h: height + extraY * 2 - CAPTION_EDGE_PX * 2 - reserveBottom,
    },
    width: compact ? Math.min(460, width + extraX * 2 - CAPTION_EDGE_PX * 2) : undefined,
  };
}

/**
 * Positions the caption next to the feature WITHOUT covering it, using the
 * caption's measured size (utils/captionPlacement: below → above → right →
 * left → least-overlap). It may use the free space around the stage too.
 * Without a region it sits at the bottom of the stage.
 */
function FloatingCaption({
  anchor,
  stageWidth,
  stageHeight,
  layout,
  size,
  compact,
  enterFrom = null,
  children,
}) {
  let style;
  if (!anchor) {
    style = compact
      ? { left: '50%', top: layout.bounds.y, transform: 'translateX(-50%)' }
      : { left: '50%', bottom: '4%', transform: 'translateX(-50%)' };
  } else if (!size) {
    style = { left: 0, top: 0, visibility: 'hidden' }; // not measured yet
  } else {
    const { x, y } = placeCaption({
      anchor: {
        x: (anchor.x / 100) * stageWidth,
        y: (anchor.y / 100) * stageHeight,
        w: (anchor.w / 100) * stageWidth,
        h: (anchor.h / 100) * stageHeight,
      },
      size,
      bounds: layout.bounds,
      gap: CAPTION_GAP_PX,
    });
    style = { left: x, top: y };
  }

  return (
    <div
      className={`absolute z-20 ${compact ? 'pointer-events-none' : CAPTION_WIDTH_CLASS}`}
      style={{ ...style, width: layout.width }}
    >
      <div
        className="hs-caption-in"
        style={
          enterFrom
            ? { '--hs-from-x': `${enterFrom.x}px`, '--hs-from-y': `${enterFrom.y}px` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The description, one caption part at a time (`part` = the one being said).
 * Every part is laid out in the same grid cell, so the card keeps the size of
 * its longest part and never jumps; dots show which part this is.
 */
function CaptionText({ text, part = 0, className, lead = null }) {
  const parts = splitCaptionParts(text);
  if (parts.length <= 1) {
    return (
      <p className={className}>
        {lead}
        {parts[0] ?? ''}
      </p>
    );
  }
  const current = Math.min(Math.max(0, part), parts.length - 1);
  return (
    <div>
      <div className="grid">
        {parts.map((p, k) => (
          <p
            key={k}
            aria-hidden={k !== current}
            className={`${className} [grid-area:1/1] transition-opacity duration-200 ${
              k === current ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {lead}
            {p}
          </p>
        ))}
      </div>
      <div
        className="mt-1.5 flex items-center gap-1"
        aria-label={`Part ${current + 1} of ${parts.length}`}
      >
        {parts.map((_, k) => (
          <span
            key={k}
            className={`h-1 rounded-full transition-all duration-200 ${
              k === current ? 'w-3 bg-accent' : 'w-1 bg-ink-faint/40 dark:bg-ink-faint-dark/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The caption card: numbered badge, label, description, speaking indicator.
 * Exported so the player can dock it under the stage on small screens.
 */
export function CaptionContent({ step, stepNumber, narration, compact = false }) {
  // Mobile view: a long description in parts, each while the voice says it,
  // smaller font, never cut off. Web view: the whole description, as always.
  const inParts = !!narration.captionParts;
  if (compact && !inParts) {
    // Small embeds: one tight row, text clamped to two lines.
    return (
      <div className="flex items-start gap-2 rounded-xl bg-panel/95 dark:bg-panel-dark/95 backdrop-blur-md border border-line dark:border-line-dark shadow-xl px-2.5 py-2">
        <span className="w-5 h-5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          <span key={stepNumber} className="hs-count-in">
            {stepNumber}
          </span>
        </span>
        <p className="text-xs leading-snug text-ink dark:text-ink-soft-dark line-clamp-2">
          {step.label && <strong className="font-semibold">{step.label}. </strong>}
          {step.text}
        </p>
      </div>
    );
  }
  if (compact) {
    // Small embeds, Mobile view: one tight row, small text (in parts, never cut).
    return (
      <div className="flex items-start gap-2 rounded-xl bg-panel/95 dark:bg-panel-dark/95 backdrop-blur-md border border-line dark:border-line-dark shadow-xl px-2.5 py-2">
        <span className="w-5 h-5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          <span key={stepNumber} className="hs-count-in">
            {stepNumber}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <CaptionText
            text={step.text}
            part={narration.part}
            className="text-[11px] leading-snug text-ink dark:text-ink-soft-dark break-words"
            lead={step.label && <strong className="font-semibold">{step.label}. </strong>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-panel/95 dark:bg-panel-dark/95 backdrop-blur-md border border-line dark:border-line-dark shadow-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          <span key={stepNumber} className="hs-count-in">
            {stepNumber}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          {step.label && (
            <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark leading-snug">
              {step.label}
            </p>
          )}
          {inParts
            ? step.text?.trim() && (
                <div className="mt-0.5">
                  <CaptionText
                    text={step.text}
                    part={narration.part}
                    className="text-[13px] text-ink-soft dark:text-ink-soft-dark leading-snug break-words"
                  />
                </div>
              )
            : step.text && (
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
