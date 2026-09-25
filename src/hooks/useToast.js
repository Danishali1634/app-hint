/**
 * @file App-wide toast notifications ("Course saved", "Export failed", ...).
 *
 * WHY CONTEXT: any page or component can call notify() without prop drilling,
 * and a single <ToastContainer /> (mounted in AppRouter) renders all toasts.
 *
 * FLOW
 *   notify(msg, type) → toast added to list → ToastContainer renders it
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
     */
    (message, type = 'info') => {
      const id = nextId('toast');
      setToasts((prev) => [...prev, { id, message, type }].slice(-MAX_VISIBLE_TOASTS));
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
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
 *   notify: (message: string, type?: ToastMessage['type']) => void,
 *   dismiss: (id: string) => void,
 * }}
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
