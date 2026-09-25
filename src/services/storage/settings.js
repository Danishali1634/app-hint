/**
 * @file User preferences in LocalStorage: theme, TTS voice, optional AI key.
 *
 * WHY LOCALSTORAGE (not IndexedDB): it is a tiny string and LocalStorage is
 * synchronous, so the theme can be applied before the first render — no flash
 * of the wrong theme.
 *
 * FAIL-SAFE: when the app runs inside an <iframe> on another site (embeds),
 * browsers often BLOCK storage for third-party frames, and merely reading
 * `localStorage` throws a SecurityError. Every access therefore goes through
 * readStored/writeStored, which fall back to an in-memory value, so the
 * embed still works (theme = OS preference, choice just isn't saved).
 *
 * HOW DARK MODE WORKS: Tailwind is configured with `darkMode: 'class'`, so every
 * `dark:` utility activates when <html> has the "dark" class. applyTheme()
 * just toggles that class.
 *
 * Used by: hooks/useTheme.js (components should use the hook, not this file).
 */

import { LS_AI_KEY, LS_THEME, LS_VOICE } from '@/constants';

/** Used when LocalStorage is unavailable (blocked third-party iframe, privacy mode). */
const memory = {};

function readKey(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}

function writeKey(key, value) {
  memory[key] = value;
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked — keep the in-memory value only.
  }
}

const readStored = () => readKey(LS_THEME);
const writeStored = (theme) => writeKey(LS_THEME, theme);

/**
 * Saved theme, or the OS preference if the user never chose one.
 * @returns {'light' | 'dark'}
 */
export function getTheme() {
  const stored = readStored();
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Persists the theme (when possible) and applies it to the page. */
export function setTheme(theme) {
  writeStored(theme);
  applyTheme(theme);
}

/** Adds/removes the "dark" class on <html> (does not persist). */
export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * Flips the saved theme and returns the new value.
 * @returns {'light' | 'dark'}
 */
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// ─── Text-to-speech voice ────────────────────────────────────────────────────

/** @typedef {{ voiceURI: string | null, rate: number }} VoiceSettings */

/** @returns {VoiceSettings} voiceURI null = pick the best voice automatically */
export function getVoiceSettings() {
  try {
    const saved = JSON.parse(readKey(LS_VOICE) || '{}');
    return {
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : null,
      rate: typeof saved.rate === 'number' ? saved.rate : 1,
    };
  } catch {
    return { voiceURI: null, rate: 1 };
  }
}

/** @param {Partial<VoiceSettings>} patch */
export function setVoiceSettings(patch) {
  writeKey(LS_VOICE, JSON.stringify({ ...getVoiceSettings(), ...patch }));
}

// ─── Optional AI key ("Improve with AI") ─────────────────────────────────────
// The user's OWN Anthropic API key. The app has no server, so the key lives
// only in this browser and is sent only to api.anthropic.com.

export function getAiKey() {
  return readKey(LS_AI_KEY) || '';
}

export function setAiKey(key) {
  writeKey(LS_AI_KEY, key ? key.trim() : null);
}
