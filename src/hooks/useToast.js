/**
 * @file App-wide toast notifications ("Course saved", "Export failed", ...).
 *
 * WHY CONTEXT: any page or component can call notify() without prop drilling,
 * and a single <ToastContainer /> (mounted in AppRouter) renders all toasts.
 *
 * FLOW
 *   notify(msg, type, { action }) → toast added to list → ToastContainer renders it
 *   (an optional `action: { label, onClick }` adds a button, e.g. "Undo")
 *                     → removed automatically after TOAST_DURATION_MS, or by dismiss(id)
 */

import { createContext, useCallback, useContext, useState } from 'react';
import { nextId } from '@/utils';

/** @typedef {import('@/types').ToastMessage} ToastMessage */

const TOAST_DURATION_MS = 4000;
/** Older toasts are dropped beyond this, so a burst of actions can't cover the page. */
const MAX_VISIBLE_TOASTS = 3;

const ToastContext = createContext(null);

/** Wrap the app once (see AppRouter). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // useCallback keeps these functions stable. Many components list `notify` in
  // their effect/callback dependencies; an unstable function would re-run them
  // on every toast.
  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    /**
     * @param {string} message
     * @param {ToastMessage['type']} [type='info']
     * @param {{ action?: { label: string, onClick: () => void } }} [options]
     */
    (message, type = 'info', options = {}) => {
      const id = nextId('toast');
      const { action } = options;
      setToasts((prev) => [...prev, { id, message, type, action }].slice(-MAX_VISIBLE_TOASTS));
      // A toast with a button stays a little longer, so there is time to press it.
      setTimeout(() => dismiss(id), action ? TOAST_DURATION_MS + 2000 : TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, notify, dismiss }}>{children}</ToastContext.Provider>
  );
}

/**
 * @returns {{
 *   toasts: ToastMessage[],
 *   notify: (message: string, type?: ToastMessage['type'], options?: { action?: { label: string, onClick: () => void } }) => void,
 *   dismiss: (id: string) => void,
 * }}
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
