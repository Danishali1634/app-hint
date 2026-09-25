/**
 * @file Shared data model for Hint Studio, documented with JSDoc.
 *
 * WHY THIS FILE EXISTS
 * The project is plain JavaScript, so nothing enforces these shapes at runtime.
 * This file is the single place that describes what a Course / Step / etc. look
 * like. Editors (VS Code) read these typedefs and give autocomplete + hover docs
 * when other files reference them, e.g.:
 *
 *   /** @param {import('@/types').Course} course *\/
 *
 * The file exports nothing at runtime.
 *
 * DATA FLOW OVERVIEW
 *   Course  ──(saved in IndexedDB "courses" store)──►  editor / course library
 *   Blob    ──(saved in IndexedDB "media" store, keyed by id)──►  step screenshots + audio
 *   Course + media blobs ──(buildWalkthroughSteps)──► WalkthroughStep[] ──► player
 *   Course + media blobs ──(buildShareableCourse)──► ShareableCourse ──► share URL
 */

/**
 * What kind of screen the course documents. Only informational (shown on the
 * New Course form); it does not change editor behaviour.
 * @typedef {'page_feature' | 'full_page' | 'mobile_app'} ScreenContext
 */

/**
 * Course lifecycle. Flow: draft ──Mark OK──► approved ──Publish──► published.
 * 'review' is defined in constants but no screen currently sets it.
 * @typedef {'draft' | 'review' | 'approved' | 'published'} CourseStatus
 */

/**
 * Highlight rectangle on a step's screenshot.
 * All values are PERCENTAGES (0–100) of the IMAGE (the editor canvas always has
 * the image's own aspect ratio), not pixels, so the region maps to the same
 * pixels at any display size — in the editor and in the player's zoom.
 * @typedef {Object} Region
 * @property {number} x Left edge, % of image width
 * @property {number} y Top edge, % of image height
 * @property {number} w Width, % of image width
 * @property {number} h Height, % of image height
 */

/**
 * What the viewer should understand about a step's region.
 *   'click' → "press this": animated pointer clicks it and the NEXT step's
 *             screenshot opens out of it (cause → effect).
 *   'look'  → "notice this": spotlight + pulse only (e.g. the chart inside a modal).
 * @typedef {'click' | 'look'} StepAction
 */

/**
 * One step of a walkthrough, as stored in IndexedDB.
 * Media is NOT stored inline — only ids pointing into the "media" store.
 * @typedef {Object} Step
 * @property {string} id
 * @property {string} label       Short title shown in the step list and player
 * @property {string} text        Description; read aloud by TTS when there is no recording
 * @property {string | null} [imageId]  This step's screenshot (media store). Missing on
 *                                      old courses → falls back to course.baseImageId
 * @property {Region | null} region     The feature area on this step's screenshot
 * @property {StepAction} [action]      Default 'click' (see utils/course.getStepAction)
 * @property {string | null} audioId    Key of the recorded audio Blob in the media store
 */

/**
 * A course, as stored in the IndexedDB "courses" store (keyPath: id).
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} title                Unique (case/space-insensitive) across all courses
 * @property {string} [titleKey]             normaliseTitle(title) — indexed for unique checks
 * @property {string} [pageName]             App page/module this explains, e.g. "Return Repack"
 * @property {ScreenContext} context
 * @property {string} description
 * @property {CourseStatus} status
 * @property {string | null} [baseImageId]  LEGACY: one screenshot shared by all steps.
 *                                          New courses use step.imageId instead.
 * @property {Step[]} steps                  Max length: MAX_STEPS
 * @property {number} createdAt              Epoch ms
 * @property {number} updatedAt              Epoch ms — library sorts by this; drives auto-delete
 * @property {number | null} publishedAt     Epoch ms, set when published
 */

/**
 * A step prepared for playback. Media ids are resolved into data URLs so the
 * player never touches IndexedDB and works the same for local and shared courses.
 * @typedef {Object} WalkthroughStep
 * @property {string} id
 * @property {string} label
 * @property {string} text
 * @property {Region | null} region
 * @property {StepAction} action
 * @property {string | null} audioData  data: URL of the recording
 * @property {string | null} imageData  data: URL of this step's screenshot
 */

/**
 * @typedef {Object} ToastMessage
 * @property {string} id
 * @property {string} message
 * @property {'info' | 'error' | 'success'} type
 */

export {};
