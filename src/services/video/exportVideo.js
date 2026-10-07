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
 * FORMAT (the download dialog):
 *   web               16:9 1280×720 layout (as always): the whole description
 *                     in the caption (3 lines, then …), the voice as one clip.
 *   mobile-portrait   the phone's full screen upright (9:16, 1080×1920) and
 *   mobile-landscape  sideways (16:9, 1920×1080): thin margins so the picture
 *                     fills the screen, text drawn larger for a phone, and
 *                     caption parts (utils/captionParts): a long description
 *                     is shown in parts, never cut off, each while the voice
 *                     says it (the AI voice speaks one clip per part).
 *
 * QUALITY (the download dialog preselects 480p every time):
 *   fast  480p, 24 fps, H.264 at 600 kbps — ready sooner, a small file.
 *   hd    Full HD — 1080p, 30 fps, H.264 at 5 Mbps (sharp text on
 *         screenshots). If the encoder can't do 1080p it makes 720p.
 * For every format (Web: 854×480 / 1920×1080; Mobile portrait: 480×854 /
 * 1080×1920; Mobile landscape: 854×480 / 1920×1080). Mono 64 kbps voice.
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
import { paceScale } from '@/utils/pace';
import { markSamePages } from '@/utils/samePage';
import { renderFrame } from './renderFrame';
import { addMp4Chapters } from './mp4Chapters';
import { getStepTitles } from '@/utils/course';
import { aiVoiceFromSettings, aiVoiceWav } from '@/services/audio/neuralVoice';
import { readingPartMs, recordingPartStarts, splitCaptionParts } from '@/utils/captionParts';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/** Frames are always DRAWN at this size (renderFrame's layout); smaller videos scale it down. */
const LAYOUT_WIDTH = 1280;
const LAYOUT_HEIGHT = 720;

/**
 * Download qualities. Frames are drawn at LAYOUT size and scaled up, so text
 * and shapes stay vector-sharp; screenshots are drawn from their full resolution.
 */
export const VIDEO_QUALITIES = {
  // 480p: ready sooner, a small file (the dialog's default).
  fast: { width: 854, height: 480, fps: 24, bitrate: 600_000 },
  // Full HD: 5 Mbps keeps small screenshot text crisp while the camera moves.
  hd: { width: 1920, height: 1080, fps: 30, bitrate: 5_000_000 },
};
/** Used only when this computer's encoder can't make 1080p. */
const HD_720 = { width: 1280, height: 720, fps: 30, bitrate: 3_000_000 };

/**
 * Mobile formats: the whole phone screen, per quality (+ the Full HD fallback
 * when the encoder can't make 1080p). Frames are drawn with a 480 px short
 * side (so captions come out big enough to read on a phone) and scaled.
 */
const MOBILE_FORMATS = {
  'mobile-portrait': {
    layoutWidth: 480,
    fast: { width: 480, height: 854, fps: 24, bitrate: 600_000 },
    hd: { width: 1080, height: 1920, fps: 30, bitrate: 5_000_000 },
    fallback: { width: 720, height: 1280, fps: 30, bitrate: 3_000_000 },
  },
  'mobile-landscape': {
    layoutWidth: 853.33,
    fast: { width: 854, height: 480, fps: 24, bitrate: 600_000 },
    hd: { width: 1920, height: 1080, fps: 30, bitrate: 5_000_000 },
    fallback: HD_720,
  },
};
/** @typedef {'web' | 'mobile-portrait' | 'mobile-landscape'} VideoFormat */
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
/** Silence between two caption parts of one AI-voice text (like a sentence pause). */
const PART_GAP_SEC = 0.25;
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

/** Web: how long the caption stays up for a step without a recording (reading time). */
function webReadingTimeMs(text) {
  if (!text?.trim()) return WALKTHROUGH_TIMING.silentNarrate + 800;
  return Math.min(12000, Math.max(3500, text.length * 75));
}

