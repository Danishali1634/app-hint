/**
 * @file Renders the toast stack, top-centre over the header.
 * Mounted ONCE in AppRouter; toasts are created anywhere via useToast().notify().
 *
 * PLACEMENT: the header's middle is empty, so toasts there don't cover the
 * editor's bottom "Mark done" bar, the canvas, or the player controls.
 * CLICK-THROUGH: toasts are `pointer-events-none` (only the × is clickable), so
 * a toast can never swallow a click or a drag meant for what's underneath.
 */

import { useToast } from '@/hooks/useToast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

/** Colours + icon per toast type. */
const TOAST_STYLES = {
  error: {
    className: 'bg-danger text-white border-danger-dark',
    Icon: AlertCircle,
  },
  success: {
    className: 'bg-teal text-white border-teal-dark',
    Icon: CheckCircle2,
  },
  info: {
    className:
      'bg-panel text-ink border-line dark:bg-panel-dark dark:text-ink-soft-dark dark:border-line-dark',
    Icon: Info,
  },
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 w-[min(28rem,calc(100%-2rem))] pointer-events-none">
      {toasts.map((toast) => {
        const { className, Icon } = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
        return (
          <div
            key={toast.id}
            role="alert"
            className={`flex items-start gap-3 rounded-2xl px-4 py-2.5 shadow-xl border animate-in slide-in-from-bottom-2 ${className}`}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-snug flex-1">{toast.message}</p>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action.onClick();
                  dismiss(toast.id);
                }}
                className="pointer-events-auto px-2.5 h-7 rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/15 dark:hover:bg-white/25 text-sm font-semibold flex-shrink-0 transition-colors"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              className="pointer-events-auto flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
