/**
 * @file Small dark bubble that explains a button on hover or keyboard focus.
 *
 *   <Tooltip label="Add the next step" shortcut="Ctrl/⌘ + Enter">
 *     <button …/>
 *   </Tooltip>
 *
 * Rendered in a portal with fixed positioning, so scrolling panels and
 * overflow-hidden cards never clip it. Shown above the element, or below when
 * there is no room; kept inside the window horizontally. Hidden again on
 * pointer down (the click itself) and on any scroll.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 250;
const GAP = 8;
const MAX_WIDTH = 240;
const EDGE = 8;

/**
 * @param {{
 *   label: string,
 *   shortcut?: string,
 *   side?: 'top' | 'bottom',
 *   className?: string,     // for the wrapper (layout: ml-auto, w-full, …)
 *   children: import('react').ReactNode,
 * }} props
 */
export function Tooltip({ label, shortcut, side = 'top', className = '', children }) {
  const ref = useRef(null);
  const timer = useRef(0);
  const [rect, setRect] = useState(null);

  const hide = () => {
    clearTimeout(timer.current);
    setRect(null);
  };
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const box = ref.current?.getBoundingClientRect();
      if (box && box.width) setRect(box);
    }, SHOW_DELAY_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!rect) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [rect]);

  if (!label) return children;

  let bubble = null;
  if (rect) {
    const below = side === 'bottom' || rect.top < 56;
    const center = Math.min(
      window.innerWidth - EDGE - MAX_WIDTH / 2,
      Math.max(EDGE + MAX_WIDTH / 2, rect.left + rect.width / 2),
    );
    bubble = createPortal(
      <div
        role="tooltip"
        className="fixed z-[200] pointer-events-none flex justify-center"
        style={{
          left: center - MAX_WIDTH / 2,
          width: MAX_WIDTH,
          ...(below ? { top: rect.bottom + GAP } : { bottom: window.innerHeight - rect.top + GAP }),
        }}
      >
        <span className="hs-tooltip-in max-w-full rounded-lg bg-ink dark:bg-white px-2.5 py-1.5 text-xs leading-snug font-medium text-white dark:text-ink shadow-lg text-center">
          {label}
          {shortcut && (
            <span className="ml-1.5 whitespace-nowrap rounded bg-white/15 dark:bg-ink/10 px-1 py-px text-[10px] font-semibold">
              {shortcut}
            </span>
          )}
        </span>
      </div>,
      document.body,
    );
  }

  return (
    <span
      ref={ref}
      className={`inline-flex ${className}`}
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {bubble}
    </span>
  );
}
