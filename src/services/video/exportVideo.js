/**
 * @file Turns the animated walkthrough into a downloadable video file.
 *
 * HOW IT WORKS (all in the browser, no server)
 *   1. Preload screenshots and decode recorded voices.
 *      Steps with text but NO recording are spoken by an in-page neural voice
 *      (services/audio/neuralVoice.js) — same priority as the player:
 *      recorded voice first, then the text. Spoken text is CACHED (IndexedDB),
 *      so downloading the same course again skips this step.
 *   2. buildTimeline(): lay every phase of every step on a timeline. Narration
 *      length = the voice's duration (or reading time if no voice could be made).
 *   3. Encode — two ways:
 *      FAST (WebCodecs: current Chrome, Edge, Safari 16.4+, Firefox 130+):
 *        every frame is drawn with renderFrame() and handed to a VideoEncoder
 *        (H.264) as fast as the computer can go; the voices are mixed in an
 *        OfflineAudioContext and encoded (AAC, or Opus where AAC isn't
 *        available). mp4-muxer writes a standard MP4 with its index at the
 *        start ("fast start"), so it plays and seeks everywhere — including
 *        QuickTime, Windows and chat previews — and is ready in seconds.
 *      FALLBACK (MediaRecorder): canvas.captureStream() is recorded in REAL
 *        TIME (a 25-second walkthrough takes ~25 s). Used only when WebCodecs
 *        is missing or fails.
 *
 * STEPS IN THE VIDEO: the on-screen steps panel (thumbnail, heading, number +
 * start time — renderFrame) is currently DISABLED (code kept, commented out in
 * renderFrame), so the picture shows only the walkthrough. The MP4 (fast path) carries the steps as chapters (mp4Chapters.js), so
 * players with a chapter menu (VLC, mpv, IINA, PotPlayer …) jump to a step on
 * click. A video file can't hold clickable buttons in the picture itself.
 *
 * QUALITY: Full HD — 1080p, 30 fps, H.264 at 5 Mbps (sharp text on screenshots),
 * mono 64 kbps voice. If the encoder can't do 1080p it makes 720p. (The old
 * "fast" 480p option is disabled — kept in VIDEO_QUALITIES for later.)
 *
 * VOICE: text steps are spoken by the AI voice chosen in Settings, from the SAME
 * audio the live player plays (neuralVoice.aiVoiceWav) — so the video sounds
 * exactly like the walkthrough, and texts the player already spoke are reused.
 * Recorded voices go through a gentle compressor + make-up gain, so quiet and
 * loud recordings end up equally clear; the AI voice is mixed in unchanged.
 *
 * LIMITATIONS
 *   - First use of an AI voice downloads it once. If it can't be loaded
 *     (offline), text steps are silent with their caption.
 *   - Fallback recording only: browsers throttle hidden tabs, so the tab must
 *     stay visible while recording.
 */

import { WALKTHROUGH_TIMING } from '@/constants';
import { buildTimeline, segmentAt } from './timeline';
import { renderFrame } from './renderFrame';
import { addMp4Chapters } from './mp4Chapters';
import { getStepTitles } from '@/utils/course';
import { aiVoiceFromSettings, aiVoiceWav } from '@/services/audio/neuralVoice';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/** Frames are always DRAWN at this size (renderFrame's layout); smaller videos scale it down. */
const LAYOUT_WIDTH = 1280;
const LAYOUT_HEIGHT = 720;

/**
 * Download qualities. Frames are drawn at LAYOUT size and scaled up, so text
 * and shapes stay vector-sharp; screenshots are drawn from their full resolution.
 */
export const VIDEO_QUALITIES = {
  // FAST 480p — disabled for now (kept for later): text was too soft.
  // fast: { width: 854, height: 480, fps: 24, bitrate: 600_000 },
  // Full HD: 5 Mbps keeps small screenshot text crisp while the camera moves.
  hd: { width: 1920, height: 1080, fps: 30, bitrate: 5_000_000 },
};
/** Used only when this computer's encoder can't make 1080p. */
const HD_720 = { width: 1280, height: 720, fps: 30, bitrate: 3_000_000 };
/** @typedef {keyof typeof VIDEO_QUALITIES} VideoQuality */

