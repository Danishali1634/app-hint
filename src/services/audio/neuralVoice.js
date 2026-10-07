/**
 * @file The AI voice: Piper neural text-to-speech running INSIDE the page.
 *
 * ONE VOICE EVERYWHERE: the live player, the ▶ previews (Settings, step text)
 * and the downloaded video all speak text with THIS voice, from the SAME audio
 * (aiVoiceWav), so the video sounds exactly like the walkthrough. (The
 * browser's own speechSynthesis plays outside the page and can never be
 * recorded into a video — it is now only the fallback when the AI voice
 * can't load, e.g. offline on first use; see tts.js.)
 *
 * WHICH VOICE: the one chosen in Settings (AI_VOICES; settings.aiVoiceId), at
 * the chosen speed. The speed is applied WITHOUT changing the pitch
 * (timeStretch.js), baked into the audio itself, so player and video match.
 *
 * NEVER BLOCKS THE PAGE: speech is generated in a Web Worker
 * (neuralVoice.worker.js), one text at a time; the page only falls back to the
 * main thread if workers can't load.
 *
 * FIRST USE of a voice downloads its model once (~60 MB, from Hugging Face; the
 * speech engine from a CDN) and keeps it in the browser's private storage
 * (OPFS). Spoken texts are cached in IndexedDB, so each text is generated once
 * — the video reuses what the player already spoke. Only the model is
 * downloaded — the step text never leaves the browser.
 *
 * HINDI VOICES (lang 'hi'): Roman-script Hinglish is converted to Devanagari
 * first (services/text/hinglish), because they pronounce Devanagari; unfamiliar
 * words are looked up online once and saved, unless Settings turned that off. Their
 * models come from the upstream Piper repo (extraVoices.js). Their training
 * data licences are NON-COMMERCIAL — fine for trying out, not for a paid product.
 */

import { getMedia, putMedia } from '@/services/storage/db';
import { getVoiceSettings } from '@/services/storage/settings';
import { shapeForHindiSpeech, toDevanagariAsync } from '@/services/text/hinglish';
import { matchSpeakerGender } from '@/services/text/speakerGender';
import { languageForVoice } from '@/services/text/demoLines';
import { registerExtraVoices } from './extraVoices';
import { timeStretch } from './timeStretch';

/** The default AI voice: clear, natural English; reads Hinglish (Latin script) well enough. */
export const VIDEO_VOICE_ID = 'en_US-hfc_female-medium';

/**
 * The AI voices offered in Settings (Piper voice ids). The user picks one; a
 * Hindi voice is never switched to automatically.
 *   lang     'en' reads text as written; 'hi' converts Hinglish to Devanagari first
 *   gender   the narrator's: first-person Hindi forms are matched to it
 *            ("main karunga" → "karungi" for a female voice; services/text/speakerGender).
 *            Hindi genders were checked by measured pitch (Pratham ~103 Hz,
 *            Priyamvada ~198 Hz) and Rohan's dataset ("Hindi Mono Male").
 *   licence  shown in Settings when the voice can't be used in a paid product
 */
export const AI_VOICES = [
  {
    id: VIDEO_VOICE_ID,
    name: 'Hannah',
    description: 'American English · female',
    lang: 'en',
    gender: 'female',
  },
  {
    id: 'en_US-lessac-medium',
    name: 'Lily',
    description: 'American English · female, warm',
    lang: 'en',
    gender: 'female',
  },
  {
    id: 'en_US-hfc_male-medium',
    name: 'Henry',
    description: 'American English · male',
    lang: 'en',
    gender: 'male',
  },
  {
    id: 'en_US-ryan-medium',
    name: 'Ryan',
    description: 'American English · male, deep',
    lang: 'en',
    gender: 'male',
  },
  {
    id: 'en_GB-jenny_dioco-medium',
    name: 'Jenny',
    description: 'British English · female',
    lang: 'en',
    gender: 'female',
  },
  {
    id: 'en_GB-alan-medium',
    name: 'Alan',
    description: 'British English · male',
    lang: 'en',
    gender: 'male',
  },
  {
    id: 'hi_IN-rohan-medium',
    name: 'Rohan',
    description: 'Hindi · male · reads Hinglish',
    lang: 'hi',
    gender: 'male',
    licence: 'IIT Madras IndicTTS data licence',
  },
  {
    id: 'hi_IN-pratham-medium',
    name: 'Pratham',
    description: 'Hindi · male · reads Hinglish',
    lang: 'hi',
    gender: 'male',
    licence: 'CC BY-NC-SA 4.0, non-commercial',
  },
  {
    id: 'hi_IN-priyamvada-medium',
    name: 'Priyamvada',
    description: 'Hindi · female · reads Hinglish',
    lang: 'hi',
    gender: 'female',
    licence: 'CC BY-NC-SA 4.0, non-commercial',
  },
];

