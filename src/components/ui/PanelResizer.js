/**
 * @file Vertical drag handle between two side-by-side panels (split pane).
 * Dragging reports the horizontal movement since the drag started; the
 * parent turns that into a panel width (and clamps it). Double-click resets.
 * Keyboard: ←/→ move it by 16px when focused. Hidden below the lg breakpoint,
 * where panels stack instead of sitting side by side.
 */

import { useRef } from 'react';

/**
 * @param {{
 *   onResizeStart?: () => void,          // remember the width at drag start
 *   onResize: (dx: number) => void,      // px moved since the drag started
 *   onReset?: () => void,
 *   label: string,
 * }} props
 */
export function PanelResizer({ onResizeStart, onResize, onReset, label }) {
  const startX = useRef(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label} (double-click to reset)`}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        startX.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
        onResizeStart?.();
      }}
      onPointerMove={(e) => {
        if (startX.current !== null) onResize(e.clientX - startX.current);
      }}
      onPointerUp={() => {
        startX.current = null;
      }}
      onPointerCancel={() => {
        startX.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onResizeStart?.();
        onResize(e.key === 'ArrowLeft' ? -16 : 16);
      }}
      className="group hidden lg:flex w-3 flex-shrink-0 cursor-col-resize items-stretch justify-center outline-none"
      style={{ touchAction: 'none' }}
    >
      <span className="w-px bg-line dark:bg-line-dark group-hover:w-1 group-hover:bg-accent/60 group-focus-visible:w-1 group-focus-visible:bg-accent transition-all rounded-full" />
    </div>
  );
}

/** Reads a remembered number (e.g. a panel width); falls back when storage is unavailable. */
export function readStoredNumber(key, fallback) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Remembers a value for the next visit (per-browser convenience only). */
export function storeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // private mode / blocked storage: the setting just isn't remembered
  }
}
