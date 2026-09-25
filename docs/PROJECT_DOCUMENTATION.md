> **⚠️ Outdated.** This document describes an earlier design (screenshot per step, multiple regions, "scenes"). The up-to-date documentation is the project [README.md](../README.md).

# Hint Studio — Project Documentation

## 31.1 Project Overview

Hint Studio is a frontend-only application for creating narrated walkthroughs from screenshots. Users upload screenshots, draw highlight regions on them, optionally record voice narration for each region, and then publish the walkthrough as a shareable URL or export it as a ZIP file.

The entire application runs in the browser — no backend server, no API, no server-side database. All data persists in IndexedDB and LocalStorage.

## 31.2 Product Flow

```
Create Course (title + context)
    ↓
Add Steps (up to 10)
    ↓
Upload Screenshot per Step
    ↓
Draw Highlight Regions on Screenshot
    ↓
Add Text Description per Region (optional)
    ↓
Record Voice Narration per Region (optional)
    ↓
Preview Walkthrough
    ↓
Mark as OK (status → approved)
    ↓
Publish (status → published, generates share URL)
    ↓
Share URL / Export ZIP
    ↓
Recipient opens URL → Course loads → Plays
```

## 31.3 Architecture

```
React UI (pages + components)
       ↓
   Hooks (useAudioRecorder, useToast, useTheme)
       ↓
   Services (db, recorder, share, zip)
       ↓
   Browser APIs (IndexedDB, MediaRecorder, Blob, URL, FileReader)
```

### Layers

1. **UI Layer** — React components and pages. No direct browser API calls.
2. **Hooks Layer** — `useAudioRecorder` wraps the recorder service with React state and lifecycle. `useToast` and `useTheme` provide context.
3. **Services Layer** — `db.js` (IndexedDB CRUD), `recorder.js` (MediaRecorder factory), `share.js` (URL encoding), `zip.js` (export/import).
4. **Browser APIs** — IndexedDB for persistence, MediaRecorder for audio, Blob/URL for media handling, FileReader for data URL conversion.

## 31.4 Why There Is No Backend

### Benefits
- **Zero hosting cost** — Deploy as static files to any CDN
- **Privacy** — All data stays in the user's browser
- **Offline-capable** — Works without network after initial load
- **No auth needed** — No user accounts, no sessions
- **Instant** — No network latency for data operations

### Limitations
- **No cross-device sync** — Courses live in one browser. Use Export/Import to transfer.
- **No multi-user collaboration** — Only one user per browser instance.
- **Share URL size** — Large courses with audio produce very long URLs.
- **Storage limits** — Browsers limit IndexedDB to a fraction of available disk (typically several hundred MB to GB).
- **Data loss** — Clearing browser data erases all courses.

### What Data Is Stored Locally
- Course metadata (title, description, status, timestamps)
- Step definitions (label, region coordinates)
- Image blobs (uploaded screenshots)
- Audio blobs (recorded narration)
- Theme preference (light/dark)

## 31.5 Folder Structure

| Directory | Purpose |
|-----------|---------|
| `src/app/router/` | HashRouter setup, route definitions, layout |
| `src/components/course/` | StepRail, RegionCanvas, RegionRow, AudioRecorderPanel |
| `src/components/ui/` | Header, Toast, ConfirmDialog, ThemeToggle |
| `src/components/walkthrough/` | WalkthroughPlayer |
| `src/constants/` | Status labels, context options, DB names, max steps |
| `src/hooks/` | useAudioRecorder, useToast, useTheme |
| `src/pages/Dashboard/` | Course list with CRUD actions |
| `src/pages/NewCourse/` | New course creation form |
| `src/pages/CourseEditor/` | Main editor: steps, images, regions, audio |
| `src/pages/CoursePreview/` | Preview walkthrough before publishing |
| `src/pages/SharedCourse/` | Load and play a shared course from URL |
| `src/services/audio/` | MediaRecorder factory function |
| `src/services/export/` | ZIP export and import using JSZip |
| `src/services/sharing/` | LZ-string URL encoding/decoding |
| `src/services/storage/` | IndexedDB (idb) and LocalStorage helpers |
| `src/utils/` | ID generation, formatting, blob helpers |

