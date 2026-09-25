/**
 * @file Pure helpers that answer questions about a Course object.
 * No storage or React here — safe to use from services, pages and components.
 *
 * WHY THIS FILE EXISTS
 * Each step owns its own screenshot (step.imageId). Older courses used one
 * shared course.baseImageId instead. Several places (editor, player, share,
 * export, delete) need the same rules for "which image does this step show?"
 * and "is this media still used?", so the rules live here once.
 */

/** @typedef {import('@/types').Course} Course */
/** @typedef {import('@/types').Step} Step */

/**
 * The screenshot a step displays.
 * Falls back to the legacy course-wide image for courses created before
 * per-step screenshots existed.
 * @param {Course} course
 * @param {Step} step
 * @returns {string | null} media id
 */
export function getStepImageId(course, step) {
  return step.imageId ?? course.baseImageId ?? null;
}

/**
 * Whether the viewer is meant to CLICK the region (animated pointer + click,
 * next screen opens from it) or just LOOK at it (spotlight only).
 * Steps saved before this option existed default to 'click'.
 * @param {Step} step
 * @returns {'click' | 'look'}
 */
export function getStepAction(step) {
  return step.action === 'look' ? 'look' : 'click';
}

/**
 * Every media id a course references (screenshots + recordings), de-duplicated.
 * Used when deleting, duplicating or exporting a course.
 * @param {Course} course
 * @returns {string[]}
 */
export function collectMediaIds(course) {
  const ids = new Set();
  if (course.baseImageId) ids.add(course.baseImageId);
  for (const step of course.steps) {
    if (step.imageId) ids.add(step.imageId);
    if (step.audioId) ids.add(step.audioId);
  }
  return [...ids];
}

/**
 * True if any step (or the legacy base image) still points at this media id.
 * Two steps can share one screenshot ("Use screenshot from Step N"), so a
 * Blob may only be deleted once nothing references it any more.
 * @param {Course} course
 * @param {string} mediaId
 */
export function isMediaInUse(course, mediaId) {
  return collectMediaIds(course).includes(mediaId);
}

/** Labels the app generates itself ("Step 3"). Custom labels never match. */
const DEFAULT_LABEL = /^step \d+$/i;

/**
 * After inserting, deleting or reordering steps, renames auto-generated labels
 * ("Step 2") to match their new position, so the list always reads
 * Step 1, Step 2, Step 3 … Labels the author typed themselves are kept.
 * @param {Step[]} steps
 * @returns {Step[]}
 */
export function renumberDefaultLabels(steps) {
  return steps.map((step, i) => {
    const label = (step.label || '').trim();
    const isDefault = !label || DEFAULT_LABEL.test(label);
    return isDefault && label !== `Step ${i + 1}` ? { ...step, label: `Step ${i + 1}` } : step;
  });
}
