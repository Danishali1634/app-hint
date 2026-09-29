/**
 * @file Left sidebar in the editor: the SCREENS and their STEPS.
 *
 * HIERARCHY: every entry is a SCREEN (one screenshot; in code a "unit" /
 * Global Step) with its numbered STEPS listed inside it. A plain screen has
 * one step. The active screen is open; others can be opened with the chevron.
 *
 * Features: select, delete (via the parent's confirm dialog), add a Global
 * Step at the end, INSERT one between any two (the small "+" between rows),
 * reorder Global Steps with native HTML5 drag & drop (sub-steps always move
 * with their Global Step). Adding/inserting is hidden at maxSteps.
 *
 * SCROLLING: the list scrolls on its own (the parent limits the rail's height),
 * so 50–100 steps never push the screenshot out of view. "Add Global Step"
 * stays pinned under the list; the active sub-step is scrolled into view.
 *
 * Each step row stays short: its number, its title or text, and a warning
 * icon (with a tooltip) when something is missing. Every button has a tooltip.
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  ImageOff,
  PanelLeftOpen,
  ChevronDown,
  AlertCircle,
  Check,
} from 'lucide-react';
import { DEFAULT_SUB_LABEL, getStepTargets, getStepUnits } from '@/utils/course';
import { Tooltip } from '@/components/ui/Tooltip';

/** @typedef {import('@/types').Step} Step */

