/**
 * @file Course details shown under an inline player (Preview page, share
 * links): page name, status, title, description and the numbered step list.
 * With onEditStep (the Preview page), each step has a ✎ that opens it for
 * editing right there, and the step on screen is highlighted.
 */

import { Tag, Mic, Type, Pencil } from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS } from '@/constants';
import { formatDate } from '@/utils';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/**
 * @param {{
 *   title: string,
 *   pageName?: string,
 *   description?: string,
 *   steps: WalkthroughStep[],
 *   status?: string,       // omitted on share links
 *   updatedAt?: number,    // omitted on share links
 *   activeIndex?: number,  // the step on screen in the player
 *   onEditStep?: (stepId: string) => void, // Preview page: edit this step here
 * }} props
 */
export function CourseInfo({
  title,
  pageName,
  description,
  steps,
  status,
  updatedAt,
  activeIndex = -1,
  onEditStep,
}) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {pageName && (
            <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-faint-dark">
              <Tag className="w-3 h-3" /> {pageName}
            </span>
          )}
          {status && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}
            >
              {STATUS_LABELS[status] || 'Draft'}
            </span>
          )}
          {updatedAt && (
            <span className="text-xs text-ink-faint dark:text-ink-faint-dark">
              Updated {formatDate(updatedAt)}
            </span>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-ink-soft dark:text-ink-faint-dark mt-2 max-w-2xl">
            {description}
          </p>
        )}
      </div>

      {steps.length > 0 && (
        <div className="rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-4">
          <h2 className="text-xs font-semibold text-ink-faint dark:text-ink-faint-dark uppercase tracking-wider mb-3">
            {steps.length} step{steps.length !== 1 ? 's' : ''}
          </h2>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className={`group flex items-center gap-3 rounded-lg ${
                  i === activeIndex && onEditStep ? 'bg-accent/5 -mx-1.5 px-1.5' : ''
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-ink-soft dark:text-ink-soft-dark truncate flex-1">
                  {step.label || `Step ${i + 1}`}
                </span>
                {step.audioData ? (
                  <Mic
                    className="w-3.5 h-3.5 text-teal dark:text-teal-dark"
                    aria-label="Recorded voice"
                  />
                ) : step.text ? (
                  <Type
                    className="w-3.5 h-3.5 text-violet dark:text-violet-dark"
                    aria-label="AI voice"
                  />
                ) : null}
                {onEditStep && (
                  <button
                    onClick={() => onEditStep(step.id)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint dark:text-ink-faint-dark hover:text-accent hover:bg-accent/10"
                    aria-label={`Edit step ${i + 1}`}
                    title="Edit this step here"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