/**
 * PACING — the video is calmer than the live player (a viewer can't pause to
 * read along as easily): the caption appears a moment before the voice starts,
 * there is a longer silence after each voice, and the still screens hold longer.
 */
/** The caption fades in (450 ms), then the voice starts (ms). */
const VOICE_LEAD_IN = 500;
/** Silence after a voice before the walkthrough moves on (ms). */
const AFTER_VOICE_PAUSE = 1200;
/** Extra stillness on the overview of a new screen and after a "look" step (ms). */
const VIDEO_HOLD = { overview: 600, lookAction: 700 };
/** Voice only: mono 64 kbps is clear speech. */
const AUDIO_BITRATE = 64_000;
const AUDIO_SAMPLE_RATE = 48_000;
/**
 * H.264 profiles to try, best compression first: High 4.0, Main 4.0, Baseline
 * 4.2 (all fit 1080p30), then Baseline 3.1 (720p only).
 */
const AVC_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42002a', 'avc1.42001f'];

/** Fallback recorder formats, best first. */
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** True if this browser can make a video file at all (either way). */
export function isVideoExportSupported() {
  return canEncodeFast() || canRecordRealtime();
}

function canEncodeFast() {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined'
  );
}

function canRecordRealtime() {
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
  if (!text?.trim()) return WALKTHROUGH_TIMING.silentNarrate + 800;
  return Math.min(12000, Math.max(3500, text.length * 75));
}

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return { img, ratio: img.naturalWidth / img.naturalHeight };
}

async function decodeAudio(audioCtx, bytes) {
  try {
    return await audioCtx.decodeAudioData(bytes);
  } catch {
    return null; // a broken recording just becomes silent
  }
}

const abortError = () => new DOMException('Cancelled', 'AbortError');

/**
 * @param {WalkthroughStep[]} steps
 * @param {{
 *   title: string,
 *   onProgress?: (fraction: number) => void,           // encoding progress 0–1
 *   onStage?: (stage: 'voice' | 'record', fraction?: number) => void,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{ blob: Blob, extension: 'mp4' | 'webm', silentSteps: number }>}
 *   silentSteps = text steps that got no voice (neural voice unavailable)
 * @throws {DOMException} name 'AbortError' when cancelled
 */
