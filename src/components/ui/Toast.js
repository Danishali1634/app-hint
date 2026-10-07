/**
 * @file Toasts via react-toastify. <ToastContainer /> is mounted ONCE in AppRouter;
 * anywhere else just call the library directly:
 *
 *   import { toast } from 'react-toastify';
 *   toast.success('Saved');
 *   toast.error('Export failed', { position: 'bottom-right', autoClose: 8000 });
 *
 * The props below are the app-wide DEFAULTS; any single toast can override them.
 *
 * PLACEMENT: top-center, because the header's middle is empty, so toasts there
 * don't cover the editor's bottom "Mark done" bar, the canvas, or the player controls.
 */

import { ToastContainer as ToastifyContainer } from 'react-toastify';
import { useTheme } from '@/hooks/useTheme';

export function ToastContainer() {
  const { theme } = useTheme();

  return (
    <ToastifyContainer
      position="top-center"
      autoClose={4000}
      limit={3}
      newestOnTop
      closeOnClick={false}
      pauseOnHover
      theme={theme === 'dark' ? 'dark' : 'light'}
    />
  );
}

/**
 * Toast body with an "Undo" button, e.g.
 *   toast.info(({ closeToast }) => <UndoToast message="Deleted" onUndo={restore} closeToast={closeToast} />)
 */
export function UndoToast({ message, onUndo, closeToast }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1">{message}</span>
      <button
        onClick={() => {
          onUndo();
          closeToast();
        }}
        className="px-2.5 h-7 rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/15 dark:hover:bg-white/25 text-sm font-semibold flex-shrink-0 transition-colors"
      >
        Undo
      </button>
    </div>
  );
}
