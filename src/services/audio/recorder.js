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
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];

    const mimeType = pickMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Fires after stop(); this is the only point where all chunks are available.
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