/** Mobile: how long the caption stays up for a step without a voice (reading time of every part). */
function readingTimeMs(parts) {
  if (!parts.length) return WALKTHROUGH_TIMING.silentNarrate + 800;
  return parts.reduce((sum, part) => sum + readingPartMs(part), 0);
}

/** The clips one after another, PART_GAP_SEC apart, as one buffer + where each starts (s). */
function joinClips(audioCtx, clips) {
  const rate = clips[0].sampleRate;
  const gap = Math.round(PART_GAP_SEC * rate);
  const length = clips.reduce((sum, c) => sum + c.length, 0) + gap * (clips.length - 1);
  const joined = audioCtx.createBuffer(1, length, rate);
  const out = joined.getChannelData(0);
  const starts = [];
  let at = 0;
  for (const clip of clips) {
    starts.push(at / rate);
    out.set(clip.getChannelData(0), at);
    at += clip.length + gap;
  }
  return { buffer: joined, starts };
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
 *   format?: VideoFormat,                                // default 'web'
 *   onProgress?: (fraction: number) => void,           // encoding progress 0–1
 *   onStage?: (stage: 'voice' | 'record', fraction?: number) => void,
 *   signal?: AbortSignal,
 *   pace?: number,                                     // the course's pace: 0.5 = half speed (utils/pace)
 * }} options
 * @returns {Promise<{ blob: Blob, extension: 'mp4' | 'webm', silentSteps: number }>}
 *   silentSteps = text steps that got no voice (neural voice unavailable)
 * @throws {DOMException} name 'AbortError' when cancelled
 */
