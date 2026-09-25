/**
 * @file Small, pure helpers with no React or storage dependencies.
 * Safe to use from any layer (components, hooks, services).
 */

// Module-level counter so two ids created in the same millisecond still differ.
let counter = 0;

/**
 * Generates a short unique-enough id, e.g. "stepm1abc2d7".
 * Format: <prefix><timestamp base36><counter>. Unique within one browser
 * session; the timestamp keeps it unique across page reloads.
 * @param {string} [prefix='id'] Readable prefix that shows what the id is for
 *   ('course', 'step', 'media', 'toast') — useful when inspecting IndexedDB.
 * @returns {string}
 */
export function nextId(prefix = 'id') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

/**
 * Clamps a percentage to 0–100. Used by the region drawing tool so a drag that
 * leaves the canvas can never produce a region outside the image.
 * @param {number} v
 */
export function clampPct(v) {
  return Math.max(0, Math.min(100, v));
}

/** Rounds to one decimal place. */
export function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * Converts text to a URL/file-safe slug: "My Course!" → "my-course".
 * Used for share URLs and export file names.
 * @param {string} s
 */
export function slug(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;

/**
 * Human-friendly relative time ("just now", "5m ago", "3d ago"), falling back
 * to a short date after one week.
 * @param {number} ts Epoch ms
 */
export function formatDate(ts) {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    // Only show the year for dates outside the current year.
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Seconds → "m:ss" (e.g. 75 → "1:15"). Used by the recorder timer and player.
 * @param {number} seconds
 */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Reads a Blob into a base64 data: URL.
 * WHY: data URLs can be put straight into <img src> / new Audio(), and — unlike
 * object URLs — can be serialised into JSON for share links.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Fetches any URL and returns its body as a data: URL. */
export async function fetchBlobToDataUrl(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return blobToDataUrl(blob);
}

/**
 * Triggers a browser download for a Blob (used by ZIP export).
 * Uses a temporary <a download> element; the object URL is revoked shortly
 * after so the Blob can be garbage-collected.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay so the browser has started the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a string as a file. */
export function downloadText(text, filename, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes the five HTML-special characters. */
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Re-encodes an image data URL smaller (WebP, else JPEG) and caps its width.
 * WHY: share links embed screenshots as base64. PNG screenshots are huge; a
 * lossy re-encode is usually 5–10× smaller, which keeps links shorter.
 * Region percentages are unaffected because the aspect ratio is preserved.
 * Returns the original if re-encoding fails or wouldn't be smaller.
 * @param {string} dataUrl
 * @param {{ maxWidth?: number, quality?: number }} [options]
 * @returns {Promise<string>}
 */
export async function compressImageDataUrl(dataUrl, { maxWidth = 1600, quality = 0.8 } = {}) {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL('image/webp', quality);
    // Browsers without WebP encoding silently return PNG — use JPEG instead.
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', quality);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
