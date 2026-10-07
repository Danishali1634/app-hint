/**
 * @file Video-style timeline for the walkthrough player.
 *
 * WHY: a walkthrough should feel like ONE video, not a slideshow. Instead of
 * Next / Previous buttons and step dots, the player shows a single bar that
 * fills continuously while it plays, with a time readout ("0:12 / 0:45").
 * Like a chapter-aware video bar, the ONE bar is drawn as a segment per step
 * (width = the step's real share of the time, small gaps between them); the
 * current step is tinted, the hovered one grows, and the hover label shows the
 * step's name plus the exact time under the pointer.
 *
 * CLICK = GO TO THAT EXACT MOMENT (like a video), even inside the step that is
 * already playing: the click is turned into a "moment" — which step, which
 * phase of it (screen / zoom / pointer / voice / click) and how far into that
 * phase — and the player continues from there (momentAt → player.seekTo).
 * A click right on a step boundary (within SNAP_PX) snaps to that step's start.
 *
 * DRAG: press anywhere and drag to scrub; the playhead and time follow the
 * pointer and the seek happens once, on release (every seek remounts the stage
 * and restarts the voice, so seeking on every mouse move would stutter).
 *
 * HOW THE TIME IS KNOWN: the live player waits for the voice to finish, so the
 * exact length is only known while playing. The bar uses the same phase plan
 * as the video export (services/video/timeline.buildTimeline) with estimated
 * speaking times; once a recording's real length is known it is used instead.
 * Inside the current step the playhead moves with real elapsed time (paused =
 * frozen) and never runs past the step's end until the next step starts.
 *
 * EDIT MODE (onInsert given): small "+" buttons sit on every step boundary —
 * before step 1, between any two steps, and after the last — to insert a step
 * exactly there.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ListVideo, Plus, X } from 'lucide-react';
import { buildTimeline } from '@/services/video/timeline';
import { afterVoicePauseMs, pacedTiming } from '@/utils/pace';
import { WALKTHROUGH_TIMING } from '@/constants';
import { getStepTitles } from '@/utils/course';
import { formatTime } from '@/utils';

export { formatTime };

/** Rough speaking time for text-to-speech (ms). Also used to seek inside TTS. */
export function speakingMs(text) {
  if (!text?.trim()) return WALKTHROUGH_TIMING.silentNarrate;
  return 600 + text.trim().length * 65;
}

/**
 * The phase plan of the live player (no end hold).
 * @param {import('@/types').WalkthroughStep[]} steps
 * @param {Record<string, number>} voiceMs  known recording lengths by step id
 */
function livePlan(steps, voiceMs, pace = 1) {
  const narration = steps.map((s) =>
    s.audioData
      ? (voiceMs[s.id] ?? Math.max(3000, speakingMs(s.text)))
      : s.text?.trim()
        ? speakingMs(s.text)
        : pacedTiming(pace).silentNarrate,
  );
  // As in the player: a slow pace pauses after each spoken line (in the action phase).
  const pause = afterVoicePauseMs(pace);
  const actionExtra = steps.map((s) => (s.audioData || s.text?.trim() ? pause : 0));
  return buildTimeline(steps, narration, { pace, actionExtra }).segments.filter(
    (seg) => seg.phase !== 'done',
  );
}

/**
 * Start and length of every step on the timeline.
 * @param {import('@/types').WalkthroughStep[]} steps
 * @param {Record<string, number>} [voiceMs]
 */
export function stepTimings(steps, voiceMs = {}, pace = 1) {
  if (steps.length === 0) return { spans: [], total: 0 };
  const spans = steps.map(() => ({ start: Infinity, end: 0 }));
  for (const seg of livePlan(steps, voiceMs, pace)) {
    const span = spans[seg.stepIndex];
    span.start = Math.min(span.start, seg.start);
    span.end = Math.max(span.end, seg.start + seg.duration);
  }
  // A step with no phases (shouldn't happen) becomes a zero-length span where
  // the previous one ended, so nothing downstream sees Infinity / NaN.
  let prevEnd = 0;
  const safe = spans.map((s) => {
    const start = Number.isFinite(s.start) ? s.start : prevEnd;
    const end = Math.max(start, s.end);
    prevEnd = end;
    return { start, duration: end - start };
  });
  return { spans: safe, total: prevEnd };
}

