/**
 * @file The controls under the editor canvas that guide area selection.
 *
 * STATES
 *   No area yet   → big "Select area of the feature" button (pulses for attention)
 *   Drawing       → instruction banner + Cancel
 *   Area selected → "Reselect area" + the step's action:
 *                     👆 "Viewer clicks this"   (pointer clicks it, next screen opens from it)
 *                     👁 "Just look at this"    (zoom + spotlight only)
 *                     ⌨ "Viewer types a value" (the value is typed into the area;
 *                                               optional sample value input)
 *                   with a one-line preview of what the walkthrough will do.
 */

import { Crosshair, MousePointerClick, Eye, TextCursorInput, X } from 'lucide-react';
import { MiniHint } from '@/components/tutorial/MiniHint';

/** @typedef {import('@/types').StepAction} StepAction */

const ACTION_OPTIONS = [
  {
    value: 'click',
    Icon: MousePointerClick,
    label: 'Viewer clicks this',
    hint: 'In the walkthrough a pointer clicks this area, then the next step opens out of it.',
  },
  {
    value: 'look',
    Icon: Eye,
    label: 'Just look at this',
    hint: 'In the walkthrough the camera zooms into this area and highlights it.',
  },
  {
    value: 'type',
    Icon: TextCursorInput,
    label: 'Viewer types a value',
    hint: 'In the walkthrough the camera zooms into this field and the value is typed into it.',
  },
];

/** Short names for the compact tiles. */
const COMPACT_LABELS = { click: 'Click it', look: 'Just look', type: 'Types value' };

/** 'type' steps: the optional sample value the walkthrough types in. */
function TypeValueInput({ value, onChange, compact = false }) {
  return (
    <label className={`block ${compact ? 'mt-2' : ''}`}>
      <span className="block text-xs font-semibold text-ink-faint dark:text-ink-faint-dark mb-1">
        Value to type <span className="font-normal">(optional)</span>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 12345 or john@example.com — empty shows a typing animation"
        className="w-full px-3 py-2 rounded-lg bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}

/**
 * @param {{
 *   hasRegion: boolean,
 *   drawMode: boolean,
 *   action: StepAction,
 *   onStartSelect: () => void,
 *   onCancelSelect: () => void,
 *   onActionChange: (action: StepAction) => void,
 *   typeValue?: string,                          // 'type' steps: sample value
 *   onTypeValueChange?: (value: string) => void, // shown only for 'type' steps
 *   compact?: boolean,   // short version for the preview studio's edit panel
 * }} props
 */
export function RegionActionBar({
  hasRegion,
  drawMode,
  action,
  onStartSelect,
  onCancelSelect,
  onActionChange,
  typeValue = '',
  onTypeValueChange,
  compact = false,
}) {
  if (compact) {
    return (
      <CompactActionBar
        hasRegion={hasRegion}
        drawMode={drawMode}
        action={action}
        onStartSelect={onStartSelect}
        onCancelSelect={onCancelSelect}
        onActionChange={onActionChange}
        typeValue={typeValue}
        onTypeValueChange={onTypeValueChange}
      />
    );
  }
  if (drawMode) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-soft/60 dark:bg-accent-soft-dark/40 border border-accent/40">
        <Crosshair className="w-5 h-5 text-accent flex-shrink-0" />
        <p className="text-sm text-ink dark:text-ink-soft-dark flex-1">
          <strong>Drag a box over the feature</strong> — for example the button the user should
          click, or the part of the modal they should look at.
        </p>
        <button
          onClick={onCancelSelect}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    );
  }

  if (!hasRegion) {
    return (
      <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-accent/30 bg-accent/5 dark:bg-accent/10 p-4">
        <MiniHint variant="select" />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark">
            Now show where the feature is
          </p>
          <p className="text-xs text-ink-soft dark:text-ink-faint-dark mt-0.5 mb-3">
            Click the button below, then drag a box over it on the screenshot — like in the
            animation. The walkthrough will zoom from the full screen into this area.
          </p>
          <button
            onClick={onStartSelect}
            className="hs-attention inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent-dark transition-colors shadow-glow"
          >
            <Crosshair className="w-5 h-5" /> Select area of the feature
          </button>
        </div>
      </div>
    );
  }

  const activeOption = ACTION_OPTIONS.find((o) => o.value === action) || ACTION_OPTIONS[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink-faint dark:text-ink-faint-dark uppercase tracking-wider mr-1">
          This area
        </span>
        <div className="flex items-center gap-1 border border-line dark:border-line-dark rounded-lg p-1">
          {ACTION_OPTIONS.map(({ value, Icon, label }) => (
            <button
              key={value}
              onClick={() => onActionChange(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                action === value
                  ? 'bg-accent text-white'
                  : 'text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <button
          onClick={onStartSelect}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
        >
          <Crosshair className="w-4 h-4" /> Reselect area
        </button>
      </div>
      <p className="text-xs text-ink-faint dark:text-ink-faint-dark">
        {activeOption.hint} Drag the box to move it, or a corner to resize.
      </p>
      {action === 'type' && onTypeValueChange && (
        <div className="max-w-md">
          <TypeValueInput value={typeValue} onChange={onTypeValueChange} />
        </div>
      )}
    </div>
  );
}

/**
 * Edit-panel version: no tutorials, just the choices, big and obvious.
 *   selecting → "Drag a box over the feature" + Cancel
 *   no area   → one "Select area" button
 *   area set  → "What happens here?" Click / Look as two large tiles + Reselect
 */
function CompactActionBar({
  hasRegion,
  drawMode,
  action,
  onStartSelect,
  onCancelSelect,
  onActionChange,
  typeValue,
  onTypeValueChange,
}) {
  if (drawMode) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-accent/10 border border-accent/40">
        <Crosshair className="w-4 h-4 text-accent flex-shrink-0" />
        <p className="text-sm font-semibold text-ink dark:text-white flex-1">
          Drag a box over the feature
        </p>
        <button
          onClick={onCancelSelect}
          className="px-2.5 py-1 rounded-lg text-sm text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
        >
          Cancel
        </button>
      </div>
    );
  }
  if (!hasRegion) {
    return (
      <button
        onClick={onStartSelect}
        className="hs-attention w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-accent text-white font-semibold hover:bg-accent-dark shadow-glow"
      >
        <Crosshair className="w-5 h-5" /> Select area
      </button>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-ink dark:text-white">What happens here?</p>
        <button
          onClick={onStartSelect}
          className="flex items-center gap-1 text-xs font-medium text-ink-soft dark:text-ink-faint-dark hover:text-accent"
        >
          <Crosshair className="w-3.5 h-3.5" /> Reselect area
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What happens here">
        {ACTION_OPTIONS.map(({ value, Icon, label }) => {
          const active = action === value;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={active}
              onClick={() => onActionChange(value)}
              className={`flex items-center justify-center gap-1.5 h-12 px-1 rounded-xl border-2 text-xs sm:text-sm font-semibold transition-colors ${
                active
                  ? 'border-accent bg-accent text-white shadow-glow'
                  : 'border-line dark:border-line-dark text-ink-soft dark:text-ink-soft-dark hover:border-accent/50'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" /> {COMPACT_LABELS[value]}
              <span className="sr-only">{label}</span>
            </button>
          );
        })}
      </div>
      {action === 'type' && onTypeValueChange && (
        <TypeValueInput value={typeValue} onChange={onTypeValueChange} compact />
      )}
    </div>
  );
}