/** The narrator's gender for a voice id (default: the voice in Settings), or null. */
export function aiVoiceGender(voiceId = aiVoiceFromSettings().voiceId) {
  return AI_VOICES.find((v) => v.id === voiceId)?.gender ?? null;
}

/** True for voices that read Devanagari (Hinglish is converted for them). */
export function isHindiVoice(voiceId) {
  return AI_VOICES.some((v) => v.id === voiceId && v.lang === 'hi');
}

/** True if this browser can run the AI voice (WebAssembly + audio). */
export function isAiVoiceSupported() {
  return (
    typeof WebAssembly === 'object' && typeof Blob !== 'undefined' && typeof Audio !== 'undefined'
  );
}

/**
 * The AI voice + speed from Settings.
 * @returns {{ voiceId: string, rate: number }}
 */
/**
 * The language the narrator explains in: English for an English voice; for a
 * Hindi voice, Hinglish or हिंदी as chosen (services/text/demoLines).
 * @returns {'en' | 'hinglish' | 'hindi'}
 */
export function narrationLanguage(voiceId = aiVoiceFromSettings().voiceId) {
  return languageForVoice(isHindiVoice(voiceId) ? 'hi' : 'en', getVoiceSettings().language);
}

export function aiVoiceFromSettings() {
  const { aiVoiceId, rate, hinglishLookup } = getVoiceSettings();
  const known = AI_VOICES.some((v) => v.id === aiVoiceId);
  return { voiceId: known ? aiVoiceId : VIDEO_VOICE_ID, rate, hinglishLookup };
}

// ─── Generating speech (Web Worker, one text at a time) ─────────────────────

/** A request gives up after this long without any sign of life from the worker. */
const WORKER_SILENCE_MS = 90_000;

let worker = null;
let workerBroken = typeof Worker === 'undefined';
let queue = Promise.resolve();
let nextId = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./neuralVoice.worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

function dropWorker() {
  worker?.terminate();
  worker = null;
}

/** One request to the worker. Rejects with `{ workerFailed: true }` if the worker itself broke. */
function askWorker(text, voiceId, onDownload) {
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = getWorker();
    } catch {
      reject({ workerFailed: true });
      return;
    }
    const id = ++nextId;
    let watchdog;
    const cleanup = () => {
      clearTimeout(watchdog);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const alive = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        cleanup();
        dropWorker();
        reject(new Error('The AI voice took too long'));
      }, WORKER_SILENCE_MS);
    };
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      alive();
      if (data.progress != null) onDownload?.(data.progress);
      if (data.blob) {
        cleanup();
        resolve(data.blob);
      } else if (data.error) {
        cleanup();
        reject(new Error(data.error));
      }
    };
    const onError = (event) => {
      event.preventDefault?.();
      cleanup();
      dropWorker();
      reject({ workerFailed: true });
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    alive();
    w.postMessage({ id, text, voiceId });
  });
}

/** Same as the worker, on the page itself (only if workers can't load). */
async function predictHere(text, voiceId, onDownload) {
  const tts = await import('@diffusionstudio/vits-web');
  registerExtraVoices(tts);
  return tts.predict({ text, voiceId }, (progress) => {
    if (progress.total) onDownload?.(progress.loaded / progress.total);
  });
}

/**
 * Speaks `text` and returns the raw audio (the voice's normal speed).
 * @param {string} text
 * @param {string} [voiceId]  Piper voice id (AI_VOICES)
 * @param {(fraction: number) => void} [onDownload]  model download progress 0–1 (first use only)
 * @returns {Promise<Blob>} audio/wav
 */
export function synthesizeSpeech(text, voiceId = VIDEO_VOICE_ID, onDownload) {
  const run = async () => {
    if (!workerBroken) {
      try {
        return await askWorker(text, voiceId, onDownload);
      } catch (err) {
        if (!err?.workerFailed) throw err;
        workerBroken = true;
        console.warn('AI voice worker unavailable, generating speech on the page instead');
      }
    }
    return predictHere(text, voiceId, onDownload);
  };
  // One at a time: each request loads a large model.
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

// ─── WAV in / out (Piper writes 16-bit PCM mono) ─────────────────────────────

/** @returns {{ samples: Float32Array, sampleRate: number } | null} */
function readWav(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || view.getUint32(0, false) !== 0x52494646) return null; // "RIFF"
  let offset = 12;
  let format = null;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 0x666d7420) {
      // "fmt "
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 0x64617461 && format) {
      // "data"
      if (format.code !== 1 || format.bits !== 16 || format.channels !== 1) return null;
      const count = Math.floor(Math.min(size, view.byteLength - body) / 2);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true) / 32768;
      return { samples, sampleRate: format.sampleRate };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Silence before every clip (seconds) — see aiVoiceWav. */
