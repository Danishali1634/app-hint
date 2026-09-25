/**
 * @file Video-style timeline for the walkthrough player.
 *
 * WHY: a walkthrough should feel like ONE video, not a slideshow. Instead of
 * Next / Previous buttons and step dots, the player shows a single bar that
 * fills continuously while it plays, with a time readout ("0:12 / 0:45").
 * Thin gaps mark where each step starts; hovering shows the step's name.
 *
 * CLICK = GO TO THAT EXACT MOMENT (like a video), even inside the step that is
 * already playing: the click is turned into a "moment" — which step, which
 * phase of it (screen / zoom / pointer / voice / click) and how far into that
 * phase — and the player continues from there (momentAt → player.seekTo).
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { buildTimeline } from '@/services/video/timeline';
import { WALKTHROUGH_TIMING } from '@/constants';

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
function livePlan(steps, voiceMs) {
  const narration = steps.map((s) =>
    s.audioData ? (voiceMs[s.id] ?? Math.max(3000, speakingMs(s.text))) : speakingMs(s.text),
  );
  return buildTimeline(steps, narration).segments.filter((seg) => seg.phase !== 'done');
}

/**
 * Start and length of every step on the timeline.
 * @param {import('@/types').WalkthroughStep[]} steps
 * @param {Record<string, number>} [voiceMs]
 */
export function stepTimings(steps, voiceMs = {}) {
  if (steps.length === 0) return { spans: [], total: 0 };
  const spans = steps.map(() => ({ start: Infinity, end: 0 }));
  for (const seg of livePlan(steps, voiceMs)) {
    const span = spans[seg.stepIndex];
    span.start = Math.min(span.start, seg.start);
    span.end = Math.max(span.end, seg.start + seg.duration);
  }
  const total = spans[spans.length - 1].end;
  return { spans: spans.map((s) => ({ start: s.start, duration: s.end - s.start })), total };
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
export function momentAt(steps, voiceMs, t) {
  const plan = livePlan(steps, voiceMs);
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

export function formatTime(ms) {
  const secs = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * @param {{
 *   steps: import('@/types').WalkthroughStep[],
 *   index: number,
 *   runKey: number,          // changes whenever a step (re)starts → playhead resets
 *   startOffset?: number,    // ms into the step where it (re)started (after a seek)
 *   playing: boolean,
 *   finished: boolean,
 *   voiceMs: Record<string, number>,
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
  onSeek,
  onInsert,
  dark = false,
  className = '',
}) {
  const { spans, total } = useMemo(() => stepTimings(steps, voiceMs), [steps, voiceMs]);
  const [elapsed, setElapsed] = useState(0);
  const barRef = useRef(null);
  const [hover, setHover] = useState(null); // { index, x } while the pointer is over the bar

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

  const span = spans[index];
  if (!span || total <= 0) return null;
  const position = finished ? total : span.start + Math.min(elapsed, span.duration * 0.98);
  const percent = (position / total) * 100;

  const timeAt = (clientX) => {
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * total;
  };
  const indexAtTime = (t) => {
    const found = spans.findIndex((s) => t >= s.start && t < s.start + s.duration);
    return found === -1 ? steps.length - 1 : found;
  };
  const seekToStep = (i) => onSeek(momentAt(steps, voiceMs, spans[i].start));

  const track = dark ? 'bg-white/25' : 'bg-line dark:bg-line-dark';
  const timeClass = dark ? 'text-white/75' : 'text-ink-faint dark:text-ink-faint-dark';
  const boundaries = onInsert ? [0, ...spans.slice(1).map((s) => s.start), total] : [];

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
          aria-valuetext={`Step ${index + 1} of ${steps.length}: ${steps[index]?.label || ''}`}
          className="group/tl relative h-6 flex items-center cursor-pointer outline-none"
          onClick={(e) => onSeek(momentAt(steps, voiceMs, timeAt(e.clientX)))}
          onMouseMove={(e) => {
            const rect = barRef.current.getBoundingClientRect();
            setHover({ index: indexAtTime(timeAt(e.clientX)), x: e.clientX - rect.left });
          }}
          onMouseLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && index < steps.length - 1) seekToStep(index + 1);
            if (e.key === 'ArrowLeft') seekToStep(Math.max(0, index - 1));
          }}
        >
          {/* Track with thin gaps where steps begin */}
          <div
            className={`relative w-full h-1 group-hover/tl:h-1.5 transition-[height] rounded-full overflow-hidden ${track}`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-accent rounded-full"
              style={{ width: `${percent}%` }}
            />
            {spans.slice(1).map((s, i) => (
              <span
                key={steps[i + 1].id}
                className={`absolute inset-y-0 w-0.5 ${dark ? 'bg-black/60' : 'bg-panel dark:bg-panel-dark'}`}
                style={{ left: `${(s.start / total) * 100}%` }}
              />
            ))}
          </div>
          {/* Playhead */}
          <span
            className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-accent shadow ring-2 ring-white/80 dark:ring-black/40 scale-0 group-hover/tl:scale-100 transition-transform"
            style={{ left: `${percent}%` }}
          />
          {/* Hover label */}
          {hover && steps[hover.index] && (
            <span
              className="absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink text-white dark:bg-white dark:text-ink text-[11px] font-semibold px-2 py-1 shadow-lg pointer-events-none z-10"
              style={{ left: Math.max(40, Math.min(hover.x, barRef.current.clientWidth - 40)) }}
            >
              {hover.index + 1}. {steps[hover.index].label || `Step ${hover.index + 1}`}
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
