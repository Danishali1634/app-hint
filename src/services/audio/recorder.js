/**
 * @file Thin wrapper around the browser MediaRecorder API (microphone → Blob).
 *
 * WHY A SEPARATE SERVICE (instead of calling MediaRecorder inside a component)
 *   - Keeps browser-API details (mime types, stream cleanup, the callback-based
 *     `onstop` event) out of React code.
 *   - Turns `stop()` into a Promise that resolves with the final Blob, which is
 *     much easier to use with async/await.
 *   - React state/lifecycle is added on top by hooks/useAudioRecorder.js.
 *
 * LIFECYCLE
 *   createAudioRecorder(onStateChange)
 *     start()  → asks for mic permission → state 'recording'
 *     stop()   → resolves with Blob, releases mic → state 'stopped'
 *     cancel() → discards audio, releases mic → state 'idle'
 *
 * The microphone is always released (tracks stopped) on stop/cancel. If it isn't,
 * the browser's "recording" indicator stays on.
 */

/** @typedef {'idle' | 'recording' | 'stopped'} RecorderState */

/** Microphone settings for speech (unsupported ones are simply ignored). */
const VOICE_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};
/**
 * Opus at 32 kbps (mono): the rate used for clear voice calls — Opus is built for
 * voice) while files stay ~3× smaller than music bitrates — which keeps share
 * links and videos small.
 */
const VOICE_BITRATE = 32_000;

/** True if this browser can record audio (needs HTTPS or localhost). */
export function isRecordingSupported() {
  console.log('navigator---------$$$$$$--------', navigator);
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    !!navigator.mediaDevices.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

console.log('isRecordingSupported-------------', isRecordingSupported());

/**
 * Creates a single-use recorder. Create a new one for every recording.
 * @param {(state: RecorderState) => void} onStateChange Called on every state change
 */
export async function createAudioRecorder(onStateChange) {
  let mediaRecorder = null;
  let stream = null;
  let chunks = [];
  let state = 'idle';
  let cleanCtx = null; // AudioContext of the clean-up chain

  /**
   * Background-noise clean-up on top of the browser's own noise suppression:
   *   high-pass 90 Hz   removes hum, fan and desk rumble below the voice
   *   low-pass 9 kHz    removes hiss above speech
   *   compressor        evens out loud/quiet words so every word is clear
   * Falls back to the raw microphone if Web Audio isn't available.
   */
  function cleanVoiceStream(micStream) {
    try {
      cleanCtx = new AudioContext();
      const source = cleanCtx.createMediaStreamSource(micStream);
      const highPass = cleanCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 90;
      const lowPass = cleanCtx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 9000;
      const compressor = cleanCtx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 10;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;
      const makeUp = cleanCtx.createGain();
      makeUp.gain.value = 1.6;
      const out = cleanCtx.createMediaStreamDestination();
      source.connect(highPass).connect(lowPass).connect(compressor).connect(makeUp).connect(out);
      return out.stream;
    } catch {
      cleanCtx = null;
      return micStream;
    }
  }

  // Holds the pending stop() promise's resolve until MediaRecorder fires `onstop`.
  let stopResolve = null;

  function setState(nextState) {
    state = nextState;
    onStateChange(nextState);
  }

  /** Requests the microphone and starts recording. Throws if permission is denied. */
  async function start() {
    if (!isRecordingSupported()) {
      throw new Error('Recording is not supported in this browser.');
    }
    // Clear voice: the browser's echo/noise clean-up and level control, mono.
    stream = await navigator.mediaDevices.getUserMedia({ audio: VOICE_CONSTRAINTS });
    chunks = [];

    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(cleanVoiceStream(stream), {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: VOICE_BITRATE,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Fires after stop(); this is the only point where all chunks are Navailable.
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      cleanupStream();
      setState('stopped');
      if (stopResolve) {
        stopResolve(blob);
        stopResolve = null;
      }
    };

    mediaRecorder.start();
    setState('recording');
  }

  /**
   * Stops recording.
   * @returns {Promise<Blob>} the recording (empty Blob if nothing was recording)
   */
  function stop() {
    return new Promise((resolve) => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        stopResolve = resolve;
        mediaRecorder.stop(); // → triggers onstop above
      } else {
        resolve(new Blob());
      }
    });
  }

  /** Stops recording and throws the audio away. */
  function cancel() {
    stopResolve = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null; // don't build a Blob we won't use
      mediaRecorder.stop();
    }
    cleanupStream();
    chunks = [];
    setState('idle');
  }

  /** Releases the microphone (turns off the browser's recording indicator). */
  function cleanupStream() {
    cleanCtx?.close().catch(() => {});
    cleanCtx = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function getStream() {
    return stream;
  }

  return { state, start, stop, cancel, getStream };
}

/**
 * First audio format this browser can record, in order of preference.
 * Chrome/Firefox → webm/opus, Safari → mp4. undefined = browser default.
 */
function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Longest audio file that can be uploaded as a step's voice. */
export const MAX_UPLOAD_SECONDS = 180;

/**
 * Uploaded voice file (mp3, m4a, wav, …) → small Opus recording, the same
 * format and bitrate as voices recorded in the app. Big files (a 3-minute WAV
 * is ~30 MB) would otherwise bloat the course, share links and videos.
 *
 * HOW: the file is decoded and played — silently — into a MediaRecorder, so
 * it takes as long as the audio itself (onProgress reports 0–1). Files that are
 * already small Opus/WebM are kept as they are.
 * @param {File} file
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 * @throws {Error} with a user-readable message
 */
export async function compressVoiceFile(file, onProgress) {
  const ctx = new AudioContext();
  try {
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error('This audio file could not be read. Try MP3, M4A, WAV or WebM.');
    }
    if (buffer.duration > MAX_UPLOAD_SECONDS) {
      throw new Error(
        `Audio is too long — keep each step under ${MAX_UPLOAD_SECONDS / 60} minutes.`,
      );
    }
    const kbps = (file.size * 8) / 1000 / buffer.duration;
    const mimeType = pickMimeType();
    if ((kbps <= 64 && /webm|ogg/.test(file.type)) || typeof MediaRecorder === 'undefined') {
      return file;
    }
    await ctx.resume();
    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    const recorder = new MediaRecorder(destination.stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: VOICE_BITRATE,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    const startedAt = ctx.currentTime;
    const timer = setInterval(
      () => onProgress?.(Math.min(1, (ctx.currentTime - startedAt) / buffer.duration)),
      200,
    );
    source.onended = () => recorder.state !== 'inactive' && recorder.stop();
    recorder.start(250);
    source.start();
    await stopped;
    clearInterval(timer);
    onProgress?.(1);
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    return blob.size > 0 && blob.size < file.size ? blob : file;
  } finally {
    ctx.close().catch(() => {});
  }
}