export async function exportWalkthroughVideo(
  steps,
  { title, quality = 'hd', onProgress, onStage, signal },
) {
  let q = VIDEO_QUALITIES[quality] ?? VIDEO_QUALITIES.hd;
  if (!isVideoExportSupported()) {
    throw new Error('Video download is not supported in this browser.');
  }
  const throwIfAborted = () => {
    if (signal?.aborted) throw abortError();
  };

  // Fonts must be ready, or the first frames draw captions in a fallback font.
  await document.fonts?.ready;

  // 1. Media — screenshots, recordings, and the AI voice for text-only steps.
  const images = {};
  for (const step of steps) {
    if (step.imageData) images[step.id] = await loadImage(step.imageData);
  }
  // Sub-steps of one Global Step share its frame (the first screenshot's
  // proportions), so a screenshot change never resizes the picture.
  steps.forEach((step, i) => {
    const prev = steps[i - 1];
    if (
      images[step.id] &&
      prev &&
      images[prev.id] &&
      step.groupId &&
      step.groupId === prev.groupId
    ) {
      images[step.id] = { ...images[step.id], ratio: images[prev.id].ratio };
    }
  });
  // Decoding needs a context; an offline one never asks for the speakers.
  const decoder = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE);
  const voices = await Promise.all(
    steps.map(async (step) =>
      step.audioData
        ? decodeAudio(decoder, await (await fetch(step.audioData)).arrayBuffer())
        : null,
    ),
  );
  throwIfAborted();

  const toSpeak = steps
    .map((step, i) => (!voices[i] && step.text?.trim() ? i : -1))
    .filter((i) => i >= 0);
  let silentSteps = 0;
  // The AI voice + speed from Settings — the same audio the player plays.
  const voice = aiVoiceFromSettings();
  const isAiVoice = steps.map(() => false);
  for (let n = 0; n < toSpeak.length; n++) {
    const i = toSpeak[n];
    onStage?.('voice', n / toSpeak.length);
    try {
      const wav = await aiVoiceWav(steps[i].text, voice, (download) =>
        onStage?.('voice', (n + download * 0.9) / toSpeak.length),
      );
      voices[i] = await decodeAudio(decoder, await wav.arrayBuffer());
      isAiVoice[i] = !!voices[i];
    } catch {
      voices[i] = null;
    }
    if (!voices[i]) silentSteps++;
    throwIfAborted();
  }
  onStage?.('record');

  // 2. Timeline
  const narrationMs = steps.map((step, i) =>
    voices[i]
      ? VOICE_LEAD_IN + voices[i].duration * 1000 + AFTER_VOICE_PAUSE
      : readingTimeMs(step.text),
  );
  const { segments, total } = buildTimeline(steps, narrationMs, VIDEO_HOLD);

  // 1080p when this computer's encoder can make it, else 720p.
  if (canEncodeFast() && q.height > HD_720.height && !(await pickVideoConfig(q))) q = HD_720;

  const canvas = document.createElement('canvas');
  canvas.width = q.width;
  canvas.height = q.height;
  const ctx = canvas.getContext('2d');
  const scale = q.width / LAYOUT_WIDTH;
  const drawAt = (t) => {
    const { segment, progress, elapsed } = segmentAt(segments, t);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderFrame(ctx, {
      width: LAYOUT_WIDTH,
      height: LAYOUT_HEIGHT,
      title,
      steps,
      images,
      segments,
      segment,
      progress,
      elapsed,
      time: t,
      total,
    });
  };
  // The steps as chapters of the MP4 (clickable in the video player's chapter menu).
  const titles = getStepTitles(steps);
  const chapters = steps.map((_, i) => ({
    startMs: segments.find((seg) => seg.stepIndex === i)?.start ?? NaN,
    title: titles[i].heading
      ? `${titles[i].number}. ${titles[i].heading}`
      : `Step ${titles[i].number}`,
  }));
  const job = {
    canvas,
    drawAt,
    segments,
    total,
    voices,
    isAiVoice,
    chapters,
    q,
    onProgress,
    signal,
  };

  // 3. Encode: fast when possible, real-time recording otherwise.
  if (canEncodeFast()) {
    try {
      const blob = await encodeFast(job);
      return { blob, extension: 'mp4', silentSteps };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      if (!canRecordRealtime()) throw err;
      console.warn('Fast video encoding failed, recording in real time instead', err);
    }
  }
  const { blob, extension } = await recordRealtime(job);
  return { blob, extension, silentSteps };
}

// ─── Mixing the voices ───────────────────────────────────────────────────────

/** Voice chain: compressor → make-up gain (quiet and loud recordings end up equally clear). */
function voiceChain(audioCtx, destination) {
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 12;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.25;
  const makeUp = audioCtx.createGain();
  makeUp.gain.value = 1.8;
  compressor.connect(makeUp).connect(destination);
  return compressor;
}

/** ms from the start of the video at which each step's voice starts (after the lead-in). */
function narrationStarts(segments) {
  const starts = {};
  for (const s of segments)
    if (s.phase === 'narrate') starts[s.stepIndex] = s.start + VOICE_LEAD_IN;
  return starts;
}

/** Every voice at its narration time, mixed into one mono track (faster than real time). */
async function mixVoicesOffline(voices, isAiVoice, segments, total) {
  const length = Math.ceil((total / 1000) * AUDIO_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, AUDIO_SAMPLE_RATE);
  const input = voiceChain(offline, offline.destination);
  const starts = narrationStarts(segments);
  voices.forEach((buffer, i) => {
    if (!buffer) return;
    const source = offline.createBufferSource();
    source.buffer = buffer;
    // The AI voice exactly as the player plays it; recordings get the clarity chain.
    source.connect(isAiVoice[i] ? offline.destination : input);
    source.start(starts[i] / 1000);
  });
  return offline.startRendering();
}

// ─── Fast path: WebCodecs + mp4-muxer ────────────────────────────────────────

