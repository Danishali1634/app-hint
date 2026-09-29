/**
 * @file "⋯" button with a small dropdown for actions people rarely need, so
 * the screen itself only shows what is needed right now.
 *
 *   <MoreMenu label="More" items={[
 *     { icon: Archive, label: 'Download a backup', onClick },
 *     { icon: Trash2, label: 'Delete all', onClick, danger: true },
 *   ]}/>
 *
 * Items that are falsy are skipped (so callers can write `cond && {…}`).
 * Closes on a pick, a click outside, Esc, scrolling or resizing.
 *
 * The dropdown is portaled to <body> with fixed positioning under the button,
 * so a screenshot, a zoom toolbar or any stacking context can never cover it.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * @param {{
 *   items: ({ icon?: import('react').ComponentType<{className?: string}>, label: string,
 *             onClick: () => void, danger?: boolean } | false | null | undefined)[],
 *   label?: string,          // tooltip
 *   buttonClassName?: string,
 *   align?: 'left' | 'right',
 * }} props
 */
export function MoreMenu({ items, label = 'More', buttonClassName = '', align = 'right' }) {
  const [anchor, setAnchor] = useState(null); // the button's rect while open
  const open = !!anchor;
  const ref = useRef(null);
  const menuRef = useRef(null);
  const list = items.filter(Boolean);
  const close = () => setAnchor(null);
  const toggle = () =>
    setAnchor((current) => (current ? null : (ref.current?.getBoundingClientRect() ?? null)));

  useEffect(() => {
    if (!open) return;
    const onDown = (e) =>
      !ref.current?.contains(e.target) && !menuRef.current?.contains(e.target) && close();
    const onKey = (e) => e.key === 'Escape' && close();
    const onMove = (e) => !menuRef.current?.contains(e.target) && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (list.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Tooltip label={label}>
        <button
          onClick={toggle}
          className={
            buttonClassName ||
            'w-9 h-9 rounded-lg flex items-center justify-center border border-line dark:border-line-dark text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors'
          }
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[150] min-w-[14rem] rounded-xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-2xl p-1 animate-in"
            style={{
              top: anchor.bottom + 6,
              ...(align === 'right'
                ? { right: Math.max(8, window.innerWidth - anchor.right) }
                : { left: Math.max(8, anchor.left) }),
            }}
          >
            {list.map(({ icon: Icon, label: text, onClick, danger }) => (
              <button
                key={text}
                role="menuitem"
                onClick={() => {
                  close();
                  onClick();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  danger
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark'
                }`}
              >
                {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                {text}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
