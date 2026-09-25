/**
 * @file Turns a stored Course into something playable or shareable.
 *
 * TWO OUTPUTS
 *   1. WalkthroughStep[]  — for the player (editor preview, preview page).
 *   2. Share URL          — the WHOLE course (text + screenshots + audio as
 *                           base64) compressed into the URL itself.
 *
 * WHY EMBED THE COURSE IN THE URL
 *   The app has no backend, so there is nowhere to upload a course. Putting the
 *   data in the URL means anyone who opens the link gets the full course, with
 *   no server involved.
 *
 * WHY LZ-STRING
 *   `compressToEncodedURIComponent` compresses the JSON AND outputs only
 *   URL-safe characters, so the result can go straight into the hash with no
 *   extra escaping.
 *
 * SHARE FLOW
 *   Course ─► buildShareableCourse (resolve media → data URLs)
 *          ─► JSON.stringify ─► LZString compress ─► buildShareUrl
 *          ─► "<origin>/#/s/<slug>/<encoded>"
 *   Open link ─► SharedCoursePage ─► decodeShareableCourse
 *             ─► shareableToWalkthroughSteps ─► WalkthroughPlayer
 *
 * FORMAT VERSIONS
 *   v3 (current): each step has its own screenshot. Screenshots live once in
 *                 `c.images` (keyed by media id) and steps point at them with
 *                 `imageKey`, so a screenshot reused by several steps is only
 *                 embedded once.
 *   v2 (legacy):  one `c.imageData` shared by every step. Still decoded, so old
 *                 links keep working.
 *
 * SIZE: screenshots are re-encoded (WebP/JPEG, ≤1600px wide) for links only —
 * the player and video export use the full-quality originals.
 *
 * KNOWN LIMITATION: base64 media makes URLs very long (a 500 KB screenshot adds
 * ~650 KB of text). Chat apps / some browsers truncate long URLs. Export (ZIP)
 * is the fallback for large courses.
 */

import LZString from 'lz-string';
import { getMediaAsDataUrl } from '@/services/storage/db';
import { compressImageDataUrl, slug } from '@/utils';
import { getStepAction, getStepImageId } from '@/utils/course';

/** @typedef {import('@/types').Course} Course */
/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

const SHARE_FORMAT_VERSION = 3;

/**
 * Compact course format stored inside share URLs. Short keys (`v`, `c`) keep the
 * URL a little smaller.
 * @typedef {Object} ShareableCourse
 * @property {2 | 3} v  Format version (see file header)
 * @property {{
 *   id: string, title: string, pageName?: string, context: string, description: string, status: string,
 *   createdAt: number, updatedAt: number, publishedAt: number | null,
 *   images?: Record<string, string>,   // v3: media id → data URL
 *   imageData?: string | null,         // v2 only
 *   steps: Array<{ id: string, label: string, text: string,
 *                  region: import('@/types').Region | null,
 *                  action?: 'click' | 'look',
 *                  imageKey?: string | null,   // v3: key into c.images
 *                  audioData: string | null }>
 * }} c
 */

/**
 * Loads every screenshot and recording a course references as data URLs.
 * Screenshots are cached per media id, so a screenshot shared by several steps
 * is read from IndexedDB only once.
 * @param {Course} course
 */
async function resolveCourseMedia(course) {
  /** media id → data URL (null if the Blob is missing) */
  const images = {};
  for (const step of course.steps) {
    const imageId = getStepImageId(course, step);
    if (imageId && !(imageId in images)) {
      images[imageId] = await getMediaAsDataUrl(imageId);
    }
  }

  const steps = await Promise.all(
    course.steps.map(async (step) => ({
      id: step.id,
      label: step.label,
      text: step.text,
      region: step.region,
      action: getStepAction(step),
      imageKey: getStepImageId(course, step),
      audioData: step.audioId ? await getMediaAsDataUrl(step.audioId) : null,
    })),
  );
  return { images, steps };
}

/**
 * Prepares a locally stored course for the WalkthroughPlayer.
 * @param {Course} course
 * @returns {Promise<WalkthroughStep[]>}
 */