/**
 * @param {{
 *   steps: Step[],
 *   activeStepId: string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onInsert: (index: number) => void,     // new step goes to position `index` (in `steps`)
 *   onDelete: (id: string) => void,        // one sub-step; parent shows a confirm dialog
 *   onDeleteUnit: (index: number) => void,  // the Global Step containing steps[index]
 *   onReorder: (from: number, to: number) => void,  // Global Step positions
 *   onHover?: (stepId: string | null) => void,  // sub-step row under the pointer
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
  onDeleteUnit,
  onReorder,
  onHover,
  maxSteps,
  fallbackImageId = null,
}) {
  const listRef = useRef(null);
  // Groups the author opened/closed by hand; otherwise a group is open while
  // one of its sub-steps is active.
  const [toggledGroups, setToggledGroups] = useState({});

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (from !== index && !isNaN(from)) onReorder(from, index);
  };

  // Keep the active step visible inside the scrolling list (without moving the page).
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeStepId) return;
    const row = list.querySelector(`[data-step-id="${activeStepId}"]`);
    if (!row) return;
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top + 8;
    else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom + 8;
  }, [activeStepId, steps.length]);

  const canAdd = steps.length < maxSteps;
  const units = getStepUnits(steps);

  return (
    <div className="flex flex-col w-full min-h-0">
      <div ref={listRef} className="min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 py-1">
        {units.map((unit, u) => {
          const dragProps = {
            onDragOver: (e) => e.preventDefault(), // required, otherwise drop never fires
            onDrop: (e) => handleDrop(e, u),
          };
          const gap = u > 0 && (
            <InsertGap
              disabled={!canAdd}
              label={`Insert a new screen between ${u} and ${u + 1}`}
              onInsert={() => onInsert(unit.start)}
            />
          );

          const subSteps = steps.slice(unit.start, unit.end + 1);
          const key = unit.groupId || subSteps[0].id;
          const containsActive = subSteps.some((s) => s.id === activeStepId);
          const open = toggledGroups[key] ?? containsActive;
          return (
            <Fragment key={key}>
              {gap}
              <GroupBlock
                number={u + 1}
                subSteps={subSteps}
                activeStepId={activeStepId}
                containsActive={containsActive}
                open={open}
                hasImage={!!(subSteps[0].imageId ?? fallbackImageId)}
                onToggle={() => setToggledGroups((t) => ({ ...t, [key]: !open }))}
                onSelectMain={() => {
                  setToggledGroups((t) => ({ ...t, [key]: true }));
                  onSelect(subSteps[0].id);
                }}
                onSelect={onSelect}
                onHover={onHover}
                onDelete={onDelete}
                onDeleteUnit={() => onDeleteUnit(unit.start)}
                dragProps={dragProps}
                onDragStart={(e) => handleDragStart(e, u)}
              />
            </Fragment>
          );
        })}
      </div>

      {/* Only once something is highlighted: before that, a new screen isn't needed yet. */}
      {canAdd && steps.some((st) => getStepTargets(st).length > 0) && (
        <Tooltip
          label="A new page or popup opened? Add a screen for it"
          className="w-full mt-2 flex-shrink-0"
        >
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:border-accent hover:text-accent transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add screen
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/** A screen: header row + its numbered steps (collapsible). */
function GroupBlock({
  number,
  subSteps,
  hasImage,
  activeStepId,
  containsActive,
  open,
  onToggle,
  onSelectMain,
  onSelect,
  onHover,
  onDelete,
  onDeleteUnit,
  dragProps,
  onDragStart,
}) {
  // A single step's own label (if the author typed one) names the screen.
  const firstLabel = (subSteps[0].label || '').trim();
  const title =
    subSteps.length === 1 && firstLabel && !/^step \d+$/i.test(firstLabel) ? firstLabel : '';
  return (
    <div
      {...dragProps}
      className={`rounded-xl border transition-all ${
        containsActive
          ? 'border-line dark:border-line-dark bg-panel dark:bg-panel-dark'
          : 'border-transparent hover:bg-paper-2/60 dark:hover:bg-paper-2-dark/60'
      }`}
    >
      {/* Header: the MAIN step */}
      <div
        draggable
        onDragStart={onDragStart}
        onClick={() => {
          if (!containsActive) onSelectMain();
          else onToggle();
        }}
        className="group flex items-center gap-2 p-2.5 cursor-pointer"
      >
        <Tooltip label="Drag to move this screen">
          <GripVertical className="w-4 h-4 text-ink-faint dark:text-ink-faint-dark flex-shrink-0 cursor-grab" />
        </Tooltip>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            containsActive
              ? 'bg-ink text-white dark:bg-white dark:text-ink'
              : 'border border-line dark:border-line-dark text-ink-soft dark:text-ink-faint-dark'
          }`}
        >
          <span className="text-xs font-bold">{number}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark truncate">
            Screen {number}
            {title && (
              <span className="font-normal text-ink-soft dark:text-ink-faint-dark"> · {title}</span>
            )}
          </p>
          {hasImage ? (
            <p className="text-xs text-ink-faint dark:text-ink-faint-dark whitespace-nowrap">
              {subSteps.length} feature{subSteps.length === 1 ? '' : 's'}
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
              <ImageOff className="w-3 h-3 flex-shrink-0" /> Needs a screenshot
            </p>
          )}
        </div>
        <DeleteButton label={`Delete Screen ${number} and its features`} onDelete={onDeleteUnit} />
        <Tooltip label={open ? 'Hide its features' : 'Show its features'}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="w-7 h-7 rounded-lg text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark flex items-center justify-center flex-shrink-0"
            aria-label={open ? 'Hide features' : 'Show features'}
            aria-expanded={open}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
        </Tooltip>
      </div>

      {/* Steps */}
      {open && (
        <div className="pb-2 pr-2 pl-5">
          <div className="border-l border-line dark:border-line-dark pl-2 space-y-0.5">
            {subSteps.map((step, k) => {
              const isActive = step.id === activeStepId;
              const label = (step.label || '').trim();
              const customLabel =
                label && !DEFAULT_SUB_LABEL.test(label) && !/^step \d+$/i.test(label) ? label : '';
              const targetCount = getStepTargets(step).length;
              const hasText = !!step.text?.trim() || !!step.audioId;
              const missing = !hasImage
                ? ''
                : targetCount === 0
                  ? 'No highlight yet: drag a box on the screenshot'
                  : !hasText
                    ? 'Nothing written yet'
                    : '';
              const summary = customLabel || step.text?.trim() || '';
              return (
                <div
                  key={step.id}
                  data-step-id={step.id}
                  onClick={() => onSelect(step.id)}
                  onPointerEnter={() => onHover?.(step.id)}
                  onPointerLeave={() => onHover?.(null)}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    isActive
                      ? 'border-accent/50 bg-accent/5'
                      : 'border-transparent hover:bg-paper-2 dark:hover:bg-paper-2-dark'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                      isActive
                        ? 'bg-accent text-white'
                        : 'border border-line dark:border-line-dark text-ink-faint dark:text-ink-faint-dark'
                    }`}
                  >
                    {!isActive && hasImage && !missing ? <Check className="w-3.5 h-3.5" /> : k + 1}
                  </span>
                  <p className="flex-1 min-w-0 text-xs text-ink dark:text-ink-soft-dark truncate">
                    <span className="font-semibold">Feature {k + 1}</span>
                    {summary && (
                      <span className="text-ink-soft dark:text-ink-faint-dark"> · {summary}</span>
                    )}
                  </p>
                  {missing && (
                    <Tooltip label={missing}>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    </Tooltip>
                  )}
                  <DeleteButton
                    label={`Delete feature ${k + 1}`}
                    onDelete={() => onDelete(step.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteButton({ label, onDelete }) {
  return (
    <Tooltip label={label}>
      <button
        onClick={(e) => {
          e.stopPropagation(); // don't also select the step
          onDelete();
        }}
        className="w-7 h-7 rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
        aria-label={label}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  );
}

/**
 * Thin gap between two steps with a "+" that inserts a new step there.
 * Always faintly visible (touch devices have no hover), stronger on hover.
 */
function InsertGap({ onInsert, disabled, label }) {
  return (
    <div className="group/gap relative h-4 flex-shrink-0 flex items-center justify-center">
      <span className="absolute inset-x-6 top-1/2 h-px bg-accent/0 group-hover/gap:bg-accent/40 transition-colors" />
      {!disabled && (
        <Tooltip label={label} className="relative z-10">
          <button
            onClick={onInsert}
            className="w-5 h-5 rounded-full border border-line dark:border-line-dark bg-panel dark:bg-panel-dark text-ink-faint flex items-center justify-center opacity-50 group-hover/gap:opacity-100 hover:border-accent hover:text-accent hover:scale-110 transition-all"
            aria-label={label}
          >
            <Plus className="w-3 h-3" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * The screen list folded into a slim strip (to give the screenshot more room):
 * one numbered button per screen, the active one highlighted, plus
 * "expand" and "add". Large screens only — below lg the full list is shown.
 * @param {{
 *   steps: Step[],
 *   activeStepId: string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onExpand: () => void,
 *   canAdd: boolean,
 * }} props
 */
export function CollapsedRail({ steps, activeStepId, onSelect, onAdd, onExpand, canAdd }) {
  const units = getStepUnits(steps);
  return (
    <div className="flex lg:flex-col items-center gap-1.5 lg:w-14 flex-shrink-0 lg:h-full min-h-0 lg:pr-3 overflow-x-auto lg:overflow-x-visible">
      <Tooltip label="Show the screen list">
        <button
          onClick={onExpand}
          className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-ink-faint dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark hover:text-accent transition-colors"
          aria-label="Show the screen list"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </Tooltip>
      <div className="flex lg:flex-col items-center gap-1.5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto overscroll-contain py-1">
        {units.map((unit, u) => {
          const subSteps = steps.slice(unit.start, unit.end + 1);
          const isActive = subSteps.some((s) => s.id === activeStepId);
          return (
            <Tooltip
              key={unit.groupId || subSteps[0].id}
              label={`Screen ${u + 1} · ${subSteps.length} feature${subSteps.length === 1 ? '' : 's'}`}
            >
              <button
                onClick={() => onSelect(subSteps[0].id)}
                className={`relative w-9 h-9 flex-shrink-0 rounded-lg text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-ink text-white dark:bg-white dark:text-ink'
                    : 'border border-line dark:border-line-dark text-ink-soft dark:text-ink-soft-dark hover:border-ink-faint'
                }`}
                aria-label={`Screen ${u + 1}`}
              >
                {u + 1}
                {subSteps.length > 1 && (
                  <span className="absolute -bottom-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-panel dark:bg-panel-dark border border-line dark:border-line-dark text-[9px] leading-[14px] text-ink-soft dark:text-ink-faint-dark">
                    {subSteps.length}
                  </span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {canAdd && (
        <Tooltip label="Add screen">
          <button
            onClick={onAdd}
            className="w-9 h-9 flex-shrink-0 rounded-lg border-2 border-dashed border-line dark:border-line-dark flex items-center justify-center text-ink-faint hover:border-accent hover:text-accent transition-colors"
            aria-label="Add screen"
          >
            <Plus className="w-4 h-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
