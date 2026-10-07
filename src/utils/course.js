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

import { computeFocusView, projectRegion, regionCenter } from '@/utils/camera';

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
 * What the viewer does with the region:
 *   'click' → animated pointer clicks it, next screen opens from it
 *   'look'  → spotlight only
 *   'type'  → the viewer enters a value there: the walkthrough types it in
 * Steps saved before this option existed default to 'click'.
 * @param {{ action?: string }} step
 * @returns {'click' | 'look' | 'type'}
 */
export function getStepAction(step) {
  return step.action === 'look' || step.action === 'type' ? step.action : 'click';
}

/**
 * True for 'click' steps (also old steps without an action). 'look' and
 * 'type' steps have no pointer click and the next screen doesn't open out of them.
 * @param {{ action?: string }} step
 */
export function isClickAction(step) {
  return getStepAction(step) === 'click';
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
  for (const id of course.gallery || []) ids.add(id);
  for (const step of course.steps) {
    if (step.imageId) ids.add(step.imageId);
    if (step.audioId) ids.add(step.audioId);
  }
  return [...ids];
}

/**
 * SCREENSHOT GALLERY: every screenshot of a course, uploaded once and reusable
 * by any Global Step or sub-step — the course's `gallery` (kept even when no
 * step uses a screenshot any more) plus every screenshot a step shows.
 * Order: gallery order first, then first use.
 * @param {Course} course
 * @returns {string[]} media ids
 */
