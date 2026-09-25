/**
 * @file Records the animated walkthrough into a downloadable video file.
 *
 * HOW IT WORKS (all in the browser, no server)
 *   1. Preload screenshots and decode recorded voices (AudioContext).
 *   2. buildTimeline(): lay every phase of every step on a timeline. Narration
 *      length = the recording's duration, or reading time for text.
 *   3. canvas.captureStream() gives a video track; the recordings are scheduled
 *      into a MediaStreamAudioDestinationNode at their narration start times.
 *   4. MediaRecorder records both tracks while renderFrame() draws each frame.
 *      Recording happens in REAL TIME: a 25-second walkthrough takes ~25 s.
 *
 * FORMAT: MP4 (H.264/AAC) when the browser can record it (recent Chrome, Safari),
 * otherwise WebM. The file extension follows the actual format.
 *
 * LIMITATIONS
 *   - Text-to-speech can't be captured (the browser speaks it outside the page),
 *     so TTS-only steps are silent in the video; their caption is shown instead.
 *   - Browsers throttle hidden tabs; the tab must stay visible while recording.
 */

import { WALKTHROUGH_TIMING } from '@/constants';
import { buildTimeline, segmentAt } from './timeline';
import { renderFrame } from './renderFrame';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const FPS = 30;
const VIDEO_BITRATE = 6_000_000;
/** Silence after a recording before the walkthrough moves on (ms). */
const AFTER_VOICE_PAUSE = 400;

/** Preferred formats, best first. */
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** True if this browser can record a canvas to a video file. */
export function isVideoExportSupported() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}

function pickMimeType() {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

/** How long the caption stays up for a step without a recording (reading time). */
function readingTimeMs(text) {
  if (!text?.trim()) return WALKTHROUGH_TIMING.silentNarrate;
  return Math.min(9000, Math.max(2500, text.length * 60));
}

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return { img, ratio: img.naturalWidth / img.naturalHeight };
}

async function decodeAudio(audioCtx, dataUrl) {
  try {
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    return await audioCtx.decodeAudioData(bytes);
  } catch {
    return null; // a broken recording just becomes silent
  }
}

/**
 * @param {WalkthroughStep[]} steps
 * @param {{
 *   title: string,
 *   onProgress?: (fraction: number) => void,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{ blob: Blob, extension: 'mp4' | 'webm' }>}
 * @throws {DOMException} name 'AbortError' when cancelled
 */
export async function exportWalkthroughVideo(steps, { title, onProgress, signal }) {
  if (!isVideoExportSupported()) {
    throw new Error('Video download is not supported in this browser.');
  }
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  };

  // Fonts must be ready, or the first frames draw captions in a fallback font.
  await document.fonts?.ready;

  // 1. Media
  const images = {};
  for (const step of steps) {
    if (step.imageData) images[step.id] = await loadImage(step.imageData);
  }
  const audioCtx = new AudioContext();
  const voices = await Promise.all(
    steps.map((step) => (step.audioData ? decodeAudio(audioCtx, step.audioData) : null)),
  );
  throwIfAborted();

  // 2. Timeline
  const narrationMs = steps.map((step, i) =>
    voices[i] ? voices[i].duration * 1000 + AFTER_VOICE_PAUSE : readingTimeMs(step.text),
  );
  const { segments, total } = buildTimeline(steps, narrationMs);

  // 3. Streams
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  const drawAt = (t) => {
    const { segment, progress, elapsed } = segmentAt(segments, t);
    renderFrame(ctx, {
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      title,
      steps,
      images,
      segment,
      progress,
      elapsed,
      time: t,
    });
  };
  drawAt(0);

  const stream = canvas.captureStream(FPS);
  const hasVoice = voices.some(Boolean);
  const audioDestination = hasVoice ? audioCtx.createMediaStreamDestination() : null;
  if (audioDestination) {
    audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: VIDEO_BITRATE,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  // 4. Record in real time.
  await audioCtx.resume();
  recorder.start(250);
  const t0 = performance.now();
  if (audioDestination) {
    const audioStart = audioCtx.currentTime;
    const narrateStart = {};
    for (const s of segments) if (s.phase === 'narrate') narrateStart[s.stepIndex] = s.start;
    voices.forEach((buffer, i) => {
      if (!buffer) return;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioDestination);
      source.start(audioStart + narrateStart[i] / 1000);
    });
  }

  let aborted = false;
  await new Promise((resolve) => {
    const tick = () => {
      if (signal?.aborted) {
        aborted = true;
        resolve();
        return;
      }
      const t = performance.now() - t0;
      drawAt(Math.min(t, total - 1));
      onProgress?.(Math.min(1, t / total));
      if (t >= total) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  audioCtx.close();
  if (aborted) throw new DOMException('Cancelled', 'AbortError');

  const type = recorder.mimeType || mimeType || 'video/webm';
  return {
    blob: new Blob(chunks, { type }),
    extension: type.startsWith('video/mp4') ? 'mp4' : 'webm',
  };
}
