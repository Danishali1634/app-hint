/**
 * @file Walkthrough pace — how fast a course plays, in the player AND the video.
 *
 * course.pace: 1 = normal, 0.5 = half speed (everything takes twice as long),
 * 1.5 = faster. It stretches every timed moment — screen entrances, camera
 * glides, pointer moves, clicks, reading time without a voice — and, when
 * slower than normal, adds a pause after each spoken line so viewers can
 * catch up. The voice itself keeps its own speed (Settings → Speed).
 */

import { WALKTHROUGH_TIMING } from '@/constants';

export const PACE = { min: 0.5, max: 1.5, step: 0.05 };

/** A valid pace (missing or invalid = 1). */
export function normalizePace(pace) {
  const n = Number(pace);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(PACE.max, Math.max(PACE.min, n));
}

/** How much longer everything lasts: 2 at half speed. */
export const paceScale = (pace) => 1 / normalizePace(pace);

/** Extra stillness after a spoken line: none at 1× or faster, 1.2 s at 0.5×. */
export const afterVoicePauseMs = (pace) => Math.round(Math.max(0, paceScale(pace) - 1) * 1200);

const cache = new Map();
/** WALKTHROUGH_TIMING stretched to the pace. */
export function pacedTiming(pace) {
  const k = paceScale(pace);
  if (!cache.has(k)) {
    cache.set(
      k,
      Object.fromEntries(
        Object.entries(WALKTHROUGH_TIMING).map(([key, ms]) => [key, Math.round(ms * k)]),
      ),
    );
  }
  return cache.get(k);
}

/** "0.75×" / "Normal". */
export const paceLabel = (pace) =>
  normalizePace(pace) === 1 ? 'Normal' : `${normalizePace(pace).toFixed(2).replace(/0$/, '')}×`;
