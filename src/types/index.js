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
 *   'type'  → "enter a value here": spotlight + the value is typed into the area
 *             with a blinking caret (Step.typeValue, or a generic typing animation).
 * @typedef {'click' | 'look' | 'type'} StepAction
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
 * @property {Region | null} region     The feature area on this step's screenshot (target 1)
 * @property {Region[]} [extraRegions]  More targets of the same step (2, 3 …), highlighted
 *                                      together with `region` (utils/course.getStepTargets)
 * @property {string[]} [extraTexts]    Descriptions of targets 2, 3 … (target 1 = `text`).
 *                                      When written, each target is explained in turn.
 * @property {StepAction} [action]      Default 'click' (see utils/course.getStepAction)
 * @property {string | null} audioId    Key of the recorded audio Blob in the media store
 * @property {string} [typeValue]       'type' steps: sample value typed in the walkthrough (optional)
 * @property {string | null} [groupId]  Multiple Steps: consecutive steps with the same groupId
 *                                      are sub-steps (Area 1, 2 …) of one main step on the same
 *                                      screenshot. Missing/null = a normal single step.
 *                                      Editor-only; playback treats them as normal steps.
 * @property {number} [videoTime]       "Create by video": seconds into course.sourceVideoId
 *                                      where this step's screenshot was taken. Steps are
 *                                      ordered by it there; playback ignores it.
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
 * @property {Step[]} steps                  Max length: MAX_STEPS (unlimited by default)
 * @property {string[]} [gallery]            Screenshot gallery: media ids uploaded to this course,
 *                                          reusable by any step (kept even when unused;
 *                                          utils/course.getCourseScreens)
 * @property {'screenshots' | 'video'} [source]  How the course was started (missing = screenshots)
 * @property {string | null} [sourceVideoId]  "Create by video": the recording (media store) the
 *                                          steps' screenshots are taken from (pages/VideoTour)
 * @property {number | null} [sourceVideoDuration]  Measured recording length, seconds (fallback
 *                                          when the WebM file reports no duration)
 * @property {Step[]} [videoDraftSteps]      "Create by video": steps in progress, autosaved;
 *                                          written to `steps` only by "Save walkthrough"
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
 * @property {Region[]} [extraRegions]  targets 2, 3 … (see Step)
 * @property {StepAction} action
 * @property {string} [typeValue]       'type' steps: the value to type (may be empty)
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