## 31.6 Libraries

### react-router-dom
- **Purpose:** Client-side routing
- **Why selected:** Standard React routing library; HashRouter mode works on static hosts without server rewrite rules
- **Where used:** `src/app/router/AppRouter.js`, all pages
- **Problem solved:** SPA navigation without server support
- **Alternatives:** TanStack Router, Wouter

### idb
- **Purpose:** Promise-based IndexedDB wrapper
- **Why selected:** Native IndexedDB API is callback-based and verbose; idb provides clean async/await syntax
- **Where used:** `src/services/storage/db.js`
- **Problem solved:** Simplifies IndexedDB CRUD operations
- **Alternatives:** Dexie.js, direct IndexedDB API

### jszip
- **Purpose:** Create and read ZIP files in the browser
- **Why selected:** Most popular client-side ZIP library; handles Blob data
- **Where used:** `src/services/export/zip.js`
- **Problem solved:** Course export/import as downloadable ZIP files
- **Alternatives:** fflate, client-zip

### lz-string
- **Purpose:** String compression for URL-safe encoding
- **Why selected:** Lightweight, produces URL-safe output, widely used for compressing JSON in URLs
- **Where used:** `src/services/sharing/share.js`
- **Problem solved:** Embedding course data (with base64 media) in shareable URLs
- **Alternatives:** pako (gzip), custom base64 encoding

### lucide-react
- **Purpose:** SVG icon library
- **Why selected:** Clean, consistent icons, tree-shakeable
- **Where used:** All components and pages
- **Problem solved:** UI iconography without external icon font
- **Alternatives:** Heroicons, Phosphor Icons

## 31.7 Voice Architecture

```
MediaRecorder (browser API)
    ↓
Audio Blob (webm/opus or mp4)
    ↓
IndexedDB (stored as Blob via putMedia)
    ↓
Blob URL / Data URL (loaded via getMediaAsDataUrl)
    ↓
Course Step Region (audioId references the Blob)
    ↓
Walkthrough Player (HTMLAudioElement plays the data URL)
```

### Recording Lifecycle

1. User clicks "Record voice" → `useAudioRecorder.start()` calls `createAudioRecorder()`
2. Recorder requests microphone via `getUserMedia({ audio: true })`
3. If permission denied → error state shown, app continues normally
4. If granted → `MediaRecorder` starts, duration timer begins
5. User clicks "Stop & Save" → `MediaRecorder.stop()` fires `onstop`, creates Blob
6. Blob saved to IndexedDB via `putMedia(mediaId, blob)`
7. Region's `audioId` updated to reference the stored Blob
8. On unmount or cancel → stream tracks stopped, recorder cleaned up

### Cleanup

- `useAudioRecorder` cleanup on unmount: cancels recorder, stops all MediaStream tracks, clears timer
- `AudioRecorderPanel` cleanup: revokes object URLs when region changes or component unmounts
- `WalkthroughPlayer` cleanup: pauses and clears audio element, revokes object URLs on step change and unmount

## 31.8 Walkthrough Logic

```
For each scene in the walkthrough:
    ├── Audio exists (audio data URL present)?
    │   ├── YES → Auto-play audio on scene entry
    │   │         Show text if also available
    │   │         Audio controls (play/pause/mute) shown
    │   └── NO → Show text only
    │            No audio controls shown
    │
    └── Neither audio nor text?
        └── Show "No text or audio for this step"
```

### Scene Transitions

When moving from one scene to the next:
1. `cleanupAudio()` pauses the current audio element
2. Audio element `src` is cleared
3. Any object URLs are revoked
4. New scene loads
5. If new scene has audio → new Audio element created, auto-plays
6. If no audio → text-only display

**Previous audio never continues playing after moving to another scene.**

## 31.9 Browser Storage

### IndexedDB

- **Database name:** `hint-studio`
- **Version:** 1
- **Object stores:**
  - `courses` (keyPath: `id`) — Course objects with steps and regions
  - `media` (key: media ID) — Blob values for images and audio

### LocalStorage

- **Key:** `hint-studio-theme` — Stores `'light'` or `'dark'`

