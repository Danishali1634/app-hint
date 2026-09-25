/**
 * @file Text-to-speech fallback ("AI Hinglish voice").
 *
 * WHEN IT IS USED: in the WalkthroughPlayer, a step with NO recorded audio but
 * WITH text is read aloud using this module.
 *   Voice priority per step:  recorded audio  >  TTS of step.text  >  silence
 *
 * WHY THE WEB SPEECH API (speechSynthesis)
 *   Built into browsers: free, offline, no API key, no backend. Voice quality
 *   and the available voices depend on the user's OS/browser.
 *
 * VOICE CHOICE: prefers an Indian-English voice (en-IN), then Hindi (hi-IN),
 * then any English voice, so Hinglish text sounds as natural as possible.
 *
 * GOTCHA: browsers load voices asynchronously; getVoices() can return [] on the
 * first call. We re-pick when the `voiceschanged` event fires.
 */

/** @typedef {'idle' | 'speaking' | 'paused'} TTSState */

export function isTTSSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Picking a voice means scanning the whole list, so the result is cached here.
let cachedVoice = null;

/** Voice preference order: first match wins. */
const VOICE_PREFERENCES = [
  (v) => v.lang === 'en-IN',
  (v) => v.lang.startsWith('en-IN'),
  (v) => v.lang === 'hi-IN',
  (v) => v.lang.startsWith('en'),
];

/** @returns {SpeechSynthesisVoice | null} */
function pickHinglishVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // voices not loaded yet

  for (const matches of VOICE_PREFERENCES) {
    const voice = voices.find(matches);
    if (voice) {
      cachedVoice = voice;
      return voice;
    }
  }
  // Last resort: any voice (not cached, so a better one can be found later).
  return voices[0] || null;
}

// Voices arrive asynchronously; refresh the cached pick when they do.
if (isTTSSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickHinglishVoice();
  };
}

/**
 * Creates a small controller around the global speechSynthesis queue.
 * Note: speechSynthesis is global, so speak() cancels anything already speaking.
 */
export function createHinglishTTS() {
  const supported = isTTSSupported();
  let state = 'idle';

  /**
   * Speaks text; `onEnd` fires when finished OR on error, so callers can always
   * rely on it to continue (e.g. auto-advance to the next step).
   * @param {string} text
   * @param {() => void} [onEnd]
   */
  function speak(text, onEnd) {
    if (!supported || !text.trim()) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickHinglishVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-IN';
    }
    utterance.rate = 0.95; // slightly slower than default, easier to follow
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      state = 'speaking';
    };
    utterance.onend = () => {
      state = 'idle';
      onEnd?.();
    };
    utterance.onerror = () => {
      state = 'idle';
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  function cancel() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    state = 'idle';
  }

  function pause() {
    if (!supported) return;
    window.speechSynthesis.pause();
    state = 'paused';
  }

  function resume() {
    if (!supported) return;
    window.speechSynthesis.resume();
    state = 'speaking';
  }

  return { speak, cancel, pause, resume, isSupported: supported, state };
}
