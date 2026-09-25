/**
 * @file Light/dark theme as React context.
 *
 * WHY CONTEXT: the theme is read by ThemeToggle (in the header) but could be
 * needed anywhere. Context shares one value app-wide without passing props down
 * the tree.
 *
 * FLOW
 *   first render → getTheme() (LocalStorage, else OS preference) → applyTheme()
 *   toggle()     → toggleTheme() persists + applies → state updates → icon re-renders
 *
 * Persistence and the DOM class live in services/storage/settings.js; this hook
 * only adds React state on top.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getTheme, toggleTheme, applyTheme } from '@/services/storage/settings';

const ThemeContext = createContext(null);

/** Wrap the app once (see AppRouter). */
export function ThemeProvider({ children }) {
  // Lazy initializer: runs once and applies the class before the first paint,
  // so there is no flash of the wrong theme.
  const [theme, setTheme] = useState(() => {
    const initial = getTheme();
    applyTheme(initial);
    return initial;
  });

  // Keep the <html> class in sync with state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // toggleTheme() is called OUTSIDE the state updater on purpose: updaters must
  // be pure, and React StrictMode calls them twice in development.
  const toggle = useCallback(() => {
    setTheme(toggleTheme());
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

/**
 * @returns {{ theme: 'light' | 'dark', toggle: () => void }}
 * @throws if used outside <ThemeProvider> — fails loudly instead of silently returning null
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
