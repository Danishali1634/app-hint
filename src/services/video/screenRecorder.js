/**
 * @file Screen recording for "Create by video" (pages/VideoTour).
 *
 *   const rec = await startScreenRecording({ onStop: ({ blob, durationMs }) => … });
 *   rec.stop();     // our Stop button (also: the floating window, the browser's bar)
 *   rec.cancel();   // leaving the page: stop without calling onStop
 *   rec.floating    // true when the floating Stop window opened
 *
 * GOES WITH THE USER TO EVERY TAB
 *   - getDisplayMedia with `surfaceSwitching: 'include'` → Chrome shows
 *     "Share this tab instead" on the sharing bar, so the user can move to
 *     another tab mid-recording and keep recording.
 *   - CaptureController 'focus-captured-surface' → after picking a tab or a
 *     window, the browser jumps to it (the user starts working right away).
 *   - Document Picture-in-Picture (Chrome/Edge 116+) → a small always-on-top
 *     window that floats over every tab and app: one dark pill with a red dot,
 *     the time and a Stop button. It has its own tiny stylesheet (not the
 *     app's), so it never picks up the page background, and the pill stays
 *     centred and small even if the user enlarges the window. Without it, the
 *     browser's own "Stop sharing" bar and our in-page Stop button are the
 *     fallback.
 *
 * USER GESTURE: opening the floating window needs the click that started the
 * recording, so it is requested in the same tick as getDisplayMedia (floating
 * window first, then the share picker). If the user cancels the picker the
 * floating window is closed again and the NotAllowedError is re-thrown.
 *
 * STOP happens on our Stop button OR when the captured track ends (the user
 * pressed the browser's "Stop sharing"). Then the floating window closes, the
 * tab title is restored, `window.focus()` tries to bring our tab back (best
 * effort: browsers may refuse) and onStop receives the recording.
 */

const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const TIMESLICE_MS = 1000;
const RECORDING_TITLE = '● Recording… – Hint Studio';
/** Small pill window; some browsers refuse tiny sizes, then the fallback is used. */
const PIP_SIZE = { width: 240, height: 72 };
const PIP_FALLBACK_SIZE = { width: 260, height: 120 };

/** The floating window's own styles: a centred dark pill, nothing full-page. */
const PIP_CSS = `
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #111 !important; background-image: none !important; margin: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    user-select: none; overflow: hidden;
  }
  .pill {
    display: flex; align-items: center; gap: 10px;
    width: 100%; max-width: 220px; box-sizing: border-box;
    padding: 6px 6px 6px 14px; border-radius: 999px;
    background: #222; border: 1px solid #333; color: #fff;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #E5484D; flex-shrink: 0;
    animation: blink 1.4s ease-in-out infinite; }
  .time { flex: 1; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stop {
    display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px;
    border: 0; border-radius: 999px; background: #E5484D; color: #fff;
    font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .stop:hover { background: #d13b40; }
  .stop:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .square { width: 9px; height: 9px; border-radius: 2px; background: #fff; }
  @keyframes blink { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
`;

