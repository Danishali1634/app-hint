/**
 * @file Phase A of "Create by video": get a video for the course.
 *
 *   Record your screen   → services/video/screenRecorder (share picker, floating
 *                          Stop window, follows the user to other tabs)
 *   or upload a video    → any video file
 *
 * While recording, this page shows a small calm card: "Recording…", the time
 * and a normal Stop button (the user may stay here). When recording stops — here, in the floating window or on
 * the browser's "Stop sharing" bar — the blob goes to onVideo, the page saves
 * it and the builder (phase B) opens by itself.
 *
 * Cancelling the share picker is not an error: we just stay here.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MonitorPlay, Upload, Square, Loader2, PlayCircle } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { toast } from 'react-toastify';
import { TutorialDialog } from '@/components/tutorial/TutorialDialog';
import { formatDuration } from '@/utils';
import { isScreenRecordingSupported, startScreenRecording } from '@/services/video/screenRecorder';

/**
 * @param {{
 *   title: string,
 *   onVideo: (video: { blob: Blob, durationSec: number | null }) => Promise<void>,
 * }} props
 */
export function GetVideo({ title, onVideo, onUseScreenshots }) {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(null); // { startedAt, floating } while recording
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false); // saving the video
  const [showTutorial, setShowTutorial] = useState(false); // "View tutorial: creating with video"
  const recRef = useRef(null);
  const mountedRef = useRef(true);
  const supported = isScreenRecordingSupported();

  // Leaving the page mid-recording: stop and throw the recording away.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - recording.startedAt), 500);
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', warn);
    };
  }, [recording]);

  const saveVideo = async (blob, durationSec) => {
    setBusy(true);
    try {
      await onVideo({ blob, durationSec });
    } catch {
      toast.error("Couldn't save the video. Please try again.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const startRecording = async () => {
    try {
      const rec = await startScreenRecording({
        onStop: ({ blob, durationMs }) => {
          recRef.current = null;
          if (!mountedRef.current) return;
          setRecording(null);
          if (!blob.size) {
            toast.error('Nothing was recorded. Please try again.');
            return;
          }
          saveVideo(blob, durationMs / 1000);
        },
        onFloatingClose: () =>
          mountedRef.current && setRecording((r) => r && { ...r, floating: false }),
      });
      recRef.current = rec;
      setElapsed(0);
      setRecording({ startedAt: rec.startedAt, floating: rec.floating });
    } catch (err) {
      // The user closed the share picker: just stay here.
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return;
      toast.error("Couldn't start recording. Try uploading a video instead.");
    }
  };

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        toast.error('Please choose a video file');
        return;
      }
      saveVideo(file, null);
    };
    input.click();
  };

  let body;
  if (recording) {
    body = (
      <div className="flex flex-col items-center text-center gap-3">
        <p className="flex items-center gap-2 text-lg font-bold text-ink dark:text-ink-soft-dark">
          <span
            className="w-2.5 h-2.5 rounded-full bg-danger motion-safe:animate-pulse"
            aria-hidden="true"
          />
          Recording…
          <span className="text-sm font-semibold tabular-nums text-ink-soft dark:text-ink-soft-dark">
            {formatDuration(elapsed / 1000)}
          </span>
        </p>
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark max-w-sm">
          Go to your app and do the task. Press Stop when you&apos;re done.
        </p>
        {recording.floating && (
          <p className="text-xs text-ink-faint dark:text-ink-faint-dark">
            You can also stop from the small floating window.
          </p>
        )}
        <Tooltip label="Stop recording and start adding features">
          <button
            onClick={() => recRef.current?.stop()}
            className="mt-1 flex items-center gap-2 h-10 px-5 rounded-xl bg-danger text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Square className="w-3.5 h-3.5 fill-current" /> Stop
          </button>
        </Tooltip>
      </div>
    );
  } else if (busy) {
    body = (
      <p className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-ink-soft dark:text-ink-soft-dark">
        <Loader2 className="w-5 h-5 animate-spin text-accent" /> Opening your video…
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col items-center text-center gap-5">
        <span className="w-16 h-16 rounded-2xl bg-accent-soft dark:bg-accent-soft-dark flex items-center justify-center">
          <MonitorPlay className="w-8 h-8 text-accent" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-ink-soft-dark">
            Record your screen
          </h1>
          {!supported && (
            <p className="text-sm text-ink-soft dark:text-ink-soft-dark mt-2 max-w-sm">
              Recording works in Chrome or Edge on a computer. You can upload a video instead.
            </p>
          )}
        </div>
        {supported && (
          <ol className="w-full grid gap-2 sm:grid-cols-3 text-left">
            {[
              ['Pick what to record', 'a tab, a window or your screen'],
              ['Do the task', 'switch tabs freely'],
              ['Press Stop', 'your video opens here'],
            ].map(([what, detail], n) => (
              <li
                key={what}
                className="flex items-start gap-2 rounded-xl bg-paper-2 dark:bg-paper-2-dark p-3"
              >
                <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {n + 1}
                </span>
                <span className="text-sm leading-snug">
                  <strong className="block text-ink dark:text-white">{what}</strong>
                  <span className="text-xs text-ink-soft dark:text-ink-faint-dark">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {supported && (
          <Tooltip label="Choose what to record, then do the task">
            <button
              onClick={startRecording}
              className="flex items-center gap-2 h-14 px-8 rounded-2xl bg-accent text-white text-lg font-bold shadow-lg shadow-accent/25 hover:bg-accent-dark transition-colors"
            >
              <span className="w-3 h-3 rounded-full bg-white" aria-hidden="true" />
              Start recording
            </button>
          </Tooltip>
        )}
        <Tooltip label="A short video that shows every click">
          <button
            onClick={() => setShowTutorial(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/10 text-accent dark:text-accent-ink-dark ring-1 ring-accent/30 text-sm font-semibold hover:bg-accent/15 transition-colors"
          >
            <PlayCircle className="w-4 h-4" /> View tutorial: creating with video
          </button>
        </Tooltip>
        <Tooltip label="Use a video file from your computer">
          <button
            onClick={pickFile}
            className={
              supported
                ? 'flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline'
                : 'flex items-center gap-2 h-12 px-6 rounded-xl bg-accent text-white font-semibold hover:bg-accent-dark transition-colors'
            }
          >
            <Upload className="w-4 h-4" /> {supported ? 'or upload a video' : 'Upload a video'}
          </button>
        </Tooltip>
        {onUseScreenshots && (
          <button
            onClick={onUseScreenshots}
            className="text-sm font-medium text-ink-faint dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark"
          >
            Use screenshots instead
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-2 mb-6 min-w-0">
          <Tooltip label="Back to courses">
            <button
              onClick={() => navigate('/')}
              disabled={!!recording}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark disabled:opacity-40"
              aria-label="Back to courses"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Tooltip>
          <p className="text-sm font-semibold text-ink-soft dark:text-ink-soft-dark truncate">
            {title}
          </p>
        </div>
        <div
          className={`rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-sm ${
            recording ? 'max-w-md mx-auto px-6 py-6' : 'px-6 py-10 sm:px-10'
          }`}
        >
          {body}
        </div>
      </div>
      {showTutorial && (
        <TutorialDialog initialId="start-recording" onClose={() => setShowTutorial(false)} />
      )}
    </>
  );
}
