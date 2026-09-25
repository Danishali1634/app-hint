/**
 * @file Theme preference, stored in LocalStorage.
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

import { LS_THEME } from '@/constants';

/** Used when LocalStorage is unavailable (blocked third-party iframe, privacy mode). */
let memoryTheme = null;

function readStored() {
  try {
    return window.localStorage.getItem(LS_THEME);
  } catch {
    return memoryTheme;
  }
}

function writeStored(theme) {
  memoryTheme = theme;
  try {
    window.localStorage.setItem(LS_THEME, theme);
  } catch {
    // Storage blocked — keep the in-memory value only.
  }
}

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
