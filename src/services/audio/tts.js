/**
 * @file Text-to-speech ("AI voice") for steps without a recorded voice.
 *
 * WHEN IT IS USED: in the player, a step with NO recording but WITH text.
 *   Voice priority per step:  recorded audio  >  TTS of step.text  >  silence
 *
 * SOUNDING HUMAN (not robotic)
 *   Browsers ship very different voices. The "natural" / neural ones sound
 *   close to a person — e.g. Edge's "Microsoft Neerja Online (Natural) –
 *   English (India)", Chrome's "Google हिन्दी" / "Google UK English Female",
 *   Safari's "Premium" / "Enhanced" voices. We score every installed voice and
 *   pick the most natural Indian-English (then Hindi, then English) one, unless
 *   the user chose a voice in Settings (hooks → settings.getVoiceSettings).
 *
 *   Text is spoken SENTENCE BY SENTENCE: natural pauses between sentences, and
 *   no silent cut-off (Chrome stops long single utterances after ~15 s).
 *
 * GOTCHA: voices load asynchronously; getVoices() can be [] at first. We
 * refresh on the `voiceschanged` event.
 */

import { getVoiceSettings } from '@/services/storage/settings';

/** @typedef {'idle' | 'speaking' | 'paused'} TTSState */

export function isTTSSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Higher = more natural / better match for Hinglish narration. */
export function scoreVoice(voice) {
  const name = `${voice.name} ${voice.voiceURI}`;
  let score = 0;
  if (/natural|neural/i.test(name)) score += 60;
  if (/online/i.test(name)) score += 15;
  if (/premium|enhanced/i.test(name)) score += 40;
  if (/google/i.test(name)) score += 30;
  if (/compact|espeak|robot/i.test(name)) score -= 40;
  const lang = voice.lang.toLowerCase();
  if (lang === 'en-in') score += 35;
  else if (lang.startsWith('hi')) score += 28;
  else if (lang === 'en-gb' || lang === 'en-us' || lang === 'en-au') score += 12;
  else if (lang.startsWith('en')) score += 8;
  else score -= 50;
  if (voice.localService === false) score += 5; // cloud voices are usually the neural ones
  return score;
}

/** Installed voices, most natural first. */
export function listVoices() {
  if (!isTTSSupported()) return [];
  return [...window.speechSynthesis.getVoices()].sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

/** A voice counts as "natural" (shown under Recommended in Settings). */
export function isNaturalVoice(voice) {
  return /natural|neural|premium|enhanced|google/i.test(`${voice.name} ${voice.voiceURI}`);
}

/** The voice to use: the saved choice if still installed, else the best one. */
/**
 * The DEFAULT voice: the most natural Indian-English (then Hindi, then
 * English) voice this browser has — used whenever no voice was saved.
 */
export function getDefaultVoice() {
  return listVoices()[0] ?? null;
}

/** The saved voice, or `voiceURI` when given (a preview), else the default. */
function pickVoice(voiceURI = getVoiceSettings().voiceURI) {
  const voices = listVoices();
  if (!voices.length) return null;
  return (voiceURI && voices.find((v) => v.voiceURI === voiceURI)) || voices[0];
}

/** Calls `callback` whenever the browser's voice list changes. Returns unsubscribe. */
export function onVoicesChanged(callback) {
  if (!isTTSSupported()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener?.('voiceschanged', callback);
  return () => synth.removeEventListener?.('voiceschanged', callback);
}

/**
 * Splits text into speakable chunks: sentences (., !, ?, Hindi danda ।, new
 * lines), and very long sentences at commas — keeps pauses natural and avoids
 * browser cut-offs.
 */
export function splitIntoSentences(text) {
  const MAX_CHUNK = 180;
  const sentences = (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK) {
      chunks.push(sentence);
      continue;
    }
    let current = '';
    for (const part of sentence.split(/(?<=,)\s+/)) {
      if ((current + ' ' + part).trim().length > MAX_CHUNK && current) {
        chunks.push(current.trim());
        current = part;
      } else {
        current = `${current} ${part}`;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
}

/**
 * Creates a small controller around the global speechSynthesis queue.
 * Note: speechSynthesis is global, so speak() cancels anything already speaking.
 */
export function createHinglishTTS() {
  const supported = isTTSSupported();
  let state = 'idle';
  let session = 0; // bumps on every speak()/cancel() so stale callbacks are ignored

  /**
   * Speaks text; `onEnd` fires once when everything was read OR on error, so
   * callers can always rely on it to continue (e.g. to the next step).
   * @param {string} text
   * @param {() => void} [onEnd]
   * @param {{ voiceURI?: string | null, rate?: number }} [override]  preview an unsaved choice
   */
  function speak(text, onEnd, override) {
    const chunks = splitIntoSentences(text);
    if (!supported || chunks.length === 0) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const mySession = ++session;
    const voice = override ? pickVoice(override.voiceURI ?? null) : pickVoice();
    const rate = override?.rate ?? getVoiceSettings().rate;
    let finished = false;
    const done = () => {
      if (finished || mySession !== session) return;
      finished = true;
      state = 'idle';
      onEnd?.();
    };

    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'en-IN';
      }
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => {
        if (mySession === session) state = 'speaking';
      };
      if (i === chunks.length - 1) utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });
  }

  function cancel() {
    if (!supported) return;
    session += 1;
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

  return { speak, cancel, pause, resume, isSupported: supported, getState: () => state };
}

/** One-off preview ("Listen" buttons, voice picker). Cancels anything playing. */
const previewPlayer = createHinglishTTS();
/**
 * @param {string} text
 * @param {() => void} [onEnd]
 * @param {{ voiceURI?: string | null, rate?: number }} [override]  e.g. an unsaved choice in Settings
 */
export function previewSpeech(text, onEnd, override) {
  previewPlayer.speak(text, onEnd, override);
}
export function stopPreviewSpeech() {
  previewPlayer.cancel();
}