/**
 * @typedef {Object} Moment  a point of the walkthrough the player can continue from
 * @property {number} index        step
 * @property {string} phase        phase of that step at this moment
 * @property {number} phaseOffset  ms already spent in that phase
 * @property {number} stepOffset   ms since the step began (for the playhead)
 */

/**
 * The moment at time t (ms from the start).
 * @param {import('@/types').WalkthroughStep[]} steps
 * @param {Record<string, number>} voiceMs
 * @param {number} t
 * @returns {Moment}
 */
export function momentAt(steps, voiceMs, t, pace = 1) {
  const plan = livePlan(steps, voiceMs, pace);
  const last = plan[plan.length - 1];
  const clamped = Math.max(0, Math.min(t, last.start + last.duration - 1));
  const seg = plan.find((s) => clamped >= s.start && clamped < s.start + s.duration) ?? last;
  const stepStart = plan.find((s) => s.stepIndex === seg.stepIndex).start;
  return {
    index: seg.stepIndex,
    phase: seg.phase,
    phaseOffset: clamped - seg.start,
    stepOffset: clamped - stepStart,
  };
}

/** A click this close (px) to a step boundary jumps to that step's start. */
const SNAP_PX = 6;
/** Pointer travel (px) after which a press counts as a drag, not a click. */
const DRAG_PX = 3;

/**
 * @param {{
 *   steps: import('@/types').WalkthroughStep[],
 *   index: number,
 *   runKey: number,          // changes whenever a step (re)starts → playhead resets
 *   startOffset?: number,    // ms into the step where it (re)started (after a seek)
 *   playing: boolean,
 *   finished: boolean,
 *   voiceMs: Record<string, number>,
 *   pace?: number,           // the course's pace (utils/pace)
 *   onSeek: (moment: Moment) => void,
 *   onInsert?: (position: number) => void,  // edit mode: insert a step at this position (0 = first)
 *   dark?: boolean,          // on the compact player's dark gradient
 *   className?: string,
 * }} props
 */
