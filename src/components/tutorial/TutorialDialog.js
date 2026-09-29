/**
 * @file The app's tutorials in a dialog: lessons on the left, grouped by how
 * the course is made ("From screenshots" / "From a recording"), the chosen
 * lesson playing in the real player on the right, and "Next lesson →" under
 * it so a beginner can simply go through them in order.
 * Opened on a specific lesson by "Show me" / the coach's "Watch how", or on the
 * whole-thing lesson by the Help button. Esc or the backdrop closes it.
 */

import { useEffect, useState } from 'react';
import { X, PlayCircle, GraduationCap, ArrowRight } from 'lucide-react';
import {
  TUTORIAL_GROUPS,
  getEditorTutorial,
  listEditorTutorials,
} from '@/examples/editorTutorials';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { Tooltip } from '@/components/ui/Tooltip';

/** @param {{ initialId?: string, onClose: () => void }} props */
export function TutorialDialog({ initialId = 'start', onClose }) {
  const [id, setId] = useState(initialId);
  const tutorial = getEditorTutorial(id);
  const all = listEditorTutorials();
  const next = all[all.findIndex((t) => t.id === tutorial.id) + 1] ?? null;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorials"
    >
      <div
        className="w-full max-w-6xl max-h-full overflow-y-auto rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-2xl p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink dark:text-white">
            <GraduationCap className="w-5 h-5 text-accent" /> How it works
          </h2>
          <Tooltip label="Close (Esc)">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* Lessons, grouped */}
          <nav className="flex lg:flex-col gap-4 overflow-x-auto lg:overflow-y-auto lg:max-h-[min(70vh,640px)] pb-1 lg:pb-0 lg:pr-1">
            {TUTORIAL_GROUPS.map((group) => (
              <div key={group.id} className="flex-shrink-0 w-64 lg:w-auto">
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
                  {group.title}
                </p>
                <div className="space-y-1.5">
                  {group.tutorials.map((t, n) => {
                    const active = t.id === tutorial.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setId(t.id)}
                        className={`w-full text-left flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                          active
                            ? 'border-accent bg-accent/10'
                            : 'border-line dark:border-line-dark hover:border-accent/50'
                        }`}
                        aria-current={active ? 'true' : undefined}
                      >
                        {n === 0 ? (
                          <PlayCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-accent" />
                        ) : (
                          <span
                            className={`w-5 h-5 mt-0.5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                              active
                                ? 'bg-accent text-white'
                                : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-faint-dark'
                            }`}
                          >
                            {n}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink dark:text-white">
                            {t.title}
                          </span>
                          <span className="block text-xs text-ink-soft dark:text-ink-faint-dark">
                            {t.summary}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* The lesson */}
          <div className="min-w-0 flex flex-col gap-3">
            <div className="h-[min(72vh,660px)] min-h-[420px]">
              <WalkthroughPlayer
                key={tutorial.id}
                steps={tutorial.steps}
                title={tutorial.title}
                variant="inline"
                hideStepList
                // Lessons point at small buttons: the caption must never cover them.
                dockCaption
                // Lessons: let each picture stay a moment after it is read.
                holdMs={3000}
                onExit={onClose}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-soft dark:text-ink-faint-dark">
                Press ▶ to play. It shows exactly where to click.
              </p>
              {next ? (
                <Tooltip label={next.summary}>
                  <button
                    onClick={() => setId(next.id)}
                    className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
                  >
                    Next lesson: {next.title} <ArrowRight className="w-4 h-4" />
                  </button>
                </Tooltip>
              ) : (
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
                >
                  Done, let me try
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