export async function buildWalkthroughSteps(course) {
  const { images, steps } = await resolveCourseMedia(course);
  return steps.map(({ imageKey, ...step }) => ({
    ...step,
    imageData: imageKey ? (images[imageKey] ?? null) : null,
  }));
}

/**
 * @param {Course} course
 * @returns {Promise<ShareableCourse>}
 */
export async function buildShareableCourse(course) {
  const { images, steps } = await resolveCourseMedia(course);
  for (const key of Object.keys(images)) {
    if (images[key]) images[key] = await compressImageDataUrl(images[key]);
  }
  return {
    v: SHARE_FORMAT_VERSION,
    c: {
      id: course.id,
      title: course.title,
      pageName: course.pageName || '',
      context: course.context,
      description: course.description,
      status: course.status,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      publishedAt: course.publishedAt,
      images,
      steps,
    },
  };
}

/**
 * Course → compressed, URL-safe string.
 * @param {Course} course
 * @returns {Promise<string>}
 */
export async function encodeShareableCourse(course) {
  const shareable = await buildShareableCourse(course);
  const json = JSON.stringify(shareable);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Compressed string → ShareableCourse. Never throws.
 * @param {string} encoded
 * @returns {ShareableCourse | null} null when the link is corrupted/truncated
 */
export function decodeShareableCourse(encoded) {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    // lz-string returns null/"" (not an error) for invalid input.
    if (!json) return null;
    const data = JSON.parse(json);
    if (!data.v || !data.c || !Array.isArray(data.c.steps)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Shared-link data → player steps (same shape as buildWalkthroughSteps output).
 * Handles both v3 (per-step images) and legacy v2 (one shared image).
 * @param {ShareableCourse} shareable
 * @returns {WalkthroughStep[]}
 */
export function shareableToWalkthroughSteps(shareable) {
  const { images = {}, imageData: legacyImage = null } = shareable.c;
  return shareable.c.steps.map((step) => ({
    id: step.id,
    label: step.label,
    text: step.text,
    region: step.region,
    action: step.action === 'look' ? 'look' : 'click',
    audioData: step.audioData,
    imageData: step.imageKey ? (images[step.imageKey] ?? null) : legacyImage,
  }));
}

/**
 * Builds the final link. Uses the hash (#/s/...) because the app uses
 * HashRouter — static hosts never see the hash, so no server config is needed.
 * The slug is only for readability; routing ignores it.
 * @param {Course} course
 * @param {string} encoded Output of encodeShareableCourse
 */
export function buildShareUrl(course, encoded) {
  const base = window.location.origin + window.location.pathname;
  const slugPart = slug(course.title) || 'course';
  return `${base}#/s/${slugPart}/${encoded}`;
}

/**
 * Link for embedding (iframe): same course data, but the #/embed route shows
 * ONLY the player — no app header, no exit button.
 * @param {Course} course
 * @param {string} encoded Output of encodeShareableCourse
 */
export function buildEmbedUrl(course, encoded) {
  const base = window.location.origin + window.location.pathname;
  const slugPart = slug(course.title) || 'course';
  return `${base}#/embed/${slugPart}/${encoded}`;
}

/** Default embed size: full available width, 250px tall (compact player). */
export const EMBED_HEIGHT_PX = 250;

/**
 * YouTube-style <iframe> snippet: width "auto" (100% of the space it is
 * pasted into) and EMBED_HEIGHT_PX tall. At this height the player switches
 * to its compact layout automatically. Change height="250" in the snippet
 * for a bigger player.
 * @param {string} embedUrl
 * @param {string} title  accessible title for the iframe
 */
export function buildEmbedCode(embedUrl, title) {
  const safeTitle = String(title).replace(/"/g, '&quot;');
  return (
    `<iframe src="${embedUrl}" title="${safeTitle}" width="100%" height="${EMBED_HEIGHT_PX}" ` +
    `style="width:100%;height:${EMBED_HEIGHT_PX}px;border:0;border-radius:12px;" ` +
    `allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>`
  );
}