### Storage Limitations

- IndexedDB storage varies by browser: Chrome ~60% of disk, Firefox ~50%, Safari ~1GB
- When storage is full, `putMedia` will throw — caught and shown as toast error
- No automatic cleanup of orphaned media (media is deleted when its parent course/step/region is deleted)

### Cleanup Strategy

- Deleting a course also deletes all its media (images and audio)
- Deleting a step deletes its image and all region audio
- Deleting a region deletes its audio
- Re-recording over existing audio deletes the old Blob before saving the new one
- Object URLs are revoked when no longer needed (component unmount, scene change)

## 31.10 Sharing

### How It Works

1. User publishes a course (status must be "approved" first)
2. `encodeShareableCourse()` converts the course to a `ShareableCourse` object:
   - All media (images, audio) converted to base64 data URLs
   - Course metadata and steps included
3. JSON stringified and compressed with `LZString.compressToEncodedURIComponent()`
4. URL format: `https://domain/#/s/<slug>/<compressed-data>`
5. Recipient opens URL → `decodeShareableCourse()` decompresses and parses
6. `shareableToScenes()` converts to playable scenes
7. WalkthroughPlayer renders the scenes

### Limitations

- **URL length:** Browsers support ~2000-8000+ character URLs. Courses with many audio recordings can exceed this.
- **No server storage:** The URL IS the data — if the URL is lost, the shared course is lost.
- **No access control:** Anyone with the URL can view the course.
- **Large media:** Audio as base64 increases size by ~33%. LZ-string compression helps but doesn't eliminate the problem.

**Recommendation:** For large courses, use Export (ZIP) instead of share URLs.

## 31.11 Export/Import

### Export

1. `exportCourseZip()` creates a JSZip instance
2. Course JSON saved as `course.json` (with media manifest mapping IDs to file paths)
3. Images saved to `images/` folder
4. Audio saved to `audio/` folder
5. `README.md` generated with course title and structure info
6. ZIP blob downloaded via `downloadBlob()`

### Import

1. User selects a `.zip` file
2. `importCourseZip()` loads the ZIP with JSZip
3. Validates `course.json` exists and version is 1
4. Reads media manifest, loads each file as Blob
5. Generates new IDs for course, steps, regions, and media
6. Saves media to IndexedDB, then saves the course
7. Course appears in dashboard with "draft" status

### Validation

- Missing `course.json` → error: "Invalid course file: missing course.json"
- Wrong version → error: "Unsupported course export version"
- Corrupt ZIP → JSZip throws, caught and shown as toast error

## 31.12 State Management

| State | Location | Why |
|-------|----------|-----|
| Course list | React state in DashboardPage | Ephemeral UI state, reloaded from IndexedDB on mount |
| Active course | React state in CourseEditorPage | Ephemeral, persisted to IndexedDB on every change |
| Active step/region | React state in CourseEditorPage | UI selection state, not persisted |
| Drawing mode | React state in CourseEditorPage | UI toggle |
| Recording state | React state in useAudioRecorder | Ephemeral, tied to component lifecycle |
| Walkthrough playback | React state in WalkthroughPlayer | Ephemeral, reset on exit |
| Theme | LocalStorage + React context | Persisted, global |
| Toasts | React context | Ephemeral notifications |

**No global state library** — each page manages its own state. Cross-cutting concerns (theme, toasts) use React Context.

## 31.13 Error Handling

| Error | Where | How it's handled |
|-------|-------|------------------|
| IndexedDB failure | `db.js` | Throws, caught by caller, shown as toast |
| Microphone denied | `useAudioRecorder` | Error state, message shown in AudioRecorderPanel |
| MediaRecorder unsupported | `useAudioRecorder` | `supported` flag, panel shows "not supported" message |
| Audio playback failure | `WalkthroughPlayer` | Play promise rejection caught silently |
| Invalid share URL | `SharedCoursePage` | Decode returns null, error screen shown |
| Invalid import file | `DashboardPage` | Error caught, toast shown |
| Corrupt course data | `importCourseZip` | JSON parse throws, caught and shown |
| Missing course | `CourseEditorPage` | Redirects to dashboard with toast |
| Empty audio blob | `AudioRecorderPanel` | Detected, user asked to try again |