export async function exportWalkthroughVideo(
  steps,
  { title, quality = 'hd', format = 'web', onProgress, onStage, signal, pace = 1 },
) {
  // The course's pace stretches every pause and reading time, like the player.
  const k = paceScale(pace);
  const mobileFormat = MOBILE_FORMATS[format] ?? null;
  const mobile = !!mobileFormat;
  let q = mobile
    ? (mobileFormat[quality] ?? mobileFormat.hd)
    : (VIDEO_QUALITIES[quality] ?? VIDEO_QUALITIES.hd);
  if (!isVideoExportSupported()) {
    throw new Error('Video download is not supported in this browser.');
  }
  const throwIfAborted = () => {
    if (signal?.aborted) throw abortError();
  };

  // Fonts must be ready, or the first frames draw captions in a fallback font.
  await document.fonts?.ready;

  // Separate screenshots of one page play as one continuous motion, as in the player.
  steps = await markSamePages(steps);

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

  // Mobile: caption parts (utils/captionParts) — a long text is shown part by
  // part, each while the voice says it. partStarts[i] = seconds into step i's
  // voice. Web: the whole text is one caption and one voice clip, as always.
  const captionParts = steps.map((step) =>
    mobile ? splitCaptionParts(step.text) : step.text?.trim() ? [step.text] : [],
  );
  const partStarts = steps.map((_, i) =>
    voices[i] && mobile
      ? recordingPartStarts(voices[i].getChannelData(0), voices[i].sampleRate, captionParts[i])
      : null,
  );
  const toSpeak = steps
    .map((_, i) => (!voices[i] && captionParts[i].length ? i : -1))
    .filter((i) => i >= 0);
  let silentSteps = 0;
  // The AI voice + speed from Settings — the same audio the player plays.
  const voice = aiVoiceFromSettings();
  const isAiVoice = steps.map(() => false);
  for (let n = 0; n < toSpeak.length; n++) {
    const i = toSpeak[n];
    onStage?.('voice', n / toSpeak.length);
    try {
      // One clip per caption part (the same clips the player plays), so each
      // part's caption starts exactly when its words do.
      const clips = [];
      for (const part of captionParts[i]) {
        const wav = await aiVoiceWav(part, voice, (download) =>
          onStage?.('voice', (n + download * 0.9) / toSpeak.length),
        );
        const clip = await decodeAudio(decoder, await wav.arrayBuffer());
        if (!clip) throw new Error('voice clip could not be decoded');
        clips.push(clip);
        throwIfAborted();
      }
      const { buffer, starts } =
        clips.length === 1 ? { buffer: clips[0], starts: [0] } : joinClips(decoder, clips);
      voices[i] = buffer;
      partStarts[i] = starts;
      isAiVoice[i] = true;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      voices[i] = null;
    }
    if (!voices[i]) silentSteps++;
    throwIfAborted();
  }
  onStage?.('record');

  // 2. Timeline
  const narrationMs = steps.map((_, i) =>
    voices[i]
      ? (VOICE_LEAD_IN + AFTER_VOICE_PAUSE) * k + voices[i].duration * 1000
      : (mobile ? readingTimeMs(captionParts[i]) : webReadingTimeMs(steps[i].text)) * k,
  );
  const { segments, total } = buildTimeline(steps, narrationMs, {
    overview: VIDEO_HOLD.overview * k,
    lookAction: VIDEO_HOLD.lookAction * k,
    pace,
  });
  // What the frames draw (Mobile): each step with its caption parts and when
  // each part starts (ms into its "narrate" phase). Web: the steps as they are.
  const frameSteps = !mobile
    ? steps
    : steps.map((step, i) => {
        const parts = captionParts[i];
        let startsMs;
        if (voices[i]) {
          startsMs = partStarts[i].map((sec, n) => (n === 0 ? 0 : VOICE_LEAD_IN * k + sec * 1000));
        } else {
          let at = 0;
          startsMs = parts.map((part) => {
            const start = at;
            at += readingPartMs(part) * k;
            return start;
          });
        }
        return { ...step, captionParts: parts, captionPartStarts: startsMs };
      });

  // 1080p when this computer's encoder can make it, else 720p.
  if (mobile) {
    if (q === mobileFormat.hd && canEncodeFast() && !(await pickVideoConfig(q))) {
      q = mobileFormat.fallback;
    }
  } else if (canEncodeFast() && q.height > HD_720.height && !(await pickVideoConfig(q))) {
    q = HD_720;
  }

  const canvas = document.createElement('canvas');
  canvas.width = q.width;
  canvas.height = q.height;
  const ctx = canvas.getContext('2d');
  // Web: always drawn at 1280×720. Mobile: a 480 px short side, in the
  // video's exact shape (so every pixel of the frame is drawn).
  const layout = mobile
    ? {
        width: mobileFormat.layoutWidth,
        height: (q.height * mobileFormat.layoutWidth) / q.width,
      }
    : { width: LAYOUT_WIDTH, height: LAYOUT_HEIGHT };
  const scale = q.width / layout.width;
  const drawAt = (t) => {
    const { segment, progress, elapsed } = segmentAt(segments, t);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderFrame(ctx, {
      width: layout.width,
      height: layout.height,
      mobile,
      title,
      steps: frameSteps,
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
    leadIn: VOICE_LEAD_IN * k, // when each voice starts in its narrate phase
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
function narrationStarts(segments, leadIn = VOICE_LEAD_IN) {
  const starts = {};
  for (const s of segments) if (s.phase === 'narrate') starts[s.stepIndex] = s.start + leadIn;
  return starts;
}

/** Every voice at its narration time, mixed into one mono track (faster than real time). */
async function mixVoicesOffline(voices, isAiVoice, segments, total, leadIn) {
  const length = Math.ceil((total / 1000) * AUDIO_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, AUDIO_SAMPLE_RATE);
  const input = voiceChain(offline, offline.destination);
  const starts = narrationStarts(segments, leadIn);
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
  leadIn,
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
    const mixed = await mixVoicesOffline(voices, isAiVoice, segments, total, leadIn);
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
  leadIn,
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
    const starts = narrationStarts(segments, leadIn);
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
