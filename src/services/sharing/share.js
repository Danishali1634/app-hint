/**
 * @file Turns a stored Course into something playable or shareable.
 *
 * TWO OUTPUTS
 *   1. WalkthroughStep[]  — for the player (editor preview, preview page).
 *   2. Share URL          — the WHOLE course (text + screenshots + audio)
 *                           packed into the URL itself.
 *
 * WHY EMBED THE COURSE IN THE URL
 *   The app has no backend, so there is nowhere to upload a course. Putting the
 *   data in the URL means anyone who opens the link gets the full course, with
 *   no server involved.
 *
 * LINK FORMAT (v4, current) — built to keep links as short as possible:
 *   "~" + base64url( [4-byte length][LZ-compressed JSON of the text][media bytes…] )
 *   Screenshots (≈99% of a link) and recordings go in as RAW bytes, encoded
 *   once. The older format put base64 data URLs inside LZ-compressed JSON —
 *   LZ can't shrink base64, it made it ~20% LONGER. Only the small text part
 *   (titles, descriptions, areas) is LZ-compressed. Steps are short arrays,
 *   and ids / dates / status that the viewer never sees are left out.
 *   Links:  "<origin>/#/s/<encoded>"   ·   embeds: "<origin>/#/e/<encoded>"
 *
 * SHARE FLOW
 *   Course ─► buildShareableCourse (resolve media → data URLs)
 *          ─► packShareable (v4 bytes → base64url) ─► buildShareUrl
 *   Open link ─► SharedCoursePage ─► decodeShareableCourse (v4, or legacy
 *             LZString text) ─► shareableToWalkthroughSteps ─► WalkthroughPlayer
 *
 * OLDER LINKS keep working: "#/s/<slug>/<encoded>" and "#/embed/<slug>/<encoded>"
 *   routes still exist, and anything that doesn't start with "~" is decoded as
 *   the previous format (LZString.compressToEncodedURIComponent of the JSON):
 *   v3: each step has its own screenshot. Screenshots live once in
 *                 `c.images` (keyed by media id) and steps point at them with
 *                 `imageKey`, so a screenshot reused by several steps is only
 *                 embedded once.
 *   v2 (legacy):  one `c.imageData` shared by every step. Still decoded, so old
 *                 links keep working.
 *
 * SIZE: screenshots are re-encoded (WebP/JPEG, see LINK_IMAGE) for links only —
 * the player and video export use the full-quality originals.
 *
 * KNOWN LIMITATION: without a server the screenshots must travel inside the
 * link, so links stay long (roughly 1.35 characters per byte of image; a
 * typical screenshot adds ~20–30k characters). Chat apps / some browsers
 * truncate very long URLs. Export (ZIP) is the fallback for large courses.
 */

import LZString from 'lz-string';
import { getMediaAsDataUrl } from '@/services/storage/db';
import { compressImageDataUrl } from '@/utils';
import { compressVoiceForLink } from '@/services/audio/linkAudio';
import { getStepAction, getStepImageId } from '@/utils/course';

/** @typedef {import('@/types').Course} Course */
/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

const SHARE_FORMAT_VERSION = 3;
/** First character of a v4 (compact binary) link. LZString's URI alphabet has no "~". */
const COMPACT_PREFIX = '~';

/**
 * Screenshots inside LINKS are the biggest part of the URL, so they are
 * shrunk harder than anywhere else (the app itself, the player and the video
 * keep the originals): at most 1024 px wide, WebP quality 0.42. Text in the
 * screenshot stays readable, even when the player zooms in. Recordings are
 * shrunk for links too (services/audio/linkAudio: Opus 16 kbps).
 */
const LINK_IMAGE = { maxWidth: 1024, quality: 0.42 };

/** Step actions as one digit in v4 links. */
const ACTION_CODES = ['click', 'look', 'type'];

