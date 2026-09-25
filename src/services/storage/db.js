/**
 * @file IndexedDB persistence layer — the app's "database".
 *
 * WHY INDEXEDDB (not LocalStorage)
 *   - Stores Blobs natively (screenshots, audio) — LocalStorage only holds strings.
 *   - Much larger quota (hundreds of MB vs ~5 MB).
 *   - Async, so large reads/writes don't block the UI thread.
 *
 * WHY THE `idb` LIBRARY
 *   The raw IndexedDB API is event/callback based. `idb` is a tiny wrapper that
 *   turns every request into a Promise so we can use async/await.
 *
 * SCHEMA (version DB_VERSION)
 *   "courses" store  keyPath "id"  → Course objects (see src/types)
 *       index "by_titleKey"   normalised title → fast unique-title checks
 *       index "by_updatedAt"  last change      → finding expired courses
 *   "media"   store  out-of-line   → Blob values keyed by a media id string
 *
 *   Courses only hold media *ids* (step.imageId, step.audioId, legacy
 *   baseImageId). This keeps course
 *   objects small and fast to list, and lets a Blob be replaced without
 *   rewriting the course.
 *
 * INVARIANT: whenever a course or step is removed, its media must be removed too,
 * otherwise orphaned Blobs silently eat storage quota.
 *
 * UNIQUE TITLES: titles are unique ignoring case/spacing/punctuation (titleKey),
 * so a course can always be found again by its name. Enforced in app code
 * (isTitleTaken / makeUniqueTitle) rather than a unique index, because courses
 * created before v2 may already contain duplicates and a unique index would
 * make the upgrade fail.
 *
 * RETENTION: purgeExpiredCourses() deletes courses (and their media) not changed
 * for COURSE_RETENTION_DAYS. Called when the Home or Library page loads (useCourseLibrary).
 *
 * DEBUGGING: DevTools → Application → IndexedDB → "hint-studio".
 */

import { openDB } from 'idb';
import {
  COURSE_RETENTION_DAYS,
  DB_NAME,
  DB_VERSION,
  INDEX_TITLE_KEY,
  INDEX_UPDATED_AT,
  STORE_COURSES,
  STORE_MEDIA,
} from '@/constants';
import { blobToDataUrl, nextId } from '@/utils';
import { collectMediaIds } from '@/utils/course';
import { normalizeTitle } from '@/utils/search';

const DAY_MS = 86_400_000;

/**
 * Window event fired after any course is saved or deleted. Lets independent
 * UI (e.g. the sidebar course list) stay in sync without prop drilling.
 * Listen with: window.addEventListener(COURSES_CHANGED_EVENT, handler)
 */
export const COURSES_CHANGED_EVENT = 'hint-studio:courses-changed';

function notifyCoursesChanged() {
  window.dispatchEvent(new Event(COURSES_CHANGED_EVENT));
}

/** @typedef {import('@/types').Course} Course */

// Cached connection promise: the database is opened once, on first use, and
// shared by every call afterwards.
let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      // Runs only when the DB is created or DB_VERSION increases.
      //
      // SELF-HEALING: instead of trusting `oldVersion`, it checks what actually
      // exists and creates anything missing. A database can end up at a version
      // number without that version's indexes (e.g. a dev-server hot reload that
      // picked up a new DB_VERSION before the matching upgrade code), and a
      // version-guarded migration would then never run again.
      async upgrade(db, _oldVersion, _newVersion, tx) {
        // Stores (v1).
        if (!db.objectStoreNames.contains(STORE_COURSES)) {
          db.createObjectStore(STORE_COURSES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA);
        }

        // Indexes (v2+).
        const store = tx.objectStore(STORE_COURSES);
        if (!store.indexNames.contains(INDEX_TITLE_KEY)) {
          store.createIndex(INDEX_TITLE_KEY, 'titleKey');
        }
        if (!store.indexNames.contains(INDEX_UPDATED_AT)) {
          store.createIndex(INDEX_UPDATED_AT, 'updatedAt');
        }

        // Backfill titleKey on courses saved before it existed (safe to repeat).
        let cursor = await store.openCursor();
        while (cursor) {
          if (!cursor.value.titleKey) {
            await cursor.update({ ...cursor.value, titleKey: normalizeTitle(cursor.value.title) });
          }
          cursor = await cursor.continue();
        }
      },
    });
  }
  return dbPromise;
}

// ─── Courses ─────────────────────────────────────────────────────────────────

/**
 * All courses, most recently updated first (library order).
 * @returns {Promise<Course[]>}
 */
