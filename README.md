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
│   ├── audio/tts.js                 speechSynthesis wrapper, prefers en-IN/hi-IN voices
│   ├── sharing/share.js             Course → player steps / compressed share URL (and back)
│   ├── video/timeline.js            Walkthrough as a fixed timeline (phase start/duration)
│   ├── video/renderFrame.js         Draws one video frame on a canvas (same look as the player)
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
│   ├── ui/Header.js                 Small-screen top bar (☰ opens the sidebar)
│   ├── ui/SearchInput.js            Big search box ("/" or Ctrl/Cmd+K)
│   ├── layout/Sidebar.js            ChatGPT-style sidebar: all courses, active one highlighted
│   ├── course/CourseResults.js      Search results / "Did you mean" / course grid
│   ├── course/StepGuide.js          Editor checklist: ① screenshot ② area ③ explain
│   ├── tutorial/HowItWorksDemo.js   Looping animated demo on the Home page
│   ├── tutorial/MiniHint.js         Tiny "what to do here" animations in the editor
│   ├── walkthrough/CourseInfo.js    Course details under an inline player
│   ├── ui/ThemeToggle.js            Sun/moon button
│   ├── ui/Toast.js                  Toast stack renderer
│   ├── ui/ConfirmDialog.js          "Are you sure?" modal
│   ├── ui/Spinner.js                Spinner + PageSpinner
│   ├── course/StepRail.js           Step list: select, add, delete, drag-reorder
│   ├── course/StepScreenshotUpload.js  Per-step screenshot: upload / drop / paste / reuse
│   ├── course/FeatureSelector.js    Canvas (image's own ratio): draw / move / resize the region
│   ├── course/RegionActionBar.js    "Select area of the feature" + Click vs Look choice
│   ├── course/AudioRecorderPanel.js Record / play / delete a step's voice
│   ├── course/ShareLinkModal.js     Share URL + Copy button (fallback when clipboard is blocked)
│   ├── course/CourseCard.js         Library card: thumbnail, page name, Preview/Download/Share, ⋯ menu
│   ├── course/CourseDoneDialog.js   After "Mark done": Copy link / Download video
│   ├── course/VideoExportOverlay.js Progress + Cancel while a video records
│   ├── course/RegionCanvas.js       ⚠️ UNUSED legacy (multi-region design) — safe to delete
│   └── walkthrough/
│       ├── WalkthroughPlayer.js     Phase state machine, narration, controls, keyboard
│       └── WalkthroughStage.js      What each phase looks like: camera, spotlight, pointer, caption
└── pages/
    ├── Home/HomePage.js
    ├── Library/LibraryPage.js
    ├── Embed/EmbedPage.js
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
enter ─► overview ─► focus ─► point ─► narrate ─► action ─► exit ─► next step
                       │  (look steps skip "point")     │
                       │                                └─(Manual mode / last step)─► done
                       └─(no area: overview ─► narrate)
```

| Phase      | What the viewer sees                                                                                                      | Ends after                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `enter`    | Screenshot appears. After a click step it **grows out of the clicked button** (`.hs-stage-emerge`), otherwise it fades in | 750 ms                            |
| `overview` | The full screenshot: "this is the page"                                                                                   | 1.4 s first / 0.8 s after a click |
| `focus`    | Camera zooms into the area (max 2.5×); the rest dims (spotlight); ring pulses                                             | 1.1 s                             |
| `point`    | Animated pointer glides in from the corner onto the button (click only)                                                   | 1.0 s                             |
| `narrate`  | Caption bubble next to the area; recorded voice, or TTS of the text                                                       | voice ends (or 2.4 s if silent)   |
| `action`   | Click: pointer presses, ripple rings, ring flashes. Look: short hold                                                      | 1.0 s / 0.7 s                     |
| `exit`     | Click: dive into the button. Look: zoom back out                                                                          | 0.5 s / 1.0 s                     |
| `done`     | Final frame. Next pulses (Manual) or "That's the whole feature!" (last)                                                   | user                              |

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
- **The viewer is in control:** nothing starts without a click. Each step plays its story, then
  **waits** (Manual is the default) with a pulsing Next button. After the last step it stops on
  "That's the whole feature!". The Auto toggle is optional.
- **Controls:** ⏮ start over · ◀ prev · ▶/⏸ play-pause · ▶ next · ↺ replay step · step dots
  (click to jump) · Auto/Manual.
- **Keyboard:** `←` `→` `Space` `Esc`.
- **Small screens** (< 640 px): the caption docks under the screenshot instead of floating.
- **Reduced motion:** with the OS "reduce motion" setting, animations become instant but the
  sequence stays the same.

**Nothing ever plays by itself.** Every player opens paused on step 1 with a big ▶ over the
screenshot, like a YouTube video.

| Entry point      | Where                                 | Layout                                            |
| ---------------- | ------------------------------------- | ------------------------------------------------- |
| Editor "Preview" | `CourseEditorPage` → `PreviewOverlay` | full screen + "Edit step N" / "Add step after N"  |
| Preview page     | `#/preview/:id`                       | **inline** in the page (no pop-up)                |
| Shared link      | `#/s/:slug/:encoded`                  | **inline** in the page (no pop-up)                |
| Embed            | `#/embed/:slug/:encoded`              | fills the iframe; **compact** below 480 px height |

- **Compact mode** (automatic when the player is under `COMPACT_MAX_HEIGHT` = 480 px, e.g. the
  250 px embed): no top bar, small controls, and a small caption over the screenshot.
- **Edit from the progress bar** (editor preview only): the progress bar shows numbered steps.
  Pick one, then **Edit step N** closes the preview on that step, or **Add step after N** inserts
  a new step right there.

TTS (`services/audio/tts.js`) picks the first available voice in this order: `en-IN` →
`hi-IN` → any English voice. That's why the UI calls it the "AI Hinglish voice".

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
`PreviewOverlay`:

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
and `keyHandlersRef.current = { goNext, goPrev, togglePlay, onExit }` is reassigned on every render.
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

| Symptom                                | Look at                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Course missing / "Course not found"    | `getCourse` in `services/storage/db.js`; check the id in the URL vs the `courses` store                                    |
| Edits not saved after refresh          | `updateCourse` / `updateStep` in `CourseEditorPage.js` (they call `saveCourse`)                                            |
| Screenshot not showing in editor       | effect on `activeImageId` in `CourseEditorPage.js` → `getStepImageId`; does the id exist in the `media` store?             |
| Region drawing / dragging wrong        | `FeatureSelector.js` → `getRelativePos`, `handleMove`, `handleUp`                                                          |
| Zoom lands in the wrong place          | `camera.js` → `computeFocusView`; is the stage ratio right? (`useImageAspectRatios`)                                       |
| Walkthrough stuck on a step            | `phase` in React DevTools; `phaseDuration` + timed effect in `WalkthroughPlayer.js`; `useNarration` (onEnd / safety timer) |
| Animation looks wrong / too fast       | `.hs-*` classes in `index.css` (durations must match `DURATION` in `WalkthroughPlayer.js`)                                 |
| Next screen doesn't "open" from button | step `action` must be `'click'`; `enterOrigin` from `focusedCenter()`                                                      |
| "Microphone permission denied"         | `useAudioRecorder.start` catch block; site must be HTTPS/localhost; browser site settings                                  |
| Recording saved but silent/empty       | `services/audio/recorder.js` → `pickMimeType`, `ondataavailable`, `onstop`                                                 |
| Player doesn't speak text              | `services/audio/tts.js` → `pickHinglishVoice` (voices load async; check `speechSynthesis.getVoices()` in console)          |
| Audio won't auto-start                 | browser autoplay policy → `onBlocked` in `useNarration` pauses the player; press Play                                      |
| Auto-advance timing                    | `DURATION` constants at top of `WalkthroughPlayer.js`                                                                      |
| Share link "Cannot Open Course"        | link truncated by the chat app / browser (too long) → `decodeShareableCourse` returns null                                 |
| Search doesn't find a course           | `searchCourses` in `utils/search.js`; check `title` / `pageName` in the `courses` store                                    |
| "Title already exists" wrongly         | `titleKey` of the other course (`normalizeTitle`); `findCourseByTitle` in `db.js`                                          |
| Course vanished                        | auto-delete: `updatedAt` older than 90 days → `purgeExpiredCourses`                                                        |
| Video download fails / is choppy       | `services/video/exportVideo.js`; the tab must stay visible; `isVideoExportSupported()`                                     |
| Video looks different from player      | `renderFrame.js` vs `WalkthroughStage.js` (both use `utils/camera.js` + `WALKTHROUGH_TIMING`)                              |
| Import fails                           | `importCourseZip` in `services/export/zip.js` (missing `course.json`, bad version)                                         |
| Theme not persisting                   | `services/storage/settings.js` + `hooks/useTheme.js`                                                                       |
| Page blank after navigation            | lazy-import path in `AppRouter.js`; check the console for chunk load errors                                                |

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
2. **Video: text-to-speech is silent.** The browser speaks TTS outside the page, so it can't be
   recorded. Steps without a recorded voice show their caption in the video but have no sound.
   Record your voice for narrated videos.
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