export function Timeline({
  steps,
  index,
  runKey,
  startOffset = 0,
  playing,
  finished,
  voiceMs,
  pace = 1,
  onSeek,
  onInsert,
  dark = false,
  className = '',
}) {
  const { spans, total } = useMemo(() => stepTimings(steps, voiceMs, pace), [steps, voiceMs, pace]);
  const titles = useMemo(() => getStepTitles(steps), [steps]);
  const [elapsed, setElapsed] = useState(0);
  const barRef = useRef(null);
  const labelRef = useRef(null);
  const pressRef = useRef(null); // { x, dragging } while a pointer is down on the bar
  const [hover, setHover] = useState(null); // { t, x } under the pointer
  const [scrubTime, setScrubTime] = useState(null); // ms while dragging, else null

  // Playhead inside the current step: real time while playing, frozen when paused.
  useEffect(() => setElapsed(startOffset), [runKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      setElapsed((e) => e + (now - last));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, runKey]);

  // Keep the hover label inside the bar (its width depends on the step name).
  useLayoutEffect(() => {
    const label = labelRef.current;
    const bar = barRef.current;
    if (!label || !bar || !hover) return;
    const half = label.offsetWidth / 2;
    label.style.left = `${Math.max(half, Math.min(hover.x, bar.clientWidth - half))}px`;
  });

  const span = spans[index];
  if (!span || total <= 0) return null;
  const playPosition = finished ? total : span.start + Math.min(elapsed, span.duration * 0.98);
  const position = scrubTime ?? playPosition;
  const percent = (position / total) * 100;

  /** Pointer → { t: ms on the timeline, x: px from the bar's left edge }. */
  const pointAt = (clientX) => {
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return { t: rect.width > 0 ? (x / rect.width) * total : 0, x, width: rect.width };
  };
  // A time exactly on a boundary belongs to the step that starts there.
  const indexAtTime = (t) => {
    const found = spans.findIndex((s) => t >= s.start && t < s.start + s.duration);
    return found === -1 ? steps.length - 1 : found;
  };
  const seekToStep = (i) => onSeek(momentAt(steps, voiceMs, spans[i].start, pace));
  /** A click: the exact moment — or a step's start when right on its boundary. */
  const clickAt = ({ t, x, width }) => {
    const i = indexAtTime(t);
    const px = (ms) => (ms / total) * width;
    if (Math.abs(x - px(spans[i].start)) <= SNAP_PX) return seekToStep(i);
    const next = spans[i + 1];
    if (next && Math.abs(x - px(next.start)) <= SNAP_PX) return seekToStep(i + 1);
    onSeek(momentAt(steps, voiceMs, t, pace));
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pressRef.current = { x: e.clientX, dragging: false };
  };
  const onPointerMove = (e) => {
    const point = pointAt(e.clientX);
    setHover(point);
    const press = pressRef.current;
    if (!press) return;
    if (!press.dragging && Math.abs(e.clientX - press.x) < DRAG_PX) return;
    press.dragging = true;
    setScrubTime(point.t);
  };
  const onPointerUp = (e) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    const point = pointAt(e.clientX);
    setScrubTime(null);
    // A drag lands on the exact time (never snaps); a plain click may snap.
    if (press.dragging) onSeek(momentAt(steps, voiceMs, point.t, pace));
    else clickAt(point);
    if (e.pointerType !== 'mouse') setHover(null);
  };
  const onPointerCancel = () => {
    pressRef.current = null;
    setScrubTime(null);
    setHover(null);
  };

  const hoverIndex = hover ? indexAtTime(hover.t) : -1;
  const scrubbing = scrubTime != null;
  const track = dark ? 'bg-white/25' : 'bg-line dark:bg-line-dark';
  // Unplayed part of the current step: a faint accent, so "where am I" reads at a glance.
  const activeTint = dark ? 'bg-white/40' : 'bg-accent/25 dark:bg-accent/30';
  const timeClass = dark ? 'text-white/75' : 'text-ink-faint dark:text-ink-faint-dark';
  const boundaries = onInsert ? [0, ...spans.slice(1).map((s) => s.start), total] : [];
  const activeIndex = scrubbing ? indexAtTime(scrubTime) : index;

  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <div className={`relative flex-1 min-w-0 ${onInsert ? 'mx-3' : ''}`}>
        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-label="Timeline"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-valuetext={`Step ${titles[index]?.number}${titles[index]?.heading ? `: ${titles[index].heading}` : ''}, ${formatTime(playPosition)} of ${formatTime(total)}`}
          className="group/tl relative h-6 flex items-center cursor-pointer outline-none touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => !pressRef.current && setHover(null)}
          onKeyDown={(e) => {
            const target = {
              ArrowRight: Math.min(steps.length - 1, index + 1),
              ArrowLeft: Math.max(0, index - 1),
              Home: 0,
              End: steps.length - 1,
            }[e.key];
            if (target == null) return;
            e.preventDefault();
            seekToStep(target);
          }}
        >
          {/* ONE track, drawn as a segment per step: width = the step's share of
              the time, a 2px gap before the next. The fill runs across all of
              them as one continuous bar. Purely visual — the bar above handles
              every pointer event. */}
          <div className="relative w-full h-2 pointer-events-none">
            {spans.map((s, i) => {
              const left = (s.start / total) * 100;
              const width = (s.duration / total) * 100;
              const played = Math.max(0, Math.min(1, (position - s.start) / (s.duration || 1)));
              const grow = i === hoverIndex || (scrubbing && i === activeIndex);
              return (
                <div
                  key={steps[i].id}
                  className={`absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden transition-[height] ${
                    grow ? 'h-2' : 'h-1 group-hover/tl:h-1.5'
                  } ${track}`}
                  style={{
                    left: `${left}%`,
                    width: i < spans.length - 1 ? `max(0px, calc(${width}% - 2px))` : `${width}%`,
                  }}
                >
                  {i === activeIndex && !finished && (
                    <div className={`absolute inset-0 ${activeTint}`} />
                  )}
                  <div
                    className="absolute inset-y-0 left-0 bg-accent"
                    style={{ width: `${played * 100}%` }}
                  />
                </div>
              );
            })}
          </div>
          {/* Playhead: on hover, focus and while dragging */}
          <span
            className={`absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-accent shadow ring-2 ring-white/80 dark:ring-black/40 pointer-events-none transition-transform group-hover/tl:scale-100 group-focus-visible/tl:scale-100 ${
              scrubbing ? 'scale-110' : 'scale-0'
            }`}
            style={{ left: `${percent}%` }}
          />
          {/* Hover preview (like a video's thumbnail preview): the step's
              screen, its name and the exact time under the pointer. Follows the
              pointer while dragging; never seeks by itself. */}
          {hover && steps[hoverIndex] && (
            <span
              ref={labelRef}
              className="absolute bottom-full mb-2 -translate-x-1/2 flex flex-col items-center rounded-lg bg-ink text-white dark:bg-white dark:text-ink text-[11px] font-semibold p-1 shadow-lg pointer-events-none z-10"
              style={{ left: hover.x }}
            >
              {steps[hoverIndex].imageData && (
                <img
                  src={steps[hoverIndex].imageData}
                  alt=""
                  draggable={false}
                  className={`${dark ? 'w-32' : 'w-44'} aspect-[16/10] object-cover object-top rounded-md mb-1 bg-black/20`}
                />
              )}
              <span
                className={`px-1 ${dark ? 'w-32' : 'w-44'} text-center line-clamp-2 break-words`}
              >
                {titles[hoverIndex].heading || `Step ${titles[hoverIndex].number}`}
              </span>
              <span className="font-mono tabular-nums font-normal opacity-75 whitespace-nowrap">
                {titles[hoverIndex].heading && `Step ${titles[hoverIndex].number} · `}
                {formatTime(hover.t)}
              </span>
            </span>
          )}
        </div>

        {/* Edit mode: insert a step at any boundary */}
        {boundaries.map((t, position) => (
          <button
            key={`insert-${position}`}
            onClick={() => onInsert(position)}
            className="absolute top-1/2 -mt-[11px] -ml-[11px] w-[22px] h-[22px] rounded-full bg-panel dark:bg-panel-dark border-2 border-accent text-accent flex items-center justify-center shadow hover:bg-accent hover:text-white hover:scale-110 transition-all z-20"
            style={{ left: `${(t / total) * 100}%` }}
            aria-label={
              position === 0
                ? 'Add a step before step 1'
                : position === steps.length
                  ? 'Add a step at the end'
                  : `Add a step between step ${position} and ${position + 1}`
            }
            title={
              position === 0
                ? 'Add a step before step 1'
                : position === steps.length
                  ? 'Add a step at the end'
                  : `Add a step between ${position} and ${position + 1}`
            }
          >
            <Plus className="w-3 h-3" strokeWidth={3} />
          </button>
        ))}
      </div>
      <span className={`flex-shrink-0 text-[11px] font-mono tabular-nums ${timeClass}`}>
        {formatTime(position)} / {formatTime(total)}
      </span>
    </div>
  );
}

