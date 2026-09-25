/**
 * @file Full-screen progress card shown while a walkthrough video is recorded.
 * Recording runs in real time, so the user must keep this tab visible; the
 * card says so. Driven by hooks/useCourseSharing.
 */

import { Film, X } from 'lucide-react';

/**
 * @param {{ title: string, stage?: 'prepare' | 'voice' | 'record', progress: number, onCancel: () => void }} props
 *   progress 0–1
 */
export function VideoExportOverlay({ title, stage = 'record', progress, onCancel }) {
  const percent = Math.round(progress * 100);
  const heading =
    stage === 'voice'
      ? 'Preparing the voice…'
      : stage === 'prepare'
        ? 'Getting ready…'
        : 'Creating your video…';
  const hint =
    stage === 'voice'
      ? 'The first video downloads the AI voice once'
      : 'Keep this tab open while it records';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="hs-caption-in relative w-full max-w-md rounded-3xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <Film className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink dark:text-ink-soft-dark">{heading}</h2>
            <p className="text-sm text-ink-soft dark:text-ink-soft-dark truncate">{title}</p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
            aria-label="Cancel video"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 h-2 rounded-full bg-paper-2 dark:bg-paper-2-dark overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-dark transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink-faint dark:text-ink-faint-dark">
          <span>{hint}</span>
          <span className="font-mono">{percent}%</span>
        </div>
      </div>
    </div>
  );
}
