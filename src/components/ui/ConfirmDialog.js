/**
 * @file Generic "Are you sure?" modal, used before destructive actions
 * (delete course in the library, delete step in the editor).
 *
 * Controlled component: the parent owns `open` and decides what confirm/cancel do.
 * Closes on Escape, backdrop click, or the X button (all call onCancel).
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 *   danger?: boolean,   // red confirm button for destructive actions
 * }} props
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) {
  // Escape-to-close. The listener only exists while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative bg-panel dark:bg-panel-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark p-6 w-full max-w-md"
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="confirm-title" className="text-lg font-bold text-ink dark:text-ink-soft-dark">
            {title}
          </h2>
          <button
            onClick={onCancel}
            className="text-ink-faint hover:text-ink dark:text-ink-faint-dark dark:hover:text-ink-soft-dark transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-ink-soft dark:text-ink-soft-dark text-sm leading-relaxed mb-6">
          {message}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper dark:hover:bg-paper-dark transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              danger ? 'bg-danger hover:bg-danger-dark' : 'bg-accent hover:bg-accent-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
