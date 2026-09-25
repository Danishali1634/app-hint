/**
 * @file The controls under the editor canvas that guide area selection.
 *
 * STATES
 *   No area yet   → big "Select area of the feature" button (pulses for attention)
 *   Drawing       → instruction banner + Cancel
 *   Area selected → "Reselect area" + the step's action:
 *                     👆 "Viewer clicks this"   (pointer clicks it, next screen opens from it)
 *                     👁 "Just look at this"    (zoom + spotlight only)
 *                   with a one-line preview of what the walkthrough will do.
 */

import { Crosshair, MousePointerClick, Eye, X } from 'lucide-react';
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
];

/**
 * @param {{
 *   hasRegion: boolean,
 *   drawMode: boolean,
 *   action: StepAction,
 *   onStartSelect: () => void,
 *   onCancelSelect: () => void,
 *   onActionChange: (action: StepAction) => void,
 * }} props
 */
export function RegionActionBar({
  hasRegion,
  drawMode,
  action,
  onStartSelect,
  onCancelSelect,
  onActionChange,
}) {
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
    </div>
  );
}