/**
 * The Steps button of the control bar: shows / hides the StepList panel.
 * @param {{ open: boolean, onToggle: () => void }} props
 */
export function StepsToggle({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="walkthrough-steps"
      aria-label={open ? 'Hide steps' : 'Show steps'}
      title={open ? 'Hide steps' : 'Show steps'}
      className={`h-9 flex-shrink-0 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors ${
        open
          ? 'bg-accent text-white'
          : 'text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
      }`}
    >
      <ListVideo className="w-4 h-4" />
      <span className="hidden sm:inline">Steps</span>
    </button>
  );
}

/**
 * The steps as a panel BESIDE the video (like a video's chapter list), so the
 * picture is never covered: thumbnail + heading + number and start time per
 * step. Clicking one jumps the player to that step's start through the same
 * onSeek as the timeline — playing keeps playing, paused stays paused — and the
 * panel stays open for the next jump. The current step (`index`) is
 * highlighted and kept scrolled into view.
 * @param {{
 *   steps: import('@/types').WalkthroughStep[],
 *   index: number,
 *   voiceMs: Record<string, number>,
 *   onSeek: (moment: Moment) => void,
 *   onClose?: () => void,    // shows a × (and Esc) to hide the panel
 *   className?: string,
 * }} props
 */
export function StepList({ steps, index, voiceMs, pace = 1, onSeek, onClose, className = '' }) {
  const { spans, total } = useMemo(() => stepTimings(steps, voiceMs, pace), [steps, voiceMs, pace]);
  const titles = useMemo(() => getStepTitles(steps), [steps]);
  const listRef = useRef(null);

  // Scroll only the list (not the page) to centre the current step.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[index];
    if (!item) return;
    const top = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [index]);

  if (total <= 0) return null;

  return (
    <aside
      id="walkthrough-steps"
      aria-label="Steps"
      onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
      className={`flex flex-col min-h-0 bg-panel dark:bg-panel-dark ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 h-11 flex-shrink-0 border-b border-line dark:border-line-dark">
        <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark">
          Steps{' '}
          <span className="font-normal text-ink-faint dark:text-ink-faint-dark">
            {steps.length}
          </span>
        </p>
      </div>
      <ol ref={listRef} className="relative flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {steps.map((s, i) => {
          const active = i === index;
          const { number, heading } = titles[i];
          const time = formatTime(spans[i]?.start ?? 0);
          return (
            <li key={s.id}>
              <button
                onClick={() => onSeek(momentAt(steps, voiceMs, spans[i].start, pace))}
                aria-current={active ? 'step' : undefined}
                aria-label={`Go to step ${number}${heading ? `: ${heading}` : ''} (${time})`}
                title={heading || `Step ${number}`}
                className={`group/step w-full flex items-start gap-2.5 p-1.5 rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'bg-accent/10 dark:bg-accent/15'
                    : 'hover:bg-paper-2 dark:hover:bg-paper-2-dark'
                }`}
              >
                <span
                  className={`w-24 flex-shrink-0 aspect-[16/10] rounded-md overflow-hidden border bg-paper dark:bg-paper-2-dark ${
                    active
                      ? 'border-accent ring-2 ring-accent'
                      : 'border-line dark:border-line-dark'
                  }`}
                >
                  {s.imageData ? (
                    <img
                      src={s.imageData}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-sm font-bold text-ink-faint dark:text-ink-faint-dark">
                      {number}
                    </span>
                  )}
                </span>
                <span className="flex-1 min-w-0 pt-0.5">
                  <span
                    className={`block line-clamp-2 break-words text-xs leading-snug font-semibold ${
                      active ? 'text-accent' : 'text-ink dark:text-ink-soft-dark'
                    }`}
                  >
                    {heading || `Step ${number}`}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-mono tabular-nums text-ink-faint dark:text-ink-faint-dark">
                    {heading && `Step ${number} · `}
                    {time}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
