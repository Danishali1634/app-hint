/**
 * @file useNarration — plays a step's narration: recorded voice, else TTS.
 *
 * WHY THIS HOOK EXISTS
 *   The player's animation state machine only needs to say "narrate this step
 *   and tell me when you're done". All the fiddly audio details live here:
 *     - choosing recorded audio vs text-to-speech,
 *     - pause / resume / stop,
 *     - progress for the "0:04 / 0:12" display,
 *     - Mobile view only (`captionParts: true`): which CAPTION PART is being
 *       spoken (utils/captionParts) — a long description is shown part by
 *       part, each while the voice says it. Web view speaks the whole text.
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
import { AI_VOICE_WAIT_MS, canSpeakText, createHinglishTTS } from '@/services/audio/tts';
import { isAiVoiceSupported, prefetchAiVoice } from '@/services/audio/neuralVoice';
import { partAt, partAtOffset, recordingPartStarts, splitCaptionParts } from '@/utils/captionParts';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/** Generous upper bound for how long TTS takes to read `text` (ms). */
function estimateSpeechMs(text) {
  return 3000 + text.length * 110;
}

/**
 * The part of `text` still to be spoken `offsetMs` into it: from the start of
 * the sentence playing at that moment (timing estimate as in Timeline.speakingMs).
 */
function textFromOffset(text, offsetMs) {
  const trimmed = text.trim();
  const fraction = Math.min(1, Math.max(0, (offsetMs - 600) / (trimmed.length * 65)));
  const target = fraction * trimmed.length;
  const sentences = trimmed.match(/[^.!?।]+[.!?।]*\s*/g) || [trimmed];
  let pos = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (pos + sentences[i].length > target) return sentences.slice(i).join('').trim();
    pos += sentences[i].length;
  }
  return sentences[sentences.length - 1].trim();
}

/** Wait this long after the texts stop changing (e.g. while typing in the editor). */
const PREFETCH_DELAY_MS = 1200;

/**
 * Prepares the AI voice for every text step in the background, so narration
 * starts immediately (and the video later reuses the same audio).
 * @param {WalkthroughStep[]} steps
 */
