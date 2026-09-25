/**
 * @file "Voice Guidance" panel for the active step in the editor.
 *
 * RESPONSIBILITIES
 *   - Show whether the step has a recording, will use TTS, or has nothing.
 *   - Record → save the Blob to IndexedDB → give the parent the new media id.
 *   - Play back / delete an existing recording.
 *
 * RECORDING FLOW
 *   Record voice → useAudioRecorder.start()   (mic permission, timer starts)
 *   Stop & Save  → stop() returns Blob
 *               → putMedia(newId, blob)      (store audio)
 *               → deleteMedia(oldId)         (drop the previous take, no orphans)
 *               → onSave(newId)              (parent sets step.audioId + saves course)
 *   Cancel       → recording discarded, nothing stored
 *   Re-record    → same as Record, but on a step that already has a voice note;
 *                  the old take stays until the new one is saved (Cancel keeps it)
 *
 * The panel writes media itself, but the course object is only changed through
 * onSave/onDelete. The editor page stays the single owner of course state.
 */

import { useRef, useEffect, useState } from 'react';
import { Mic, Play, Pause, Trash2, Loader2, AlertCircle, Type, RotateCcw } from 'lucide-react';
import { useAudioRecorder, formatDuration } from '@/hooks/useAudioRecorder';
import { putMedia, deleteMedia, getMediaAsDataUrl } from '@/services/storage/db';
import { nextId } from '@/utils';
import { useToast } from '@/hooks/useToast';

/** @typedef {import('@/types').Step} Step */

const RECORD_BUTTON_CLASS =
  'flex items-center gap-2 px-3 py-2 rounded-lg border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors w-fit';

/**
 * @param {{
 *   step: Step,
 *   onSave: (audioId: string) => void,
 *   onDelete: () => void,
 * }} props
 */
export function AudioRecorderPanel({ step, onSave, onDelete }) {
  const { supported, state, duration, error, start, stop, cancel, reset } = useAudioRecorder();
  const { notify } = useToast();

  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [loading, setLoading] = useState(false);
  // Hidden <audio> element used for preview playback.
  const audioRef = useRef(null);

  // Load the step's existing recording whenever the step (or its audio) changes.
  useEffect(() => {
    // `mounted` guard: if the user switches step before the async load finishes,
    // the stale result must not overwrite the new step's state.
    let mounted = true;

    if (step.audioId) {
      setLoading(true);
      getMediaAsDataUrl(step.audioId).then((url) => {
        if (!mounted) return;
        if (url) {
          setPreviewUrl(url);
          setHasAudio(true);
        }
        setLoading(false);
      });
    } else {
      setHasAudio(false);
      setPreviewUrl(null);
    }

    return () => {
      mounted = false;
    };
  }, [step.audioId]);

  const handleStart = async () => {
    reset();
    await start();
  };

  const handleStop = async () => {
    const blob = await stop();
    if (!blob || blob.size === 0) {
      notify('Recording was empty, try again.', 'error');
      return;
    }
    const mediaId = nextId('media');
    await putMedia(mediaId, blob);
    if (step.audioId) await deleteMedia(step.audioId); // replace old take
    onSave(mediaId);
    notify('Recording saved', 'success');
  };

  const handleDelete = async () => {
    if (step.audioId) await deleteMedia(step.audioId);
    onDelete();
    setHasAudio(false);
    setPreviewUrl(null);
    notify('Recording deleted');
  };

  const togglePlay = () => {
    if (!audioRef.current || !previewUrl) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
  };

  // "Record voice" is shown when there is no saved audio and we're not recording.
  const showRecordButton = !hasAudio && ((!loading && state === 'idle') || state === 'stopped');

  return (
    <div className="flex flex-col gap-3">
      {/* ── Status badges: what will play for this step ── */}
      <div className="flex items-center gap-2 text-xs">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
            hasAudio
              ? 'bg-teal-soft dark:bg-teal-soft-dark text-teal dark:text-teal-dark'
              : 'bg-paper-2 dark:bg-paper-2-dark text-ink-faint dark:text-ink-faint-dark'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          {hasAudio ? 'Recorded voice' : 'No recording'}
        </div>
        {!hasAudio && step.text && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-violet-soft dark:bg-violet-soft-dark text-violet dark:text-violet-dark">
            <Type className="w-3.5 h-3.5" />
            AI Hinglish voice will read text
          </div>
        )}
        {!hasAudio && !step.text && (
          <span className="text-ink-faint dark:text-ink-faint-dark">Add text or record voice</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-ink-faint dark:text-ink-faint-dark">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading audio...
        </div>
      )}

      {/* ── Existing recording: play / delete ── */}
      {!loading && hasAudio && previewUrl && state !== 'recording' && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-teal-soft/50 dark:bg-teal-soft-dark/30 border border-teal/30 dark:border-teal-dark/30">
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-teal text-white flex items-center justify-center hover:bg-teal-dark transition-colors flex-shrink-0"
            aria-label={isPlaying ? 'Pause' : 'Play recording'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <audio
            ref={audioRef}
            src={previewUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
          <span className="text-xs text-ink-soft dark:text-ink-soft-dark flex-1">
            Recorded voice will play during walkthrough
          </span>
          {supported && (
            <button
              onClick={handleStart}
              className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-xs font-medium text-teal dark:text-teal-dark hover:bg-teal/10 transition-colors"
              title="Record a new voice note (replaces this one when saved)"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-record
            </button>
          )}
          <button
            onClick={handleDelete}
            className="w-8 h-8 rounded-lg text-danger hover:bg-danger/10 flex items-center justify-center transition-colors"
            aria-label="Delete recording"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Start recording ── */}
      {showRecordButton && (
        <button onClick={handleStart} className={RECORD_BUTTON_CLASS}>
          <Mic className="w-4 h-4" /> Record voice
        </button>
      )}

      {/* ── Recording in progress ── */}
      {state === 'recording' && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-danger/10 border border-danger/30">
          <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse-rec flex-shrink-0" />
          <span className="text-sm font-mono font-semibold text-danger">
            {formatDuration(duration)}
          </span>
          <button
            onClick={handleStop}
            className="ml-auto px-3 py-1.5 rounded-lg bg-danger text-white text-sm font-semibold hover:bg-danger-dark transition-colors"
          >
            Stop & Save
          </button>
          <button
            onClick={cancel}
            className="px-3 py-1.5 rounded-lg text-sm text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Errors / unsupported browser ── */}
      {!supported && (
        <div className="flex items-center gap-2 text-xs text-ink-faint dark:text-ink-faint-dark px-3 py-2 bg-paper-2 dark:bg-paper-2-dark rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span>Voice recording is not supported in this browser.</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-danger flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </div>
  );
}
