/**
 * @file Left sidebar in the editor: the ordered list of steps.
 *
 * Features: select a step, delete (via parent's confirm dialog), add at the end,
 * INSERT between any two steps (the small "+" between rows), reorder with
 * native HTML5 drag & drop. Adding/inserting is hidden at maxSteps.
 *
 * WHY NATIVE DRAG & DROP (no library): the list is at most 10 items and only
 * needs "move index A to index B". The dragged index is carried in
 * dataTransfer and the parent's onReorder does the array move.
 *
 * Each row shows a small content summary so authors can see at a glance what a
 * step is missing: No screenshot (warning) / Click or Look (the region's
 * action) / Voice / AI (text will be read by TTS).
 */

import { Fragment } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Mic,
  Type,
  ImageOff,
  MousePointerClick,
  Eye,
} from 'lucide-react';

/** @typedef {import('@/types').Step} Step */

/**
 * @param {{
 *   steps: Step[],
 *   activeStepId: string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onInsert: (index: number) => void,     // new step goes to position `index`
 *   onDelete: (id: string) => void,        // parent shows a confirm dialog first
 *   onReorder: (from: number, to: number) => void,
 *   maxSteps: number,
 *   fallbackImageId?: string | null,   // legacy course-wide screenshot (counts as "has image")
 * }} props
 */
export function StepRail({
  steps,
  activeStepId,
  onSelect,
  onAdd,
  onInsert,
  onDelete,
  onReorder,
  maxSteps,
  fallbackImageId = null,
}) {
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (from !== index && !isNaN(from)) onReorder(from, index);
  };

  const canAdd = steps.length < maxSteps;

  return (
    <div className="flex flex-col w-full">
      {steps.map((step, i) => {
        const isActive = step.id === activeStepId;
        const hasImage = !!(step.imageId ?? fallbackImageId);
        const hasRegion = !!step.region;
        const isLook = step.action === 'look';
        const hasAudio = !!step.audioId;
        const hasText = !!step.text;

        return (
          <Fragment key={step.id}>
            {i > 0 && (
              <InsertGap
                disabled={!canAdd}
                label={`Insert a step between ${i} and ${i + 1}`}
                onInsert={() => onInsert(i)}
              />
            )}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => e.preventDefault()} // required, otherwise drop never fires
              onDrop={(e) => handleDrop(e, i)}
              onClick={() => onSelect(step.id)}
              className={`group flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                isActive
                  ? 'border-accent bg-accent-soft/40 dark:bg-accent-soft-dark/20'
                  : 'border-line dark:border-line-dark bg-panel dark:bg-panel-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
              }`}
            >
              <GripVertical className="w-4 h-4 text-ink-faint dark:text-ink-faint-dark flex-shrink-0 cursor-grab" />

              <div className="w-8 h-8 rounded-lg bg-paper-2 dark:bg-paper-2-dark flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-ink-faint dark:text-ink-faint-dark">
                  {i + 1}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink dark:text-ink-soft-dark truncate">
                  {step.label || `Step ${i + 1}`}
                </p>

                {/* Content summary badges */}
                <div className="flex items-center gap-2 text-xs text-ink-faint dark:text-ink-faint-dark mt-0.5">
                  {!hasImage && (
                    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                      <ImageOff className="w-3 h-3" /> No screenshot
                    </span>
                  )}
                  {hasImage && hasRegion && (
                    <span className="flex items-center gap-0.5 text-teal dark:text-teal-dark">
                      {isLook ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <MousePointerClick className="w-3 h-3" />
                      )}
                      {isLook ? 'Look' : 'Click'}
                    </span>
                  )}
                  {hasImage && !hasRegion && <span>No area yet</span>}
                  {hasAudio && (
                    <span className="flex items-center gap-0.5 text-teal dark:text-teal-dark">
                      <Mic className="w-3 h-3" /> Voice
                    </span>
                  )}
                  {/* Text without a recording → the player will use TTS */}
                  {hasText && !hasAudio && (
                    <span className="flex items-center gap-0.5 text-violet dark:text-violet-dark">
                      <Type className="w-3 h-3" /> AI
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation(); // don't also select the step
                  onDelete(step.id);
                }}
                className="w-7 h-7 rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Delete step"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </Fragment>
        );
      })}

      {canAdd && (
        <button
          onClick={onAdd}
          className="mt-2 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:border-accent hover:text-accent transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Step
        </button>
      )}
    </div>
  );
}

/**
 * Thin gap between two steps with a "+" that inserts a new step there.
 * Always faintly visible (touch devices have no hover), stronger on hover.
 */
function InsertGap({ onInsert, disabled, label }) {
  return (
    <div className="group/gap relative h-4 flex items-center justify-center">
      <span className="absolute inset-x-6 top-1/2 h-px bg-accent/0 group-hover/gap:bg-accent/40 transition-colors" />
      {!disabled && (
        <button
          onClick={onInsert}
          className="relative z-10 w-5 h-5 rounded-full border border-line dark:border-line-dark bg-panel dark:bg-panel-dark text-ink-faint flex items-center justify-center opacity-50 group-hover/gap:opacity-100 hover:border-accent hover:text-accent hover:scale-110 transition-all"
          aria-label={label}
          title={label}
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