/** 12.3456789 → 12.3 (a tenth of a percent is far below one pixel on screen). */
const round1 = (n) => Math.round(n * 10) / 10;
const roundRegion = (r) => ({ x: round1(r.x), y: round1(r.y), w: round1(r.w), h: round1(r.h) });
const regionToArray = (r) => [r.x, r.y, r.w, r.h];
const arrayToRegion = (a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] });

/**
 * Compact course format stored inside share URLs. Short keys (`v`, `c`) keep the
 * URL a little smaller.
 * @typedef {Object} ShareableCourse
 * @property {2 | 3 | 4} v  Format version (see file header; v4 links are decoded into this shape)
 * @property {{
 *   id: string, title: string, pageName?: string, context: string, description: string, status: string,
 *   createdAt: number, updatedAt: number, publishedAt: number | null,
 *   images?: Record<string, string>,   // v3: media id → data URL
 *   imageData?: string | null,         // v2 only
 *   steps: Array<{ id: string, label: string, text: string,
 *                  region: import('@/types').Region | null,
 *                  action?: 'click' | 'look' | 'type', typeValue?: string,
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
      ...(step.region && step.extraRegions?.length ? { extraRegions: step.extraRegions } : {}),
      // One description per target (targets 2, 3 …), when the author wrote them.
      ...(step.region && step.extraTexts?.some((t) => t?.trim())
        ? { extraTexts: step.extraTexts.map((t) => t || '') }
        : {}),
      // Sub-steps of one Global Step: a screenshot change between them is seamless.
      ...(step.groupId ? { groupId: step.groupId } : {}),
      action: getStepAction(step),
      ...(getStepAction(step) === 'type' && step.typeValue ? { typeValue: step.typeValue } : {}),
      imageKey: getStepImageId(course, step),
      audioData: step.audioId ? await getMediaAsDataUrl(step.audioId) : null,
    })),
  );
  return { images, steps };
}

/**
 * ONE DESCRIPTION PER TARGET: a sub-step whose targets have their own
 * descriptions plays as one moment per target — target 1 with its text (and
 * the recorded voice, if any), then the camera glides to target 2 with its
 * text, and so on (same screenshot, so it feels like one continuous page).
 * Without extra descriptions the targets stay highlighted together.
 * @param {WalkthroughStep[]} steps
 * @returns {WalkthroughStep[]}
 */
export function expandTargetDescriptions(steps) {
  return steps.flatMap((step) => {
    const texts = step.extraTexts || [];
    const targets = step.region ? [step.region, ...(step.extraRegions || [])] : [];
    if (targets.length < 2 || !texts.some((t) => t?.trim())) return [step];
    return targets.map((region, k) => ({
      ...step,
      id: k === 0 ? step.id : `${step.id}~${k}`,
      region,
      extraRegions: [],
      extraTexts: [],
      text: k === 0 ? step.text : texts[k - 1] || '',
      audioData: k === 0 ? step.audioData : null,
      groupId: step.groupId || `solo-${step.id}`,
    }));
  });
}

/**
 * Prepares a locally stored course for the WalkthroughPlayer.
 * @param {Course} course
 * @param {{ expandTargets?: boolean }} [options]  false keeps one frame per step
 *   (the preview studio edits frames by step position)
 * @returns {Promise<WalkthroughStep[]>}
 */
export async function buildWalkthroughSteps(course, { expandTargets = true } = {}) {
  const { images, steps } = await resolveCourseMedia(course);
  const built = steps.map(({ imageKey, ...step }) => ({
    ...step,
    extraRegions: step.extraRegions || [], // same shape as shared links
    imageData: imageKey ? (images[imageKey] ?? null) : null,
  }));
  return expandTargets ? expandTargetDescriptions(built) : built;
}

/**
 * @param {Course} course
 * @returns {Promise<ShareableCourse>}
 */
