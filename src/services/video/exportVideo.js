/**
 * @file Records the animated walkthrough into a downloadable video file.
 *
 * HOW IT WORKS (all in the browser, no server)
 *   1. Preload screenshots and decode recorded voices (AudioContext).
 *      Steps with text but NO recording are spoken by an in-page neural voice
 *      (services/audio/neuralVoice.js) — same priority as the player:
 *      recorded voice first, then the text.
 *   2. buildTimeline(): lay every phase of every step on a timeline. Narration
 *      length = the voice's duration (or reading time if no voice could be made).
 *   3. canvas.captureStream() gives a video track; the recordings are scheduled
 *      into a MediaStreamAudioDestinationNode at their narration start times.
 *   4. MediaRecorder records both tracks while renderFrame() draws each frame.
 *      Recording happens in REAL TIME: a 25-second walkthrough takes ~25 s.
 *
 * FORMAT: MP4 (H.264/AAC) when the browser can record it (recent Chrome, Safari),
 * otherwise WebM. The file extension follows the actual format.
 *
 * VOICE CLARITY: every voice goes through a gentle compressor + make-up gain,
 * so quiet and loud recordings end up equally clear. Audio is recorded at 96 kbps.
 *
 * LIMITATIONS
 *   - The video's AI voice is a neural English voice (the live player uses the
 *     browser's own voices, which can't be recorded). First use downloads it once.
 *     If it can't be loaded (offline), text steps are silent with their caption.
 *   - Browsers throttle hidden tabs; the tab must stay visible while recording.
 */

import { WALKTHROUGH_TIMING } from '@/constants';
import { buildTimeline, segmentAt } from './timeline';
import { renderFrame } from './renderFrame';
import { synthesizeSpeech } from '@/services/audio/neuralVoice';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const FPS = 30;
/**
 * 2 Mbps H.264 at 720p: screenshots stay sharp (the picture is mostly still),
 * and a 6-step video is ~3 MB instead of ~9 MB.
 */
const VIDEO_BITRATE = 2_000_000;
/** Silence after a recording before the walkthrough moves on (ms). */
const AFTER_VOICE_PAUSE = 400;
const AUDIO_BITRATE = 96_000;

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
 *   onProgress?: (fraction: number) => void,           // recording progress 0–1
 *   onStage?: (stage: 'voice' | 'record', fraction?: number) => void,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{ blob: Blob, extension: 'mp4' | 'webm', silentSteps: number }>}
 *   silentSteps = text steps that got no voice (neural voice unavailable)
 * @throws {DOMException} name 'AbortError' when cancelled
 */
export async function exportWalkthroughVideo(steps, { title, onProgress, onStage, signal }) {
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

  // Text steps without a recording: speak the text with the neural voice.
  const toSpeak = steps
    .map((step, i) => (!voices[i] && step.text?.trim() ? i : -1))
    .filter((i) => i >= 0);
  let silentSteps = 0;
  for (let n = 0; n < toSpeak.length; n++) {
    const i = toSpeak[n];
    onStage?.('voice', n / toSpeak.length);
    try {
      const wav = await synthesizeSpeech(steps[i].text.trim(), (download) =>
        onStage?.('voice', (n + download * 0.9) / toSpeak.length),
      );
      voices[i] = await audioCtx.decodeAudioData(await wav.arrayBuffer());
    } catch {
      voices[i] = null;
    }
    if (!voices[i]) silentSteps++;
    throwIfAborted();
  }
  onStage?.('record');

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
      total,
    });
  };
  drawAt(0);

  const stream = canvas.captureStream(FPS);
  const hasVoice = voices.some(Boolean);
  const audioDestination = hasVoice ? audioCtx.createMediaStreamDestination() : null;
  let voiceInput = null; // where voices are connected: compressor → make-up gain → destination
  if (audioDestination) {
    audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.25;
    const makeUp = audioCtx.createGain();
    makeUp.gain.value = 1.8;
    compressor.connect(makeUp).connect(audioDestination);
    voiceInput = compressor;
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: VIDEO_BITRATE,
    audioBitsPerSecond: AUDIO_BITRATE,
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
      source.connect(voiceInput);
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
    silentSteps,
  };
}
