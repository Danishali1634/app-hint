# Hint Studio — Narrated Walkthrough Builder

Explain a feature so clearly that people understand it **even without reading the button
labels**. Each step is one screenshot (the page, then the modal it opens, …) with the feature area
selected. The walkthrough is an animated story, not a slideshow:

> full page → camera zooms into the button → a pointer clicks it → the next screen **opens out of
> that button** → zoom into what matters there → caption + voice explain it.

You can write a description and/or record your voice for each step, then **Mark done** to
**copy a link** (opens the app on that course) or **download the walkthrough as a video**. Courses
have unique titles plus a page name, so you can **search** for them weeks later, even with typos.

**Everything runs in the browser.** There is no backend, no API and no server database; data lives
in the browser's IndexedDB.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Tech stack and why](#2-tech-stack-and-why)
3. [Architecture](#3-architecture)
4. [Folder structure (file by file)](#4-folder-structure-file-by-file)
5. [Data model](#5-data-model)
6. [Application flows](#6-application-flows)
7. [Hooks — what, where, why](#7-hooks--what-where-why)
8. [React patterns used in this codebase](#8-react-patterns-used-in-this-codebase)
9. [Storage](#9-storage)
10. [Debugging guide](#10-debugging-guide)
11. [Coding conventions](#11-coding-conventions)
12. [Known issues and limitations](#12-known-issues-and-limitations)
13. [Build and deployment](#13-build-and-deployment)

---

## 1. Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script                 | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Vite dev server with hot reload              |
| `npm run build`        | Production build to `dist/` (static files)   |
| `npm run preview`      | Serve the production build locally           |
| `npm run lint`         | ESLint (JS + React Hooks rules)              |
| `npm run format`       | Prettier: rewrite files in the project style |
| `npm run format:check` | Prettier: fail if any file is not formatted  |

> Voice recording needs microphone access, which browsers only allow on **HTTPS or localhost**.

---

## 2. Tech stack and why

| Library                  | Used for                                                   | Why this one                                                                                        |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **React 18**             | UI                                                         | Component model + hooks; the whole app is React function components.                                |
| **JavaScript (ES2020+)** | Language                                                   | Plain `.js` files containing JSX. Data shapes are documented with JSDoc in `src/types/index.js`.    |
| **Vite 5**               | Dev server + bundler                                       | Very fast dev server, simple config. Configured to parse JSX inside `.js` files (`vite.config.js`). |
| **react-router-dom 7**   | Routing                                                    | Uses **HashRouter** so the app works on any static host without rewrite rules (see §3).             |
| **Tailwind CSS 3**       | Styling (theme: zinc greys + indigo `#635BFF`, Inter font) | Utility classes, custom colour tokens in `tailwind.config.js`, class-based dark mode.               |
| **idb**                  | IndexedDB access                                           | Tiny Promise wrapper; raw IndexedDB is callback/event based.                                        |
| **lz-string**            | Share links                                                | Compresses JSON _and_ outputs URL-safe characters in one call.                                      |
| **JSZip**                | Export / import                                            | Creates and reads ZIP files in the browser and accepts Blobs directly.                              |
| **lucide-react**         | Icons                                                      | Tree-shakeable SVG icon components.                                                                 |
| Web APIs                 | MediaRecorder, speechSynthesis, FileReader                 | Recording, text-to-speech fallback and Blob → data URL, all built into the browser.                 |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Pages (src/pages)            one component per route                 │
│   Home · Library · NewCourse · CourseEditor · CoursePreview · Shared · Embed
├──────────────────────────────────────────────────────────────────────┤
│ Components (src/components)  reusable UI, no direct storage access*  │
│   course/  StepRail · FeatureSelector · AudioRecorderPanel · Share…  │
│   walkthrough/ WalkthroughPlayer        ui/ Header · Toast · Dialog  │
├──────────────────────────────────────────────────────────────────────┤
│ Hooks (src/hooks)            React state on top of services          │
│   useAudioRecorder · useToast · useTheme                             │
├──────────────────────────────────────────────────────────────────────┤
│ Services (src/services)      plain JS, no React                      │
│   storage/db · storage/settings · audio/recorder · audio/tts         │
│   sharing/share · export/zip                                         │
├──────────────────────────────────────────────────────────────────────┤
│ Browser APIs                 IndexedDB · LocalStorage · MediaRecorder│
│                              speechSynthesis · FileReader · Blob     │
└──────────────────────────────────────────────────────────────────────┘
        * exception: AudioRecorderPanel writes audio Blobs itself (see §6.4)
```

**Rules that keep this layering clean:**

- **Services never import React.** They can be unit-tested or reused on their own.
- **Pages own the data.** For example, `CourseEditorPage` is the single owner of the `course`
  object. Children receive data as props and report changes through callbacks.
- **The player never touches storage.** It receives `WalkthroughStep[]` with media already
  resolved to data URLs, so the same player works for local courses and shared links.

### Provider and route tree (`src/app/router/AppRouter.js`)

```
<ThemeProvider>            light/dark state
  <ToastProvider>          notify() from anywhere
    <HashRouter>
      <AppRoutes>          /s/*, /embed/* → course only
                           everything else → <Sidebar/> (all courses) + page
      <ToastContainer/>    renders toasts on every page
```

| URL                      | Page                | Purpose                                            |
| ------------------------ | ------------------- | -------------------------------------------------- |
| `#/`                     | `HomePage`          | Create a course · search · View all · demo + about |
| `#/courses`              | `LibraryPage`       | All courses: search, filter, card actions          |
| `#/examples/:id?`        | `ExamplesPage`      | 4 playable example walkthroughs ("See examples")   |
| `#/new`                  | `NewCoursePage`     | Create a draft course                              |
| `#/editor/:courseId`     | `CourseEditorPage`  | Screenshot, steps, regions, text, voice, publish   |
| `#/preview/:courseId`    | `CoursePreviewPage` | Inline player (YouTube-style) + course info        |
| `#/s/:slug/:encoded`     | `SharedCoursePage`  | Share link: inline player + course info            |
| `#/embed/:slug/:encoded` | `EmbedPage`         | Player only, for `<iframe>` embeds (250px tall)    |
| anything else            | redirect to `#/`    |                                                    |

**Why HashRouter?** With normal paths, refreshing `/editor/123` on a static host returns 404
unless rewrite rules are configured. Everything after `#` never reaches the server, so
`index.html` is always served and the router takes over.

**Why `lazy()` + `Suspense`?** Each page is a separate JS chunk that loads on first visit. Someone
opening a share link never downloads the editor code.

---

## 4. Folder structure (file by file)

Every file starts with a header comment explaining its purpose and flow. This table is the map.

```
src/
├── main.js                          Entry: mounts <App/> in StrictMode, loads CSS
├── App.js                           Root component → AppRouter
├── index.css                        Tailwind layers + ALL walkthrough animations (.hs-*)
├── app/router/AppRouter.js          Providers + route table
├── types/index.js                   JSDoc typedefs: Course, Step, Region, WalkthroughStep…
├── constants/index.js               Labels, status colours, MAX_STEPS, DB/LocalStorage keys
├── utils/index.js                   Pure helpers: nextId, slug, formatDate, blobToDataUrl…
├── utils/course.js                  Course rules: getStepImageId, collectMediaIds, renumberDefaultLabels…
├── utils/search.js                  normalizeTitle, similarity, searchCourses (+ "did you mean")
├── utils/camera.js                  Pure zoom math, shared by player AND video export
├── services/
│   ├── storage/db.js                IndexedDB CRUD for courses + media, duplicateCourse
│   ├── storage/settings.js          Theme in LocalStorage + <html class="dark">
│   ├── audio/recorder.js            MediaRecorder wrapper → Promise<Blob>
│   ├── audio/tts.js                 speechSynthesis: scores voices (natural first, en-IN/hi-IN), sentence chunks, preview
│   ├── storage/settings.js          (also) voice choice + speed, the user's own AI key
│   ├── sharing/share.js             Course → player steps / compressed share URL (and back)
│   ├── video/timeline.js            Walkthrough as a fixed timeline (phase start/duration); used by the video AND the player's timeline bar
│   ├── video/renderFrame.js         Draws one video frame: outgoing + incoming screen overlap, same-screen glide, progress bar
│   ├── text/enhance.js              "Improve" text: offline polish, or Claude rewrite with the user's own key
│   ├── video/exportVideo.js         canvas + voices → MediaRecorder → MP4/WebM Blob
│   └── export/zip.js                Course ⇄ .zip (course.json + images/ + audio/)
├── hooks/
│   ├── useAudioRecorder.js          Recorder state, timer, errors, unmount cleanup
│   ├── useToast.js                  Toast context: notify / dismiss
│   ├── useTheme.js                  Theme context: theme / toggle
│   ├── useNarration.js              Player voice: recording > TTS, pause/resume, safety timer
│   ├── useElementSize.js            ResizeObserver → live width/height of an element
│   ├── useImageAspectRatios.js      Preloads step screenshots, reports their real ratios
│   ├── useCourseSharing.js          Copy link + Download video (+ progress/fallback overlays)
│   └── useCourseThumbnail.js        Object URL of a course's first screenshot (cards)
├── components/
│   ├── ui/Header.js                 Top bar: sidebar toggle, Courses, New course, Settings, theme
│   ├── ui/SettingsDialog.js         Voice picker (+ preview, speed) and the optional AI key
│   ├── ui/SearchInput.js            Big search box ("/" or Ctrl/Cmd+K)
│   ├── layout/Sidebar.js            ChatGPT-style sidebar: all courses, active one highlighted
│   ├── course/CourseResults.js      Search results / "Did you mean" / course grid
│   ├── course/StepGuide.js          Editor checklist: ① screenshot ② area ③ explain
│   ├── tutorial/HowItWorksDemo.js   Looping animated demo on the Home page
│   ├── tutorial/MiniHint.js         Tiny "what to do here" animations in the editor
│   ├── tutorial/Highlights.js       Home: real product stats (count-up) + use cases → examples
│   ├── walkthrough/CourseInfo.js    Course details under an inline player
│   ├── ui/ThemeToggle.js            Sun/moon button
│   ├── ui/Toast.js                  Toast stack renderer
│   ├── ui/ConfirmDialog.js          "Are you sure?" modal
│   ├── ui/Spinner.js                Spinner + PageSpinner
│   ├── course/StepRail.js           Step list: select, add, delete, drag-reorder
│   ├── course/StepScreenshotUpload.js  Per-step screenshot: upload / drop / paste / reuse
│   ├── course/FeatureSelector.js    Canvas (image's own ratio): draw / move / resize the region
│   ├── course/RegionActionBar.js    "Select area of the feature" + Click vs Look choice
│   ├── course/AudioRecorderPanel.js Record / play / re-record / delete a step's voice
│   ├── course/DescriptionField.js   Step text + ✨ Improve / Undo / 🔊 Listen
│   ├── course/PreviewStudio.js      Editor preview: Watch / Edit, draft with Save / Discard
│   ├── course/StepEditPanel.js      Edit one moment: what's said, highlighted area, add/delete
│   ├── course/ShareLinkModal.js     Share URL + Copy button (fallback when clipboard is blocked)
│   ├── course/CourseCard.js         Library card: thumbnail, page name, Preview/Download/Share, ⋯ menu
│   ├── course/CourseDoneDialog.js   After "Mark done": Copy link / Download video
│   ├── course/VideoExportOverlay.js Progress + Cancel while a video records
│   ├── course/RegionCanvas.js       ⚠️ UNUSED legacy (multi-region design) — safe to delete
│   └── walkthrough/
│       ├── WalkthroughPlayer.js     Phase state machine, narration, controls, keyboard
│       ├── Timeline.js              Video-style timeline bar (+ stepTimings / formatTime)
│       └── WalkthroughStage.js      What each phase looks like: camera, spotlight, pointer, caption
└── pages/
    ├── Home/HomePage.js
    ├── Library/LibraryPage.js
    ├── Embed/EmbedPage.js
    ├── Examples/ExamplesPage.js
src/examples/
    ├── index.js                     The 4 example walkthroughs (WalkthroughStep[])
    └── mockScreens.js               Drawn SVG screens of a sample ERP app + their boxes
    ├── NewCourse/NewCoursePage.js
    ├── CourseEditor/CourseEditorPage.js
    ├── CoursePreview/CoursePreviewPage.js
    └── SharedCourse/SharedCoursePage.js
```

Imports use the `@/` alias for `src/`, e.g. `import { saveCourse } from '@/services/storage/db'`.
It's configured in `vite.config.js` (for the build) and `jsconfig.json` (for VS Code
IntelliSense).

---

## 5. Data model

The full definitions, with JSDoc, are in `src/types/index.js`.

```js
Course {
  id,
  title,                          // UNIQUE (ignoring case/spacing/punctuation)
  titleKey,                       // normalizeTitle(title) — indexed, set by saveCourse
  pageName,                       // app page/module it explains, e.g. "Return Repack" (searchable)
  description,
  context:     'page_feature' | 'full_page' | 'mobile_app',   // informational only
  status:      'draft' | 'review' | 'approved' | 'published',
  baseImageId: string | null,     // LEGACY: one screenshot for all steps (old courses only)
  steps:       Step[],            // max 10 (MAX_STEPS)
  createdAt, updatedAt, publishedAt   // epoch ms; updatedAt drives auto-delete,
                                      // publishedAt = last "Mark done"
}

Step {
  id, label,
  text:    string,                // caption in the player; spoken by TTS if no recording
  imageId: string | null,         // → media store: THIS step's screenshot
  region:  { x, y, w, h } | null, // the feature, in PERCENT (0–100) of the screenshot
  action:  'click' | 'look',      // click: pointer clicks it, next screen opens from it
                                  // look:  zoom + spotlight only
  audioId: string | null          // → media store
}

WalkthroughStep {                 // what the player consumes
  id, label, text, region, action,
  audioData: string | null,       // data: URL
  imageData: string | null        // data: URL of this step's screenshot
}
```

**Media is stored separately from courses.** Steps only hold ids (`imageId`, `audioId`), and the
Blobs live in their own IndexedDB store. Two steps may **share** one screenshot ("Use step N's
screenshot"), so an image is only deleted once no step uses it (`releaseImage` in the editor,
`isMediaInUse` / `collectMediaIds` in `utils/course.js`).

**Backward compatibility:** old courses have `course.baseImageId` and no `step.imageId`.
`getStepImageId(course, step)` returns `step.imageId ?? course.baseImageId`, so they keep working
everywhere (editor, player, share, export). Steps without `action` default to `'click'`.

**Status lifecycle:**

```
draft ──[Mark done]──► published (shown as "Done")
A done course stays fully editable. Import / duplicate reset to draft.
('approved' is a legacy state from the old Mark OK → Publish flow; 'review' is never set.)
```

---

## 6. Application flows

### 6.1 Create a course

```
Home / sidebar "New course" → #/new
  NewCoursePage: title (required, unique), page name (required), context, description
    title is checked live against IndexedDB (debounced); if taken → "Open it" link
  Create → saveCourse({ status: 'draft', steps: [ empty "Step 1" ], … })
        → navigate to #/editor/:id  (opens on "Add the screenshot for step 1")
```

### 6.2 Load the editor

```
CourseEditorPage mount
  getCourse(courseId) ──not found──► toast "Course not found" → #/
        │ found
        ▼
  setCourse, select first step
  effect on the ACTIVE step's image id → getMediaAsDataUrl → imageUrl (canvas)
```

For the active step the editor shows:

1. **No screenshot yet:** `StepScreenshotUpload`. Upload, drag & drop, paste (Ctrl/Cmd+V), or
   "Use step N's screenshot".
2. **Screenshot, no area yet:** the canvas plus a big pulsing **"Select area of the feature"**
   button.
3. **Area selected:** "Reselect area" and the choice **👆 Viewer clicks this** / **👁 Just look at
   this**, with a one-line preview of what the walkthrough will do.

With no steps at all, it shows "Add First Step".

### 6.3 Edit a step (autosave)

There is no Save button. Every edit goes through `updateCourse(patch)` or
`updateStep(stepId, patch)`, which:

```
setCourse(prev => { updated = merge(prev, patch, updatedAt: now); saveCourse(updated); return updated })
```

| User action               | Code path                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Add step screenshot       | `StepScreenshotUpload.onFile` → `handleImageFile` (type/size check) → `putMedia` → `setStepImage`              |
| Change screenshot         | "Change screenshot" → `handleImageFile` → `setStepImage` (region reset, old image released)                    |
| Reuse previous screenshot | "Use step N's screenshot" → `reusePreviousImage` → `setStepImage(sharedId)`                                    |
| Select feature area       | "Select area of the feature" → draw mode → drag on `FeatureSelector` → `handleRegionChange` (leaves draw mode) |
| Move / resize area        | drag the box / a corner handle → `handleRegionChange`                                                          |
| Click vs Look             | `RegionActionBar` → `updateStep({ action })`                                                                   |
| Add step (end)            | `addStep` → `insertStep(steps.length)` (blocked at `MAX_STEPS`)                                                |
| Insert step between two   | StepRail "+" between rows → `insertStep(index)`; "Step N" labels renumbered                                    |
| Re-record voice           | AudioRecorderPanel "Re-record" → the new take replaces the old one only when saved                             |
| Delete step               | StepRail 🗑 → `ConfirmDialog` → `deleteStep` (deletes its audio + unshared screenshot)                          |
| Reorder steps             | StepRail drag & drop → `reorderSteps(from, to)`                                                                |
| Edit label / description  | input `onChange` → `updateStep`                                                                                |
| Edit title                | click title → input → on blur `finishTitleEdit` refuses a duplicate and restores the old one                   |
| Edit page name            | click the page-name chip → `updateCourse({ pageName })`                                                        |

**How region drawing works** (`FeatureSelector`): the canvas takes the screenshot's **own aspect
ratio** (read from the image on load), so a percentage points at exactly the same pixels in the
player's zoom. On pointer-down it converts the position to a percentage. It then attaches
`pointermove`/`pointerup` listeners to `window` for the duration of the drag, so releasing outside
the canvas still ends it. Pointer events cover mouse, touch and pen. Regions smaller than 3% are
ignored, and moving or resizing keeps the box inside the image.

### 6.4 Record voice

```
AudioRecorderPanel                     useAudioRecorder            services/audio/recorder
 "Record voice" ── start() ──────────► createAudioRecorder ──────► getUserMedia (permission)
                                       timer every 1 s             MediaRecorder.start()
 "Stop & Save" ─── stop() ───────────► recorder.stop() ──────────► onstop → Blob, mic released
   putMedia(newId, blob)
   deleteMedia(oldAudioId)             ← replace the previous take, no orphaned Blobs
   onSave(newId) → editor.updateStep({ audioId })
 "Cancel" ──────── cancel() ─────────► audio discarded, mic released
```

### 6.5 Playback — the animated walkthrough

The same `WalkthroughPlayer` is used everywhere. Every step runs through a **phase state
machine**. `WalkthroughPlayer.js` decides the phase, and `WalkthroughStage.js` decides what it looks
like.

```
enter ─► overview ─► focus ─► point ─► narrate ─► action ─► next step (automatically)
                       │  (look steps skip "point")     │
                       │                                └─(last step)─► done
                       └─(no area: overview ─► narrate)

next step on the SAME screenshot:  focus (camera + pointer glide from the old area) ─► narrate ─► …
```

| Phase      | What the viewer sees                                                                                                      | Ends after                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `enter`    | Screenshot appears. After a click step it **grows out of the clicked button** (`.hs-stage-emerge`), otherwise it fades in | 750 ms                            |
| `overview` | The full screenshot: "this is the page"                                                                                   | 1.4 s first / 0.8 s after a click |
| `focus`    | Camera zooms into the area (max 2.5×); the rest dims (spotlight); ring pulses                                             | 1.1 s                             |
| `point`    | Animated pointer glides in from the corner onto the button (click only)                                                   | 1.0 s                             |
| `narrate`  | Caption bubble next to the area; recorded voice, or TTS of the text                                                       | voice ends (or 2.4 s if silent)   |
| `action`   | Click: pointer presses, ripple rings, ring flashes. Look: short hold                                                      | 1.0 s / 0.7 s                     |
| `exit`     | The previous screen, drawn **under** the next one while it enters: dives into the clicked button, or fades                | 0.65 s (overlaps `enter`)         |
| `done`     | Last step only: "That's the whole feature!" + Watch again                                                                 | user                              |

- **Camera math** (`camera.js`): the image layer is moved with
  `translate(tx%, ty%) scale(s)`. `computeFocusView(region)` picks `s` so the area fills about 42%
  of the stage (never above 2.5×, to stay sharp), centres it slightly above the middle (to leave room
  for the caption), and clamps so no empty space shows past the image edge. Overlays (spotlight,
  ring, pointer, caption) are drawn **outside** the scaled layer at `projectRegion(region, view)`,
  so they stay crisp.
- **Stage size:** `useElementSize` measures the free space and `useImageAspectRatios` provides the
  screenshot's real ratio. The stage is the largest box of that exact ratio that fits.
- **Narration** (`useNarration`): recorded audio ▶ TTS of `step.text` ▶ nothing. TTS has a safety
  timer so a browser that never fires "finished" can't freeze the walkthrough.
- **One piece, like a video:** nothing starts without a click, but after ▶ every step flows into
  the next on its own. There is no Next button. The previous screen stays on stage (`leaving`)
  while the next one enters, so there is never a blank frame. Consecutive steps on the **same
  screenshot** keep the same stage (`stageKey`), so the camera and pointer glide from one area to
  the next with no cut. After the last step it stops on "That's the whole feature!".
- **Controls:** ▶/⏸ and a **video timeline** (`walkthrough/Timeline.js`): one bar that fills
  continuously, thin gaps where steps begin, the step name on hover, click to jump, and
  `0:12 / 0:45`. Step lengths use the same phase plan as the video export
  (`buildTimeline`), with estimated speaking times. A recording's real length replaces the
  estimate once it has played.
- **Keyboard:** `Space` play/pause · `←` `→` jump a step · `Esc` exit. Keys are ignored while
  typing in a text field.
- **Small screens** (< 640 px): the caption docks under the screenshot instead of floating.
- **Reduced motion:** with the OS "reduce motion" setting, animations become instant but the
  sequence stays the same.

**Nothing ever plays by itself.** Every player opens paused on step 1 with a big ▶ over the
screenshot, like a YouTube video.

| Entry point      | Where                                | Layout                                            |
| ---------------- | ------------------------------------ | ------------------------------------------------- |
| Editor "Preview" | `CourseEditorPage` → `PreviewStudio` | full screen, Watch / **Edit** (see below)         |
| Preview page     | `#/preview/:id`                      | **inline** in the page (no pop-up)                |
| Shared link      | `#/s/:slug/:encoded`                 | **inline** in the page (no pop-up)                |
| Embed            | `#/embed/:slug/:encoded`             | fills the iframe; **compact** below 480 px height |

- **Compact mode** (automatic when the player is under `COMPACT_MAX_HEIGHT` = 480 px, e.g. the
  250 px embed): no top bar, small controls, and a small caption over the screenshot.
- **Preview studio** (`components/course/PreviewStudio.js`, editor "Preview" only):
  - **Watch** (default): the player at full size, plus one **Edit** button.
  - **Edit**: the player pauses and a panel (`StepEditPanel.js`) opens beside it for the moment
    on screen. To pick another moment, press ▶ and pause where you want, or click the timeline.
    While it plays, the panel says "Pause at the moment you want to change".
  - The panel shows three things:
    1. **What's said.** The recorded voice if there is one (re-record or remove it), with the
       caption under it. Otherwise the text, with ✨ Improve and 🔊 Listen, plus "Or record your
       own voice".
    2. **Highlighted area.** Change it, switch Click/Look, or replace the screenshot.
    3. **Add a step after this** / **Delete this step.**
  - **Draft, not autosave.** **Save** writes the course and confirms with a ✓ Saved animation.
    **Discard** throws the draft away, so nothing goes live. Media from a discarded draft is
    deleted, and media the saved course no longer uses is cleaned up. Closing with unsaved
    changes asks first.

**Several areas on one screenshot:** after selecting an area, **+ Add another area** creates the
next step on the _same_ screenshot, and starts straight in "drag a box" mode. Each area is its
own numbered step (1, 2, 3…) with its own description and voice. The editor shows the other
areas as numbered dashed boxes; click one to edit it. There are chips for "Areas on this
screenshot". Because the steps share the screenshot, the player and the video glide the camera
from area to area as one scene. There's no new data format: consecutive steps simply share an
`imageId`.

**Small files:**

- Voices are recorded as Opus at 32 kbps, which is clear for speech.
- **Upload audio** lets you use an existing voice file (MP3, M4A, WAV, …) for a step. It is
  re-encoded to the same small format (`compressVoiceFile`), so a 200 KB WAV becomes about
  20 KB. This takes as long as the audio plays; the limit is 3 minutes per step.
- Video: 2 Mbps H.264 at 720p with 96 kbps audio, about 7 MB per minute.
- Share and embed links:
  - screenshots are capped at 1280 px and WebP quality 0.6 (links only; the app keeps the
    originals);
  - area numbers are rounded, and ids are shortened.
  - A link still contains the whole course, so it can't be as short as a bit.ly link without an
    online service to store courses.

**What is said at each step** is shown as a pill in the step list and in the edit panel: **Your
voice** (a recording, which plays first), **Text · AI voice**, or **Nothing to say yet**.

**Voice → text** (`services/audio/transcribe.js`): **Convert to text (use AI voice)** on a
recording, or **Convert all voices to text** in the editor header, turns recordings into the
step text using Whisper, which runs in the browser. The recording is then removed, so the AI
voice reads the text. The first use downloads the model once (~80 MB), and the audio never
leaves the browser. The text is written in English, because Whisper translates Hindi/Hinglish
speech.

**Clear recordings** (`services/audio/recorder.js`):

- The browser's echo and noise suppression and auto gain run first.
- A Web Audio clean-up chain follows: high-pass 90 Hz (hum and rumble), low-pass 9 kHz (hiss),
  then a compressor with make-up gain so every word is equally clear.
- Recordings are Opus at 128 kbps.
- The video mixes voices through another gentle compressor.

**Video voice for text steps** (`services/audio/neuralVoice.js`): the browser's speechSynthesis
can't be recorded. When exporting, text steps without a recording are spoken by a Piper neural
voice running in WebAssembly, and that audio is mixed into the video. The first export
downloads the voice once (~60 MB, cached in OPFS).

**Video ending:** after the last step the video dims, then:

- a check mark draws itself in a glowing circle, with sparkles;
- "You're all set!" appears, with "Now you know: <title>";
- `drawOutro` in `renderFrame.js` draws it; `END_HOLD_MS` is 4.8 s.

**Timeline seeking:** clicking the timeline jumps to that exact moment (step, phase and offset
into the voice), even inside the step that is playing (`momentAt` → `seekTo`). In edit mode,
"+" buttons on the timeline insert a step before step 1, between any two steps, or at the end.
The edit panel also has **Add step before / after**.

**Voice priority:** a recorded voice always wins; text-to-speech is only used when a step has no
recording. The video export follows the same rule.

**AI voice** (`services/audio/tts.js`): browsers ship very different voices, so each one is
scored. Natural, neural or online voices (Edge's "Natural" voices, Chrome's Google voices, and
Apple's Premium/Enhanced voices) rank first, and `en-IN` / `hi-IN` voices are preferred.
Long text is spoken sentence by sentence, which sounds more natural and avoids Chrome's
long-utterance cut-off. **Settings** (gear icon) lets you choose the voice, preview it, and set
the speed. The choice is stored in LocalStorage (`hint-studio-voice`).

**Improve text** (`services/text/enhance.js`, button ✨ under every description):

- Without a key, `polishText()` tidies spacing, punctuation and capitals offline, and never
  changes your words.
- With your own Anthropic API key (Settings → "Improve text with AI"), it rewrites the step with
  Claude (`claude-opus-5`, low effort) into one or two clear spoken sentences. It keeps Hinglish,
  English, and UI labels exactly as written.
  - The SDK is loaded lazily, only on first use.
  - Server-side fallbacks (`fallbacks: 'default'`) retry on a fallback model if a request is
    declined.
  - The key is stored only in this browser and sent only to Anthropic. The browser call is
    acceptable **only** because it is the user's own key. Never ship a shared key this way.
- **Undo** restores the previous text.

### 6.6 Mark done → Copy link / Download video

```
Editor bottom bar: "N of M steps ready" (ready = screenshot + selected area) · Preview · Mark done
Mark done → every step ready? no → toast + jump to that step
                             yes → status 'published', publishedAt = now → CourseDoneDialog
CourseDoneDialog:  🔗 Copy link       → useCourseSharing.copyLink
                   </> Copy embed code → useCourseSharing.copyEmbed (iframe, width 100%, height 250)
                   ⬇ Download video  → useCourseSharing.downloadVideo
Course card:       ▶ Preview · ⬇ Download video · 🔗 Copy link · ⋯ Copy embed code (same hook)
```

- A done course **stays editable**. Links and videos are snapshots, so after an edit the bottom bar
  says "Changed since you shared it" and the button becomes **Share / Download** to make fresh ones.
- **Copy link:** if the browser blocks the clipboard, `ShareLinkModal` shows the link with a Copy
  button.

**Video export** (`services/video/*`): browsers can't silently screen-record a page, so the
walkthrough is **redrawn on a `<canvas>`** using the same camera maths (`utils/camera.js`) and the
same timing (`WALKTHROUGH_TIMING` in constants). `canvas.captureStream()` provides the video, and
recorded voices are scheduled into an `AudioContext` destination. `MediaRecorder` records both **in
real time** (a 17 s walkthrough takes about 17 s). The output is MP4 when the browser supports it
(Chrome, Safari), otherwise WebM, at 1280×720.

How the share URL is built (`services/sharing/share.js`):

```
Course → resolve media to data URLs → screenshots re-encoded (WebP/JPEG ≤1600px, links only)
       → { v: 3, c: { title, pageName, images: {id: dataUrl}, steps: [...] } }
       → JSON → LZString.compressToEncodedURIComponent → "<origin>/#/s/<slug>/<encoded>"
```

In v3 each screenshot is embedded **once** in `c.images`, and steps point at it with `imageKey`.
Old v2 links (one shared `c.imageData`) still open.

Opening the link reverses this. `SharedCoursePage` runs `decodeShareableCourse`, which returns
`null` for a corrupted or truncated link (an error screen is shown). Otherwise it runs
`shareableToWalkthroughSteps` and hands the result to the player. **IndexedDB is not used**, so the
link works in any browser.

### 6.6b Search, unique titles and auto-delete

- **Search** (dashboard, `utils/search.js`): matches title **and** page name, ignoring case, spaces
  and punctuation, and ranks exact > prefix > phrase > all words. With no matches it shows **"No
  results found"** plus **"Did you mean"** cards, using bigram (Dice) similarity, so "stock
  recieve" finds "Receive Stock". Shortcuts: `/` or `Ctrl/Cmd+K` focuses the box, `Esc` clears it.
- **Unique titles:** `findCourseByTitle` (uses the `by_titleKey` index) is checked on create and
  on rename. Duplicate and import never fail: `makeUniqueTitle` adds " (2)".
- **Auto-delete:** `purgeExpiredCourses()` runs when the dashboard loads and deletes courses (with
  media) whose **last change** (`updatedAt`, index `by_updatedAt`) is older than
  `COURSE_RETENTION_DAYS` (90). Every edit restarts the countdown. Cards warn 14 days ahead, and
  the editor shows "Kept until <date>".

### 6.7 Export and import (ZIP)

```
Export: course.json { version: 3, course, mediaManifest } + images/image_N.* + audio/audio_N.*
        mediaManifest maps OLD media ids → paths inside the ZIP (each file written once)
Import: read course.json → check version (1, 2 or 3) → copy every file into IndexedDB under NEW
        ids (shared screenshots stay shared) → rewrite ids in the course → 'draft' → saveCourse
```

Imports always create a **new** course, so importing the same file twice gives two copies.

### 6.8 Duplicate and delete

- **Duplicate** (`duplicateCourse`): deep-copies the course **and all its media** (every step
  screenshot and recording) under new ids, so deleting one copy never breaks the other. The title
  gets "(copy)" and the status resets to draft.
- **Delete** (`deleteCourse`): removes every media id from `collectMediaIds(course)`, then the
  course.

### 6.9 Theme and toasts

- **Theme:** `getTheme()` reads LocalStorage, falling back to the OS preference. `applyTheme()`
  toggles `class="dark"` on `<html>`, which enables Tailwind's `dark:` classes.
- **Toasts:** calling `notify(message, 'success' | 'error' | 'info')` anywhere shows a toast that
  disappears after 4 s.

---

## 7. Hooks — what, where, why

### Custom hooks

| Hook                   | File                            | Used by                                             | Why it exists                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAudioRecorder`     | `hooks/useAudioRecorder.js`     | `AudioRecorderPanel`                                | The recorder service is plain JS. The hook adds React state (`state`, `duration`, `error`), a 1-second timer, friendly permission errors, and **guaranteed mic release on unmount**, so the panel only handles buttons.                                                                           |
| `useToast`             | `hooks/useToast.js`             | Most pages + `AudioRecorderPanel`, `ShareLinkModal` | Global notifications without passing props down the tree. One `<ToastContainer/>` renders them.                                                                                                                                                                                                   |
| `useTheme`             | `hooks/useTheme.js`             | `ThemeToggle`                                       | Shares the light/dark value app-wide; persistence lives in `services/storage/settings.js`.                                                                                                                                                                                                        |
| `useNarration`         | `hooks/useNarration.js`         | `WalkthroughPlayer`                                 | The phase machine only says "narrate this step, tell me when done". The hook picks recording vs TTS and handles pause/resume/stop and progress. A **token guard** stops a cancelled narration from advancing the walkthrough, and a **safety timer** stops a silent TTS failure from freezing it. |
| `useElementSize`       | `hooks/useElementSize.js`       | `WalkthroughPlayer`                                 | The stage must have the screenshot's exact ratio _and_ fit a box whose height CSS can't know, so the box is measured with `ResizeObserver`.                                                                                                                                                       |
| `useCourseSharing`     | `hooks/useCourseSharing.js`     | `useCourseLibrary`, `CourseEditorPage`              | Copy link, Copy embed code and Download video appear on every card and in the Mark done dialog. The async work, progress overlay, Cancel, error toasts and clipboard fallback live in one place.                                                                                                  |
| `useCourseLibrary`     | `hooks/useCourseLibrary.js`     | `HomePage`, `LibraryPage`                           | Loads the courses (after the auto-delete cleanup) and provides every card action plus the delete dialog, so Home and Library behave the same.                                                                                                                                                     |
| `useCourseList`        | `hooks/useCourseList.js`        | `Sidebar`                                           | A live course list: `db.js` fires `COURSES_CHANGED_EVENT` after every save or delete, and the hook re-reads IndexedDB (debounced, because the editor autosaves on every keystroke).                                                                                                               |
| `useCourseThumbnail`   | `hooks/useCourseThumbnail.js`   | `CourseCard`                                        | Card thumbnails via `URL.createObjectURL` (no big base64 copies), revoked on unmount to free memory.                                                                                                                                                                                              |
| `useImageAspectRatios` | `hooks/useImageAspectRatios.js` | `WalkthroughPlayer`                                 | Preloads every screenshot (instant step transitions) and reports each natural ratio, which the zoom math needs **before** a step is shown.                                                                                                                                                        |

`useToast` and `useTheme` **throw if used outside their Provider**, so a missing Provider fails
loudly instead of silently returning `null`.

### Built-in React hooks, and why each is used

| Hook                | Where                                                                                              | Reason                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `useState`          | everywhere                                                                                         | UI state that should re-render when it changes.                                                                                    |
| `useEffect`         | data loading in pages, listeners, cleanup                                                          | Side effects: IndexedDB reads, `window` listeners (keyboard, mouse drag), stopping audio or the mic on unmount.                    |
| `useRef`            | `audioRef`, `recorderRef`, `timerRef`, `tokenRef`, `keyHandlersRef`, `containerRef`, `ttsTimerRef` | A value that survives re-renders **without** causing one: DOM nodes, audio elements, timers, and "latest callback" references.     |
| `useCallback`       | `updateCourse`, `updateStep`, `notify`, recorder actions, player navigation                        | Keeps function identity stable so functions can be listed in effect dependencies without re-running those effects on every render. |
| `useContext`        | `useToast`, `useTheme`                                                                             | Reads the Provider value.                                                                                                          |
| `useParams`         | editor, preview, shared pages                                                                      | Reads `:courseId` or `:encoded` from the URL.                                                                                      |
| `useNavigate`       | pages                                                                                              | Programmatic navigation (after create, "not found", back buttons).                                                                 |
| `useLocation`       | `AppRouter`                                                                                        | Detects `/s/...` to hide the header on shared links.                                                                               |
| `lazy` / `Suspense` | `AppRouter`                                                                                        | Per-page code splitting with a spinner fallback.                                                                                   |

---

## 8. React patterns used in this codebase

**1. The `mounted` guard for async effects.** It's used in the editor, `AudioRecorderPanel` and
`PreviewStudio`:

```js
useEffect(() => {
  let mounted = true;
  getMediaAsDataUrl(id).then((url) => {
    if (mounted) setImageUrl(url);
  });
  return () => {
    mounted = false;
  };
}, [id]);
```

Without it, switching steps quickly could let an **old** result overwrite the **new** step's
state.

**2. The "latest callback" ref** (`WalkthroughPlayer`). The keyboard listener is registered once,
and `keyHandlersRef.current = { goNext, goPrev, togglePlay, onExit, embedded }` is reassigned on every render.
The listener reads the ref, so it never calls an outdated closure.

**2b. A state machine driven by effects** (`WalkthroughPlayer`). One effect runs a `setTimeout`
for the current phase, and its cleanup cancels the timer. Any phase change, pause or navigation
therefore cancels the pending transition automatically, and a stale timer can never skip a step.
`runId` is bumped on every (re)start of a step. It's part of the stage's `key`, so CSS enter
animations replay.

**3. Functional state updates.** `setCourse(prev => …)` always builds on the newest state, even
when several updates happen in quick succession (fast typing, drag events).

**4. Window listeners only while needed.** `FeatureSelector` attaches `pointermove`/`pointerup`
only during a drag, and the effect cleanup removes them. `StepScreenshotUpload` listens for `paste`
only while it's on screen.

**5. Controlled modals.** `ConfirmDialog` and `ShareLinkModal` never decide anything themselves.
The parent owns `open` and the action.

**6. StrictMode.** `main.js` wraps the app in `<StrictMode>`. In development React runs renders,
effects and state updaters **twice** to expose impure code. If you see something happen twice in
dev only, this is why; it doesn't happen in production.

---

## 9. Storage

| Data                               | Where                      | Key / store                                                          |
| ---------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Courses (metadata, steps, regions) | IndexedDB `hint-studio` v2 | store `courses`, keyPath `id`, indexes `by_titleKey`, `by_updatedAt` |
| Screenshots + audio (Blobs)        | IndexedDB `hint-studio` v2 | store `media`, key = media id                                        |
| Theme                              | LocalStorage               | `hint-studio-theme`                                                  |

- **v1 → v2 migration** (`upgrade()` in `db.js`): adds both indexes and backfills `titleKey` on
  existing courses. It was tested against a real v1 database.
- **Changing the schema:** bump `DB_VERSION` in `constants/index.js` and add a migration in
  `upgrade()` in `services/storage/db.js`. Don't rename `DB_NAME`; existing users would appear to
  lose their data.
- **Invariant:** whenever a course or step is removed, its media must be removed too, **unless
  another step still uses it** (shared screenshots). `deleteCourse`, `deleteStep`, `setStepImage`
  (replacement) and re-recording all follow this.
- IDs come from `nextId(prefix)` and look like `course…`, `step…`, `media…`, `toast…`, which makes
  them easy to recognise in DevTools.

---

## 10. Debugging guide

### DevTools checklist

- **Application → IndexedDB → hint-studio:** inspect the `courses` and `media` stores. Deleting the
  database gives a clean slate.
- **Application → Local Storage:** `hint-studio-theme`.
- **Console:** services throw real `Error`s, and user-facing failures also show a toast.
- **React DevTools:** check `CourseEditorPage` state (`course`, `activeStepId`, `drawMode`) and
  `WalkthroughPlayer` state (`index`, `phase`, `playing`, `autoAdvance`, `enterOrigin`). Watching
  `phase` change is the fastest way to debug the animation sequence.

### Symptom → where to look

| Symptom                                | Look at                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Course missing / "Course not found"    | `getCourse` in `services/storage/db.js`; check the id in the URL vs the `courses` store                                               |
| Edits not saved after refresh          | `updateCourse` / `updateStep` in `CourseEditorPage.js` (they call `saveCourse`)                                                       |
| Screenshot not showing in editor       | effect on `activeImageId` in `CourseEditorPage.js` → `getStepImageId`; does the id exist in the `media` store?                        |
| Region drawing / dragging wrong        | `FeatureSelector.js` → `getRelativePos`, `handleMove`, `handleUp`                                                                     |
| Zoom lands in the wrong place          | `camera.js` → `computeFocusView`; is the stage ratio right? (`useImageAspectRatios`)                                                  |
| Walkthrough stuck on a step            | `phase` in React DevTools; `phaseDuration` + timed effect in `WalkthroughPlayer.js`; `useNarration` (onEnd / safety timer)            |
| Animation looks wrong / too fast       | `.hs-*` classes in `index.css` (durations must match `WALKTHROUGH_TIMING`)                                                            |
| Next screen doesn't "open" from button | step `action` must be `'click'`; `enterOrigin` from `focusedCenter()`                                                                 |
| "Microphone permission denied"         | `useAudioRecorder.start` catch block; site must be HTTPS/localhost; browser site settings                                             |
| Recording saved but silent/empty       | `services/audio/recorder.js` → `pickMimeType`, `ondataavailable`, `onstop`                                                            |
| Player doesn't speak text              | `services/audio/tts.js` → `scoreVoice` / `listVoices` (voices load async; check `speechSynthesis.getVoices()`), Settings voice choice |
| Audio won't auto-start                 | browser autoplay policy → `onBlocked` in `useNarration` pauses the player; press Play                                                 |
| Step timing / timeline length          | `WALKTHROUGH_TIMING` in `constants/index.js` (player, timeline bar and video share it)                                                |
| Share link "Cannot Open Course"        | link truncated by the chat app / browser (too long) → `decodeShareableCourse` returns null                                            |
| Search doesn't find a course           | `searchCourses` in `utils/search.js`; check `title` / `pageName` in the `courses` store                                               |
| "Title already exists" wrongly         | `titleKey` of the other course (`normalizeTitle`); `findCourseByTitle` in `db.js`                                                     |
| Course vanished                        | auto-delete: `updatedAt` older than 90 days → `purgeExpiredCourses`                                                                   |
| Video download fails / is choppy       | `services/video/exportVideo.js`; the tab must stay visible; `isVideoExportSupported()`                                                |
| Video looks different from player      | `renderFrame.js` vs `WalkthroughStage.js` (both use `utils/camera.js` + `WALKTHROUGH_TIMING`)                                         |
| Import fails                           | `importCourseZip` in `services/export/zip.js` (missing `course.json`, bad version)                                                    |
| Theme not persisting                   | `services/storage/settings.js` + `hooks/useTheme.js`                                                                                  |
| Page blank after navigation            | lazy-import path in `AppRouter.js`; check the console for chunk load errors                                                           |

---

## 11. Coding conventions

- **Formatting:** Prettier (`.prettierrc.json`): single quotes, semicolons, trailing commas, 100
  columns. Run `npm run format` before committing.
- **Linting:** ESLint with React Hooks rules. Unused variables are errors; capitalised names
  (components, constants) are exempt because they're used in JSX.
- **Files:** `.js` for everything, including JSX. PascalCase for components (`StepRail.js`),
  camelCase for hooks, services and utils (`useToast.js`, `db.js`).
- **Exports:** named exports (`export function X`), except `App` (default).
- **Comments:** every file starts with a `@file` header explaining **what it does, where it's
  used and why**. Functions get JSDoc with `@param` / `@returns` using the typedefs from
  `@/types`. Inline comments explain _why_, not _what_.
- **Constants:** magic numbers go in named constants (`MAX_STEPS`, `MAX_IMAGE_BYTES`,
  `TOAST_DURATION_MS`, the player timing constants) and repeated Tailwind strings go in
  `*_CLASS` constants.
- **Layering:** see §3. UI → hooks → services → browser APIs. Services never import React.

---

## 12. Known issues and limitations

1. **Share URLs are long.** The whole course is inside the link. Screenshots are compressed, but
   a 2-step test course still gives a ~44,000-character link. Recorded voices are not compressed.
   Some chat apps truncate very long links; download the video instead.
2. **Video voice needs a one-time download.** The AI voice in videos is a neural English voice
   (~60 MB, downloaded on the first export). If it can't load (offline), text steps are silent,
   and you're told how many. It can sound different from the preview voice, which is the
   browser's own.
   **AI voice quality depends on the browser.** Edge has the most natural voices, then Chrome's
   Google voices. Pick one in Settings; there is no server-side voice.
3. **Video records in real time,** and the tab must stay visible while it does (browsers throttle
   hidden tabs).
4. **Single browser.** Data lives in one browser's IndexedDB. Clearing site data deletes all
   courses. Use Export for backups.
5. **Old regions on legacy courses.** Areas drawn before per-step screenshots existed were measured
   on a fixed 16:10 canvas. On screenshots that aren't 16:10 they may be slightly off; reselect
   them once.
6. **Unused code / dependency:** `components/course/RegionCanvas.js` (legacy) and the
   `@supabase/supabase-js` package are unused and can be removed.
7. **ZIP import is lightly validated.** Only `course.json` presence, version and a steps array are
   checked.

---

## 13. Build and deployment

```bash
npm run build      # → dist/ (fully static)
npm run preview    # test the build locally
```

Because of HashRouter, **no rewrite rules are needed** on any static host:

| Host             | How                                                    |
| ---------------- | ------------------------------------------------------ |
| Vercel           | `vercel --prod`                                        |
| Netlify          | `netlify deploy --prod --dir=dist`                     |
| GitHub Pages     | `npm run build && npx gh-pages -d dist`                |
| Cloudflare Pages | Build command `npm run build`, output directory `dist` |

Serve over **HTTPS**, or the microphone won't be available.

---

## 14. UI structure at a glance

- **Sidebar (ChatGPT/Gemini-style):** New course, a course search, Home, All courses, then every
  course grouped as Today / Yesterday / Previous 7 days / Previous 30 days / Older. The course
  open in the editor or preview is highlighted.
  - **Closed by default**; the panel button in the top bar (or the close button in the sidebar)
    toggles it.
  - **Open by default on New course (`#/new`) and in the editor (`#/editor/...`)** on large
    screens. The rules are `SIDEBAR_OPEN_BY_DEFAULT` in `AppRouter.js`.
  - The toggle overrides the default until you move to another page, which re-applies that
    page's default.
  - On small screens (< 1024 px) it always starts closed and opens as a drawer over the page.
- **Home:** hero + "Create new course", "Find an existing course" (search, Import, View all),
  a looping animated demo, how it works in 3 steps, and what we stand for. Courses are **not**
  listed here by default.
- **Editor guidance:** the `StepGuide` checklist (① Add screenshot ② Select the feature ③ Explain
  it) highlights what to do next. The upload and "Select area" states show small looping
  animations of the action.
- **Theme:** tokens in `tailwind.config.js` (neutral zinc, indigo accent, near-black dark mode,
  Inter). Accent copies live in `index.css` (glows) and `services/video/renderFrame.js` (video).
- **Embeds and storage:** in third-party iframes browsers may block `localStorage`.
  `services/storage/settings.js` falls back to an in-memory theme, so embeds never crash.

### Home content, examples and embeds

- **No reviews or invented customers.** The home page shows only facts about the product. The
  stats (`10` steps per course, `3` ways to share, `0` sign-ups or servers, `90` days clean-up)
  are read from the same constants the code enforces, so they can never drift. Use cases link to
  playable examples.
- **Examples** (`#/examples`, opened by "See examples" on Home and in the sidebar): four
  **complete feature flows** of a sample ERP app, 6–9 steps each, played in the real player.
  Press ▶ once and each plays to the end on its own:
  - Repack a return and check the trend (`return-repack`)
  - Purchase order: create, approve, receive (`purchase-order`)
  - Monthly sales report: pick a month and export (`monthly-report`)
  - Find a customer and get their statement (`customer-lookup`)

  Steps that share a screen reuse the same image, so the camera glides between them. Their screens are SVG drawn in
  `src/examples/mockScreens.js`, and the highlighted regions come from the same boxes the screens
  draw, so the zoom always lands exactly. To add an example, add screens there and an entry in
  `src/examples/index.js`.

- **Embeds are watch-only.** Inside an iframe only `#/embed/...` renders. Any other page shows
  `EmbedOnlyNotice`, so a host site's visitors can never create or edit courses.
- **Compact embed player** (under 480 px tall, e.g. the 250 px embed):
  - the screenshot fills the frame over a blurred copy of itself
  - title and ▶ appear before playing
  - the caption sits at the top
  - ▶/⏸ and the video timeline sit on a gradient; they auto-hide while playing and come back
    on hover
  - there's a **fullscreen** button (inline players have one too)
- **Animations:** the sidebar slides and resizes when opened or closed (desktop), or slides in
  as a drawer with a fading backdrop (phone). Home sections reveal on scroll (`useInView` +
  `.reveal`). Everything respects the OS "reduce motion" setting.
- **Responsive:** every page was checked at 390 px, 820 px and 1440 px with no sideways scrolling.
