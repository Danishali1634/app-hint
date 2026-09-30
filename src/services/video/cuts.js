/**
 * @file Cut parts of the "Create by video" recording (pages/VideoTour).
 *
 * Cuts are non-destructive: the recording itself is never re-encoded. A cut is
 * a `{ start, end }` range in seconds, stored on `course.videoCuts`; the
 * builder's player skips it, seeking into it lands just after it, and the
 * scrubber shows it as removed. Restoring a cut simply deletes the range.
 *
 * Ranges are half-open, [start, end): the moment at `end` is kept.
 */

/** @typedef {{ start: number, end: number }} VideoCut */

/** Shorter cuts are ignored (a double click, not a real selection). */
export const MIN_CUT_SEC = 0.2;
/** A cut may not remove the whole video: at least this much stays. */
const MIN_KEPT_SEC = 0.5;
/** How far before the end a cut counts as "reaching the end". */
const END_SLACK_SEC = 0.05;

/**
 * Clamped to the video, sorted, overlapping or touching cuts merged, tiny ones dropped.
 * @param {VideoCut[] | null | undefined} cuts
 * @param {number} duration
 * @returns {VideoCut[]}
 */
export function normalizeCuts(cuts, duration) {
  const max = duration > 0 ? duration : Infinity;
  const sorted = (cuts || [])
    .map(({ start, end }) => ({
      start: Math.max(0, Math.min(start, end)),
      end: Math.min(max, Math.max(start, end)),
    }))
    .filter((cut) => cut.end - cut.start >= MIN_CUT_SEC)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const cut of sorted) {
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged;
}

/** Seconds of video left after the cuts. */
export function keptDuration(cuts, duration) {
  return Math.max(
    0,
    duration - normalizeCuts(cuts, duration).reduce((sum, c) => sum + c.end - c.start, 0),
  );
}

/**
 * The cuts with one more range, or null when that range is too short or would
 * leave (almost) nothing of the video.
 * @returns {VideoCut[] | null}
 */
export function addCut(cuts, range, duration) {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (end - start < MIN_CUT_SEC) return null;
  const next = normalizeCuts([...(cuts || []), { start, end }], duration);
  return keptDuration(next, duration) < MIN_KEPT_SEC ? null : next;
}

/** The cut that contains `time`, or null. */
export function cutAt(cuts, time) {
  return (cuts || []).find((cut) => time >= cut.start && time < cut.end) || null;
}

/** True when `cut` runs to the end of the video (nothing to jump to after it). */
export const reachesEnd = (cut, duration) => cut.end >= duration - END_SLACK_SEC;

/**
 * Where to go instead of a time inside a cut: just after the cut, or just
 * before it when it runs to the end of the video. Times outside cuts stay.
 */
export function snapOutOfCuts(cuts, time, duration) {
  const cut = cutAt(cuts, time);
  if (!cut) return time;
  if (!reachesEnd(cut, duration)) return cut.end;
  return Math.max(0, cut.start - END_SLACK_SEC);
}
