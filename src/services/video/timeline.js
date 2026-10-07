/**
 * @file The walkthrough as a fixed timeline, for video export.
 *
 * The live player advances phase by phase with timers and waits for the voice to
 * finish. A video needs the same story laid out up front: every phase of every
 * step gets a start time and a duration, and any moment t can then be drawn.
 * Phase names and durations are the same as the player's (WALKTHROUGH_TIMING),
 * so the video looks like the on-screen walkthrough.
 */

import { pacedTiming, paceScale } from '@/utils/pace';
import { clickOrigin, getStepTargets, isClickAction } from '@/utils/course';

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
  return !!step.imageData && !!step.region && isClickAction(step);
}

/** How many presses a click step's "action" phase has: one per target. */
export function clickCount(step) {
  return Math.max(1, getStepTargets(step).length);
}

/**
 * How step i follows step i-1:
 *   'same'  same screenshot → the camera glides straight to the new area
 *   'swap'  another screenshot WITHIN the same Global Step (another state of
 *           the same page) → it crossfades in while the camera glides on, like
 *           'same' — every sub-step feels like one page
 *   'enter' the first step, a new Global Step (a new page), or a step without
 *           a screenshot → the next screen opens out of the click / fades in
 */
export function transitionFor(steps, i) {
  const prev = steps[i - 1];
  const step = steps[i];
  if (!prev || !prev.imageData || !step?.imageData) return 'enter';
  if (prev.imageData === step.imageData) return 'same';
  return samePage(prev, step) ? 'swap' : 'enter';
}

/**
 * True when `to` shows the same page as `from` — the walkthrough then moves
 * on as ONE continuous motion (camera glides, focus travels) instead of
 * opening a new scene: the same screenshot, sub-steps of one Global Step, or
 * another shot of the same screen (utils/samePage marks it `pageOf`).
 * The player, the timeline and the video all decide with this.
 */
export function samePage(from, to) {
  if (!from?.imageData || !to?.imageData) return false;
  if (from.imageData === to.imageData) return true;
  if (from.groupId && from.groupId === to.groupId) return true;
  return !!to.pageOf && to.pageOf === from.id;
}

/** True if step i shows the same screenshot as step i-1 (camera glides, no cut). */
export function continuesScreen(steps, i) {
  const prev = steps[i - 1];
  return !!prev && !!steps[i].imageData && steps[i].imageData === prev.imageData;
}

/**
 * Lays the walkthrough out in time, exactly like the live player plays it:
 *   - the first screen: enter → overview → focus → point → narrate → action;
 *   - the same screen as the step before: the camera glides straight from the
 *     old area to the new one ("continued" focus), then narrate → action;
 *   - another screenshot of the same Global Step: exactly like the same
 *     screen (continued focus → narrate → action); the new screenshot
 *     crossfades in during the glide, so it never feels like a cut;
 *   - next to a step without a screenshot: enter as for the first screen
 *     (the previous screen's exit is drawn UNDER it, so there is no blank gap).
 * @param {WalkthroughStep[]} steps
 * @param {number[]} narrationMs  how long each step's narration lasts
 * @param {{ overview?: number, lookAction?: number, pace?: number, actionExtra?: number[] }} [hold]  extra ms of
 *   stillness on the overview and after a "look" step — the downloaded video uses
 *   this to give the viewer more time (the live player's timeline passes nothing);
 *   pace: the course's pace (utils/pace), which stretches every timed phase;
 *   actionExtra: per step, ms added to its action phase (the pause after a
 *   spoken line when the pace is slow — utils/pace.afterVoicePauseMs).
 * @returns {{ segments: TimelineSegment[], total: number }}
 */
export function buildTimeline(steps, narrationMs, hold = {}) {
  const T = pacedTiming(hold.pace);
  const extraOverview = hold.overview ?? 0;
  const extraLook = hold.lookAction ?? 0;
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

    const kind = transitionFor(steps, i);
    if (kind === 'same' || kind === 'swap') {
      if (region) add(i, 'focus', T.focus, null, true);
    } else {
      const enterOrigin = prev && isClickStep(prev) ? clickOrigin(prev) : null;
      add(i, 'enter', T.enter, enterOrigin);
      add(
        i,
        'overview',
        (i === 0 && !enterOrigin ? T.overviewFirst : T.overview) + extraOverview,
        enterOrigin,
      );
      if (region) add(i, 'focus', T.focus, enterOrigin);
      if (isClick) add(i, 'point', T.point, enterOrigin);
    }
    add(i, 'narrate', narrationMs[i], null);
    // Click steps: one press per target (the pointer clicks them in order).
    add(
      i,
      'action',
      (isClick ? T.clickAction * clickCount(step) : T.lookAction + extraLook) +
        (hold.actionExtra?.[i] ?? 0),
      null,
    );
  });
  add(steps.length - 1, 'done', Math.round(END_HOLD_MS * paceScale(hold.pace)), null);

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
