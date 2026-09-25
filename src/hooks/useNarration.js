/**
 * @file useNarration — plays a step's narration: recorded voice, else TTS.
 *
 * WHY THIS HOOK EXISTS
 *   The player's animation state machine only needs to say "narrate this step
 *   and tell me when you're done". All the fiddly audio details live here:
 *     - choosing recorded audio vs text-to-speech,
 *     - pause / resume / stop,
 *     - progress for the "0:04 / 0:12" display,
 *     - releasing audio on unmount.
 *
 * WHY THE `token` GUARD
 *   Stopping narration can itself fire callbacks: Chrome fires the TTS
 *   utterance's `onerror` ("interrupted") on cancel, and an old <audio> could
 *   still end. Every start() gets a new token and a callback only runs if its
 *   token is still current, so a stopped narration can never advance the
 *   walkthrough by mistake.
 *
 * WHY THE TTS SAFETY TIMER
 *   Some browsers never fire the utterance's `onend` (Chrome silently cuts off
 *   long utterances; some systems have no voices at all). Without a fallback the
 *   walkthrough would freeze on that step. If speech hasn't finished after a
 *   generous estimate of its length, we treat it as finished. The timer is
 *   cleared on pause and restarted on resume, so it never skips ahead while paused.
 *
 * Used by: components/walkthrough/WalkthroughPlayer.js
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createHinglishTTS, isTTSSupported } from '@/services/audio/tts';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/** Generous upper bound for how long TTS takes to read `text` (ms). */
function estimateSpeechMs(text) {
  return 3000 + text.length * 110;
}

/** True if this step has anything to say (and the browser can say it). */
export function hasNarration(step) {
  if (!step) return false;
  return !!step.audioData || (!!step.text?.trim() && isTTSSupported());
}

/**
 * @returns {{
 *   mode: 'recorded' | 'tts' | 'none',
 *   progress: { current: number, duration: number },   // seconds, recorded audio only
 *   start: (step: WalkthroughStep, handlers: { onEnd: () => void, onBlocked?: () => void }) => void,
 *   pause: () => void,
 *   resume: () => void,
 *   stop: () => void,
 * }}
 */
export function useNarration() {
  const [mode, setMode] = useState('none');
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const audioRef = useRef(null);
  // One TTS controller for the lifetime of the component.
  const ttsRef = useRef(null);
  if (!ttsRef.current) ttsRef.current = createHinglishTTS();
  const tokenRef = useRef(0);
  // TTS safety timer + what it needs to be restarted after a pause.
  const ttsTimerRef = useRef(null);
  const ttsFallbackRef = useRef(null); // { finish, ms } while TTS is active

  const clearTtsTimer = useCallback(() => {
    clearTimeout(ttsTimerRef.current);
    ttsTimerRef.current = null;
  }, []);

  const armTtsTimer = useCallback(() => {
    clearTtsTimer();
    const fallback = ttsFallbackRef.current;
    if (fallback) ttsTimerRef.current = setTimeout(fallback.finish, fallback.ms);
  }, [clearTtsTimer]);

  const stop = useCallback(() => {
    tokenRef.current += 1; // invalidate callbacks of whatever was playing
    clearTtsTimer();
    ttsFallbackRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = ''; // release the data URL
      audioRef.current = null;
    }
    ttsRef.current.cancel();
    setMode('none');
    setProgress({ current: 0, duration: 0 });
  }, [clearTtsTimer]);

  const start = useCallback(
    (step, { onEnd, onBlocked }) => {
      stop();
      const token = tokenRef.current;
      let finished = false;
      const finish = () => {
        if (finished || tokenRef.current !== token) return; // once, and only if still current
        finished = true;
        clearTtsTimer();
        ttsFallbackRef.current = null;
        onEnd();
      };

      // 1. Recorded voice has priority.
      if (step.audioData) {
        setMode('recorded');
        const audio = new Audio(step.audioData);
        audioRef.current = audio;
        audio.onloadedmetadata = () =>
          setProgress((p) => ({
            ...p,
            duration: Number.isFinite(audio.duration) ? audio.duration : 0,
          }));
        audio.ontimeupdate = () => setProgress((p) => ({ ...p, current: audio.currentTime }));
        audio.onended = finish;
        audio.onerror = finish; // a broken recording must not freeze the walkthrough
        // Autoplay policy can reject play() until the user has interacted.
        audio.play().catch(() => {
          if (tokenRef.current === token) onBlocked?.();
        });
        return;
      }

      // 2. Text-to-speech fallback.
      if (step.text?.trim() && isTTSSupported()) {
        setMode('tts');
        ttsFallbackRef.current = { finish, ms: estimateSpeechMs(step.text) };
        armTtsTimer();
        ttsRef.current.speak(step.text, finish);
        return;
      }

      // 3. Nothing to say.
      finish();
    },
    [stop, clearTtsTimer, armTtsTimer],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    ttsRef.current.pause();
    clearTtsTimer();
  }, [clearTtsTimer]);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
    ttsRef.current.resume();
    armTtsTimer();
  }, [armTtsTimer]);

  // Silence everything when the player unmounts.
  useEffect(() => stop, [stop]);

  return { mode, progress, start, pause, resume, stop };
}
