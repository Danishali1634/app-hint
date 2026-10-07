/**
 * @file Modal that shows a generated share URL with a Copy button.
 * Used after publishing (CourseEditorPage) and as the clipboard fallback of useCourseSharing.
 * The URL itself is built by services/sharing/share.js.
 */

import { toast } from 'react-toastify';

/**
 * @param {{
 *   url: string,
 *   title: string,
 *   description: string,
 *   note: string,            // small print under the input (URL length warning)
 *   copiedMessage: string,   // toast text after copying
 *   onClose: () => void,
 * }} props
 */
export function ShareLinkModal({ url, title, description, note, copiedMessage, onClose }) {
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => toast.success(copiedMessage));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-panel dark:bg-panel-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark p-6 w-full max-w-lg">
        <h2 className="text-lg font-bold text-ink dark:text-ink-soft-dark mb-2">{title}</h2>
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark mb-4">{description}</p>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={url}
            readOnly
            className="flex-1 px-3 py-2 rounded-lg bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm text-ink-soft dark:text-ink-soft-dark font-mono"
            onClick={(e) => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            Copy
          </button>
        </div>

        <p className="text-xs text-ink-faint dark:text-ink-faint-dark">{note}</p>

        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
