/**
 * @file "Your next step" — a small checklist that always says what to do NOW,
 * so a first-time user never has to think or get stuck.
 *
 *   ✓ Add a screenshot
 *   ✓ Draw a box
 *   ● Write what to do        ← current: one plain sentence + two buttons
 *   ○ Add the next step         [Show me where] (spotlights the real spot)
 *   ○ Watch it                  [Watch how]     (plays that tutorial)
 *
 * The parent decides what is done (from the course) and where each item lives
 * on the page (a `data-tour` target for the spotlight). Starts collapsed to
 * one line ("Your next step: …"); opening it is remembered. When everything is done it
 * shrinks to a single "All done" line.
 */

import { useState } from 'react';
import { Check, ChevronDown, Crosshair, PlayCircle, Sparkles } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

const COLLAPSED_KEY = 'hs-coach-collapsed';

function readCollapsed() {
  try {
    // Collapsed (one line) unless the user opened it: nothing more than needed on screen.
    return localStorage.getItem(COLLAPSED_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * @param {{
 *   items: { id: string, title: string, how: string, done: boolean,
 *            target?: string, tutorialId?: string }[],
 *   onSpotlight: (item: { target: string, title: string, how: string }) => void,
 *   onShowTutorial: (id: string) => void,
 * }} props
 */
export function NextStepCoach({ items, onSpotlight, onShowTutorial }) {
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = (value) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // private mode: just not remembered
    }
  };

  const current = items.find((item) => !item.done);
  const doneCount = items.filter((item) => item.done).length;

  if (!current) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-teal/30 bg-teal/10 px-3 py-2.5 text-sm font-semibold text-teal dark:text-teal-dark">
        <Sparkles className="w-4 h-4" /> All done! Press Preview any time.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={!collapsed}
      >
        <span className="relative w-8 h-8 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90" aria-hidden="true">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="4"
              className="stroke-line dark:stroke-line-dark"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-accent transition-all duration-500"
              strokeDasharray={`${(doneCount / items.length) * 94.2} 94.2`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink dark:text-ink-soft-dark">
            {doneCount}/{items.length}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
            Your next step
          </span>
          <span className="block text-sm font-bold text-ink dark:text-white truncate">
            {current.title}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-ink-faint transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="text-sm leading-snug text-ink-soft dark:text-ink-soft-dark">
            {current.how}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {current.target && (
              <Tooltip label="Highlight the exact spot on the page">
                <button
                  onClick={() => onSpotlight(current)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-soft-dark hover:border-ink-faint dark:hover:border-ink-faint-dark transition-colors"
                >
                  <Crosshair className="w-3.5 h-3.5" /> Show me where
                </button>
              </Tooltip>
            )}
            {current.tutorialId && (
              <Tooltip label="Play a short video of this">
                <button
                  onClick={() => onShowTutorial(current.tutorialId)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-soft-dark hover:border-ink-faint dark:hover:border-ink-faint-dark transition-colors"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Watch how
                </button>
              </Tooltip>
            )}
          </div>

          <ol className="mt-3 space-y-1 border-t border-line dark:border-line-dark pt-2.5">
            {items.map((item, n) => {
              const isCurrent = item.id === current.id;
              return (
                <li key={item.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[10px] ${
                      item.done
                        ? 'border border-line dark:border-line-dark text-ink-faint dark:text-ink-faint-dark'
                        : isCurrent
                          ? 'bg-accent text-white'
                          : 'bg-paper-2 dark:bg-paper-2-dark text-ink-faint dark:text-ink-faint-dark'
                    }`}
                  >
                    {item.done ? <Check className="w-3 h-3" /> : n + 1}
                  </span>
                  <span
                    className={
                      item.done
                        ? 'text-ink-faint dark:text-ink-faint-dark line-through'
                        : isCurrent
                          ? 'font-semibold text-ink dark:text-white'
                          : 'text-ink-soft dark:text-ink-faint-dark'
                    }
                  >
                    {item.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