export function useAiVoicePrefetch(steps, { captionParts = false } = {}) {
  // Mobile view speaks one clip per caption part; Web view one clip per text.
  const texts = steps
    .filter((s) => !s.audioData && s.text?.trim())
    .flatMap((s) => (captionParts ? splitCaptionParts(s.text) : [s.text]));
  const key = texts.join('\u0000');
  // The first time: at once — the voice engine starts cold (a few seconds) and
  // the first step speaks within seconds of ▶. Later changes (typing in the
  // editor) wait for a pause.
  const started = useRef(false);
  useEffect(() => {
    if (!key || !isAiVoiceSupported()) return;
    let cancel = () => {};
    const delay = started.current ? PREFETCH_DELAY_MS : 0;
    started.current = true;
    const timer = setTimeout(() => {
      cancel = prefetchAiVoice(key.split('\u0000'));
    }, delay);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [key]);
}

/** True if this step has anything to say (and the browser can say it). */
export function hasNarration(step) {
  if (!step) return false;
  return !!step.audioData || (!!step.text?.trim() && canSpeakText());
}

/**
 * @returns {{
 *   mode: 'recorded' | 'tts' | 'none',
 *   progress: { current: number, duration: number },   // seconds, recorded audio only
 *   part: number,                                       // caption part being spoken
 *   start: (step: WalkthroughStep, handlers: { onEnd: () => void, onBlocked?: () => void }) => void,
 *   pause: () => void,
 *   resume: () => void,
 *   stop: () => void,
 * }}
 */
export function useNarration() {
  const [mode, setMode] = useState('none');
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [part, setPart] = useState(0);
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
    setPart(0);
  }, [clearTtsTimer]);

  const start = useCallback(
    (step, { onEnd, onBlocked, offsetMs = 0, captionParts = false }) => {
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

      // Mobile view: the caption parts (Web view: none, the whole text is one card).
      const parts = captionParts ? splitCaptionParts(step.text) : [];
      const isCurrent = () => tokenRef.current === token;

      /** Text-to-speech (also used when a recording can't be played here). */
      const speakText = () => {
        setMode('tts');
        if (!captionParts) {
          // Timeline seek: speech can't start mid-word, so start from the sentence
          // that would be playing at that moment.
          const text = offsetMs > 0 ? textFromOffset(step.text, offsetMs) : step.text;
          // + the time the AI voice may need to get ready (it falls back to the
          // browser voice after AI_VOICE_WAIT_MS).
          ttsFallbackRef.current = { finish, ms: AI_VOICE_WAIT_MS + estimateSpeechMs(text) };
          armTtsTimer();
          ttsRef.current.speak(text, finish);
          return;
        }
        // Mobile: start from the caption part that would be playing at that moment.
        const first = offsetMs > 0 ? partAtOffset(parts, offsetMs) : 0;
        const rest = parts.slice(first);
        setPart(first);
        // + the time the AI voice may need to get ready (it falls back to the
        // browser voice after AI_VOICE_WAIT_MS).
        ttsFallbackRef.current = {
          finish,
          ms: AI_VOICE_WAIT_MS + estimateSpeechMs(rest.join(' ')) + rest.length * 1000,
        };
        armTtsTimer();
        ttsRef.current.speak(rest, finish, undefined, (k) => isCurrent() && setPart(first + k));
      };
      const canSpeak = !!step.text?.trim() && canSpeakText();

      // 1. Recorded voice has priority.
      if (step.audioData) {
        setMode('recorded');
        const audio = new Audio(step.audioData);
        audioRef.current = audio;
        // Timeline seek into the middle of the recording.
        if (offsetMs > 0) audio.currentTime = offsetMs / 1000;
        // Caption parts: switch points estimated from the text (share of the
        // recording's length) until the recording is decoded, then moved to
        // its real pauses.
        let partStarts = null;
        const estimateStarts = () => {
          const total = parts.reduce((sum, p) => sum + p.length, 0) || 1;
          let before = 0;
          partStarts = parts.map((p) => {
            const at = (before / total) * audio.duration;
            before += p.length;
            return at;
          });
        };
        if (parts.length > 1) {
          fetch(step.audioData)
            .then((r) => r.arrayBuffer())
            .then((bytes) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes))
            .then((buffer) => {
              if (!isCurrent()) return;
              partStarts = recordingPartStarts(buffer.getChannelData(0), buffer.sampleRate, parts);
              setPart(partAt(partStarts, audio.currentTime));
            })
            .catch(() => {}); // keep the estimate
        }
        audio.onloadedmetadata = () => {
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
          setProgress((p) => ({ ...p, duration }));
          if (parts.length > 1 && !partStarts && duration) estimateStarts();
        };
        audio.ontimeupdate = () => {
          setProgress((p) => ({ ...p, current: audio.currentTime }));
          if (partStarts) setPart(partAt(partStarts, audio.currentTime));
        };
        audio.onended = finish;
        // A recording this browser can't decode (or a broken one) must not
        // freeze the walkthrough: read the text with the AI voice instead,
        // or move on when there is no text.
        let failedOver = false;
        const recordingFailed = () => {
          if (failedOver || finished || tokenRef.current !== token) return;
          failedOver = true;
          audio.onended = audio.onerror = audio.ontimeupdate = null;
          audio.pause();
          if (audioRef.current === audio) audioRef.current = null;
          if (canSpeak) speakText();
          else finish();
        };
        audio.onerror = recordingFailed;
        audio.play().catch((err) => {
          if (tokenRef.current !== token) return;
          // Autoplay policy can reject play() until the user has interacted.
          if (err?.name === 'NotAllowedError') onBlocked?.();
          else if (err?.name !== 'AbortError') recordingFailed();
        });
        return;
      }

      // 2. Text-to-speech fallback.
      if (canSpeak) {
        speakText();
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

  return { mode, progress, part, start, pause, resume, stop };
}
