/**
 * @file Course export / import as a ZIP file.
 *
 * WHY: courses live only in one browser's IndexedDB. A ZIP is the way to back
 * up a course or move it to another device, and it has no size limit (unlike
 * share URLs).
 *
 * WHY JSZIP: builds and reads ZIP files entirely in the browser, and accepts Blobs
 * directly, so media is written without base64 conversion.
 *
 * ZIP LAYOUT (version 3)
 *   course.json   { version, course, mediaManifest }
 *   images/       image_0.<ext>, image_1.<ext>, ...   (step screenshots, each once)
 *   audio/        audio_0.<ext>, audio_1.<ext>, ...   (step recordings)
 *   README.md     human-readable description
 *
 *   `mediaManifest` maps the ORIGINAL media ids (as found in `course`) to paths
 *   inside the ZIP, e.g. { "media123": "audio/audio_0.webm" }.
 *   Versions 1–2 (one shared base image) can still be imported.
 *
 * IMPORT FLOW
 *   read course.json ─► check version ─► copy each media file into IndexedDB
 *   under a NEW id (once per file, so shared screenshots stay shared)
 *   ─► rewrite ids in the course ─► reset to draft ─► save.
 *   Everything gets new ids, so importing the same ZIP twice creates two
 *   separate courses instead of overwriting.
 */

import JSZip from 'jszip';
import { getMedia, makeUniqueTitle, putMedia, saveCourse } from '@/services/storage/db';
import { nextId, downloadBlob, slug } from '@/utils';
import { collectMediaIds } from '@/utils/course';

/** @typedef {import('@/types').Course} Course */

const EXPORT_VERSION = 3;
const SUPPORTED_VERSIONS = [1, 2, 3];

/** "image/png" → "png"; falls back when the Blob has no type. */
function extensionFor(blob, fallback) {
  return blob.type.split('/')[1] || fallback;
}

function buildReadme(title) {
  return [
    `# ${title}`,
    '',
    'Exported from Hint Studio.',
    '',
    '## Structure',
    '',
    '- `course.json` — course metadata, steps, and region data',
    '- `images/` — step screenshots',
    '- `audio/` — voice recordings per step',
    '- `mediaManifest` inside `course.json` maps media IDs to file paths',
    '',
    '## Import',
    '',
    'Open Hint Studio and use **Import Course** to restore this course.',
    '',
  ].join('\n');
}

/**
 * Builds a ZIP for the course and triggers a browser download.
 * @param {Course} course
 */
export async function exportCourseZip(course) {
  const zip = new JSZip();
  const imageFolder = zip.folder('images');
  const audioFolder = zip.folder('audio');
  const mediaManifest = {};

  const audioIds = new Set(course.steps.map((step) => step.audioId).filter(Boolean));
  let imageIndex = 0;
  let audioIndex = 0;

  // Each media id is written once, even if several steps share it.
  for (const mediaId of collectMediaIds(course)) {
    const blob = await getMedia(mediaId);
    if (!blob) continue;
    if (audioIds.has(mediaId)) {
      const fileName = `audio_${audioIndex++}.${extensionFor(blob, 'webm')}`;
      audioFolder?.file(fileName, blob);
      mediaManifest[mediaId] = `audio/${fileName}`;
    } else {
      const fileName = `image_${imageIndex++}.${extensionFor(blob, 'png')}`;
      imageFolder?.file(fileName, blob);
      mediaManifest[mediaId] = `images/${fileName}`;
    }
  }

  const courseData = { version: EXPORT_VERSION, course: { ...course }, mediaManifest };
  zip.file('course.json', JSON.stringify(courseData, null, 2));
  zip.file('README.md', buildReadme(course.title));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${slug(course.title) || 'course'}.zip`);
}

/**
 * Copies one media file from the ZIP into IndexedDB under a fresh id.
 * @returns {Promise<string | null>} new media id, or null if the file is not in the ZIP
 */
async function restoreMedia(zip, manifest, oldMediaId) {
  const path = manifest[oldMediaId];
  const fileObj = path && zip.file(path);
  if (!fileObj) return null;
  const blob = await fileObj.async('blob');
  const newMediaId = nextId('media');
  await putMedia(newMediaId, blob);
  return newMediaId;
}

/**
 * Reads an exported ZIP and saves it as a NEW draft course.
 * @param {File} file
 * @returns {Promise<Course>}
 * @throws {Error} with a user-readable message (shown in a toast by useCourseLibrary)
 */
export async function importCourseZip(file) {
  const zip = await JSZip.loadAsync(file);
  const courseFile = zip.file('course.json');
  if (!courseFile) throw new Error('Invalid course file: missing course.json');

  const data = JSON.parse(await courseFile.async('string'));
  if (!SUPPORTED_VERSIONS.includes(data.version)) {
    throw new Error('Unsupported course export version.');
  }

  const course = data.course;
  if (!course || !Array.isArray(course.steps)) {
    throw new Error('Invalid course file: course data is missing or damaged.');
  }
  const manifest = data.mediaManifest || {};

  // Restore every referenced file once: old id → new id.
  // If a file is missing from the ZIP, the old id is kept (same as before).
  const idMap = new Map();
  for (const oldId of collectMediaIds(course)) {
    const newId = await restoreMedia(zip, manifest, oldId);
    if (newId) idMap.set(oldId, newId);
  }
  const remap = (mediaId) => (mediaId ? (idMap.get(mediaId) ?? mediaId) : mediaId);

  course.baseImageId = remap(course.baseImageId);
  for (const step of course.steps) {
    step.id = nextId('step');
    step.imageId = remap(step.imageId);
    step.audioId = remap(step.audioId);
  }

  course.id = nextId('course');
  // Titles are unique; importing a course that already exists adds " (2)".
  course.title = await makeUniqueTitle(course.title || 'Imported course');
  course.status = 'draft';
  course.createdAt = Date.now();
  course.updatedAt = Date.now();
  course.publishedAt = null;
  await saveCourse(course);
  return course;
}