export async function buildShareableCourse(course) {
  const { images, steps } = await resolveCourseMedia(course);
  for (const key of Object.keys(images)) {
    if (images[key]) images[key] = await compressImageDataUrl(images[key], LINK_IMAGE);
  }
  for (const step of steps) {
    if (step.audioData) step.audioData = await compressVoiceForLink(step.audioData);
  }
  // Short keys/ids and rounded numbers: every character counts in a URL.
  const imageKeys = {};
  const shortImages = {};
  Object.keys(images).forEach((key, n) => {
    imageKeys[key] = `i${n}`;
    shortImages[`i${n}`] = images[key];
  });
  const shortSteps = steps.map((step, n) => ({
    ...step,
    id: `s${n}`,
    imageKey: step.imageKey ? imageKeys[step.imageKey] : null,
    region: step.region ? roundRegion(step.region) : null,
    ...(step.extraRegions ? { extraRegions: step.extraRegions.map(roundRegion) } : {}),
  }));
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
      images: shortImages,
      steps: shortSteps,
    },
  };
}

/**
 * Course → compressed, URL-safe string.
 * @param {Course} course
 * @returns {Promise<string>}
 */
export async function encodeShareableCourse(course) {
  return packShareable(await buildShareableCourse(course));
}

// ─── v4: compact binary link format ─────────────────────────────────────────

/** data: URL → { mime, bytes } */
function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(5, comma); // after "data:"
  const body = dataUrl.slice(comma + 1);
  // Keep parameters such as ";codecs=opus" — only the ";base64" flag goes.
  const mime = head.replace(/;base64$/, '') || 'application/octet-stream';
  if (!head.endsWith(';base64'))
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes };
}

/** Bytes → binary string (chunked: String.fromCharCode has an argument limit). */
function bytesToBinary(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return out;
}

