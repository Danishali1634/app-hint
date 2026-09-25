/**
 * @file The 3-part checklist at the top of the editor for the ACTIVE step:
 *   ① Add screenshot  ② Select the feature  ③ Explain it (text or voice)
 * Done parts get a ✓, the next thing to do is highlighted, so it is always
 * obvious what to do next. Clicking a part scrolls to / starts that part.
 */

import { Check, ImagePlus, Crosshair, MessageSquareText } from 'lucide-react';

/**
 * @param {{
 *   stepNumber: number,
 *   hasImage: boolean,
 *   hasRegion: boolean,
 *   hasExplanation: boolean,   // text or recorded voice
 *   onSelectArea: () => void,
 *   onExplain: () => void,
 * }} props
 */
export function StepGuide({
  stepNumber,
  hasImage,
  hasRegion,
  hasExplanation,
  onSelectArea,
  onExplain,
}) {
  const parts = [
    { key: 'image', Icon: ImagePlus, label: 'Add screenshot', done: hasImage, onClick: null },
    {
      key: 'area',
      Icon: Crosshair,
      label: 'Select the feature',
      done: hasRegion,
      onClick: hasImage ? onSelectArea : null,
    },
    {
      key: 'explain',
      Icon: MessageSquareText,
      label: 'Explain it',
      hint: 'text or voice',
      done: hasExplanation,
      onClick: onExplain,
    },
  ];
  const currentKey = parts.find((p) => !p.done)?.key;

  return (
    <div className="rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-2 flex flex-col sm:flex-row gap-1.5">
      <span className="hidden md:flex items-center px-3 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark whitespace-nowrap">
        Step {stepNumber}
      </span>
      {parts.map(({ key, Icon, label, hint, done, onClick }, i) => {
        const isCurrent = key === currentKey;
        return (
          <button
            key={key}
            onClick={onClick || undefined}
            disabled={!onClick}
            className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all disabled:cursor-default ${
              isCurrent
                ? 'bg-accent/10 ring-1 ring-accent/40'
                : done
                  ? 'hover:bg-paper-2 dark:hover:bg-paper-2-dark'
                  : 'opacity-60'
            }`}
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                done
                  ? 'bg-teal text-white'
                  : isCurrent
                    ? 'bg-accent text-white shadow-glow'
                    : 'bg-paper-2 dark:bg-paper-2-dark text-ink-faint dark:text-ink-faint-dark'
              }`}
            >
              {done ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-ink-soft-dark">
                <Icon className="w-3.5 h-3.5 text-accent" /> {label}
              </span>
              <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark">
                {done ? 'Done' : isCurrent ? 'Do this now' : hint || 'Next'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