## 31.14 Debugging Guide

| What to debug | Where to look |
|---------------|-------------|
| Course state | `CourseEditorPage.js` — `course` state, `updateCourse()` |
| IndexedDB | `src/services/storage/db.js` — all CRUD operations |
| Recording | `src/hooks/useAudioRecorder.js` and `src/services/audio/recorder.js` |
| Audio playback | `src/components/walkthrough/WalkthroughPlayer.js` — `loadSceneAudio()`, `cleanupAudio()` |
| Walkthrough | `src/components/walkthrough/WalkthroughPlayer.js` — scene transitions, `current` state |
| URL parsing | `src/services/sharing/share.js` — `encodeShareableCourse()`, `decodeShareableCourse()` |
| Export/import | `src/services/export/zip.js` — `exportCourseZip()`, `importCourseZip()` |
| Theme | `src/hooks/useTheme.js` and `src/services/storage/settings.js` |

### Browser DevTools

- **Application > IndexedDB** — Inspect `hint-studio` database, `courses` and `media` stores
- **Application > Local Storage** — Check `hint-studio-theme`
- **Console** — Errors from async operations are logged
- **Network** — No network requests should appear (frontend-only)

## 31.15 Deployment

### Development

```bash
npm install
npm run dev
```

### Production Build

```bash
npm run build
```

Outputs to `dist/` — fully static HTML, CSS, and JS.

### Preview Production Build

```bash
npm run preview
```

### Environment Configuration

No environment variables required. The app runs entirely client-side.

### SPA Routing

Uses **HashRouter** (`#/route/path`). This means:
- No server-side rewrite rules needed
- Works on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages)
- URLs look like `https://domain/#/editor/abc123`

### Deployment Steps

#### Vercel
1. Connect repository to Vercel
2. Build command: `npm run build`
3. Output directory: `dist`
4. Deploy

#### Netlify
1. Connect repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Deploy

#### GitHub Pages
1. `npm run build`
2. Push `dist/` to `gh-pages` branch (or use `gh-pages` npm package)
3. Enable GitHub Pages in repo settings

#### Cloudflare Pages
1. Connect repository
2. Build command: `npm run build`
3. Output directory: `dist`
4. Deploy

## 31.16 Scalability

### Current Implementation

The frontend-only architecture scales well for **single-user, single-browser** use:

- **IndexedDB capacity:** Typically 500MB–2GB per origin. A course with 10 steps, each with a 2MB screenshot and 1MB audio per region, uses ~30MB. Dozens of courses fit comfortably.
- **Large audio handling:** Audio blobs are stored as Blobs in IndexedDB, not in React state. They're loaded as data URLs only when needed for playback or sharing.
- **Memory management:** Object URLs are revoked after use. Audio elements are cleaned up on scene transitions. MediaRecorder streams are stopped on unmount.
- **Lazy loading:** All pages are lazy-loaded via `React.lazy()` with Suspense, reducing initial bundle size.
- **Code splitting:** Vite automatically splits chunks per route.

### Limitations

- **IndexedDB is per-browser:** Courses don't sync across devices. Use Export/Import for portability.
- **Share URL size:** Courses with large audio produce very long URLs (base64 + compression). Practical limit is ~5-10 short audio clips.
- **No concurrent editing:** Only one user per browser.
- **Storage eviction:** Browsers may evict IndexedDB data under storage pressure (especially in private browsing).

### Future Possibilities (Not Implemented)

If the product eventually requires multi-user cloud storage:

- **Backend migration:** Add a server (e.g., Supabase, Firebase) for cloud course storage, user accounts, and cross-device sync.
- **Real-time collaboration:** WebSocket-based concurrent editing.
- **Cloud media storage:** Store images and audio in cloud storage (S3, Cloudinary) instead of IndexedDB.
- **Short share links:** Store course data server-side, generate short IDs for sharing.
- **User authentication:** OAuth or email/password for personal course libraries.
- **Course marketplace:** Public course directory with search and ratings.

These would be **additive** changes — the current frontend-only architecture would remain the foundation, with cloud features layered on top.
