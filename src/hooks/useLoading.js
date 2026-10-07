/**
 * @file Global "please wait" screen for API calls — usable from any component.
 *
 *   const { run, isLoading } = useLoading();
 *
 *   const result = await run((signal) => fetch(url, { signal }), 'Saving…');
 *   if (!result) return; // undefined = the user pressed Cancel
 *
 * WHILE A run() IS IN PROGRESS
 *   - a see-through layer covers the app → nothing can be clicked
 *   - the app is made `inert` → nothing can be reached with Tab / Enter either
 *   - a card shows the message and a Cancel button (Esc works too). It appears
 *     after a short delay, so quick calls don't make the screen flash.
 *   Several run() calls can overlap; the screen stays until all have finished.
 *
 * CANCEL
 *   run() stops waiting at once and returns undefined. Pass `signal` on to
 *   fetch / SDK calls so the request itself is stopped too. Calls that can't
 *   take a signal finish quietly and their result is ignored.
 *
 * ERRORS thrown by the task reach the caller unchanged (use try/catch as usual).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';

const LoadingContext = createContext(null);

export function LoadingProvider({ children }) {
  const running = useRef(new Set()); // { message, controller } for each call in progress
  const [message, setMessage] = useState(null); // null = nothing running
  const appRef = useRef(null);
  const isLoading = message !== null;

  /** Show the newest call's message, or hide the screen when none are left. */
  const refresh = useCallback(() => {
    const calls = [...running.current];
    setMessage(calls.length ? calls[calls.length - 1].message : null);
  }, []);

  const run = useCallback(async (task, message = 'Please wait…') => {
    const call = { message, controller: new AbortController() };
    running.current.add(call);
    refresh();
    try {
      return await waitUnlessCancelled(task, call.controller.signal);
    } catch (error) {
      if (call.controller.signal.aborted) return undefined; // cancelled → not an error
      throw error;
    } finally {
      running.current.delete(call);
      refresh();
    }
  }, [refresh]);

  const cancel = useCallback(() => {
    running.current.forEach((call) => call.controller.abort());
  }, []);

  // Lock the app (no clicks, no keyboard) while loading; Esc cancels.
  useEffect(() => {
    if (!isLoading) return;
    const app = appRef.current;
    app.inert = true;
    document.activeElement?.blur();

    const onKeyDown = (e) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      app.inert = false;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isLoading, cancel]);

  return (
    <LoadingContext.Provider value={{ run, cancel, isLoading }}>
      <div ref={appRef}>{children}</div>
      {isLoading && <LoadingOverlay message={message} onCancel={cancel} />}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingContext);
}

/** Runs the task, but gives up (rejects) as soon as `signal` is aborted. */
function waitUnlessCancelled(task, signal) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
    Promise.resolve()
      .then(() => task(signal))
      .then(resolve, reject);
  });
}

function LoadingOverlay({ message, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 cursor-wait"
      role="alertdialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={message}
    >
      {/* Fades in after a short delay → quick calls only block clicks, no flash. */}
      <div className="absolute inset-0 bg-paper/50 dark:bg-paper-dark/50 backdrop-blur-[2px] animate-fade-in-late" />
      <div className="relative flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-xl cursor-default animate-fade-in-late">
        <Spinner />
        <p className="text-sm font-medium text-ink dark:text-ink-soft-dark">{message}</p>
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className="px-4 h-9 rounded-lg border border-line dark:border-line-dark text-sm font-semibold text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
