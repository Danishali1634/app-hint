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

- [How to Read This Codebase](#how-to-read-this-codebase)
- **Part A — Implementation Flow Guide** (UI action → internal code → final output)
  - [A1. Screenshot upload flow](#a1-screenshot-upload-flow)
  - [A2. Select region (area) flow](#a2-select-region-area-flow--detailed)
  - [A3. Nested component flow](#a3-nested-component-flow)
  - [A4. Action selection flow](#a4-action-selection-flow-click--look--type)
  - [A5. Description / text flow](#a5-description--text-flow)
  - [A6. Audio recording flow](#a6-audio-recording-flow)
  - [A7. Preview flow](#a7-preview-flow-player--phase-state-machine)
  - [A8. Camera / region flow](#a8-camera--region-flow-utilscamerajs)
  - [A9. Timeline flow](#a9-timeline-flow)
  - [A10. YouTube-style step thumbnails](#a10-youtube-style-step-thumbnails-flow---implemented)
  - [A11. Video export: preview vs export](#a11-video-export-preview-vs-export)
  - [A12. Frame rendering flow](#a12-frame-rendering-flow-renderframejs)
  - [A13. Audio → video flow](#a13-audio--video-flow)
  - [A14. Download flow](#a14-download-flow-exact-user-journey)
  - [A15. Share link flow](#a15-share-link-flow-video-download-se-bilkul-alag)
  - [A16. ZIP export / import flow](#a16-zip-export--import-flow-backup--share-link-se-alag)
  - [A17. Mark done / publish flow](#a17-mark-done--publish-flow)
  - [A18. Complete end-to-end flow](#a18-complete-end-to-end-flow)
  - [A19. Data flow table](#a19-data-flow-table)
  - [A20. If you want to debug this feature](#a20-if-you-want-to-debug-this-feature)
  - [A21. Data at each step](#a21-data-at-each-step-quick-reference)
  - [README vs code](#readme-vs-code-jo-purane-docs-mein-galat-tha-ab-theek)
- **Part B — Reference**
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
  14. [UI structure at a glance](#14-ui-structure-at-a-glance)

---

## How to Read This Codebase

Is project ko samajhne ka sabse simple mental model yeh hai:

```text
EDITOR            → course / step ka DATA banata hai (screenshot, area, action, text, voice)
  ↓
STEP DATA         → Course { steps: Step[] } IndexedDB mein; media (Blobs) alag store mein
  ↓
TIMELINE          → buildTimeline(): har step ke phases + unki durations (kab kya hoga)
  ↓
PREVIEW  OR  EXPORT
  │          └── Canvas par frame-by-frame draw → WebCodecs → MP4 download
  └── React DOM + CSS transforms → browser mein live animation
```

| Layer         | Kaam                                                    | Main files                                                                           |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Editor**    | data banata hai                                         | `pages/CourseEditor/CourseEditorPage.js`, `components/course/*`                      |
| **Timeline**  | decide karta hai kab kya hoga                           | `services/video/timeline.js` (`buildTimeline`), `components/walkthrough/Timeline.js` |
| **Preview**   | browser mein animation dikhata hai                      | `components/walkthrough/WalkthroughPlayer.js` + `WalkthroughStage.js`                |
| **Export**    | same concept ko frames mein draw karke video banata hai | `services/video/exportVideo.js` + `renderFrame.js`                                   |
| **IndexedDB** | data / media store karta hai                            | `services/storage/db.js`                                                             |
| **Share**     | course ko URL ke andar package karta hai                | `services/sharing/share.js`                                                          |

**Teen golden rules** jo har flow mein dikhenge:

1. **Page data ka owner hai.** `CourseEditorPage` akela `course` state rakhta hai. Children ko data
   props se milta hai, aur woh changes callbacks (`onUpdateStep`, `onUpdate`, `onSave`, …) se upar
   bhejte hain.
2. **Step ke andar Blob nahi hota.** Screenshot / voice IndexedDB ke `media` store mein Blob ki
   tarah save hote hain; Step ke andar sirf unka id (`imageId`, `audioId`) hota hai.
3. **Player storage ko touch nahi karta.** Player ko `WalkthroughStep[]` milta hai jismein media
   pehle se **data URLs** (`imageData`, `audioData`) mein badal chuka hota hai
   (`buildWalkthroughSteps` / `shareableToWalkthroughSteps`). Isliye wahi player local course,
   share link aur embed teeno mein chalta hai.

> **Notation:** is guide mein `A → B` ka matlab "A ne B ko call kiya / data diya". File paths
> `src/` se relative hain. **"Example"** likhe values sirf samjhane ke liye hain — real ids
> `nextId(prefix)` se bante hain: `` `${prefix}${Date.now().toString(36)}${counter}` ``
> (jaise `mediamfz3k2a14`).

---

# PART A — Implementation Flow Guide (UI action → final output)

## A1. Screenshot upload flow

### What user sees

User **New course** banata hai (`#/new`), phir editor (`#/editor/:courseId`) khulta hai. Jab tak
active step ke paas screenshot nahi hai, main column mein upload box dikhta hai: **Upload / drag &
drop / paste (Ctrl/Cmd+V)**, "Use step N's screenshot", ya gallery se chunna. Upload ke baad wahi
jagah screenshot canvas (`TargetCanvas`) le leta hai.

### Step 0 — course banana (abhi koi screenshot nahi)

`NewCoursePage` mein **koi screenshot upload nahi hota.** Sirf course aur ek khaali step banta hai.

```text
User "Create" dabata hai
  → NewCoursePage.handleCreate()
  → course object banta hai (status 'draft', ek khaali step)
  → saveCourse(course)                    services/storage/db.js
  → navigate(`/editor/${course.id}`)
```

```js
// Before (NewCoursePage.handleCreate ke baad IndexedDB "courses" store mein) — example values
{
  id: 'coursemfz3k2a10',
  title: 'Create a purchase order',
  status: 'draft',
  baseImageId: null,          // legacy field, naye courses mein hamesha null
  steps: [
    { id: 'stepmfz3k2a11', label: 'Step 1', text: '', imageId: null,
      region: null, action: 'click', audioId: null },
  ],
  publishedAt: null,
  // … pageName, description, context, createdAt, updatedAt
  // NOTE: `gallery` yahan set NAHI hota — pehle upload par banta hai
}
```

Editor mein naye steps `createStep(stepNumber)` (`CourseEditorPage.js`) se bante hain — same shape:
`{ id, label: 'Step N', text: '', imageId: null, region: null, action: 'click', audioId: null }`.

### Step 1 — file select hoti hai

```text
User image chunta / drop karta / paste karta hai
  ↓
StepScreenshotUpload                     components/course/StepScreenshotUpload.js
  pickFile()     → on-the-fly <input type="file" accept="image/*" multiple>
  handleDrop()   → drop event ke files
  handlePaste()  → window "paste" listener (sirf jab tak component screen par hai)
  ↓
deliver(files)                            sirf image/* files rakhta hai
  ↓   (yahan koi storage NAHI hoti — sirf File[] upar bheji jaati hai)
props.onFiles(files)
  ↓
CourseEditorPage.handleImageFiles(files)
```

> Aapke example mein `handleUpload(...)` tha — **aisa koi function code mein nahi hai.** Asli naam
> `deliver` (child mein) → `onFiles` prop → `handleImageFiles` (parent mein) hai.

Doosre raaste bhi isi pipeline mein aate hain:

| Kahan se                         | Handler                                                  |
| -------------------------------- | -------------------------------------------------------- |
| "Add screens" (GlobalStepEditor) | inline file input → `onAddScreens` → `addScreens`        |
| Screen gallery modal             | `ScreenGallery.pickFiles` → `onUpload`                   |
| "Change screenshot"              | `pickReplacementImage` (ek file)                         |
| "Use step N's screenshot"        | `reusePreviousImage` — **naya Blob nahi**, same id reuse |

### Step 2 — Blob IndexedDB mein jaata hai

```text
handleImageFiles(files)
  ↓
storeImageFiles(files)                    CourseEditorPage.js
  ├─ file.type image/ nahi?      → toast "Please choose an image file (PNG, JPG, ...)"
  ├─ file > MAX_IMAGE_BYTES (10 MB)? → toast "<name> is over 10MB — skipped"
  ├─ const mediaId = nextId('media')
  ├─ await putMedia(mediaId, file)        db.put('media', blob, id)
  └─ addToGallery(ids)                    course.gallery mein id push + saveCourse
  ↓
pehla id → setUnitImage(firstId)          active Global Step ke sub-steps par imageId
baaki ids → addSubStepsWithScreensRef.current(rest)   har extra screenshot = naya sub-step
```

**Important:** original `File` **jaisa hai waisa** save hota hai — upload par koi compression nahi.
(`compressImageDataUrl` sirf share links ke liye use hota hai, dekho A15.)

### IndexedDB mein kya save hota hai

```text
IndexedDB database "hint-studio" (DB_VERSION 3)
│
├── store "courses"   keyPath: "id"      indexes: by_titleKey, by_updatedAt
│     { id: 'coursemfz3k2a10', steps: [ { imageId: 'mediamfz3k2a14', … } ], gallery: [...] }
│                                                     │
│                                           sirf id (string) ─┐
│                                                             │
└── store "media"     out-of-line keys                        │
      key 'mediamfz3k2a14'  →  value: <File/Blob image/png 412 KB>   ◄──┘
```

### Step object: before → after

```js
// Before upload
{ id: 'stepmfz3k2a11', label: 'Step 1', text: '', imageId: null,
  region: null, action: 'click', audioId: null }

// After upload — setUnitImage(newImageId) ne { imageId, ...withTargets([]) } lagaya
{ id: 'stepmfz3k2a11', label: 'Step 1', text: '',
  imageId: 'mediamfz3k2a14',          // → media store ka key
  region: null, extraRegions: [],     // withTargets([]) = targets saaf
  action: 'click', audioId: null }

// Course level par bhi:
course.gallery = ['mediamfz3k2a14']   // addToGallery
```

`setUnitImage` targets ko clear karta hai (naya screenshot = purane boxes galat jagah hote), lekin
text/audio rakhta hai. Purana image `releaseImage` se tabhi delete hota hai jab woh
`course.baseImageId` na ho, `course.gallery` mein na ho, aur koi aur step use na kar raha ho.

### `imageId` kaise use hota hai

`imageId` ek **pointer** hai. Har jagah pehle `getStepImageId(course, step)` (`utils/course.js`)
se id nikalti hai:

```js
return step.imageId ?? course.baseImageId ?? null; // purane courses ke liye baseImageId fallback
```

Phir id se Blob padha jaata hai:

| Consumer                | Kaise                                                                    | Result                                   |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| Editor canvas           | `useEffect` on `activeImageId` → `getMediaAsDataUrl(id)` → `setImageUrl` | **data URL** (`imageUrl`)                |
| Screens strip / gallery | `getCourseScreens(course)` → `useMediaUrls(ids)` → `URL.createObjectURL` | object URLs (cached, unmount par revoke) |
| Player / video / share  | `resolveCourseMedia` → `getMediaAsDataUrl(imageId)` (har id ek hi baar)  | `WalkthroughStep.imageData`              |

### UI update

```text
putMedia ✓ → setUnitImage → updateStep → setCourse(...) → re-render
  → activeImageId badla → getMediaAsDataUrl → imageUrl
  → main column: StepScreenshotUpload ki jagah GlobalStepEditor → TargetCanvas (image dikhti hai)
  → toast "Screenshot added — now select the target of Sub-step 1"
```

**Blob vs metadata ka relation:** Step (chhota JSON, har keystroke par save hota hai) ↔ Blob (bada,
ek baar save). Isse autosave fast rehta hai, aur ek screenshot kai steps share kar sakte hain
(same `imageId`) bina copy ke.

---

## A2. Select region (area) flow — detailed

### What user sees

Screenshot ke upar mouse / finger se **drag** karke ek box banta hai. Box ke corners se resize, beech
se move hota hai. Main editor mein **koi "select mode" button nahi hai** — `TargetCanvas` ka header
khud kehta hai "NO MODES TO SWITCH": khaali jagah par drag = active sub-step mein naya target.

> Preview studio (editor ka "Preview & edit" overlay) mein ek purana component bhi hai:
> `FeatureSelector` + `RegionActionBar`, jahan explicit `drawMode` hota hai ("Select area of the
> feature"). Woh sirf `region` edit karta hai (`extraRegions` nahi). Main editor `TargetCanvas`
> use karta hai.

### Kaunsa component kya karta hai

```text
CourseEditorPage            owner of `course`; updateStep(stepId, patch)
  └─ GlobalStepEditor       addTarget / changeTarget / setTargets (targets ↔ step fields)
       └─ TargetCanvas      pointer events, pixel → % math, box draw / move / resize
```

### Pointer events (TargetCanvas.js)

```text
pointerdown on image
  → handlePointerDown(e)
      primary button nahi / image nahi → ignore
      pos = getPos(e.clientX, e.clientY)
      setDraw({ start: pos, current: { x, y, w: 0, h: 0 } })
  ↓
useEffect (sirf jab `draw` ya `drag` set ho):
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup' / 'pointercancel', handleUp)
  → canvas ke bahar chhodne par bhi drag theek se khatam hota hai
  ↓
pointermove → handleMove → current box update (live preview)
  ↓
pointerup → handleUp
    box RELEASE position se banta hai (last move se nahi)
    if (box.w > MIN_REGION_PCT && box.h > MIN_REGION_PCT) onAddTarget(box)   // MIN_REGION_PCT = 3
    chhota box (galti se click) → discard
```

Existing box par: `startDrag(e, index, mode, handle)` → `{ index, mode: 'move'|'resize', handle,
startX, startY, orig }` → move ko `Math.min(clampPct(orig.x + dx), 100 - orig.w)` se image ke
andar rakha jaata hai; resize kam se kam `MIN_REGION_PCT` rehta hai → `onChangeTarget(index, box)`.

### Coordinates: pixels → percentages

```js
// getPos (TargetCanvas.js)
const rect = containerRef.current.getBoundingClientRect();
x: clampPct(((clientX - rect.left) / rect.width) * 100)
y: clampPct(((clientY - rect.top) / rect.height) * 100)

// box
x = Math.min(start.x, pos.x)        w = Math.abs(pos.x - start.x)
y = Math.min(start.y, pos.y)        h = Math.abs(pos.y - start.y)
```

`clampPct(v)` = `Math.max(0, Math.min(100, v))` (`utils/index.js`). Values **unrounded floats**
store hote hain (rounding sirf share link mein hoti hai).

```text
Screenshot = 100% × 100%   (container ka aspect ratio = image ka naturalWidth / naturalHeight)

 0%                         50%                       100%
  ┌────────────────────────────────────────────────────┐ 0%
  │                                                    │
  │                    ┌─────────┐ ← region            │
  │                    │  Save   │   x=45 y=46         │ 50%
  │                    └─────────┘   w=10 h=8          │
  │                                                    │
  └────────────────────────────────────────────────────┘ 100%
```

**Example:** user ne screenshot ke beech mein "Save" button select kiya. Mouse 1000 px wide canvas
par 450 px se 550 px, aur 625 px high canvas par 287 px se 337 px gaya:

```text
x = 450/1000*100 = 45      w = (550-450)/1000*100 = 10
y = 287/625*100  ≈ 45.9    h = (337-287)/625*100  = 8
```

```js
// Before selection
region: null, extraRegions: []

// After selection (example values)
region: { x: 45, y: 45.92, w: 10, h: 8 }, extraRegions: []

// Doosra box usi sub-step par draw kiya (multiple targets)
region: { x: 45, y: 45.92, w: 10, h: 8 },
extraRegions: [{ x: 70, y: 12, w: 14, h: 6 }]
```

Format `Region` typedef (`types/index.js`) ke mutabiq: `{ x, y, w, h }` — sab **percent of the
IMAGE** (0–100), pixels nahi.

### Resize par selection stable kyun rehti hai

- Canvas container ka size = `canvasWidth = fitWidth * zoom`, `canvasHeight = canvasWidth / ratio`.
  `ratio` image ke `onLoad` se (`naturalWidth / naturalHeight`), `fitWidth` `useElementSize`
  (ResizeObserver) se.
- Boxes CSS `%` se render hote hain (`regionStyle`). Window chhoti-badi ho ya zoom (0.5×–4×) badle,
  `45%` hamesha image ke same pixel par padta hai — player aur video mein bhi.

### Region parent tak kaise pahunchta hai

```text
TargetCanvas
  │ onAddTarget(box)  /  onChangeTarget(index, box | null)
  ↓
GlobalStepEditor
  addTarget(region)            → setTargets([...targets, region])       (ya replace mode mein swap)
  changeTarget(index, region)  → null = target delete (+ uska paired text bhi hataata hai)
  setTargets(list)             → onUpdateStep(active.id, withTargets(list))
  ↓                                  withTargets(list) = { region: list[0] || null,
  ↓                                                        extraRegions: list.slice(1) }
CourseEditorPage.updateStep(stepId, patch)
  → setCourse(prev => { updated = …; saveCourse(updated); return updated })   // turant autosave
```

Padhne ke liye ulta helper: `getStepTargets(step)` = `step.region ? [step.region,
...(step.extraRegions || [])] : []`.

> ⚠️ Move / resize ke dauraan `onChangeTarget` **har pointermove** par chalta hai, aur har baar
> `saveCourse` hota hai (koi debounce nahi).

---

## A3. Nested component flow

Aapke example ka `OffersPage` is project mein nahi hai. Equivalent page **`CourseEditorPage`** hai.
Poori tree (main editor):

```text
CourseEditorPage                           state: course, activeStepId, railHover, showDone, …
│
├── StepRail                               step list (select / add / delete / drag-reorder)
│
├── [active step ke paas image NAHI hai]
│   └── StepScreenshotUpload               props: stepNumber, onFiles=handleImageFiles,
│                                                 galleryCount, onOpenGallery,
│                                                 reuseFromStepNumber, onReuse=reusePreviousImage
│
├── [image HAI]
│   └── GlobalStepEditor                   props: mainNumber, subSteps, activeStepId, imageUrl,
│       │                                         pageName, screens, highlightId=railHover,
│       │                                         onSelect=selectStep, onUpdateStep=updateStep,
│       │                                         onAddSubStep, onDeleteSubStep,
│       │                                         onChangeScreenshot=pickReplacementImage,
│       │                                         onUseScreen=showScreenForSubStep,
│       │                                         onAddScreens=addScreens, onSplit, onDeleteAll, …
│       │
│       ├── TargetCanvas                   props: imageUrl, subSteps [{id, number, targets}],
│       │                                         activeId, replacingIndex, hint, highlightId
│       │                                  callbacks: onAddTarget=addTarget,
│       │                                             onChangeTarget=changeTarget,
│       │                                             onSelectSubStep, onHoverSubStep
│       │
│       └── SubStepCard (har sub-step)     onUpdate={(patch) => onUpdateStep(step.id, patch)}
│           ├── ACTIONS buttons            → onUpdate({ action })            (A4)
│           ├── "Step heading" input       → onUpdate({ label })
│           ├── DescriptionField           → onUpdate({ text }) / ({ extraTexts })   (A5)
│           └── AudioRecorderPanel         → onSave(audioId) → onUpdate({ audioId })  (A6)
│
├── ScreenGallery                          saare uploaded screens (course.gallery)
├── PreviewStudio                          "Preview & edit" overlay (draft copy, Save / Discard)
├── CourseDoneDialog                       Mark done ke baad (A17)
└── ConfirmDialog
```

### Generic pattern (har flow yahi follow karta hai)

```text
CourseEditorPage (owner)
   │ props: step data + callback (updateStep)
   ↓
GlobalStepEditor
   │ props: step + onUpdate = (patch) => onUpdateStep(step.id, patch)
   ↓
SubStepCard / TargetCanvas / DescriptionField / AudioRecorderPanel
   │ user interaction (click, drag, type, record)
   ↓
child handler (addTarget, onChange, handleStop …)
   │ callback(patch)
   ↓
CourseEditorPage.updateStep(stepId, patch)
   │ setCourse(prev => { …merge patch, updatedAt: Date.now(); saveCourse(updated) })
   ↓
State update → re-render → naye props neeche jaate hain → UI mein naya data
```

### Example trace: "user ne text type kiya"

```text
<textarea> onChange                         DescriptionField
  → onChange(e.target.value)                (DescriptionField ka prop)
  → (text) => onUpdate({ text })            SubStepCard
  → (patch) => onUpdateStep(step.id, patch) GlobalStepEditor
  → updateStep(stepId, { text })            CourseEditorPage
  → setCourse(...) + saveCourse(updated)    IndexedDB "courses"
  → re-render: SubStepCard ko naya step.text value milta hai
```

### Autosave kaise kaam karta hai

- `updateCourse(patch)` aur `updateStep(stepId, patch)` **`setCourse` updater ke andar**
  `saveCourse(updated)` call karte hain, `updatedAt: Date.now()` ke saath. **Koi debounce/timer
  nahi** — har change turant likha jaata hai.
- `saveCourse` (`db.js`) = `db.put('courses', { ...course, titleKey: normalizeTitle(course.title) })`
  phir `'hint-studio:courses-changed'` event (sidebar list refresh ke liye). `saveCourse` khud
  `updatedAt` **nahi** badalta — callers badalte hain.
- "Save changes" button (`saveNow`) sirf visible confirmation hai: dobara save + ✓ flash.
- **PreviewStudio alag hai:** woh `draft` copy edit karta hai aur sirf **Save** par `onSave(next)`
  → page `setCourse(next); saveCourse(next)` karta hai.

---

## A4. Action selection flow (click / look / type)

### What user sees

Sub-step card mein "The viewer should…" ke neeche teen buttons: **Click it**, **Just look**,
**Type** (`GlobalStepEditor.js` `ACTIONS`). Type chunne par ek "Value to type" input aata hai.

```text
User "Just look" dabata hai
  → SubStepCard ACTIONS button onClick={() => onUpdate({ action: value })}
  → onUpdateStep(step.id, { action: 'look' })
  → CourseEditorPage.updateStep → setCourse + saveCourse
  → Step.action = 'look' IndexedDB mein
  → preview / video: next time pointer nahi, sirf zoom + spotlight
```

```js
// Before (createStep default)
action: 'click'
// After
action: 'look'
// Type chunne par
action: 'type', typeValue: '12345'   // "Value to type" input → onUpdate({ typeValue })
```

(Preview studio mein same kaam `RegionActionBar` ke `ACTION_OPTIONS` → `onActionChange` →
`StepEditPanel` `onChange({ action })` karta hai.)

### click vs look vs type

| action  | Preview / video mein kya hota hai                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| `click` | camera zoom → **pointer glide** (`point` phase) → press + ripple → agla screen **usi button se khulta** hai |
| `look`  | camera zoom + spotlight + ring, **pointer nahi**, chhota hold (`lookAction` 450 ms)                         |
| `type`  | zoom + field ke andar typed value (`TypingField` / `drawTypingField`), pointer nahi                         |

### Code mein decision kahan hota hai

```js
getStepAction(step); // utils/course.js — 'look' | 'type' ho to wahi, warna 'click' (default)
isClickAction(step); // getStepAction(step) === 'click'
isClickStep(step); // services/video/timeline.js — !!step.imageData && !!step.region && isClickAction(step)
```

| Jagah                               | Check                                                              | Effect                                                |
| ----------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `WalkthroughPlayer` `advancePhase`  | `const isClick = !!region && isClickAction(step)`                  | focus → `isClick && !continued ? 'point' : 'narrate'` |
| `WalkthroughPlayer` `phaseDuration` | `isClick ? clickAction * clickCount(step) : lookAction`            | action phase ki length                                |
| `WalkthroughPlayer` `goTo`          | `fromClick`                                                        | next screen click point se "emerge" kare              |
| `WalkthroughStage`                  | `showCursor = isClick && CURSOR_PHASES.includes(phase)…`, `isType` | pointer / typing field dikhe ya nahi                  |
| `buildTimeline`                     | `point` segment sirf `isClick` par                                 | video + timeline bar                                  |
| `renderFrame` `drawStep`            | `isClickStep(step)`                                                | video mein cursor, ripples                            |

---

## A5. Description / text flow

### What user sees

Har sub-step card mein textarea ("What to say"), neeche **✨ Improve**, **Undo**, **🔊 Listen**.
Ek sub-step par 2+ targets hon to har target ka alag textarea ("What to say at each target").

```text
<textarea value={value}>                        DescriptionField (controlled component)
  onChange → setPrevious(null); onChange(e.target.value)
  ↓
single target:  onUpdate({ text })
multi target:   target 1 → onUpdate({ text: value })
                target n → extra[n-1] = value; onUpdate({ extraTexts: extra })
  ↓
updateStep → setCourse + saveCourse → Step.text / Step.extraTexts
```

```js
// Before
text: ''
// After typing (example)
text: 'Click Save to store the purchase order.'
// 2 targets
text: 'First pick the supplier.', extraTexts: ['Then click Save.']
```

**✨ Improve** (`DescriptionField.improve`): user ki apni Anthropic key ho (`getAiKey()`) to
`improveWithClaude(text, { apiKey, label, pageName, action })`, warna offline `polishText(text)`
(`services/text/enhance.js`). Purana text `previous` state mein rehta hai → **Undo**.
**🔊 Listen** = `previewSpeech` (`services/audio/tts.js`).

### Text kahan-kahan use hota hai

```text
Step.text
  ├─► Preview caption     buildWalkthroughSteps → WalkthroughStep.text → WalkthroughStage
  │                       CaptionContent (floating / docked / compact caption)
  ├─► Browser TTS         useNarration.start(): recording NAHI hai → speakText() →
  │                       createHinglishTTS().speak (window.speechSynthesis, sentence by sentence)
  ├─► Recording fallback  recording hai lekin play fail → text ho to TTS par fallback
  ├─► Timeline estimate   speakingMs(text) = 600 + length*65 ms (Timeline bar ki length)
  ├─► Video voice         exportVideo: recording nahi → speak(text) → Piper neural voice (A13)
  ├─► Video caption       renderFrame drawCaption (text: step.text)
  └─► Step heading        getStepTitles(): custom label nahi to text ka pehla sentence
```

Multiple targets + `extraTexts` wale step ko `expandTargetDescriptions` playback ke liye **ek step
per target** mein tod deta hai (ids `${step.id}~${k}`; audio sirf pehle wale ke paas).

---

## A6. Audio recording flow

### What user sees

Sub-step card mein **Record voice** → timer chalta hai → **Stop & Save** → play button, Re-record,
Delete, "Convert to text". **Upload audio** se file bhi de sakte hain.

```text
User "Record voice" dabata hai
  ↓
AudioRecorderPanel.handleStart()   → reset(); start()
  ↓
useAudioRecorder.start()           hooks/useAudioRecorder.js (state, 1 s timer, errors)
  ↓
createAudioRecorder(...).start()   services/audio/recorder.js
  navigator.mediaDevices.getUserMedia({ audio: VOICE_CONSTRAINTS })   ← MIC PERMISSION
    (echoCancellation, noiseSuppression, autoGainControl, mono, 48 kHz)
    permission denied → "Microphone permission denied. Please allow access and try again."
  cleanVoiceStream: highpass 90 Hz → lowpass 9 kHz → compressor → gain
  new MediaRecorder(stream, { mimeType: pickMimeType(), audioBitsPerSecond: VOICE_BITRATE /*32 kbps*/ })
  ondataavailable → chunks.push(e.data)
  ↓
User "Stop & Save"
  ↓
AudioRecorderPanel.handleStop()
  const blob = await stop()          onstop → new Blob(chunks, { type: mimeType || 'audio/webm' }), mic band
  empty blob? → toast "Recording was empty, try again."
  const mediaId = nextId('media')
  await putMedia(mediaId, blob)                          IndexedDB "media"
  if (manageMedia && step.audioId) await deleteMedia(step.audioId)   purana take delete
  onSave(mediaId)
  ↓
SubStepCard: onSave={(audioId) => onUpdate({ audioId })}
  ↓
updateStep(stepId, { audioId }) → setCourse + saveCourse
  ↓
toast "Recording saved"; panel getMediaAsDataUrl(step.audioId) → hidden <audio> → play
```

```js
// Before
audioId: null;
// After Stop & Save (example)
audioId: 'mediamfz3k9q27'; // media store: Blob audio/webm;codecs=opus
```

- `pickMimeType` order: `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus`, `audio/mp4`.
- **Live recording ki koi max length nahi.** `MAX_UPLOAD_SECONDS = 180` sirf **uploaded** files
  par (`compressVoiceFile`, Opus 32 kbps re-encode).
- Re-record: purana take tab tak rehta hai jab tak naya save na ho.
- `handleDelete` → `deleteMedia` (agar `manageMedia`) → `onDelete()` → `onUpdate({ audioId: null })`.
- `handleConvert` → `transcribeRecording` (Whisper, browser mein) → audio delete →
  `onTranscribed(text)` → `onUpdate({ text, audioId: null })`.
- Preview studio (`StepEditPanel`) `manageMedia={false}` deta hai — wahan purane Blobs turant delete
  nahi hote (draft Discard ho sakta hai).

### Recorded voice vs browser TTS

|          | Recorded voice               | Browser TTS                         | Video AI voice                |
| -------- | ---------------------------- | ----------------------------------- | ----------------------------- |
| Source   | `step.audioId` → `audioData` | `step.text`                         | `step.text`                   |
| Engine   | `new Audio(step.audioData)`  | `window.speechSynthesis` (`tts.js`) | Piper WASM (`neuralVoice.js`) |
| Kahan    | preview + video              | sirf preview                        | sirf video export             |
| Priority | **hamesha pehle**            | recording na ho tab                 | recording na ho tab           |

Priority `useNarration.start()` mein: recording → TTS → kuch nahi (`finish()`).

---

## A7. Preview flow (player + phase state machine)

### What user sees

Big ▶ ke saath paused player. ▶ ke baad har step apne aap agle mein flow karta hai: screen aata hai
→ poora page → camera area mein zoom → pointer aata hai → caption + voice → click → agla screen
usi button se khulta hai … → end mein happy ending card.

### Data kahan se aata hai

```text
Course (IndexedDB)                           share link (URL)
  │ buildWalkthroughSteps(course)              │ decodeShareableCourse → shareableToWalkthroughSteps
  │   resolveCourseMedia: ids → data URLs      │
  └──────────────► WalkthroughStep[] ◄──────────┘
                   { id, label, text, region, extraRegions, action, typeValue,
                     audioData, imageData, groupId, extraTexts }
                          │
                          ↓
                   <WalkthroughPlayer steps title variant … />
```

| Kaun render karta hai    | Props                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `PreviewStudio` (editor) | `steps={walkSteps} title variant="inline" onIndexChange onPlayingChange requestedIndex pauseRequest onInsertStep` |
| `CoursePreviewPage`      | `steps title variant="inline"`                                                                                    |
| `SharedCoursePage`       | `steps title variant="inline"`                                                                                    |
| `EmbedPage`              | `steps title onExit embedded`                                                                                     |
| `ExamplesPage`           | `steps title variant="inline"`                                                                                    |

### Decide vs render

```text
WalkthroughPlayer   = DIMAAG   (kaunsa step, kaunsa phase, kab aage badhna, voice start/stop)
WalkthroughStage    = CHEHRA   ("Purely presentational": is phase mein screen kaisa dikhe)
```

Player state: `index`, `phase` (`useState('enter')`), `runId`, `playing` (default `false`, kabhi
autoplay nahi), `hasStarted`, `stageKey`, `continued`, `leaving`, `enterOrigin`, `voiceMs`,
`startOffset`; refs `phaseSkipRef`, `narrationOffsetRef`. `autoAdvance` ek constant `true` hai.

### Phase machine

```text
enter ─► overview ─► focus ─► point ─► narrate ─► action ─► (agla step: goNext)
                      │  (look/type: point skip)            │
                      │                                     └─ last step ─► done ─► OutroCard
                      └─ (region nahi: overview ─► narrate)

Same screenshot / same Global Step (groupId) wala agla step:
   focus (camera + pointer purane area se glide, continued=true) ─► narrate ─► …
```

`advancePhase` (player):

```js
enter    → 'overview'
overview → region ? 'focus' : 'narrate'
focus    → isClick && !continued ? 'point' : 'narrate'
point    → 'narrate'
narrate  → 'action'          // voice khatam hone par useNarration ka onEnd bhi setPhase('action') karta hai
action / done → autoAdvance && !isLast ? goNext() : setPhase('done')
```

Timer effect: `if (!playing || !ready || phaseDuration == null) return;` → `setTimeout(advancePhase,
phaseDuration - phaseSkipRef.current)`. Pause, seek ya phase change → cleanup timer cancel kar
deta hai, isliye purana timer kabhi step skip nahi kar sakta.

| Phase      | `phaseDuration` (`WALKTHROUGH_TIMING`)                                                | Stage kya dikhata hai                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `enter`    | 650 ms                                                                                | screenshot aata hai: click ke baad **clicked button se grow** (`hs-stage-emerge`, origin = `enterOrigin`), warna fade    |
| `overview` | 1200 ms (pehla step) / 450 ms                                                         | poora screenshot, `OVERVIEW_VIEW`                                                                                        |
| `focus`    | 1050 ms                                                                               | camera zoom (`cameraTransform(focusView)`), spotlight dim, ring pulse                                                    |
| `point`    | 850 ms (sirf click)                                                                   | `AnimatedCursor` corner (`CURSOR_START`) se target par glide                                                             |
| `narrate`  | voice ki length (`null` = voice ke `onEnd` ka wait) / 2200 ms agar kuch bolne ko nahi | caption (`CaptionContent`), voice                                                                                        |
| `action`   | click: 750 ms × targets · look/type: 450 ms                                           | press + ripple + ring flash / hold / typing                                                                              |
| `exit`     | (player isse set nahi karta)                                                          | `leaving` stage ko `phase="exit"` milta hai: purana screen naye ke **neeche** button mein dive (500 ms) ya fade (600 ms) |
| `done`     | last step: `null` (ruk jaata hai)                                                     | `isFinished` → `OutroCard` ("You're all set!")                                                                           |

### Narration (voice)

```text
phase === 'narrate' effect
  → startNarration(step, { offsetMs: narrationOffsetRef.current,
                           onEnd: () => setPhase('action'),
                           onBlocked: () => setPlaying(false) })
useNarration.start:
  1. step.audioData → new Audio(...), currentTime = offsetMs/1000, onended → onEnd
  2. warna text → speakText() (TTS) + safety timer (3000 + length*110 ms)
  3. warna → turant finish
playing badla → resumeNarration() / pauseNarration()
recording ki real length pata chali → setVoiceMs({ [step.id]: ms })  (Timeline exact ho jaata hai)
```

### Step change

`goTo(i, { smooth })`: narration stop, offsets reset.

- **Same page** (same `imageData` ya same `groupId`) + smooth → `setContinued(true)`, `stageKey`
  **same** (stage remount nahi → camera glide), phase `to.region ? 'focus' : 'narrate'`.
- **Naya page** → `setLeaving({ step: from, kind: fromClick ? 'click' : 'look', … })`,
  `setEnterOrigin(smooth && fromClick ? clickOrigin(from) : null)`, `stageKey + 1`, phase `'enter'`.
- `leaving` `LEAVE_MS` (650) ke baad clear.

---

## A8. Camera / region flow (`utils/camera.js`)

### Idea

Screenshot ek layer hai jise CSS se move + scale kiya jaata hai:

```text
transform: translate(tx%, ty%) scale(s);   transform-origin: 0 0
Image ka point p (% of image) screen par dikhta hai:  p * s + t
(translate % layer ke apne size = stage size ke relative hai)
```

`CameraView = { s, tx, ty }`. `OVERVIEW_VIEW = { s: 1, tx: 0, ty: 0 }` (poora image).

### Flow

```text
region {x, y, w, h}  (% of image)
  ↓
computeFocusView(region, zoom?, center = FOCUS_CENTER)
  s  = clamp(zoom ?? FOCUS_FILL / max(region.w, region.h, 1), 1, MAX_ZOOM)   // FOCUS_FILL 42, MAX_ZOOM 2.5
  minT = 100 - 100*s
  tx = clamp(center.x - regionCenterX*s, minT, 0)     // FOCUS_CENTER = { x: 50, y: 42 }
  ty = clamp(center.y - regionCenterY*s, minT, 0)     // 42 = thoda upar, caption ke liye jagah
  ↓
{ s, tx, ty }
  ↓
cameraTransform(view) = `translate(${tx}%, ${ty}%) scale(${s})`
  ↓
<div className="hs-camera" style={{ transform }}>   // .hs-camera: 1000 ms transition
  ↓
zoomed screenshot
```

**Example** (A2 wala "Save" button, `{ x: 45, y: 46, w: 10, h: 8 }`):

```text
s  = clamp(42 / 10, 1, 2.5) = 2.5              (4.2 hota, par max 2.5 — sharpness ke liye)
centre = (50, 50)       minT = 100 - 250 = -150
tx = clamp(50 - 50*2.5, -150, 0) = -75
ty = clamp(42 - 50*2.5, -150, 0) = -83
transform: translate(-75%, -83%) scale(2.5)
```

Clamp ka matlab: zoomed image hamesha poore stage ko cover kare — kinare par khaali jagah kabhi na
dikhe.

### `projectRegion(region, view)`

Zoom ke **baad** region screen par kahan hai (% of stage):

```js
{ x: region.x*s + tx, y: region.y*s + ty, w: region.w*s, h: region.h*s }
// example: { x: 45*2.5-75 = 37.5, y: 46*2.5-83 = 32, w: 25, h: 20 }
```

Spotlight, ring, cursor aur caption isi projected box par rakhe jaate hain (`boxStyle(projected,
SPOTLIGHT_PADDING)`, class `hs-follow-camera` — same 1000 ms curve, taaki camera ke saath chalein).
Aur helpers: `regionCenter(r)`, `focusedCenter(region)`; `clickOrigin(step)` (`utils/course.js`)
last target ka projected centre deta hai (agla screen wahin se khulta hai).

### Region percentage mein kyun?

Editor canvas, preview stage aur 1280×720 video — teeno ka pixel size alag hai. `%` of image har
size par same jagah point karta hai, isliye ek hi `region` teeno jagah kaam karta hai.

### Overlay scaled layer ke bahar kyun?

`camera.js` comment: _"Overlays (spotlight, ring, cursor, caption) are drawn OUTSIDE the scaled
camera layer using this, so borders and text stay crisp at any zoom."_ Agar ring layer ke andar
hoti to 2.5× par uska 3 px border 7.5 px aur blur ho jaata. (Exception: kai targets wala
`MultiSpotlight` SVG mask camera ke **andar** hai, taaki holes screenshot ke saath zoom hon.)

Caption ke liye `captionAwareView` (`utils/captionPlacement.js`): pehle `computeFocusView`; caption
fit na ho to thoda zoom-out / pan karke aisa view dhoondhta hai jismein caption feature ko cover na
kare. `placeCaption` side chunta hai: below → above → right → left → least overlap.

---

## A9. Timeline flow

### `buildTimeline(steps, narrationMs)` (`services/video/timeline.js`)

Poori walkthrough ko fixed segments mein badalta hai. **Video export aur player ka timeline bar
dono** yahi use karte hain.

```text
Step data + narrationMs[i]
  ↓  har step i ke liye transitionFor(steps, i):
  │    'same'  = pichhle step jaisa hi imageData
  │    'swap'  = same groupId (Global Step ka doosra screen)
  │    'enter' = naya screen
  │
  ├─ 'same' / 'swap' → sirf focus (continued: true)  [region ho to]
  └─ 'enter'         → enter (650) → overview (1200 pehla / 450) → focus (1050, region ho to)
                       → point (850, sirf click)
  ↓  phir hamesha:
  narrate (narrationMs[i]) → action (click: 750 × targets, look/type: 450)
  ↓  sab steps ke baad:
  done (END_HOLD_MS = 4800, last step)
  ↓
{ segments: TimelineSegment[], total }
  TimelineSegment = { stepIndex, phase, start, duration, enterOrigin, continued }
```

**Example** (step 1: click, region, text; narration 3000 ms):

```text
start    0  enter     650
       650  overview 1200
      1850  focus    1050
      2900  point     850
      3750  narrate  3000
      6750  action    750   → step 1 khatam 7500 ms par
```

`segmentAt(segments, t)` → `{ segment, progress, elapsed }` — "time t par kaunsa phase".

### Narration duration kahan se

| Kahan                        | narrationMs                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Player timeline (`livePlan`) | recording: `voiceMs[id] ?? max(3000, speakingMs(text))`; text: `speakingMs(text)` = `600 + length*65` |
| Video export                 | recording / AI voice ki asli length + `AFTER_VOICE_PAUSE` (400); warna `readingTimeMs(text)`          |

Player khud timeline se nahi chalta (woh voice khatam hone ka wait karta hai); bar `stepTimings()`
se har step ka `{ start, duration }` nikalta hai aur current step ke andar playhead real elapsed
time (rAF loop) se chalta hai — isse bar aur preview sync rehte hain.

### Seeking

```text
User timeline par click karta hai                 components/walkthrough/Timeline.js
  → onPointerDown / onPointerUp (DRAG_PX = 3 se kam hila = click)
  → clickAt(point)
       boundary se SNAP_PX (6 px) ke andar → seekToStep(i) = onSeek(momentAt(steps, voiceMs, spans[i].start))
       warna                              → onSeek(momentAt(steps, voiceMs, t))
User drag karta hai → scrubTime (playhead + time pointer ke saath) → release par exact t, snap nahi
Keyboard ←/→/Home/End (slider focus) → seekToStep(target)
  ↓
momentAt(steps, voiceMs, t) → Moment { index, phase, phaseOffset, stepOffset }
  ↓
onSeek = WalkthroughPlayer.seekTo(moment)
  stopNarration(); setLeaving(null); setContinued(!entering); setEnterOrigin(…)
  setStageKey(k+1); setIndex(moment.index); setPhase(moment.phase)
  phaseSkipRef.current = moment.phaseOffset            // timer utna kam chalega
  narrationOffsetRef.current = phase === 'narrate' ? phaseOffset : 0   // voice beech se
  setStartOffset(moment.stepOffset); setRunId(r+1)     // playhead wahan se
  ↓
Player usi step + phase + offset se continue — playing tha to chalta rahega, paused tha to paused.
```

---

## A10. YouTube-style step thumbnails flow — ✅ IMPLEMENTED

Teen jagah steps thumbnails ke saath dikhte hain, sab `getStepTitles(steps)` (`utils/course.js`)
se `{ number: '4' | '4.1', heading }` lete hain. `heading` = author ka typed "Step heading", ya
(label abhi bhi auto "Step 4.1" ho to) description ka pehla sentence.

**1. Steps panel (`StepList`, `Timeline.js`)** — player ke full layout mein **hamesha dikhta hai**
(md+ par video ke right, phone par neeche; compact embed mein nahi).

```text
StepList item click (step i)
  → momentAt(steps, voiceMs, spans[i].start)      spans = stepTimings(steps, voiceMs).spans
  → onSeek(moment) = WalkthroughPlayer.seekTo      (A9 wala same seek)
  → player step i ke start se; current step highlight + list mein centre scroll
```

**2. Timeline hover preview** — bar par hover/drag karne par step ka screenshot, heading aur
`Step 4.1 · 1:03`. Sirf dikhata hai, **seek nahi karta**.

**3. Downloaded video** — `renderFrame` `drawStepsPanel` har frame mein wahi panel draw karta hai,
aur `addMp4Chapters` steps ko MP4 chapters banata hai (VLC, mpv, IINA jaise players mein clickable).

> `StepsToggle` (show/hide button) code mein hai lekin **render nahi hota** — panel hamesha khula
> rehta hai.

---

## A11. Video export: preview vs export

```text
BROWSER PREVIEW                               VIDEO EXPORT
Screenshot (data URL)                         Screenshot (data URL → <img>, loadImage)
  ↓                                             ↓
React DOM (WalkthroughStage)                  <canvas> 2D (renderFrame)
  ↓                                             ↓
CSS transform + CSS animations (.hs-*)        har frame par camera/overlay khud calculate
  ↓                                             ↓
live, real time, voice ke saath               frame-by-frame (30 fps HD / 24 fps Fast)
                                                ↓
                                              VideoEncoder (WebCodecs) → H.264
                                              + AudioEncoder (AAC ya Opus)
                                                ↓
                                              mp4-muxer → MP4 → addMp4Chapters → Blob → download
```

**DOM animation ko seedha MP4 kyun nahi?** `renderFrame.js` header: _"Browsers can't screen-record
a page without asking the user to pick a screen/tab. A canvas can be recorded silently … so the
player's visuals are redrawn here with the 2D API."_ Isliye same maths (`utils/camera.js`,
`utils/captionPlacement.js`) aur same timing (`WALKTHROUGH_TIMING`) canvas par dobara draw kiye
jaate hain — video player jaisa hi dikhta hai.

---

## A12. Frame rendering flow (`renderFrame.js`)

`exportWalkthroughVideo` ka `drawAt(t)` har frame par:

```text
current timestamp t (ms)
  ↓
segmentAt(segments, t) → { segment, progress, elapsed }         (kaunsa step + phase)
  ↓
ctx.setTransform(scale, …)  (Fast 480p par 1280×720 layout ko chhota karo)
  ↓
renderFrame(ctx, { width: 1280, height: 720, title, steps, images, segments,
                   segment, progress, elapsed, time: t, total })
   1. background + title
   2. drawProgressBar      har step ka segment, played part accent
   3. enter phase ho to pichhla screen: layer(i-1, 'exit')   (naye ke neeche)
   4. current layer: drawStep(...)   (swap ho to fadeFrom crossfade)
        stage rect (image ratio ka sabse bada box)
        camera: stepFocusView (captionAwareView) + lerpView/easeInOut (focus mein 1000 ms)
        enter/exit transform (button se grow / button mein dive / fade)
        screenshot through camera (rounded clip)
        spotlight (even-odd holes)  → ring (pulse, click par flash)
        typing field (type action)
        drawCursor + drawRipples (click)
        layoutCaption + placeCaption + drawCaption
   5. drawStepsPanel       right side steps list (current highlighted)
   6. done + elapsed > OUTRO_DELAY_MS (900) → drawOutro
  ↓
new VideoFrame(canvas, { timestamp, duration }) → videoEncoder.encode(...)
```

**`drawOutro(ctx, width, height, t, title, stepCount)`**: screen dim (`rgba(9,9,11,0.78)`) → 18
sparkles upar uthte hain → accent circle pop + glow → check mark khud draw hota hai → text:
`OUTRO_TEXT.heading` ("You're all set!"), `OUTRO_TEXT.learned(title)` ("Now you know: …"),
`OUTRO_TEXT.tagline(stepCount)` ("N steps · Happy working! 🎉"). Same `OUTRO_TEXT`
(`constants/index.js`) live player ka `OutroCard` bhi use karta hai.

---

## A13. Audio → video flow

```text
RECORDED AUDIO
  step.audioData (data URL; IndexedDB Blob se buildWalkthroughSteps ne banaya)
  → fetch(...).arrayBuffer() → decodeAudio (OfflineAudioContext) → AudioBuffer
    (decode fail → null = silent)

TEXT, RECORDING NAHI
  step.text → speak(text)                                     exportVideo.js
     cache key `tts-${VIDEO_VOICE_ID}-${hash}-${length}` → getMedia (cache hit?)
     miss → synthesizeSpeech(text)                            services/audio/neuralVoice.js
             @diffusionstudio/vits-web (Piper, WASM), voice 'en_US-hfc_female-medium'
             pehli baar model download (~60 MB, OPFS mein)
           → WAV Blob → putMedia(key, wav)  (IndexedDB "media" mein cache)
  → decodeAudio → AudioBuffer          fail → silentSteps++ (toast baad mein)

DONO
  narrationMs[i] = buffer.duration*1000 + AFTER_VOICE_PAUSE (400)   → buildTimeline
  narrationStarts(segments): har step ke 'narrate' segment ka start
  mixVoicesOffline: new OfflineAudioContext(1, length, 48000)
     → voiceChain (compressor + make-up gain) → source.start(start/1000) → startRendering()
  → ek mixed mono track → AudioEncoder (AAC, warna Opus) → muxer.addAudioChunk

Video frames (VideoEncoder H.264) + audio chunks
  ↓
mp4-muxer Muxer({ fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
  ↓
muxer.finalize() → addMp4Chapters(buffer, chapters) → new Blob([...], { type: 'video/mp4' })
```

---

## A14. Download flow (exact user journey)

```text
User "Download video" dabata hai
  (CourseCard, CourseDoneDialog, ya editor — sab sharing.downloadVideo(course))
  ↓
useCourseSharing.downloadVideo(course)                     hooks/useCourseSharing.js
  isVideoExportSupported()? nahi → toast "…Try Chrome or Edge."
  setQualityFor(course) → VideoQualityDialog (Fast · 480p / HD · 720p;
                          last choice localStorage 'videoQuality')
  ↓ user "Download"
recordVideo(course, quality)
  AbortController; setVideo({ stage: 'prepare' }) → VideoExportOverlay (progress + Cancel)
  steps = await buildWalkthroughSteps(course)               IndexedDB → data URLs
  ↓
exportWalkthroughVideo(steps, { title, quality, signal, onStage, onProgress })
  1. document.fonts.ready
  2. loadImage per step (sub-steps same ratio share karte hain)
  3. voices decode + text-only steps ke liye speak()   onStage('voice', fraction)
  4. onStage('record')
  5. narrationMs → buildTimeline(steps, narrationMs)   ← timeline creation
  6. canvas q.width × q.height, drawAt(t)              ← frame rendering
  7. chapters = getStepTitles → { startMs, title }
  8. canEncodeFast()? → encodeFast(job)
        pickVideoConfig(q) (AVC_CODECS: High → Main → Baseline)
        pickAudioConfig()  (AAC → Opus)
        audio pehle: mixVoicesOffline → AudioEncoder     ← audio mixing
        video: har frame drawAt → VideoFrame → encode (keyframe har 2 s)   ← encoding
        muxer.finalize()                                 ← MP4 muxing
        addMp4Chapters → Blob('video/mp4')
     fail (abort nahi) → recordRealtime (MediaRecorder + canvas.captureStream, real time)
  ↓ { blob, extension: 'mp4' | 'webm', silentSteps }
downloadBlob(blob, `${slug(course.title) || 'walkthrough'}.${extension}`)
  temporary <a download> + object URL (1 s baad revoke)       ← browser download
  ↓
toast "Video downloaded" (ya silentSteps > 0 → "…the AI voice couldn't load…")
```

| Quality | Size     | fps | Bitrate  |
| ------- | -------- | --- | -------- |
| `fast`  | 854×480  | 24  | 600 kbps |
| `hd`    | 1280×720 | 30  | 1 Mbps   |

Frames hamesha 1280×720 layout mein draw hote hain (`LAYOUT_WIDTH/HEIGHT`); Fast mein canvas scale
down hota hai.

---

## A15. Share link flow (video download se bilkul alag)

**Share link = poora course URL ke andar.** Koi server nahi, receiver ko IndexedDB nahi chahiye.

### Banana

```text
Copy link → useCourseSharing.copyLink(course)
  ↓
encodeShareableCourse(course)                              services/sharing/share.js
  buildShareableCourse(course)
    resolveCourseMedia: IndexedDB se ids → data URLs (har screenshot ek baar)
    screenshots → compressImageDataUrl(img, LINK_IMAGE)     { maxWidth: 1024, quality: 0.42 } WebP/JPEG
    recordings  → compressVoiceForLink (linkAudio.js)      Opus 16 kbps
    chhote ids (i0…, s0…), regions 0.1 tak round
    → { v: 3, c: { … } }
  packShareable(...)
    media → dataUrlToBytes (raw bytes)          [mime, byteLength] list
    steps → compact arrays [label, text, region|0, action#, image#, audio#, …]
    text part → LZString.compressToUint8Array(JSON.stringify({ t, p, d, m, s }))
    bytes = [4-byte text length][LZ text][media bytes…]
    → '~' + toBase64Url(bytes)                  (+ → -, / → _, = hata do)
  ↓
buildShareUrl(course, encoded) = `${origin + pathname}#/s/~…`
  → navigator.clipboard.writeText  (blocked → ShareLinkModal)
```

Embed: `buildEmbedUrl` → `#/e/~…`, `buildEmbedCode` → `<iframe … height="250">`.

### Kholna

```text
URL #/s/:encoded                                          AppRouter (HashRouter)
  ↓
SharedCoursePage: useMemo(() => decodeShareableCourse(encoded))
  '~' → unpackShareable: base64url → bytes → LZ text decompress → media bytes → data: URLs
  purana format → LZString.decompressFromEncodedURIComponent (v2/v3)
  fail / truncated → null → "Cannot open this course"
  ↓
shareableToWalkthroughSteps(shareable) → WalkthroughStep[]
  ↓
<WalkthroughPlayer variant="inline" />  (browser preview)
```

**IndexedDB kyun nahi chahiye:** saara media link ke andar hai aur player sirf data URLs chahta
hai. (`EmbedPage` bhi aise hi, `embedded` prop ke saath.)

---

## A16. ZIP export / import flow (backup — share link se alag)

```text
EXPORT  exportCourseZip(course)                            services/export/zip.js
  Course + collectMediaIds(course) har id ek baar getMedia
  ↓
  JSZip:
    course.json   { version: 3, course, mediaManifest }    mediaManifest: { 'media123': 'images/image_0.png', … }
    images/image_N.<ext>   audio/audio_N.<ext>   README.md
  ↓
  downloadBlob(zip, `${slug(title) || 'course'}.zip`)
  UI: CourseCard "Export ZIP (backup)" (useCourseLibrary.exportZip), editor header "Export ZIP" (handleExport)

IMPORT  importCourseZip(file)
  course.json padho (nahi → "Invalid course file: missing course.json")
  version SUPPORTED_VERSIONS [1,2,3] mein? (nahi → "Unsupported course export version.")
  har media file → restoreMedia: nextId('media') + putMedia   (NAYE ids; shared screenshot shared hi rehta hai)
  idMap se baseImageId / gallery / step.imageId / step.audioId rewrite
  step.id = nextId('step'), course.id = nextId('course')
  title = makeUniqueTitle(title)  → "Title (2)" agar pehle se hai
  status 'draft', createdAt/updatedAt now, publishedAt null
  saveCourse(course)
  UI: Home / Library ka hidden <input type="file" accept=".zip"> → useCourseLibrary.importZip
```

Share link = dekhne ke liye (compressed, receiver ke paas kuch save nahi). ZIP = backup / doosre
device par **editable** copy (originals, IndexedDB mein save).

---

## A17. Mark done / publish flow

```text
Editor bottom bar: "{readyCount} of {n} steps ready" · Preview · Mark done
  ↓ click
markDone()                                                CourseEditorPage.js
  steps.length === 0 → toast "Create Global Step 1 first — every walkthrough needs one"
  pehla step jo isStepReady nahi:
      isStepReady = (step) => !!getStepImageId(course, step) && !!step.region
      image hai, region nahi → toast "<Step 3.2>: select its target first"
      image nahi            → toast "<Step 3.2> needs a screenshot"
      → selectStep(step.id)   (us step par jump)          → RUK JAATA HAI
  sab ready:
      updateCourse({ status: 'published', publishedAt: Date.now() })
      setShowDone(true) → CourseDoneDialog
  ↓
CourseDoneDialog
  Copy link       → sharing.copyLink(course)      (A15)
  Copy embed code → sharing.copyEmbed(course)
  Download video  → sharing.downloadVideo(course) (A14)
```

- **Ready = screenshot + target 1.** Text ya voice zaroori **nahi**. (Sub-step card ka green ✓
  alag cheez hai: woh text ya audio bhi maangta hai.)
- Button kabhi disabled nahi hota, sirf dim; done ke baad label "Share / Download".
- Done course editable rehta hai. `course.updatedAt - publishedAt > 1500` → badge "Changed since
  you shared it — share or download again".
- Status: `draft → published` seedha. `approved` / `review` legacy hain, set nahi hote.

---

## A18. Complete end-to-end flow

```text
USER
 │
 ├── Upload Screenshot
 │      ↓ StepScreenshotUpload (pickFile / handleDrop / handlePaste → deliver)
 │      ↓ onFiles → CourseEditorPage.handleImageFiles → storeImageFiles
 │      ↓ putMedia(mediaId, file)          IndexedDB "media"  (File/Blob)
 │      ↓ setUnitImage → step.imageId      IndexedDB "courses"
 │
 ├── Select Region
 │      ↓ TargetCanvas handlePointerDown / handleUp (getPos → % of image)
 │      ↓ onAddTarget → GlobalStepEditor.addTarget → withTargets
 │      ↓ step.region {x,y,w,h} (+ extraRegions)
 │
 ├── Select Action
 │      ↓ SubStepCard ACTIONS → onUpdate({ action })
 │      ↓ step.action 'click' | 'look' | 'type'
 │
 ├── Enter Description
 │      ↓ DescriptionField onChange → onUpdate({ text })
 │      ↓ step.text (+ extraTexts)
 │
 ├── Record Voice
 │      ↓ AudioRecorderPanel → useAudioRecorder → createAudioRecorder (MediaRecorder)
 │      ↓ audio Blob → putMedia → onSave(audioId)
 │      ↓ step.audioId
 │
 ↓   (har change: updateStep → setCourse + saveCourse)
STEP DATA   Course { steps: Step[] }  +  media Blobs
 │
 ↓   buildWalkthroughSteps (ids → data URLs)   /   share link: shareableToWalkthroughSteps
WalkthroughStep[]
 │
 ↓   buildTimeline(steps, narrationMs) → segments  (stepTimings / momentAt for the bar)
TIMELINE
 │
 ├──────────────→ PREVIEW
 │                  WalkthroughPlayer (phase machine, useNarration)
 │                    ↓
 │                  WalkthroughStage  React + CSS
 │                    computeFocusView → cameraTransform   (Camera)
 │                    AnimatedCursor                        (Pointer)
 │                    CaptionContent / placeCaption         (Caption)
 │                  Timeline + StepList (seek → seekTo) · OutroCard
 │
 └──────────────→ VIDEO EXPORT   (useCourseSharing.downloadVideo → recordVideo)
                    exportWalkthroughVideo
                      ↓
                    <canvas> renderFrame(ctx, frame)  (drawStep, drawStepsPanel, drawOutro)
                      ↓
                    VideoFrame per frame
                      ↓
                    VideoEncoder (WebCodecs) → H.264
                      +
                    speak / synthesizeSpeech (Piper) + mixVoicesOffline → AudioEncoder
                      ↓
                    mp4-muxer Muxer → finalize → addMp4Chapters
                      ↓
                    MP4 Blob
                      ↓
                    downloadBlob → Download
```

---

## A19. Data flow table

| User Action       | Component                                     | Function/Handler                                                                             | State/Data                           | Storage                              | Next Consumer                                                    |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| Upload screenshot | `StepScreenshotUpload` (→ `CourseEditorPage`) | `deliver` → `onFiles` → `handleImageFiles` → `storeImageFiles` → `setUnitImage`              | `step.imageId`, `course.gallery`     | IndexedDB `media` (Blob) + `courses` | `TargetCanvas` (via `getMediaAsDataUrl` → `imageUrl`)            |
| Select region     | `TargetCanvas` → `GlobalStepEditor`           | `handlePointerDown` / `handleUp` → `onAddTarget` → `addTarget` → `setTargets` → `updateStep` | `step.region`, `step.extraRegions`   | IndexedDB `courses`                  | `computeFocusView` (player, `renderFrame`)                       |
| Select action     | `SubStepCard` (in `GlobalStepEditor`)         | `onClick={() => onUpdate({ action })}` → `updateStep`                                        | `step.action` (+ `typeValue`)        | IndexedDB `courses`                  | `isClickAction` / `isClickStep` (player phases, timeline, video) |
| Enter text        | `DescriptionField`                            | `onChange` → `onUpdate({ text })` → `updateStep`                                             | `step.text`, `step.extraTexts`       | IndexedDB `courses`                  | `CaptionContent`, `useNarration` (TTS), `speak` (video)          |
| Record voice      | `AudioRecorderPanel`                          | `handleStart` / `handleStop` → `putMedia` → `onSave(mediaId)` → `updateStep`                 | `step.audioId`                       | IndexedDB `media` (Blob) + `courses` | `useNarration` (`new Audio`), `decodeAudio` (video)              |
| Preview           | `WalkthroughPlayer` → `WalkthroughStage`      | `advancePhase`, `phaseDuration`, `goTo`, `seekTo`                                            | `index`, `phase`, `runId`, `voiceMs` | — (memory only)                      | `WalkthroughStage`, `Timeline`, `StepList`, `OutroCard`          |
| Export video      | `VideoQualityDialog` → `useCourseSharing`     | `recordVideo` → `exportWalkthroughVideo` → `buildTimeline` → `encodeFast`                    | `segments` / timeline, frames        | TTS cache in IndexedDB `media`       | `renderFrame`, `VideoEncoder`, `Muxer`                           |
| Download          | `useCourseSharing`                            | `downloadBlob(blob, filename)`                                                               | MP4 `Blob`                           | Browser (Downloads)                  | User                                                             |
| Copy link         | `CourseDoneDialog` / `CourseCard`             | `copyLink` → `encodeShareableCourse` → `buildShareUrl`                                       | encoded string                       | URL (clipboard)                      | `SharedCoursePage`                                               |
| Export ZIP        | `CourseCard` / editor header                  | `exportCourseZip`                                                                            | ZIP Blob                             | Browser (Downloads)                  | `importCourseZip`                                                |
| Mark done         | `CourseEditorPage` bottom bar                 | `markDone` → `isStepReady` → `updateCourse`                                                  | `status`, `publishedAt`              | IndexedDB `courses`                  | `CourseDoneDialog`                                               |

---

## A20. "If you want to debug this feature"

### Screenshot upload / display broken?

1. `StepScreenshotUpload` — `deliver` ko files mil rahi hain? (image/* filter)
2. `CourseEditorPage.handleImageFiles` → `storeImageFiles` — type / 10 MB toast aaya?
3. DevTools → Application → IndexedDB → `hint-studio` → `media` — naya `media…` key hai?
4. `setUnitImage` — step par `imageId` laga? (`courses` store mein step dekho)
5. `getStepImageId(course, step)` → `activeImageId` → `getMediaAsDataUrl` → `imageUrl`
6. Thumbnails: `getCourseScreens` → `useMediaUrls`

### Screenshot selection broken?

1. `TargetCanvas` — `handlePointerDown` chala? (primary button, image loaded)
2. `getPos` — `containerRef` ka `getBoundingClientRect`; container ka ratio = image ratio?
3. `handleUp` — box `MIN_REGION_PCT` (3) se bada tha?
4. `GlobalStepEditor.addTarget` / `changeTarget` / `setTargets` → `withTargets`
5. `CourseEditorPage.updateStep` → `step.region` / `step.extraRegions` (`courses` store)
6. Playback: `getStepTargets`, `WalkthroughStage` (`projectRegion` + `boxStyle`)

### Action (pointer aa hi nahi raha)?

1. `step.action` (`courses` store) → `getStepAction` (default `'click'`)
2. `isClickAction` / `isClickStep` — region bhi hona chahiye
3. `WalkthroughPlayer.advancePhase` (focus → point), `continued` true to point skip
4. `WalkthroughStage` `showCursor`

### Preview zoom broken?

1. `step.region` values (0–100?)
2. `computeFocusView(region)` — `s`, `tx`, `ty` (`FOCUS_FILL`, `MAX_ZOOM`, clamp)
3. `cameraTransform(view)` → `.hs-camera` style (Elements panel mein transform dekho)
4. Stage ratio: `useImageAspectRatios` + `useElementSize` (`ready` false = spinner)
5. `projectRegion` → spotlight / ring position; caption: `captionAwareView`, `placeCaption`

### Walkthrough atak gaya / voice nahi?

1. React DevTools: `WalkthroughPlayer` ka `phase`, `playing`, `ready`
2. `phaseDuration` — `narrate` mein `null` = voice ke `onEnd` ka wait
3. `useNarration.start` — `mode` (`recorded` / `tts` / `none`), `onBlocked` (autoplay policy)
4. `tts.js` voices (`speechSynthesis.getVoices()`), Settings voice

### Timeline / seek galat?

1. `stepTimings` spans, `livePlan` narration estimates (`voiceMs`)
2. `momentAt` ka `Moment` (index, phase, offsets)
3. `WalkthroughPlayer.seekTo` — `phaseSkipRef`, `narrationOffsetRef`, `startOffset`

### Video export broken?

1. `isVideoExportSupported` / `canEncodeFast` (VideoEncoder, VideoFrame, OfflineAudioContext)
2. `buildWalkthroughSteps` — steps mein `imageData` / `audioData` hai?
3. Voice: `speak` → `synthesizeSpeech` (network / model download), `silentSteps`
4. `buildTimeline(steps, narrationMs)` — `total` sahi?
5. `renderFrame` (ek frame canvas par draw karke dekho: `drawAt(t)`)
6. `pickVideoConfig` / `pickAudioConfig` — "No H.264 encoder available" / "No audio encoder available"
7. `Muxer` finalize → `addMp4Chapters` (fail par original buffer lautata hai)
8. Console: "Fast video encoding failed, recording in real time instead" → `recordRealtime`
9. `downloadBlob` filename / popup blocker

### Share link nahi khulta?

1. Link truncate hua? → `decodeShareableCourse` null → "Cannot open this course"
2. `unpackShareable` ("Link is truncated"), `shareableToWalkthroughSteps`

### Mark done kaam nahi kar raha?

1. `isStepReady` — har step ke paas image + `region`?
2. toast message padho → `selectStep` us step par le jaata hai

---

## A21. Data at each step (quick reference)

```js
// ── Naya course (NewCoursePage.handleCreate) ─────────────────────────────── example
step = { id: 'stepA', label: 'Step 1', text: '', imageId: null,
         region: null, action: 'click', audioId: null }

// ── Screenshot upload (storeImageFiles + setUnitImage) ─────────────────────
media store:  'mediaB' → Blob(image/png)
step.imageId = 'mediaB'; step.region = null; step.extraRegions = []
course.gallery = ['mediaB']

// ── Area select (TargetCanvas → addTarget → withTargets) ───────────────────
step.region = { x: 45, y: 45.92, w: 10, h: 8 }; step.extraRegions = []

// ── Action (ACTIONS button) ────────────────────────────────────────────────
step.action = 'click'            // ya 'look' / 'type' (+ typeValue)

// ── Text (DescriptionField) ────────────────────────────────────────────────
step.text = 'Click Save to store the purchase order.'

// ── Voice (AudioRecorderPanel.handleStop) ──────────────────────────────────
media store:  'mediaC' → Blob(audio/webm;codecs=opus)
step.audioId = 'mediaC'

// ── Mark done ──────────────────────────────────────────────────────────────
course.status = 'published'; course.publishedAt = 1759132800000

// ── Player input (buildWalkthroughSteps) ───────────────────────────────────
{ id: 'stepA', label: 'Step 1', text: 'Click Save…', region: { x: 45, … },
  extraRegions: [], action: 'click', audioData: 'data:audio/webm;base64,…',
  imageData: 'data:image/png;base64,…', groupId: undefined }

// ── Timeline (buildTimeline) ───────────────────────────────────────────────
[{ stepIndex: 0, phase: 'enter', start: 0, duration: 650, enterOrigin: null }, …,
 { stepIndex: 0, phase: 'done', start: 7500, duration: 4800, … }]   total: 12300

// ── Seek (momentAt at t = 4000) ────────────────────────────────────────────
{ index: 0, phase: 'narrate', phaseOffset: 250, stepOffset: 4000 }

// ── Download ───────────────────────────────────────────────────────────────
Blob { type: 'video/mp4' } → 'create-a-purchase-order.mp4'
```

---

## README vs code: jo purane docs mein galat tha (ab theek)

| Purana README                                                                      | Code (source of truth)                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main editor mein `FeatureSelector` + "Select area" draw mode, `handleRegionChange` | Main editor `TargetCanvas` (koi mode nahi) → `addTarget` / `changeTarget`; `FeatureSelector` + `RegionActionBar` sirf `PreviewStudio` / `StepEditPanel` mein               |
| "Several areas" = consecutive steps same `imageId`                                 | Global Step = sub-steps same `groupId`; ek sub-step ke kai targets = `region` + `extraRegions` (+ `extraTexts`)                                                            |
| Action sirf `'click' \| 'look'`                                                    | `'click' \| 'look' \| 'type'` (+ `typeValue`)                                                                                                                              |
| Phase durations 750 / 1.4 s / 1.1 s / 1.0 s / 2.4 s …                              | `WALKTHROUGH_TIMING`: enter 650, overviewFirst 1200, overview 450, focus 1050, point 850, silentNarrate 2200, clickAction 750, lookAction 450, exitClick 500, exitLook 600 |
| Ending: "That's the whole feature!"                                                | `OutroCard` / `drawOutro` with `OUTRO_TEXT` ("You're all set!")                                                                                                            |
| Video 2 Mbps + 96 kbps, 1280×720 only                                              | `VIDEO_QUALITIES`: hd 1280×720 30 fps 1 Mbps, fast 854×480 24 fps 600 kbps; audio 64 kbps; MP4 chapters                                                                    |
| Recordings "Opus at 128 kbps"                                                      | `VOICE_BITRATE = 32_000`                                                                                                                                                   |
| Share screenshots "1280 px, WebP 0.6"                                              | `LINK_IMAGE = { maxWidth: 1024, quality: 0.42 }`                                                                                                                           |
| IndexedDB `hint-studio` v2                                                         | `DB_VERSION = 3`                                                                                                                                                           |
| Voice LocalStorage key `hint-studio-voice`                                         | `LS_VOICE = 'hint-studio-voice-v2'`                                                                                                                                        |
| `enterOrigin` from `focusedCenter()`                                               | `clickOrigin(prev)` (`utils/course.js`); `focusedCenter` defined hai par kahin use nahi hota                                                                               |
| React DevTools: `drawMode` (editor), `autoAdvance` (state)                         | editor mein `drawMode` nahi; `autoAdvance` ek constant hai                                                                                                                 |

**Code mein absent / unused (bataya gaya, banaya nahi):**

- `handleUpload` (aapke example ka naam) — nahi hai; asli: `deliver` → `onFiles` → `handleImageFiles`.
- `OffersPage` — nahi hai; equivalent `CourseEditorPage`.
- Upload par image compression — nahi hai (sirf share links mein).
- Autosave debounce — nahi hai (har change turant `saveCourse`).
- Live recording max length — nahi hai (180 s sirf upload par).
- `StepsToggle`, `hideControls` prop, `focusedCenter` — code mein hain, use nahi hote.
- `RegionCanvas.js`, `StepGuide.js` — kahin import nahi hote.
- `services/audio/recorder.js` mein do debug `console.log` lines hain (lines 40, 49).
- `@supabase/supabase-js` dependency — use nahi hoti.

---

# PART B — Reference

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

| Library                       | Used for                                                   | Why this one                                                                                        |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **React 18**                  | UI                                                         | Component model + hooks; the whole app is React function components.                                |
| **JavaScript (ES2020+)**      | Language                                                   | Plain `.js` files containing JSX. Data shapes are documented with JSDoc in `src/types/index.js`.    |
| **Vite 5**                    | Dev server + bundler                                       | Very fast dev server, simple config. Configured to parse JSX inside `.js` files (`vite.config.js`). |
| **react-router-dom 7**        | Routing                                                    | Uses **HashRouter** so the app works on any static host without rewrite rules (see §3).             |
| **Tailwind CSS 3**            | Styling (theme: zinc greys + indigo `#635BFF`, Inter font) | Utility classes, custom colour tokens in `tailwind.config.js`, class-based dark mode.               |
| **idb**                       | IndexedDB access                                           | Tiny Promise wrapper; raw IndexedDB is callback/event based.                                        |
| **lz-string**                 | Share links                                                | Compresses JSON _and_ outputs URL-safe characters in one call.                                      |
| **JSZip**                     | Export / import                                            | Creates and reads ZIP files in the browser and accepts Blobs directly.                              |
| **lucide-react**              | Icons                                                      | Tree-shakeable SVG icon components.                                                                 |
| **mp4-muxer**                 | Video download, link voices                                | Writes a standard MP4 ("fast start") from WebCodecs chunks, in the browser.                         |
| **@diffusionstudio/vits-web** | AI voice in downloaded videos                              | Piper neural TTS in WebAssembly; `speechSynthesis` can't be recorded.                               |
| **@anthropic-ai/sdk**         | ✨ Improve text (optional, user's own key)                 | Loaded lazily on first use only.                                                                    |
| Web APIs                      | MediaRecorder, speechSynthesis, FileReader, WebCodecs      | Recording, text-to-speech, Blob → data URL, fast video encoding — all built into the browser.       |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Pages (src/pages)            one component per route                 │
│   Home · Library · NewCourse · CourseEditor · CoursePreview · Shared · Embed
├──────────────────────────────────────────────────────────────────────┤
│ Components (src/components)  reusable UI, no direct storage access*  │
│   course/  StepRail · GlobalStepEditor · TargetCanvas · AudioRecor…  │
│   walkthrough/ WalkthroughPlayer · Stage · Timeline · OutroCard      │
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
      <AppRoutes>          /s/*, /e/* (and old /embed/*) → course only
                           everything else → <Sidebar/> (all courses) + page
      <ToastContainer/>    renders toasts on every page
```

| URL                                            | Page                | Purpose                                            |
| ---------------------------------------------- | ------------------- | -------------------------------------------------- |
| `#/`                                           | `HomePage`          | Create a course · search · View all · demo + about |
| `#/courses`                                    | `LibraryPage`       | All courses: search, filter, card actions          |
| `#/examples/:id?`                              | `ExamplesPage`      | 4 playable example walkthroughs ("See examples")   |
| `#/new`                                        | `NewCoursePage`     | Create a draft course                              |
| `#/editor/:courseId`                           | `CourseEditorPage`  | Screenshot, steps, regions, text, voice, publish   |
| `#/preview/:courseId`                          | `CoursePreviewPage` | Inline player (YouTube-style) + course info        |
| `#/s/:encoded`                                 | `SharedCoursePage`  | Share link: inline player + course info            |
| `#/e/:encoded`                                 | `EmbedPage`         | Player only, for `<iframe>` embeds (250px tall)    |
| `#/s/:slug/:encoded`, `#/embed/:slug/:encoded` | same pages          | Older links (before v4), still work                |
| anything else                                  | redirect to `#/`    |                                                    |

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
├── utils/captionPlacement.js        placeCaption / captionAwareView: caption never covers the feature
├── services/
│   ├── storage/db.js                IndexedDB CRUD for courses + media, duplicateCourse
│   ├── storage/settings.js          Theme in LocalStorage + <html class="dark">
│   ├── audio/recorder.js            MediaRecorder wrapper → Promise<Blob>
│   ├── audio/tts.js                 speechSynthesis: scores voices (natural first, en-IN/hi-IN), sentence chunks, preview
│   ├── storage/settings.js          (also) voice choice + speed, the user's own AI key
│   ├── sharing/share.js             Course → player steps / compressed share URL (and back)
│   ├── video/timeline.js            Walkthrough as a fixed timeline (phase start/duration); used by the video AND the player's timeline bar
│   ├── video/renderFrame.js         Draws one video frame: screens, camera, pointer, caption, steps panel, progress bar, ending (drawOutro)
│   ├── video/mp4Chapters.js         addMp4Chapters: steps as MP4 chapters (clickable in VLC / mpv / IINA)
│   ├── text/enhance.js              "Improve" text: offline polish, or Claude rewrite with the user's own key
│   ├── video/exportVideo.js         canvas + voices → WebCodecs + mp4-muxer → MP4 Blob (MediaRecorder fallback); VIDEO_QUALITIES
│   ├── audio/neuralVoice.js         Piper neural voice (synthesizeSpeech) for text steps in videos
│   ├── audio/linkAudio.js           compressVoiceForLink: recordings → Opus 16 kbps, share links only
│   ├── audio/transcribe.js          Whisper in the browser: recording → step text
│   └── export/zip.js                Course ⇄ .zip (course.json + images/ + audio/)
├── hooks/
│   ├── useAudioRecorder.js          Recorder state, timer, errors, unmount cleanup
│   ├── useToast.js                  Toast context: notify / dismiss
│   ├── useTheme.js                  Theme context: theme / toggle
│   ├── useNarration.js              Player voice: recording > TTS, pause/resume, safety timer
│   ├── useElementSize.js            ResizeObserver → live width/height of an element
│   ├── useImageAspectRatios.js      Preloads step screenshots, reports their real ratios
│   ├── useCourseSharing.js          Copy link + Download video (+ progress/fallback overlays)
│   ├── useCourseThumbnail.js        Object URL of a course's first screenshot (cards)
│   ├── useMediaUrls.js              Object URLs for many media ids (Screens strip, gallery)
│   ├── useCourseLibrary.js          Home/Library: load courses + every card action
│   ├── useCourseList.js             Live sidebar list (COURSES_CHANGED_EVENT)
│   └── useInView.js                 Scroll-reveal on Home
├── components/
│   ├── ui/Header.js                 Top bar: sidebar toggle, Courses, New course, Settings, theme
│   ├── ui/SettingsDialog.js         Voice picker (+ preview, speed) and the optional AI key
│   ├── ui/SearchInput.js            Big search box ("/" or Ctrl/Cmd+K)
│   ├── layout/Sidebar.js            ChatGPT-style sidebar: all courses, active one highlighted
│   ├── course/CourseResults.js      Search results / "Did you mean" / course grid
│   ├── course/StepGuide.js          ⚠️ not imported anywhere (older editor checklist)
│   ├── tutorial/HowItWorksDemo.js   Looping animated demo on the Home page
│   ├── tutorial/MiniHint.js         Tiny "what to do here" animations in the editor
│   ├── tutorial/Highlights.js       Home: real product stats (count-up) + use cases → examples
│   ├── walkthrough/CourseInfo.js    Course details under an inline player
│   ├── ui/ThemeToggle.js            Sun/moon button
│   ├── ui/Toast.js                  Toast stack renderer
│   ├── ui/ConfirmDialog.js          "Are you sure?" modal
│   ├── ui/Spinner.js                Spinner + PageSpinner
│   ├── ui/PanelResizer.js           Drag handle to resize editor panels
│   ├── course/StepRail.js           Step list: select, add, delete, drag-reorder
│   ├── course/StepScreenshotUpload.js  Per-step screenshot: upload / drop / paste / reuse / gallery
│   ├── course/GlobalStepEditor.js   Main editor: Screens strip, TargetCanvas, one SubStepCard per sub-step
│   ├── course/TargetCanvas.js       Main editor canvas: drag = new target, move / resize, zoom (no modes)
│   ├── course/ScreenGallery.js      Every screenshot uploaded to the course (course.gallery), reuse / delete
│   ├── course/FeatureSelector.js    Preview studio only: single-region canvas with a draw mode
│   ├── course/RegionActionBar.js    Preview studio only: "Select area" + Click / Look / Type choice
│   ├── course/AudioRecorderPanel.js Record / play / re-record / delete a step's voice
│   ├── course/DescriptionField.js   Step text + ✨ Improve / Undo / 🔊 Listen
│   ├── course/PreviewStudio.js      Editor preview: Watch / Edit, draft with Save / Discard
│   ├── course/StepEditPanel.js      Edit one moment: what's said, highlighted area, add/delete
│   ├── course/ShareLinkModal.js     Share URL + Copy button (fallback when clipboard is blocked)
│   ├── course/CourseCard.js         Library card: thumbnail, page name, Preview/Download/Share, ⋯ menu
│   ├── course/CourseDoneDialog.js   After "Mark done": Copy link / Download video
│   ├── course/VideoExportOverlay.js Progress + Cancel while a video records
│   ├── course/VideoQualityDialog.js Download video: Fast · 480p / HD · 720p
│   ├── course/RegionCanvas.js       ⚠️ UNUSED legacy (multi-region design) — safe to delete
│   └── walkthrough/
│       ├── WalkthroughPlayer.js     Phase state machine, narration, controls, keyboard
│       ├── Timeline.js              Timeline bar (steps as segments, drag, hover preview) + StepList panel
│       │                            + stepTimings / momentAt (formatTime lives in utils/index.js)
│       ├── WalkthroughStage.js      What each phase looks like: camera, spotlight, pointer, caption
│       └── OutroCard.js             Happy ending when the walkthrough finishes (same as the video)
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
  steps:       Step[],            // no limit by default (MAX_STEPS)
  createdAt, updatedAt, publishedAt   // epoch ms; updatedAt drives auto-delete,
                                      // publishedAt = last "Mark done"
}

Step {
  id, label,                      // label = "Step heading" (auto "Step 3" / "Step 3.2" until typed)
  text:    string,                // caption in the player; spoken by TTS if no recording
  imageId: string | null,         // → media store: THIS step's screenshot
  region:  { x, y, w, h } | null, // target 1, in PERCENT (0–100) of the screenshot
  extraRegions?: Region[],        // targets 2, 3 … on the same screenshot
  extraTexts?:   string[],        // what to say at targets 2, 3 … (optional)
  action:  'click' | 'look' | 'type',  // click: pointer clicks, next screen opens from it
                                       // look: zoom + spotlight only · type: typed value
  typeValue?: string,             // 'type' steps
  groupId?: string | null,        // consecutive steps with the same groupId = sub-steps of one Global Step
  audioId: string | null          // → media store
}

Course.gallery?: string[]         // every screenshot uploaded to the course (reusable)

WalkthroughStep {                 // what the player consumes
  id, label, text, region, extraRegions, action, typeValue,
  groupId, extraTexts,            // built by share.js (not in the typedef, but used)
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
2. **Screenshot:** `GlobalStepEditor` — the Screens strip, the `TargetCanvas` (drag anywhere to
   add a target to the selected sub-step; no mode to switch) and one card per sub-step with Step
   heading, targets, **Click it / Just look / Type**, description and voice.
   (The older `FeatureSelector` + "Select area of the feature" flow is only used in the Preview
   studio's edit panel.)

With no steps at all, it shows "Add First Step".

### 6.3 Edit a step (autosave)

There is no Save button. Every edit goes through `updateCourse(patch)` or
`updateStep(stepId, patch)`, which:

```
setCourse(prev => { updated = merge(prev, patch, updatedAt: now); saveCourse(updated); return updated })
```

| User action               | Code path                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add step screenshot       | `StepScreenshotUpload` `deliver` → `onFiles` → `handleImageFiles` → `storeImageFiles` (type/size check, `putMedia`, `addToGallery`) → `setUnitImage` |
| Change screenshot         | "Change screenshot" → `pickReplacementImage` → `setUnitImage` (targets reset, old image released)                                                    |
| Reuse previous screenshot | "Use step N's screenshot" → `reusePreviousImage` (same id, no copy)                                                                                  |
| Select target (area)      | drag on `TargetCanvas` → `onAddTarget` → `GlobalStepEditor.addTarget` → `setTargets` → `updateStep(withTargets)`                                     |
| Move / resize target      | drag the box / a corner handle → `onChangeTarget` → `changeTarget`                                                                                   |
| Click / Look / Type       | `SubStepCard` `ACTIONS` → `onUpdate({ action })` → `updateStep`                                                                                      |
| Add step (end)            | `addStep` → `insertStep(steps.length)` (blocked at `MAX_STEPS`)                                                                                      |
| Insert step between two   | StepRail "+" between rows → `insertStep(index)`; "Step N" labels renumbered                                                                          |
| Re-record voice           | AudioRecorderPanel "Re-record" → the new take replaces the old one only when saved                                                                   |
| Delete step               | StepRail 🗑 → `requestDeleteStep` / `requestDeleteUnit` → `ConfirmDialog` → `deleteSteps` (deletes its audio + unshared screenshot)                   |
| Reorder steps             | StepRail drag & drop → `reorderSteps(from, to)`                                                                                                      |
| Edit label / description  | input `onChange` → `updateStep`                                                                                                                      |
| Edit title                | click title → input → on blur `finishTitleEdit` refuses a duplicate and restores the old one                                                         |
| Edit page name            | click the page-name chip → `updateCourse({ pageName })`                                                                                              |

**How region drawing works** (`TargetCanvas`; full walk-through in **A2**): the canvas takes the
screenshot's **own aspect ratio** (read from the image on load), so a percentage points at exactly
the same pixels in the player's zoom. On pointer-down `getPos` converts the position to a
percentage. It then attaches `pointermove`/`pointerup` listeners to `window` for the duration of
the drag, so releasing outside the canvas still ends it. Pointer events cover mouse, touch and pen.
Boxes of 3% or less (`MIN_REGION_PCT`) are ignored, and moving or resizing keeps the box inside the
image.

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
                       │  (look / type steps skip "point") │
                       │                                └─(last step)─► done
                       └─(no area: overview ─► narrate)

next step on the SAME screenshot:  focus (camera + pointer glide from the old area) ─► narrate ─► …
```

| Phase      | What the viewer sees                                                                                                      | Ends after (`WALKTHROUGH_TIMING`)         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `enter`    | Screenshot appears. After a click step it **grows out of the clicked button** (`.hs-stage-emerge`), otherwise it fades in | 650 ms                                    |
| `overview` | The full screenshot: "this is the page"                                                                                   | 1200 ms first step / 450 ms later         |
| `focus`    | Camera zooms into the area (max 2.5×); the rest dims (spotlight); ring pulses                                             | 1050 ms                                   |
| `point`    | Animated pointer glides in from the corner onto the button (click only)                                                   | 850 ms                                    |
| `narrate`  | Caption bubble next to the area; recorded voice, or TTS of the text                                                       | voice ends (or 2200 ms if nothing to say) |
| `action`   | Click: pointer presses, ripple rings, ring flashes. Look / Type: short hold / typing                                      | 750 ms × targets / 450 ms                 |
| `exit`     | The previous screen, drawn **under** the next one while it enters: dives into the clicked button, or fades                | 500 ms / 600 ms (overlaps `enter`)        |
| `done`     | Last step only: `OutroCard` — "You're all set!" + Watch again                                                             | user                                      |

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
  the next with no cut. After the last step the `OutroCard` happy ending appears (same wording as
  the video, `OUTRO_TEXT`).
- **Controls:** ▶/⏸ and a **video timeline** (`walkthrough/Timeline.js`): one bar that fills
  continuously, drawn as one segment per step (width = its share of the time), a hover preview
  (screenshot + heading + time), click to jump (snaps within `SNAP_PX` of a step start), drag to
  scrub, and `0:12 / 0:45`. Beside the video, the **`StepList`** panel shows every step as a
  thumbnail with its heading; clicking one seeks to that step (see **A10**). Step lengths use the same phase plan as the video export
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
| Shared link      | `#/s/:encoded`                       | **inline** in the page (no pop-up)                |
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

**Global Steps, sub-steps and targets:** a Global Step is a run of consecutive steps with the same
`groupId` (numbered 3.1, 3.2 …); each sub-step can use another screenshot of the same page
("Add screens"), and has one or more **targets** (`region` + `extraRegions`, optional
`extraTexts`). Sub-steps on the same screenshot keep the same stage, so the player and the video
glide the camera from area to area as one scene; another screenshot of the same Global Step
crossfades in (`transitionFor` = `'swap'`).

**Small files:**

- Voices are recorded as Opus at 32 kbps, which is clear for speech.
- **Upload audio** lets you use an existing voice file (MP3, M4A, WAV, …) for a step. It is
  re-encoded to the same small format (`compressVoiceFile`), so a 200 KB WAV becomes about
  20 KB. This takes as long as the audio plays; the limit is 3 minutes per step.
- Video: H.264, **HD** 1280×720 30 fps 1 Mbps or **Fast** 854×480 24 fps 600 kbps
  (`VIDEO_QUALITIES`), mono 64 kbps audio.
- Share and embed links:
  - screenshots are capped at 1024 px and WebP quality 0.42 (`LINK_IMAGE`; links only, the app
    keeps the originals), recordings are re-encoded to Opus 16 kbps (`compressVoiceForLink`);
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
- Recordings are Opus at 32 kbps (`VOICE_BITRATE`).
- The video mixes voices through another gentle compressor.

**Video voice for text steps** (`services/audio/neuralVoice.js`): the browser's speechSynthesis
can't be recorded. When exporting, text steps without a recording are spoken by a Piper neural
voice running in WebAssembly, and that audio is mixed into the video. The first export
downloads the voice once (~60 MB, cached in OPFS).

**Video ending:** after the last step the video dims, then:

- a check mark draws itself in a glowing circle, with sparkles;
- "You're all set!" appears, with "Now you know: <title>";
- then "N steps · Happy working! 🎉";
- `drawOutro` in `renderFrame.js` draws it; `END_HOLD_MS` is 4.8 s. The live player shows the same
  ending with `OutroCard` (shared wording: `OUTRO_TEXT` in `constants/index.js`).

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
the speed. The choice is stored in LocalStorage (`LS_VOICE` = `hint-studio-voice-v2`).

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
same timing (`WALKTHROUGH_TIMING` in constants). Every frame is handed to a **WebCodecs**
`VideoEncoder` (H.264; quality chosen in `VideoQualityDialog`) and the voices are mixed in an `OfflineAudioContext` and encoded
(AAC, or Opus) — both much **faster than real time** (a 60 s walkthrough takes ~10 s). `mp4-muxer`
writes a standard MP4 with its index at the start, so it plays and seeks in every player. Spoken
AI-voice text is cached in IndexedDB. Browsers without WebCodecs fall back to `MediaRecorder`
recording `canvas.captureStream()` in real time. Every frame also shows the steps panel, and the
MP4 carries the steps as chapters (`addMp4Chapters`). Full walk-through: **A11–A14**.

How the share URL is built (`services/sharing/share.js`):

```
Course → resolve media to data URLs → screenshots re-encoded (WebP ≤1024px q0.42) and
   recordings re-encoded (Opus 16 kbps) — links only
       → v4 bytes: [length][LZ-compressed JSON of the text][raw media bytes…]
       → base64url → "<origin>/#/s/~<encoded>"   (embeds: "<origin>/#/e/~<encoded>")
```

Media travel as **raw bytes** (encoded once), each screenshot **once** even when several steps use
it; only the small text part is LZ-compressed. Older links (`#/s/<slug>/<LZ text>`, v2/v3) still
open.

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
| Courses (metadata, steps, regions) | IndexedDB `hint-studio` v3 | store `courses`, keyPath `id`, indexes `by_titleKey`, `by_updatedAt` |
| Screenshots + audio (Blobs)        | IndexedDB `hint-studio` v3 | store `media`, key = media id                                        |
| Video AI-voice cache (WAV)         | IndexedDB `hint-studio` v3 | store `media`, key `tts-<voice>-<hash>-<length>`                     |
| Theme                              | LocalStorage               | `hint-studio-theme`                                                  |
| Voice choice + speed               | LocalStorage               | `hint-studio-voice-v2`                                               |
| Own AI key (optional)              | LocalStorage               | `hint-studio-anthropic-key`                                          |
| Last video quality                 | LocalStorage               | `videoQuality`                                                       |

- **Migrations** (`upgrade()` in `db.js`, "self-healing"): creates any missing store or index and
  backfills `titleKey`. v3 has the same schema as v2; it was bumped so databases stuck at v2
  without the indexes get repaired.
- **Changing the schema:** bump `DB_VERSION` in `constants/index.js` and add a migration in
  `upgrade()` in `services/storage/db.js`. Don't rename `DB_NAME`; existing users would appear to
  lose their data.
- **Invariant:** whenever a course or step is removed, its media must be removed too, **unless
  another step still uses it** (shared screenshots). `deleteCourse`, `deleteSteps`, `setUnitImage`
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
- **React DevTools:** check `CourseEditorPage` state (`course`, `activeStepId`, `railHover`) and
  `WalkthroughPlayer` state (`index`, `phase`, `playing`, `hasStarted`, `enterOrigin`, `runId`). Watching
  `phase` change is the fastest way to debug the animation sequence.

### Symptom → where to look

| Symptom                                | Look at                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Course missing / "Course not found"    | `getCourse` in `services/storage/db.js`; check the id in the URL vs the `courses` store                                               |
| Edits not saved after refresh          | `updateCourse` / `updateStep` in `CourseEditorPage.js` (they call `saveCourse`)                                                       |
| Screenshot not showing in editor       | effect on `activeImageId` in `CourseEditorPage.js` → `getStepImageId` → `getMediaAsDataUrl`; does the id exist in the `media` store?  |
| Region drawing / dragging wrong        | `TargetCanvas.js` → `getPos`, `handlePointerDown`, `handleUp`, `startDrag` (preview studio: `FeatureSelector.js`)                     |
| Zoom lands in the wrong place          | `camera.js` → `computeFocusView`; is the stage ratio right? (`useImageAspectRatios`)                                                  |
| Walkthrough stuck on a step            | `phase` in React DevTools; `phaseDuration` + timed effect in `WalkthroughPlayer.js`; `useNarration` (onEnd / safety timer)            |
| Animation looks wrong / too fast       | `.hs-*` classes in `index.css` (durations must match `WALKTHROUGH_TIMING`)                                                            |
| Next screen doesn't "open" from button | step `action` must be `'click'`; `enterOrigin` from `clickOrigin(prev)` (`utils/course.js`)                                           |
| "Microphone permission denied"         | `useAudioRecorder.start` catch block; site must be HTTPS/localhost; browser site settings                                             |
| Recording saved but silent/empty       | `services/audio/recorder.js` → `pickMimeType`, `ondataavailable`, `onstop`                                                            |
| Player doesn't speak text              | `services/audio/tts.js` → `scoreVoice` / `listVoices` (voices load async; check `speechSynthesis.getVoices()`), Settings voice choice |
| Audio won't auto-start                 | browser autoplay policy → `onBlocked` in `useNarration` pauses the player; press Play                                                 |
| Step timing / timeline length          | `WALKTHROUGH_TIMING` in `constants/index.js` (player, timeline bar and video share it)                                                |
| Share link "Cannot Open Course"        | link truncated by the chat app / browser (too long) → `decodeShareableCourse` returns null                                            |
| Search doesn't find a course           | `searchCourses` in `utils/search.js`; check `title` / `pageName` in the `courses` store                                               |
| "Title already exists" wrongly         | `titleKey` of the other course (`normalizeTitle`); `findCourseByTitle` in `db.js`                                                     |
| Course vanished                        | auto-delete: `updatedAt` older than 90 days → `purgeExpiredCourses`                                                                   |
| Video download fails / is choppy       | `services/video/exportVideo.js` (`canEncodeFast`, `encodeFast`, `recordRealtime`); `isVideoExportSupported()` — see **A20**           |
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
3. **Keep the tab open while the video is made.** It usually takes seconds; only browsers without
   WebCodecs record in real time (and need the tab visible, as browsers throttle hidden tabs).
4. **Single browser.** Data lives in one browser's IndexedDB. Clearing site data deletes all
   courses. Use Export for backups.
5. **Old regions on legacy courses.** Areas drawn before per-step screenshots existed were measured
   on a fixed 16:10 canvas. On screenshots that aren't 16:10 they may be slightly off; reselect
   them once.
6. **Unused code / dependency:** `components/course/RegionCanvas.js` (legacy),
   `components/course/StepGuide.js`, the `StepsToggle` component, the player's `hideControls`
   prop, `focusedCenter` in `camera.js`, and the `@supabase/supabase-js` package are unused.
   `services/audio/recorder.js` still has two debug `console.log` lines.
7. **Two meanings of "done" for a step.** Mark done needs screenshot + target 1
   (`isStepReady`); the green ✓ on a sub-step card also needs text or a voice.
8. **Every drag is a write.** Moving / resizing a target calls `updateStep` → `saveCourse` on
   every `pointermove` (no debounce).
9. **ZIP import is lightly validated.** Only `course.json` presence, version and a steps array are
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
