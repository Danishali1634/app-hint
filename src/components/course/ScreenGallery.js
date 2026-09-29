/**
 * @file The course's SCREENSHOT GALLERY (modal): every screenshot uploaded to
 * this course, uploaded once and reusable anywhere.
 *
 *   click a screenshot → it is used for the current sub-step (or the new
 *                        Global Step) — no second upload, no second copy
 *   Upload             → adds one or many screenshots to the gallery
 *   Remove             → only for screenshots no step uses (the file is deleted)
 *
 * Each tile says where it is used ("Step 3.2 · 4.1"), so near-identical
 * screenshots of the same modal are easy to tell apart.
 */

import { useEffect } from 'react';
import { X, Upload, Trash2, Check, Images } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * @param {{
 *   screens: { id: string, url?: string, usedBy: string[] }[],  // usedBy: step names
 *   currentId: string | null,        // screenshot of the current sub-step (highlighted)
 *   targetLabel: string,             // e.g. "Step 3.2" — what picking applies to
 *   onPick: (id: string) => void,
 *   onUpload: (files: File[]) => void,
 *   onRemove: (id: string) => void,
 *   onClose: () => void,
 * }} props
 */
export function ScreenGallery({
  screens,
  currentId,
  targetLabel,
  onPick,
  onUpload,
  onRemove,
  onClose,
}) {
  useEffect(() => {
    const handleKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const pickFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => input.files?.length && onUpload([...input.files]);
    input.click();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Screenshot gallery"
        className="hs-caption-in relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-3xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line dark:border-line-dark">
          <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
            <Images className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-ink dark:text-white">Screenshots</h2>
            <p className="text-xs text-ink-soft dark:text-ink-faint-dark">
              Pick one for <strong>{targetLabel}</strong>
            </p>
          </div>
          <button
            onClick={pickFiles}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {screens.length === 0 ? (
            <button
              onClick={pickFiles}
              className="w-full py-16 rounded-2xl border-2 border-dashed border-line dark:border-line-dark text-sm text-ink-soft dark:text-ink-faint-dark hover:border-accent hover:text-accent transition-colors"
            >
              No screenshots yet — upload one or several
            </button>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {screens.map((screen, n) => {
                const isCurrent = screen.id === currentId;
                const unused = screen.usedBy.length === 0;
                return (
                  <li key={screen.id} className="group relative">
                    <Tooltip label={`Use for ${targetLabel}`} className="w-full">
                      <button
                        onClick={() => onPick(screen.id)}
                        className={`block w-full rounded-xl overflow-hidden border-2 transition-all bg-paper-2 dark:bg-paper-2-dark ${
                          isCurrent
                            ? 'border-accent ring-4 ring-accent/20'
                            : 'border-line dark:border-line-dark hover:border-accent/60'
                        }`}
                      >
                        <span className="block aspect-[16/10]">
                          {screen.url && (
                            <img
                              src={screen.url}
                              alt={`Screenshot ${n + 1}`}
                              className="w-full h-full object-cover object-top"
                              draggable={false}
                            />
                          )}
                        </span>
                        {isCurrent && (
                          <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent text-white text-[10px] font-bold">
                            <Check className="w-3 h-3" /> Current
                          </span>
                        )}
                      </button>
                    </Tooltip>
                    <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                      <span className="font-semibold text-ink dark:text-ink-soft-dark">
                        #{n + 1}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-ink-faint dark:text-ink-faint-dark">
                        {unused ? 'Not used yet' : `Used in ${screen.usedBy.join(' · ')}`}
                      </span>
                      {unused && (
                        <Tooltip label="Remove from the gallery">
                          <button
                            onClick={() => onRemove(screen.id)}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-danger hover:bg-danger/10"
                            aria-label={`Remove screenshot ${n + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