/** True when this browser can record the screen (desktop Chrome, Edge, Firefox, Safari). */
export function isScreenRecordingSupported() {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

/** True when the floating Stop window (Document Picture-in-Picture) is available. */
export function canFloatControls() {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

function pickMimeType() {
  return MIME_TYPES.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || '';
}

/** "1:05" */
function clock(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Opens the floating window: the small size first, a larger one if refused. */
function requestPipWindow() {
  const pip = window.documentPictureInPicture;
  try {
    return pip
      .requestWindow(PIP_SIZE)
      .catch(() => pip.requestWindow(PIP_FALLBACK_SIZE))
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * Builds the floating controls: one dark pill with red dot · time · Stop.
 * Plain DOM with its own stylesheet, so it needs no React root and none of
 * the app's page styles.
 * @returns {{ setTime: (ms: number) => void }}
 */
function buildPipControls(pipWindow, onStopClick) {
  const doc = pipWindow.document;
  doc.title = 'Recording';
  const style = doc.createElement('style');
  style.textContent = PIP_CSS;
  doc.head.appendChild(style);
  doc.body.setAttribute(
    'style',
    'background:#111 !important;background-image:none !important;margin:0',
  );

  const pill = doc.createElement('div');
  pill.className = 'pill';
  const dot = doc.createElement('span');
  dot.className = 'dot';
  const time = doc.createElement('span');
  time.className = 'time';
  time.textContent = '0:00';

  const stop = doc.createElement('button');
  stop.type = 'button';
  stop.className = 'stop';
  stop.title = 'Stop recording and go back to Hint Studio';
  const square = doc.createElement('span');
  square.className = 'square';
  stop.append(square, doc.createTextNode('Stop'));
  stop.addEventListener('click', onStopClick);

  pill.append(dot, time, stop);
  doc.body.replaceChildren(pill);
  return { setTime: (ms) => (time.textContent = clock(ms)) };
}

/**
 * Asks the user what to share and starts recording it.
 * Must be called from a click handler (user gesture).
 * @param {{
 *   onStop: (result: { blob: Blob, durationMs: number, mimeType: string }) => void,
 *   onFloatingClose?: () => void,   // the user closed the floating window
 * }} options
 * @returns {Promise<{ startedAt: number, floating: boolean, stop: () => void, cancel: () => void }>}
 * @throws DOMException 'NotAllowedError' when the user cancels the picker,
 *         'NotSupportedError' when the browser can't record the screen.
 */
export async function startScreenRecording({ onStop, onFloatingClose }) {
  if (!isScreenRecordingSupported()) {
    throw new DOMException('Screen recording is not supported here', 'NotSupportedError');
  }

  // Both requests are made before any await, so both still see the click.
  const pipPromise = canFloatControls() ? requestPipWindow() : Promise.resolve(null);
  const controller = window.CaptureController ? new window.CaptureController() : null;
  const options = {
    video: { frameRate: 30 },
    audio: false,
    surfaceSwitching: 'include',
    selfBrowserSurface: 'exclude',
    monitorTypeSurfaces: 'include',
  };
  if (controller) options.controller = controller;

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(options);
  } catch (err) {
    (await pipPromise)?.close();
    throw err;
  }
  try {
    controller?.setFocusBehavior('focus-captured-surface');
  } catch {
    // Too late or not a tab/window: the browser keeps its default.
  }
  const pipWindow = await pipPromise;

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const startedAt = Date.now();
  const originalTitle = document.title;
  let finished = false;
  let cancelled = false;
  let timer = 0;

  const cleanUp = () => {
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    document.title = originalTitle;
    try {
      pipWindow?.close();
    } catch {
      // Already closed by the user.
    }
  };

  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    const durationMs = Date.now() - startedAt;
    cleanUp();
    if (cancelled) return;
    try {
      window.focus();
    } catch {
      // Best effort only.
    }
    const type = recorder.mimeType || mimeType || 'video/webm';
    onStop({ blob: new Blob(chunks, { type }), durationMs, mimeType: type });
  };

  const stop = () => {
    if (finished) return;
    finished = true;
    if (recorder.state !== 'inactive') recorder.stop();
    else cleanUp();
  };
  const cancel = () => {
    cancelled = true;
    stop();
  };

  // The browser's own "Stop sharing" button ends the track.
  stream.getVideoTracks().forEach((track) => track.addEventListener('ended', stop));

  if (pipWindow) {
    const controls = buildPipControls(pipWindow, () => {
      // Still inside the click in the floating window: focusing our tab is allowed here.
      try {
        window.focus();
      } catch {
        // Best effort only.
      }
      stop();
    });
    timer = setInterval(() => controls.setTime(Date.now() - startedAt), 500);
    pipWindow.addEventListener('pagehide', () => {
      if (!finished) onFloatingClose?.();
    });
  }

  document.title = RECORDING_TITLE;
  recorder.start(TIMESLICE_MS);
  return { startedAt, floating: !!pipWindow, stop, cancel };
}

/**
 * The real length of a video in seconds. MediaRecorder WebM files report
 * `duration === Infinity` until the browser has scanned to the end, so this
 * seeks far past the end once, waits for the duration to settle, then goes
 * back to 0. Resolves with `fallback` if the browser never finds it.
 * @param {HTMLVideoElement} video  metadata already loaded
 * @param {number} [fallback]       e.g. the measured recording length
 * @returns {Promise<number>}
 */
export function resolveVideoDuration(video, fallback = 0) {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve(video.duration);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('durationchange', check);
      video.removeEventListener('timeupdate', check);
      clearTimeout(timeout);
      const duration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallback;
      video.currentTime = 0;
      resolve(duration);
    };
    const check = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) finish();
    };
    const timeout = setTimeout(finish, 4000);
    video.addEventListener('durationchange', check);
    video.addEventListener('timeupdate', check);
    video.currentTime = 1e101;
  });
}
