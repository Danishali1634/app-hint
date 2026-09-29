/**
 * @file "▶ Show me" — a small link next to an action that plays its
 * tutorial (src/examples/editorTutorials.js) in the TutorialDialog.
 */

import { PlayCircle } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

/** @param {{ onClick: () => void, label?: string, className?: string }} props */
export function ShowMe({ onClick, label = 'Show me', className = '' }) {
  if (!onClick) return null;
  return (
    <Tooltip label="Watch a short tutorial for this" className={className}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex items-center gap-1 px-1.5 h-6 rounded-md text-xs font-medium text-ink-faint dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark whitespace-nowrap transition-colors"
      >
        <PlayCircle className="w-3.5 h-3.5" /> {label}
      </button>
    </Tooltip>
  );
}
