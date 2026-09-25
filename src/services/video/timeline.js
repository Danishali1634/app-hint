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

/** How long the ending (last frame → "You're all set!" card) stays on screen. */
const END_HOLD_MS = 4800;

/** True if the step's region is a "click" (pointer + next screen opens from it). */
export function isClickStep(step) {
  return !!step.imageData && !!step.region && step.action !== 'look';
}

/** True if step i shows the same screenshot as step i-1 (camera glides, no cut). */
export function continuesScreen(steps, i) {
  const prev = steps[i - 1];
  return !!prev && !!steps[i].imageData && steps[i].imageData === prev.imageData;
}

/**
 * Lays the walkthrough out in time, exactly like the live player plays it:
 *   - a new screen: enter → overview → focus → point → narrate → action;
 *     the previous screen's exit is drawn UNDER the new screen's enter
 *     (they overlap, so there is never a blank gap between steps);
 *   - the same screen as the step before: the camera glides straight from the
 *     old area to the new one ("continued" focus), then narrate → action.
 * @param {WalkthroughStep[]} steps
 * @param {number[]} narrationMs  how long each step's narration lasts
 * @returns {{ segments: TimelineSegment[], total: number }}
 */
export function buildTimeline(steps, narrationMs) {
  const segments = [];
  let time = 0;
  const add = (stepIndex, phase, duration, enterOrigin, continued = false) => {
    segments.push({ stepIndex, phase, start: time, duration, enterOrigin, continued });
    time += duration;
  };

  steps.forEach((step, i) => {
    const prev = steps[i - 1];
    const region = step.imageData ? step.region : null;
    const isClick = isClickStep(step);

    if (continuesScreen(steps, i)) {
      if (region) add(i, 'focus', T.focus, null, true);
    } else {
      const enterOrigin = prev && isClickStep(prev) ? focusedCenter(prev.region) : null;
      add(i, 'enter', T.enter, enterOrigin);
      add(i, 'overview', i === 0 && !enterOrigin ? T.overviewFirst : T.overview, enterOrigin);
      if (region) add(i, 'focus', T.focus, enterOrigin);
      if (isClick) add(i, 'point', T.point, enterOrigin);
    }
    add(i, 'narrate', narrationMs[i], null);
    add(i, 'action', isClick ? T.clickAction : T.lookAction, null);
  });
  add(steps.length - 1, 'done', END_HOLD_MS, null);

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
