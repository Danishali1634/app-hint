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

/**
 * Max steps per course. Unlimited: authors can add as many steps as they need.
 * Set a finite number here to bring a cap back (StepRail then hides "Add Step").
 */
export const MAX_STEPS = Infinity;

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
/** LocalStorage key for the text-to-speech voice + speed. */
// v2: earlier builds saved a voice on every click in Settings; the new key
// starts everyone back on the default voice until they press Save.
export const LS_VOICE = 'hint-studio-voice-v2';
/** LocalStorage key for the user's own Anthropic API key ("Improve with AI"). */
export const LS_AI_KEY = 'hint-studio-anthropic-key';
/** LocalStorage key for Hinglish words looked up once and saved (services/text/hinglish). */
export const LS_HINGLISH_WORDS = 'hint-studio-hinglish-words';
/** LocalStorage key for pronunciations the user fixed by hand (Settings → Check my courses). */
export const LS_HINGLISH_OVERRIDES = 'hint-studio-hinglish-overrides';
/** LocalStorage key for the voice-typing language last used (hinglish | hindi | english). */
export const LS_DICTATION_LANG = 'hint-studio-dictation-lang';
/** LocalStorage key: auto-fix Hinglish/English spelling while typing step text ('0' = off). */
export const LS_AUTOFIX = 'hint-studio-autofix';
/** LocalStorage key for the plan (free / trial / pro) + free-try usage. */
export const LS_PLAN = 'hint-studio-plan';

// ─── Plans (freemium) ────────────────────────────────────────────────────────
// Everything is local for now (no payments yet). hooks/usePlan.js reads these;
// to gate a new feature, add it to PRO_FEATURES and call tryFeature('key').

/** Length of the "Try Pro free" trial. */
export const TRIAL_DAYS = 14;

/**
 * Pro features. `freeUses` = how many times a Free user can try it before the
 * upgrade dialog appears (0 = Pro only).
 */
export const PRO_FEATURES = {
  screenRecording: {
    label: 'Screen recording',
    unit: 'recordings',
    freeUses: 3,
    pitch: 'Record your screen once and get every step made for you.',
  },
  bulkUpload: {
    label: 'Bulk screenshot upload',
    unit: 'bulk uploads',
    freeUses: 5,
    pitch: 'Drop a whole folder of screenshots — each one becomes its own step.',
  },
};

/** "Free vs Pro" rows in the upgrade dialog. */
export const PLAN_COMPARISON = [
  { label: 'Unlimited courses & steps', free: true, pro: true },
  { label: 'Share links & embeds', free: true, pro: true },
  { label: 'Screen recording → steps', free: '3 tries', pro: 'Unlimited' },
  { label: 'Bulk screenshot upload', free: '5 tries', pro: 'Unlimited' },
  { label: 'Keep courses forever', free: '90 days', pro: true },
  { label: 'Priority support', free: false, pro: true },
];

// ─── Walkthrough timing (ms) ─────────────────────────────────────────────────
// Shared by the live player (WalkthroughPlayer) and the video export
// (services/video), so a downloaded video matches what people see on screen.
// The CSS animations in index.css (.hs-*) are built for these durations.

export const WALKTHROUGH_TIMING = {
  enter: 650, // .hs-stage-emerge / .hs-stage-fade-in
  overviewFirst: 1200, // first step: give time to recognise the page
  overview: 450, // later steps: the screen just opened — move on quickly
  focus: 1450, // camera zoom + focus morph (FocusCamera) (utils/camera.glideMs = 95% of it, ~1.4 s): slow enough to follow
  // Another screenshot of the same screen swaps in as the camera starts to glide.
  // Short on purpose: a long crossfade between two frames of a recording (where
  // things moved) shows both frames at once, a ghosted double image. A quick
  // swap looks like a real screen updating.
  crossfade: 220,
  point: 850, // .hs-cursor glide (850ms)
  silentNarrate: 2200, // step with no voice/text: time to look
  clickAction: 750, // press + ripple, then the next screen starts opening
  lookAction: 450, // brief hold on the highlight
  exitClick: 500, // .hs-stage-exit-click (overlaps the next step's enter)
  exitLook: 600, // .hs-stage-exit-fade (overlaps the next step's enter)
  doneAutoResume: 300,
};

/**
 * The happy ending shown when a walkthrough finishes — in the live player
 * (components/walkthrough/OutroCard) and in the downloaded video
 * (services/video/renderFrame drawOutro). One wording for both.
 */
export const OUTRO_TEXT = {
  heading: "You're all set!",
  learned: (title) => `Now you know: ${title}`,
  tagline: (stepCount) => `${stepCount} step${stepCount === 1 ? '' : 's'} · Happy working! 🎉`,
};