export function getCourseScreens(course) {
  const ids = [...(course.gallery || [])];
  for (const step of course.steps) {
    const id = getStepImageId(course, step);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
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

/**
 * Labels the app generates itself: "Step 3", "Step 3.2" for a sub-step (and
 * the older "Step 3 · Area 2", which gets renamed). Custom labels never match.
 */
const DEFAULT_LABEL = /^step \d+((\.| · area )\d+)?$/i;

/** True for a label the app made itself ("Step 3", "Step 3.2"): never translated or shown as text. */
export const isDefaultLabel = (label) => !label?.trim() || DEFAULT_LABEL.test(label.trim());

/**
 * MULTIPLE STEPS (sub-steps)
 * A main step can hold several sub-steps: areas on ONE screenshot, each with
 * its own description / voice. They are stored as ordinary consecutive steps
 * that share a `groupId` (and the same screenshot), so the player, video,
 * share links and exports treat them like any other steps — the player glides
 * from one area to the next because the screenshot is the same.
 * Steps without a groupId are plain single steps (the default).
 */

/**
 * The step list as MAIN steps: a single step, or a run of consecutive steps
 * with the same groupId. `start`/`end` are indices into `steps` (inclusive).
 * Without any groups this is exactly one unit per step.
 * @param {Step[]} steps
 * @returns {{ start: number, end: number, groupId: string | null }[]}
 */
export function getStepUnits(steps) {
  const units = [];
  steps.forEach((step, i) => {
    const last = units[units.length - 1];
    if (step.groupId && last && last.groupId === step.groupId && last.end === i - 1) last.end = i;
    else units.push({ start: i, end: i, groupId: step.groupId || null });
  });
  return units;
}

/**
 * For each step: its main-step number (1-based) and, for sub-steps, its area
 * number (1-based; null for a single step).
 * @param {Step[]} steps
 * @returns {{ main: number, area: number | null }[]}
 */
export function getStepNumbers(steps) {
  const numbers = [];
  getStepUnits(steps).forEach((unit, u) => {
    for (let i = unit.start; i <= unit.end; i++) {
      numbers[i] = {
        main: u + 1,
        area: unit.groupId ? i - unit.start + 1 : null,
        global: i + 1, // what users see: steps count 1, 2, 3 … across screens
      };
    }
  });
  return numbers;
}

/**
 * What users call a step: "Step 5" — steps are numbered straight through the
 * course; a screen only groups them (no "Step 3.2" nesting in anything shown).
 */
export function formatStepNumber({ global, main }) {
  return `Step ${global ?? main}`;
}

/**
 * How viewers see each step: its number as in the editor ("4") and a
 * heading that says what the step is about — the heading the author typed, or
 * (when the label is still the generated "Step 4.1") the first sentence of the
 * description. `heading` is '' when the step has neither.
 * @param {{ label?: string, text?: string, groupId?: string | null }[]} steps
 * @returns {{ number: string, heading: string }[]}
 */
export function getStepTitles(steps) {
  const numbers = getStepNumbers(steps);
  return steps.map((step, i) => {
    const label = (step.label || '').trim();
    const text = (step.text || '').trim().replace(/\s+/g, ' ');
    const heading =
      label && !DEFAULT_LABEL.test(label) ? label : (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text);
    return { number: String(numbers[i].global), heading };
  });
}

/** Labels the app generates for sub-steps ("Step 3.2", older "Step 3 · Area 2"). */
export const DEFAULT_SUB_LABEL = /^step \d+(\.| · area )\d+$/i;

/**
 * TARGETS: a (sub-)step highlights one or more areas on its screenshot.
 * `region` is target 1 (what older code and links know), `extraRegions`
 * holds targets 2, 3 …; the walkthrough highlights them all together.
 * @param {{ region?: import('@/types').Region | null, extraRegions?: import('@/types').Region[] }} step
 * @returns {import('@/types').Region[]}
 */
export function getStepTargets(step) {
  if (!step?.region) return [];
  return [step.region, ...(step.extraRegions || [])];
}

/**
 * One description per target: target 1's is `step.text`, targets 2, 3 … are
 * `step.extraTexts` (empty = not written). Always `count` entries.
 * @param {{ text?: string, extraTexts?: string[] }} step
 * @param {number} count  number of targets
 * @returns {string[]}
 */
export function targetTexts(step, count) {
  const texts = [step?.text || '', ...(step?.extraTexts || [])].map((t) => t || '');
  while (texts.length < count) texts.push('');
  return texts.slice(0, Math.max(1, count));
}

/** The same step with `targets` as its targets (empty list → no region). */
export function withTargets(targets) {
  return { region: targets[0] || null, extraRegions: targets.slice(1) };
}

/**
 * The area the camera frames: the only target, or the box around all of them.
 * @returns {import('@/types').Region | null}
 */
export function getFocusRegion(step) {
  const targets = getStepTargets(step);
  if (targets.length <= 1) return targets[0] || null;
  const x = Math.min(...targets.map((t) => t.x));
  const y = Math.min(...targets.map((t) => t.y));
  const right = Math.max(...targets.map((t) => t.x + t.w));
  const bottom = Math.max(...targets.map((t) => t.y + t.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Where a click step's LAST target ends up once zoomed in (stage %): the point
 * the next screen opens out of. For one target this is utils/camera.focusedCenter.
 */
export function clickOrigin(step) {
  const targets = getStepTargets(step);
  const last = targets[targets.length - 1];
  return regionCenter(projectRegion(last, computeFocusView(getFocusRegion(step))));
}

/**
 * Repairs groups after edits that don't know about them (the preview studio
 * can insert a plain step inside a group):
 *   - a group that got split in two gets a new id for the later part
 *   - a "group" member without a screenshot becomes a single step
 * Sub-steps of one Global Step MAY show different screens (e.g. the table
 * before and after "Save"), so a different screenshot does not split a group.
 * Returns the same array when nothing needed fixing.
 * @param {Course} course
 * @param {() => string} makeGroupId
 * @returns {Step[]}
 */
export function normalizeStepGroups(course, makeGroupId) {
  let changed = false;
  const usedIds = new Set();
  let run = null; // { originalId, groupId } of the group being continued
  const steps = course.steps.map((step) => {
    if (!step.groupId) {
      run = null;
      return step;
    }
    const imageId = getStepImageId(course, step);
    if (!imageId) {
      run = null;
      changed = true;
      return { ...step, groupId: null };
    }
    if (!run || run.originalId !== step.groupId) {
      const groupId = usedIds.has(step.groupId) ? makeGroupId() : step.groupId;
      usedIds.add(groupId);
      run = { originalId: step.groupId, groupId };
    }
    if (run.groupId === step.groupId) return step;
    changed = true;
    return { ...step, groupId: run.groupId };
  });
  return changed ? steps : course.steps;
}

/**
 * After inserting, deleting or reordering steps, renames auto-generated labels
 * ("Step 2") to match their new position, so the list always reads
 * Step 1, Step 2, Step 3 … (sub-steps: Step 3.1, Step 3.2 …).
 * Labels the author typed themselves are kept. A group left with one member
 * becomes a plain step again.
 * @param {Step[]} steps
 * @returns {Step[]}
 */
export function renumberDefaultLabels(inputSteps) {
  // A "group" of one is just a Global Step with one sub-step: store it as a
  // plain step, so single steps always look the same.
  const units = getStepUnits(inputSteps);
  const steps = inputSteps.map((step, i) => {
    const unit = units.find((u) => i >= u.start && i <= u.end);
    return step.groupId && unit.start === unit.end ? { ...step, groupId: null } : step;
  });
  const numbers = getStepNumbers(steps);
  return steps.map((step, i) => {
    const label = (step.label || '').trim();
    const isDefault = !label || DEFAULT_LABEL.test(label);
    const wanted = formatStepNumber(numbers[i]);
    return isDefault && label !== wanted ? { ...step, label: wanted } : step;
  });
}