export async function getAllCourses() {
  const db = await getDB();
  const courses = await db.getAll(STORE_COURSES);
  return courses.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * @param {string} id
 * @returns {Promise<Course | undefined>}
 */
export async function getCourse(id) {
  const db = await getDB();
  return db.get(STORE_COURSES, id);
}

/**
 * Inserts or replaces a course (upsert by id). Keeps `titleKey` in sync with
 * the title so the unique-title index is always correct.
 * @param {Course} course
 */
export async function saveCourse(course) {
  const db = await getDB();
  await db.put(STORE_COURSES, { ...course, titleKey: normalizeTitle(course.title) });
  notifyCoursesChanged();
}

// ─── Unique titles ───────────────────────────────────────────────────────────

/**
 * The course that already uses this title (ignoring case/spacing), if any.
 * @param {string} title
 * @param {string} [exceptId] ignore this course (e.g. the one being renamed)
 * @returns {Promise<Course | undefined>}
 */
export async function findCourseByTitle(title, exceptId) {
  const db = await getDB();
  const same = await db.getAllFromIndex(STORE_COURSES, INDEX_TITLE_KEY, normalizeTitle(title));
  return same.find((course) => course.id !== exceptId);
}

/**
 * Returns `base` if free, else "base (2)", "base (3)", ... Used by duplicate and
 * import, which must never fail because of a name clash.
 * @param {string} base
 */
export async function makeUniqueTitle(base) {
  if (!(await findCourseByTitle(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!(await findCourseByTitle(candidate))) return candidate;
  }
}

// ─── Retention ───────────────────────────────────────────────────────────────

/**
 * Date after which a course is deleted automatically.
 * @param {Course} course
 * @returns {number} epoch ms
 */
export function getCourseExpiry(course) {
  return course.updatedAt + COURSE_RETENTION_DAYS * DAY_MS;
}

// In-flight purge, shared by concurrent callers (e.g. React StrictMode runs
// effects twice in development) so a course is never counted twice.
let purgeInFlight = null;

/**
 * Deletes every course (with its media) not changed for COURSE_RETENTION_DAYS.
 * Concurrent calls share one run and resolve with the same count.
 * @param {number} [now=Date.now()]
 * @returns {Promise<number>} how many courses were deleted
 */
export function purgeExpiredCourses(now = Date.now()) {
  if (!purgeInFlight) {
    purgeInFlight = runPurge(now).finally(() => {
      purgeInFlight = null;
    });
  }
  return purgeInFlight;
}

async function runPurge(now) {
  const db = await getDB();
  const cutoff = now - COURSE_RETENTION_DAYS * DAY_MS;
  const expired = await db?.getAllFromIndex(
    STORE_COURSES,
    INDEX_UPDATED_AT,
    IDBKeyRange.upperBound(cutoff, true),
  );
  for (const course of expired) {
    await deleteCourse(course.id);
  }
  return expired.length;
}

/**
 * Deletes a course AND all media it references (step screenshots, step audio,
 * legacy base image).
 * @param {string} id
 */
export async function deleteCourse(id) {
  const db = await getDB();
  const course = await db.get(STORE_COURSES, id);
  if (course) {
    for (const mediaId of collectMediaIds(course)) {
      await db.delete(STORE_MEDIA, mediaId);
    }
  }
  await db.delete(STORE_COURSES, id);
  notifyCoursesChanged();
}

// ─── Media (Blobs) ───────────────────────────────────────────────────────────

/**
 * @param {string} id  Media id (generate with nextId('media'))
 * @param {Blob} blob  Image File or recorded audio Blob
 */
export async function putMedia(id, blob) {
  const db = await getDB();
  await db.put(STORE_MEDIA, blob, id);
}

/**
 * @param {string} id
 * @returns {Promise<Blob | undefined>}
 */
export async function getMedia(id) {
  const db = await getDB();
  return db.get(STORE_MEDIA, id);
}

/** @param {string} id */
export async function deleteMedia(id) {
  const db = await getDB();
  await db.delete(STORE_MEDIA, id);
}

/**
 * Loads a media Blob as a data: URL, ready for <img src> / new Audio().
 * @param {string} id
 * @returns {Promise<string | null>} null if the media id does not exist
 */
export async function getMediaAsDataUrl(id) {
  const blob = await getMedia(id);
  if (!blob) return null;
  return blobToDataUrl(blob);
}

// ─── Duplicate ───────────────────────────────────────────────────────────────

/**
 * Deep-copies a course including its media. The copy is reset to "draft".
 *
 * Every media Blob is copied under a new id so the duplicate owns its files
 * (deleting one course must not break the other). Media shared by several
 * steps is copied ONCE and stays shared in the copy (old id → new id map).
 * @param {string} courseId
 * @returns {Promise<Course | null>}
 */
export async function duplicateCourse(courseId) {
  const original = await getCourse(courseId);
  if (!original) return null;

  /** old media id → new media id (missing Blobs keep their old id, as before) */
  const idMap = new Map();
  for (const oldId of collectMediaIds(original)) {
    const blob = await getMedia(oldId);
    if (!blob) continue;
    const newId = nextId('media');
    await putMedia(newId, blob);
    idMap.set(oldId, newId);
  }
  const remap = (mediaId) => (mediaId ? (idMap.get(mediaId) ?? mediaId) : null);

  const newSteps = original.steps.map((step) => ({
    ...step,
    id: nextId('step'),
    imageId: remap(step.imageId),
    audioId: remap(step.audioId),
  }));

  const copy = {
    ...original,
    id: nextId('course'),
    title: await makeUniqueTitle(`${original.title} (copy)`),
    status: 'draft',
    baseImageId: remap(original.baseImageId),
    steps: newSteps,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    publishedAt: null,
  };
  await saveCourse(copy);
  return copy;
}
