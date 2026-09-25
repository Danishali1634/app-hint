/**
 * @file App-wide constants. Keep "magic" strings and numbers here so they are
 * changed in one place (e.g. renaming the IndexedDB database or step limit).
 */

// ─── New Course form: "What are you showing?" ────────────────────────────────

/** Long description shown under each context option. */
export const CONTEXT_LABELS = {
  page_feature: 'A feature that lives on a larger website page',
  full_page: 'An entire website page',
  mobile_app: 'A mobile app screen',
};

/** Options rendered as buttons on the New Course page. */
export const CONTEXT_OPTIONS = [
  { value: 'page_feature', label: 'A feature on a page' },
  { value: 'full_page', label: 'A whole page' },
  { value: 'mobile_app', label: 'A mobile app screen' },
];

// ─── Course status badge ─────────────────────────────────────────────────────

export const STATUS_LABELS = {
  draft: 'Draft',
  review: 'In Review', // defined but not currently used by any flow
  approved: 'Approved', // legacy: set by the old "Mark OK" step
  published: 'Done', // set by "Mark done" in the editor
};

/** Tailwind classes for the status pill (light + dark mode). */
export const STATUS_COLORS = {
  draft: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  review: 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-teal-200 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  published: 'bg-teal-soft text-teal dark:bg-teal-soft-dark dark:text-teal-dark',
};

// ─── Limits ──────────────────────────────────────────────────────────────────

/** Max steps per course. Enforced in the editor (StepRail hides "Add Step"). */
export const MAX_STEPS = 10;

/**
 * Courses are deleted automatically when they haven't been changed for this
 * many days (≈ 3 months). Measured from `updatedAt`, so a course you are still
 * working on never disappears. Download the video to keep a course forever.
 */
export const COURSE_RETENTION_DAYS = 90;
/** Show the "Deletes in N days" warning on a card when this close to expiry. */
export const RETENTION_WARNING_DAYS = 14;

// ─── Storage keys ────────────────────────────────────────────────────────────
// Changing DB_NAME or the store names makes existing users' data "disappear"
// (it is still in the old database). Bump DB_VERSION + add an upgrade step in
// services/storage/db.js instead if the schema needs to change.

export const DB_NAME = 'hint-studio';
/**
 * v1: stores. v2: `by_titleKey` + `by_updatedAt` indexes on courses.
 * v3: same schema — bumped so databases stuck at v2 WITHOUT the indexes get
 *     repaired by the self-healing upgrade in services/storage/db.js.
 */
export const DB_VERSION = 3;
/** Store for Course objects, keyPath "id". */
export const STORE_COURSES = 'courses';
/** Store for Blobs (screenshots + audio), keyed by a media id string. */
export const STORE_MEDIA = 'media';
/** Index on course.titleKey (normalised title) — unique-title checks. */
export const INDEX_TITLE_KEY = 'by_titleKey';
/** Index on course.updatedAt — finding expired courses. */
export const INDEX_UPDATED_AT = 'by_updatedAt';

/** LocalStorage key for the light/dark theme preference. */
export const LS_THEME = 'hint-studio-theme';

// ─── Walkthrough timing (ms) ─────────────────────────────────────────────────
// Shared by the live player (WalkthroughPlayer) and the video export
// (services/video), so a downloaded video matches what people see on screen.
// The CSS animations in index.css (.hs-*) are built for these durations.

export const WALKTHROUGH_TIMING = {
  enter: 750, // .hs-stage-emerge / .hs-stage-fade-in
  overviewFirst: 1400, // first step: give time to recognise the page
  overview: 800, // after a click: the screen just opened, show it briefly
  focus: 1100, // .hs-camera zoom (1000ms) + a beat
  point: 1000, // .hs-cursor glide (900ms) + a beat
  silentNarrate: 2400, // step with no voice/text: time to look
  clickAction: 1000, // press + ripple
  lookAction: 700, // hold on the highlight
  exitClick: 500, // .hs-stage-exit-click
  exitLook: 1000, // zoom back out
  doneAutoResume: 300, // Auto switched on while waiting
};
