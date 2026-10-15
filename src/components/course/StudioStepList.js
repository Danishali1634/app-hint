/**
 * @file The steps beside the player in the preview studio (PreviewStudio), as
 * an editable playlist: click a step to edit it right there, ▶ to play the
 * walkthrough from that step, drag to reorder (the others make room live,
 * hooks/useSortableList), 🗑 to delete. A step without a box shows a red mark.
 * It only renders and reports; the studio owns the draft.
 */

import {
  AlertCircle,
  Eye,
  GripVertical,
  MousePointerClick,
  Play,
  TextCursorInput,
  Trash2,
} from 'lucide-react';
import { useSortableList } from '@/hooks/useSortableList';
import { Tooltip } from '@/components/ui/Tooltip';
import { getStepAction, isDefaultLabel } from '@/utils/course';

/** @typedef {import('@/types').Step} Step */

const ACTION_ICONS = { click: MousePointerClick, look: Eye, type: TextCursorInput };
const ACTION_NAMES = { click: 'Click', look: 'Look', type: 'Type' };

/** A custom title, else the first words of the description. */
function stepTitle(step) {
  if (!isDefaultLabel(step.label)) return step.label.trim();
  const words = (step.text || '').trim().split(/\s+/).filter(Boolean);
  return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : words.join(' ');
}

/**
 * @param {{
 *   steps: Step[],
 *   thumbs: Record<string, string | null>, // step id → screenshot data URL
 *   activeIndex: number,
 *   canDelete: boolean,
 *   onSelect: (index: number) => void,
 *   onPlay: (index: number) => void,
 *   onMove: (from: number, to: number) => void,
 *   onDelete: (index: number) => void,
 * }} props
 */
export function StudioStepList({
  steps,
  thumbs,
  activeIndex,
  canDelete,
  onSelect,
  onPlay,
  onMove,
  onDelete,
}) {
  const byId = new Map(steps.map((step, i) => [step.id, { step, index: i }]));
  const { order, draggingId, rowProps } = useSortableList({
    ids: steps.map((step) => step.id),
    onMove,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-line dark:border-line-dark flex-shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
          Steps
        </p>
        <span className="text-xs font-semibold text-accent tabular-nums">{steps.length}</span>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {order.map((id, position) => {
          const entry = byId.get(id);
          if (!entry) return null;
          const { step, index } = entry;
          const number = position + 1;
          const active = index === activeIndex;
          const dragging = id === draggingId;
          const title = stepTitle(step);
          const action = getStepAction(step);
          const ActionIcon = ACTION_ICONS[action];
          const thumb = thumbs[step.id];
          return (
            <li
              key={id}
              {...rowProps(id)}
              className={`group relative flex items-center rounded-xl border select-none ${
                dragging
                  ? 'border-accent bg-panel dark:bg-panel-dark shadow-xl ring-1 ring-accent/30'
                  : active
                    ? 'border-accent bg-accent-soft/60 dark:bg-accent-soft-dark/30'
                    : 'border-transparent hover:bg-paper-2 dark:hover:bg-paper-2-dark'
              }`}
            >
              <Tooltip label="Drag to move this step">
                <span
                  data-drag-handle
                  className={`w-5 h-10 flex-shrink-0 flex items-center justify-center touch-none text-ink-faint dark:text-ink-faint-dark ${
                    dragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                >
                  <GripVertical className="w-4 h-4" />
                </span>
              </Tooltip>
              <button
                onClick={() => onSelect(index)}
                className="flex-1 min-w-0 flex items-center gap-2 py-1.5 pr-16 text-left"
                aria-current={active ? 'step' : undefined}
                aria-label={`Edit step ${number}${title ? `: ${title}` : ''}`}
              >
                <span className="relative w-14 h-9 flex-shrink-0 rounded-md overflow-hidden bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark">
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  )}
                  <span className="absolute left-0.5 top-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ink/80 text-white text-[10px] font-bold leading-4 text-center tabular-nums">
                    {number}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] font-semibold truncate ${
                      title
                        ? 'text-ink dark:text-ink-soft-dark'
                        : 'italic font-medium text-ink-faint dark:text-ink-faint-dark'
                    }`}
                  >
                    {title || 'No text yet'}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-ink-faint dark:text-ink-faint-dark">
                    <ActionIcon className="w-3 h-3" /> {ACTION_NAMES[action]}
                  </span>
                </span>
              </button>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                {!step.region && (
                  <Tooltip label="No box yet: open it and draw one">
                    <AlertCircle className="w-4 h-4 mr-1 text-danger" aria-label="No box yet" />
                  </Tooltip>
                )}
                <Tooltip label="Play from this step">
                  <button
                    onClick={() => onPlay(index)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint dark:text-ink-faint-dark hover:text-accent hover:bg-accent/10"
                    aria-label={`Play from step ${number}`}
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                {canDelete && (
                  <Tooltip label="Delete this step">
                    <button
                      onClick={() => onDelete(index)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint dark:text-ink-faint-dark hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Delete step ${number}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
