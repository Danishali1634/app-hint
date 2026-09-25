/**
 * @file useAudioRecorder — React hook around services/audio/recorder.js.
 *
 * WHY THIS HOOK EXISTS
 *   The recorder service is plain JS and knows nothing about React. Components
 *   need recording state as React state (so the UI re-renders), a running
 *   duration timer, friendly error messages, and guaranteed cleanup when the
 *   component unmounts (otherwise the mic stays on). This hook does all of that,
 *   so AudioRecorderPanel only deals with buttons.
 *
 * WHY useRef FOR recorder / timer
 *   They must survive re-renders but changing them should NOT cause a render.
 *   useState would trigger extra renders; plain variables would reset on every
 *   render.
 *
 * WHY useCallback
 *   Keeps start/stop/cancel/reset identities stable, so they're safe to use in
 *   effect dependency arrays and don't re-render memoised children.
 *
 * Used by: components/course/AudioRecorderPanel.js
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioRecorder, isRecordingSupported } from '@/services/audio/recorder';
import { formatDuration } from '@/utils';

/**
 * @returns {{
 *   supported: boolean,
 *   state: 'idle' | 'recording' | 'stopped',
 *   duration: number,          // seconds since start
 *   error: string | null,      // user-facing message
 *   start: () => Promise<void>,
 *   stop: () => Promise<Blob | null>,
 *   cancel: () => void,
 *   reset: () => void,
 * }}
 */
export function useAudioRecorder() {
  // Checked once — browser support doesn't change during a session.
  const [supported] = useState(isRecordingSupported());
  const [state, setState] = useState('idle');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError('Recording is not supported in this browser.');
      return;
    }
    setError(null);
    setDuration(0);
    try {
      // Passing setState lets the service drive React state directly.
      const recorder = await createAudioRecorder(setState);
      recorderRef.current = recorder;
      await recorder.start();

      clearTimer();
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (e) {
      // Browsers word permission errors differently; normalise to one message.
      const msg = e instanceof Error ? e.message : 'Failed to start recording.';
      const isPermissionError =
        msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied');
      setError(
        isPermissionError
          ? 'Microphone permission denied. Please allow access and try again.'
          : msg,
      );
      setState('idle');
    }
  }, [supported, clearTimer]);

  /** Stops and returns the recorded Blob (null if nothing was recording). */
  const stop = useCallback(async () => {
    clearTimer();
    if (recorderRef.current) {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      return blob;
    }
    return null;
  }, [clearTimer]);

  /** Stops and discards the recording. */
  const cancel = useCallback(() => {
    clearTimer();
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
    }
    setDuration(0);
    setState('idle');
  }, [clearTimer]);

  /** Clears error/duration before a new attempt. */
  const reset = useCallback(() => {
    setError(null);
    setDuration(0);
    setState('idle');
  }, []);

  // Unmount cleanup: stop the timer and release the mic if still recording
  // (e.g. the user switches step or leaves the editor mid-recording).
  useEffect(() => {
    return () => {
      clearTimer();
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
    };
  }, [clearTimer]);

  return { supported, state, duration, error, start, stop, cancel, reset };
}

// Re-exported for convenience so the panel can import both from one place.
export { formatDuration };