async function pickVideoConfig(q) {
  for (const codec of AVC_CODECS) {
    const config = {
      codec,
      width: q.width,
      height: q.height,
      bitrate: q.bitrate,
      bitrateMode: 'variable',
      framerate: q.fps,
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {
      // try the next profile
    }
  }
  return null;
}

async function pickAudioConfig() {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const [codec, muxerCodec] of [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ]) {
    const config = {
      codec,
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    };
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, muxerCodec };
    } catch {
      // try the next codec
    }
  }
  return null;
}

/** Lets the page repaint (progress bar, Cancel) between batches of frames. */
const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

async function encodeFast({
  canvas,
  drawAt,
  segments,
  total,
  voices,
  isAiVoice,
  chapters,
  q,
  onProgress,
  signal,
}) {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const videoConfig = await pickVideoConfig(q);
  if (!videoConfig) throw new Error('No H.264 encoder available');

  const hasVoice = voices.some(Boolean);
  const audio = hasVoice ? await pickAudioConfig() : null;
  if (hasVoice && !audio) throw new Error('No audio encoder available');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: q.width, height: q.height, frameRate: q.fps },
    ...(audio
      ? {
          audio: {
            codec: audio.muxerCodec,
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfChannels: 1,
          },
        }
      : {}),
    fastStart: 'in-memory', // index at the start: plays and seeks everywhere
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  });
  videoEncoder.configure(videoConfig);

  // Audio first (quick): the whole mixed voice track.
  if (audio) {
    const mixed = await mixVoicesOffline(voices, isAiVoice, segments, total);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (failure = e),
    });
    audioEncoder.configure(audio.config);
    const samples = mixed.getChannelData(0);
    const block = AUDIO_SAMPLE_RATE / 10; // 100 ms per AudioData
    for (let offset = 0; offset < samples.length; offset += block) {
      const data = samples.subarray(offset, Math.min(samples.length, offset + block));
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: data.length,
        numberOfChannels: 1,
        timestamp: Math.round((offset / AUDIO_SAMPLE_RATE) * 1e6),
        data,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // Video: every frame, as fast as the encoder takes them.
  const frameCount = Math.ceil((total / 1000) * q.fps);
  const frameDuration = 1e6 / q.fps;
  const keyframeEvery = q.fps * 2; // a keyframe every 2 s keeps seeking snappy
  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) {
      videoEncoder.close();
      throw abortError();
    }
    if (failure) throw failure;
    drawAt(Math.min((i * 1000) / q.fps, total - 1));
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDuration),
      duration: Math.round(frameDuration),
    });
    videoEncoder.encode(frame, { keyFrame: i % keyframeEvery === 0 });
    frame.close();
    // Don't run ahead of the encoder (memory), and keep the page responsive.
    while (videoEncoder.encodeQueueSize > 8) await yieldToPage();
    if (i % 15 === 0) {
      onProgress?.(i / frameCount);
      await yieldToPage();
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress?.(1);
  return new Blob([addMp4Chapters(target.buffer, chapters)], { type: 'video/mp4' });
}

// ─── Fallback: real-time MediaRecorder ───────────────────────────────────────

async function recordRealtime({
  canvas,
  drawAt,
  segments,
  total,
  voices,
  isAiVoice,
  q,
  onProgress,
  signal,
}) {
  drawAt(0);
  const stream = canvas.captureStream(q.fps);
  const hasVoice = voices.some(Boolean);
  const audioCtx = new AudioContext();
  const audioDestination = hasVoice ? audioCtx.createMediaStreamDestination() : null;
  let voiceInput = null;
  if (audioDestination) {
    audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    voiceInput = voiceChain(audioCtx, audioDestination);
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: q.bitrate,
    audioBitsPerSecond: AUDIO_BITRATE,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  await audioCtx.resume();
  recorder.start(250);
  const t0 = performance.now();
  if (audioDestination) {
    const audioStart = audioCtx.currentTime;
    const starts = narrationStarts(segments);
    voices.forEach((buffer, i) => {
      if (!buffer) return;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(isAiVoice[i] ? audioDestination : voiceInput);
      source.start(audioStart + starts[i] / 1000);
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
  if (aborted) throw abortError();

  const type = recorder.mimeType || mimeType || 'video/webm';
  return {
    blob: new Blob(chunks, { type }),
    extension: type.startsWith('video/mp4') ? 'mp4' : 'webm',
  };
}
