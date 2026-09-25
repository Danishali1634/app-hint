/**
 * @file Neural text-to-speech that runs INSIDE the page — used for the video.
 *
 * WHY THIS EXISTS: the browser's speechSynthesis (used by the live player)
 * plays straight to the speakers, outside the page, so it can never be
 * recorded into a video. For "Download video", text-only steps are instead
 * spoken by a Piper neural voice running in WebAssembly (@diffusionstudio/vits-web),
 * which returns real audio (a WAV Blob) that can be mixed into the video.
 *
 * FIRST USE downloads the voice model once (~60 MB, from Hugging Face; the
 * speech engine from a CDN) and keeps it in the browser's private storage
 * (OPFS), so later videos start immediately. Only the model is downloaded —
 * the step text never leaves the browser.
 *
 * The library is imported lazily, so nobody downloads it until they export a
 * video that needs it.
 */

/** A clear, natural English voice; reads Hinglish (Latin script) well enough. */
export const VIDEO_VOICE_ID = 'en_US-hfc_female-medium';

/**
 * Speaks `text` and returns the audio.
 * @param {string} text
 * @param {(fraction: number) => void} [onDownload]  model download progress 0–1 (first use only)
 * @returns {Promise<Blob>} audio/wav
 */
export async function synthesizeSpeech(text, onDownload) {
  const tts = await import('@diffusionstudio/vits-web');
  return tts.predict({ text, voiceId: VIDEO_VOICE_ID }, (progress) => {
    if (progress.total) onDownload?.(progress.loaded / progress.total);
  });
}