const toBase64Url = (bytes) =>
  btoa(bytesToBinary(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * ShareableCourse (with data URLs) → compact v4 link text.
 * Text part (LZ-compressed JSON):
 *   { t: title, p: pageName, d: description,
 *     m: [[mime, byteLength], …],                 // media, in the order they follow
 *     s: [[label, text, [x,y,w,h] | 0, action digit, image media # | -1,
 *          audio media # | -1, typeValue, [[x,y,w,h], …] more targets | 0,
 *          Global Step group # | -1, [text, …] descriptions of targets 2, 3 … | 0], …] }
 *     (fields after typeValue are optional; trailing empty ones are left out)
 * @param {ShareableCourse} shareable
 * @returns {string}
 */
function packShareable(shareable) {
  const { c } = shareable;
  const media = [];
  const chunks = [];
  const groupNumbers = new Map(); // groupId → small number (links only need "same or not")
  const groupNumber = (id) => {
    if (!groupNumbers.has(id)) groupNumbers.set(id, groupNumbers.size);
    return groupNumbers.get(id);
  };
  const addMedia = (dataUrl) => {
    const { mime, bytes } = dataUrlToBytes(dataUrl);
    media.push([mime, bytes.length]);
    chunks.push(bytes);
    return media.length - 1;
  };
  const imageIndex = {};
  for (const [key, dataUrl] of Object.entries(c.images || {})) {
    if (dataUrl) imageIndex[key] = addMedia(dataUrl);
  }
  const steps = c.steps.map((step) => [
    step.label || '',
    step.text || '',
    step.region ? regionToArray(step.region) : 0,
    Math.max(0, ACTION_CODES.indexOf(step.action)),
    step.imageKey && step.imageKey in imageIndex ? imageIndex[step.imageKey] : -1,
    step.audioData ? addMedia(step.audioData) : -1,
    step.typeValue || '',
    step.extraRegions?.length ? step.extraRegions.map(regionToArray) : 0,
    step.groupId ? groupNumber(step.groupId) : -1,
    step.extraTexts?.length ? step.extraTexts : 0,
  ]);
  // Trailing "nothing here" fields are left out (older links end at typeValue).
  for (const row of steps) {
    while (row.length > 7 && (row[row.length - 1] === 0 || row[row.length - 1] === -1)) row.pop();
  }
  const text = LZString.compressToUint8Array(
    JSON.stringify({ t: c.title, p: c.pageName || '', d: c.description || '', m: media, s: steps }),
  );

  const total = 4 + text.length + chunks.reduce((sum, b) => sum + b.length, 0);
  const bytes = new Uint8Array(total);
  new DataView(bytes.buffer).setUint32(0, text.length);
  bytes.set(text, 4);
  let offset = 4 + text.length;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return COMPACT_PREFIX + toBase64Url(bytes);
}

/**
 * v4 link text → the same ShareableCourse shape the older links decode to
 * (data URLs rebuilt from the raw bytes), so everything after decoding is shared.
 * @param {string} encoded  without the "~"
 * @returns {ShareableCourse | null}
 */
function unpackShareable(encoded) {
  const bytes = fromBase64Url(encoded);
  const textLength = new DataView(bytes.buffer).getUint32(0);
  const json = LZString.decompressFromUint8Array(bytes.subarray(4, 4 + textLength));
  if (!json) return null;
  const data = JSON.parse(json);
  if (!Array.isArray(data.s) || !Array.isArray(data.m)) return null;

  let offset = 4 + textLength;
  const media = data.m.map(([mime, length]) => {
    const chunk = bytes.subarray(offset, offset + length);
    offset += length;
    if (chunk.length !== length) throw new Error('Link is truncated');
    return `data:${mime};base64,${btoa(bytesToBinary(chunk))}`;
  });
  const images = {};
  const steps = data.s.map((row, n) => {
    const [label, text, region, action, image, audio, typeValue, more, group, texts] = row;
    if (image >= 0) images[`i${image}`] = media[image];
    return {
      id: `s${n}`,
      label,
      text,
      region: region ? arrayToRegion(region) : null,
      ...(region && Array.isArray(more) ? { extraRegions: more.map(arrayToRegion) } : {}),
      ...(region && Array.isArray(texts) ? { extraTexts: texts } : {}),
      ...(Number.isInteger(group) && group >= 0 ? { groupId: `g${group}` } : {}),
      action: ACTION_CODES[action] || 'click',
      typeValue: typeValue || '',
      imageKey: image >= 0 ? `i${image}` : null,
      audioData: audio >= 0 ? media[audio] : null,
    };
  });
  return {
    v: 4,
    c: { title: data.t, pageName: data.p, description: data.d, images, steps },
  };
}

/**
 * Link text → ShareableCourse. Never throws.
 * Reads the compact v4 format ("~…") and every older LZString link.
 * @param {string} encoded
 * @returns {ShareableCourse | null} null when the link is corrupted/truncated
 */
export function decodeShareableCourse(encoded) {
  try {
    if (encoded.startsWith(COMPACT_PREFIX)) return unpackShareable(encoded.slice(1));
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
  return expandTargetDescriptions(
    shareable.c.steps.map((step) => ({
      id: step.id,
      label: step.label,
      text: step.text,
      region: step.region,
      extraRegions: step.region && Array.isArray(step.extraRegions) ? step.extraRegions : [],
      ...(Array.isArray(step.extraTexts) ? { extraTexts: step.extraTexts } : {}),
      ...(step.groupId ? { groupId: step.groupId } : {}),
      action: getStepAction(step),
      typeValue: step.typeValue || '',
      audioData: step.audioData,
      imageData: step.imageKey ? (images[step.imageKey] ?? null) : legacyImage,
    })),
  );
}

/**
 * Builds the final link. Uses the hash (#/s/...) because the app uses
 * HashRouter — static hosts never see the hash, so no server config is needed.
 * No title slug in the path any more: every character counts.
 * @param {Course} course  (kept for callers; the link no longer contains its title)
 * @param {string} encoded Output of encodeShareableCourse
 */
export function buildShareUrl(course, encoded) {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/s/${encoded}`;
}

/**
 * Link for embedding (iframe): same course data, but the #/e route shows
 * ONLY the player — no app header, no exit button.
 * @param {Course} course  (kept for callers; the link no longer contains its title)
 * @param {string} encoded Output of encodeShareableCourse
 */
export function buildEmbedUrl(course, encoded) {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/e/${encoded}`;
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
