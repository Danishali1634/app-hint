/**
 * @file The walkthrough as a fixed timeline, for video export.
 *
 * The live player advances phase by phase with timers and waits for the voice to
 * finish. A video needs the same story laid out up front: every phase of every
 * step gets a start time and a duration, and any moment t can then be drawn.
 * Phase names and durations are the same as the player's (WALKTHROUGH_TIMING),
 * so the video looks like the on-screen walkthrough.
 */

import { WALKTHROUGH_TIMING as T } from '@/constants';
import { focusedCenter } from '@/utils/camera';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/**
 * @typedef {Object} TimelineSegment
 * @property {number} stepIndex
 * @property {string} phase     'enter' | 'overview' | 'focus' | 'point' | 'narrate' | 'action' | 'exit' | 'done'
 * @property {number} start     ms from the start of the video
 * @property {number} duration  ms
 * @property {{x: number, y: number} | null} enterOrigin  stage % the step grows from
 */

/** How long the last frame stays on screen at the end of the video. */
const END_HOLD_MS = 2200;

/** True if the step's region is a "click" (pointer + next screen opens from it). */
export function isClickStep(step) {
  return !!step.imageData && !!step.region && step.action !== 'look';
}

/**
 * @param {WalkthroughStep[]} steps
 * @param {number[]} narrationMs  how long each step's narration lasts
 * @returns {{ segments: TimelineSegment[], total: number }}
 */
export function buildTimeline(steps, narrationMs) {
  const segments = [];
  let time = 0;
  const add = (stepIndex, phase, duration, enterOrigin) => {
    segments.push({ stepIndex, phase, start: time, duration, enterOrigin });
    time += duration;
  };

  steps.forEach((step, i) => {
    const prev = steps[i - 1];
    const enterOrigin = prev && isClickStep(prev) ? focusedCenter(prev.region) : null;
    const region = step.imageData ? step.region : null;
    const isClick = isClickStep(step);
    const isLast = i === steps.length - 1;

    add(i, 'enter', T.enter, enterOrigin);
    add(i, 'overview', i === 0 || !enterOrigin ? T.overviewFirst : T.overview, enterOrigin);
    if (region) add(i, 'focus', T.focus, enterOrigin);
    if (isClick) add(i, 'point', T.point, enterOrigin);
    add(i, 'narrate', narrationMs[i], enterOrigin);
    add(i, 'action', isClick ? T.clickAction : T.lookAction, enterOrigin);
    if (isLast) add(i, 'done', END_HOLD_MS, enterOrigin);
    else add(i, 'exit', isClick ? T.exitClick : T.exitLook, enterOrigin);
  });

  return { segments, total: time };
}

/**
 * The segment playing at time t, plus progress 0–1 within it.
 * @param {TimelineSegment[]} segments
 * @param {number} t ms
 */
export function segmentAt(segments, t) {
  const segment =
    segments.find((s) => t >= s.start && t < s.start + s.duration) ?? segments[segments.length - 1];
  const progress = Math.min(1, Math.max(0, (t - segment.start) / segment.duration));
  return { segment, progress, elapsed: t - segment.start };
}