const LEAD_IN_SEC = 0.25;

function withLeadIn(samples, sampleRate) {
  const out = new Float32Array(Math.round(LEAD_IN_SEC * sampleRate) + samples.length);
  out.set(samples, out.length - samples.length);
  return out;
}

function writeWav(samples, sampleRate) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

// ─── The voice for a text (cached) ───────────────────────────────────────────

/** Short stable key for a text + voice (FNV-1a), for the spoken-text cache. */
function textKey(text, voiceId) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `tts-${voiceId}-${(hash >>> 0).toString(36)}-${text.length}`;
}

/** Raw spoken audio: from the IndexedDB cache, or generated once and cached. */
async function rawSpeech(text, voiceId, onDownload) {
  const key = textKey(text, voiceId);
  try {
    const cached = await getMedia(key);
    if (cached) return cached;
  } catch {
    // cache unavailable: just generate
  }
  const wav = await synthesizeSpeech(text, voiceId, onDownload);
  putMedia(key, wav).catch(() => {});
  return wav;
}

/** Finished audio per text + voice + speed (this page session). */
const finished = new Map();
const MAX_FINISHED = 200;

/**
 * The AI voice speaking `text` — THE audio used by the player, the previews
 * and the video (so they sound the same).
 * @param {string} text
 * @param {{ voiceId?: string, rate?: number, hinglishLookup?: boolean }} [voice]  default: Settings
 * @param {(fraction: number) => void} [onDownload]
 * @returns {Promise<Blob>} audio/wav at the chosen speed
 */
export function aiVoiceWav(text, voice = {}, onDownload) {
  const settings = aiVoiceFromSettings();
  const voiceId = voice.voiceId ?? settings.voiceId;
  const rate = voice.rate ?? settings.rate;
  const lookup = voice.hinglishLookup ?? settings.hinglishLookup;
  // "main karunga" → "karungi" for a female voice (captions get the same fix in share.js).
  const trimmed = matchSpeakerGender(text.trim(), aiVoiceGender(voiceId));
  const key = `${textKey(trimmed, voiceId)}@${rate}${lookup ? '' : ':local'}`;
  let result = finished.get(key);
  if (!result) {
    result = (async () => {
      // Hindi voices: Hinglish → Devanagari (the spoken-text cache is keyed by the result).
      // …then shaped for natural speech: pauses, "।", symbols as words (captions unchanged).
      const spoken = isHindiVoice(voiceId)
        ? shapeForHindiSpeech(await toDevanagariAsync(trimmed, { lookup }))
        : trimmed;
      const raw = await rawSpeech(spoken, voiceId, onDownload);
      const wav = readWav(await raw.arrayBuffer());
      if (!wav) return raw; // unknown format: as generated rather than nothing
      // A short silent lead-in: an audio device waking from silence (Bluetooth,
      // macOS power saving) swallows the first ~100–200 ms — that was the first
      // word of some steps. Added before the time-stretch so it can't clip speech.
      const padded = withLeadIn(wav.samples, wav.sampleRate);
      const samples =
        Math.abs(rate - 1) < 0.01 ? padded : timeStretch(padded, wav.sampleRate, rate);
      return writeWav(samples, wav.sampleRate);
    })();
    result.catch(() => finished.delete(key)); // failures are retried next time
    finished.set(key, result);
    if (finished.size > MAX_FINISHED) finished.delete(finished.keys().next().value);
  }
  return result;
}

const urls = new WeakMap();
/**
 * aiVoiceWav as a playable URL (for <audio>).
 * @returns {Promise<string>}
 */
export async function aiVoiceUrl(text, voice, onDownload) {
  const blob = await aiVoiceWav(text, voice, onDownload);
  let url = urls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(blob, url);
  }
  return url;
}

/**
 * Prepares the AI voice for these texts in the background, one after another
 * (the player calls this while it waits for ▶, so narration starts at once).
 * @param {string[]} texts
 * @returns {() => void} cancel (stops before the next text)
 */
export function prefetchAiVoice(texts) {
  let cancelled = false;
  (async () => {
    for (const text of texts) {
      if (cancelled) return;
      if (!text?.trim()) continue;
      try {
        await aiVoiceWav(text);
      } catch {
        return; // offline / unavailable: the player falls back on its own
      }
    }
  })();
  return () => {
    cancelled = true;
  };
}
