/**
 * @file useSortableList — drag a row to a new place in a vertical list, the
 * way a YouTube playlist is reordered.
 *
 * WHAT THE USER SEES
 *   The grabbed row lifts (shadow) and follows the pointer; the other rows
 *   slide out of its way as it passes them, so the list always shows the order
 *   it will have on release. On release the row settles into its gap and
 *   `onMove(from, to)` reports the change. Near the top/bottom edge of a
 *   scrolling list, the list scrolls by itself.
 *
 * HOW
 *   Pointer events (not HTML5 drag & drop: that shows a ghost image and never
 *   moves the other rows). While dragging, `order` is a PREVIEW of the new
 *   order; the component renders its rows in that order. Rows that changed
 *   place slide there (FLIP: measure before, measure after, animate the
 *   difference). The dragged row gets a translateY that keeps it under the
 *   pointer whatever its current layout position.
 *
 *   Mouse: the whole row can be grabbed (a click without movement stays a
 *   click). Touch / pen: only the element marked `data-drag-handle` starts a
 *   drag (elsewhere the finger scrolls the list); give it `touch-action: none`.
 *
 * Used by: components/course/StepRail.js, pages/VideoTour/VideoTourParts.js
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 4;
const SLIDE_MS = 160;
const EDGE_PX = 40;
const MAX_SCROLL_PX = 14;

function scrollParent(el) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/**
 * @param {{
 *   ids: string[],                              // the rows, in their real order
 *   onMove: (from: number, to: number) => void, // positions in `ids`
 *   disabled?: boolean,
 * }} options
 * @returns {{
 *   order: string[],                  // render the rows in this order
 *   draggingId: string | null,
 *   rowProps: (id: string) => object, // spread on each row element
 * }}
 */
export function useSortableList({ ids, onMove, disabled = false }) {
  const [preview, setPreview] = useState(null); // string[] while dragging / settling
  const [draggingId, setDraggingId] = useState(null);
  const nodes = useRef(new Map()); // id → element
  const drag = useRef(null);
  const firstTops = useRef(null); // FLIP: row tops before a preview change
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const idsKey = ids.join('|');
  // The parent applied the move (or the list changed): the real order takes over.
  useEffect(() => setPreview(null), [idsKey]);

  const order = preview && preview.length === ids.length ? preview : ids;
  const orderRef = useRef(order);
  orderRef.current = order;

  // FLIP: rows that changed place start where they were and slide to their new place.
  useLayoutEffect(() => {
    const before = firstTops.current;
    if (!before) return;
    firstTops.current = null;
    for (const [id, el] of nodes.current) {
      if (id === drag.current?.id || !before.has(id)) continue;
      const delta = before.get(id) - el.getBoundingClientRect().top;
      if (!delta) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      el.getBoundingClientRect(); // apply the start position before animating
      el.style.transition = `transform ${SLIDE_MS}ms ease`;
      el.style.transform = '';
    }
    positionDragged();
  });

  /** Keeps the dragged row under the pointer, whatever its layout position now. */
  const positionDragged = () => {
    const d = drag.current;
    const el = d && nodes.current.get(d.id);
    if (!d?.active || !el) return;
    const layoutTop = el.getBoundingClientRect().top - d.offset;
    d.offset = d.startTop + (d.pointerY - d.startY) - layoutTop;
    el.style.transform = `translateY(${d.offset}px) scale(1.02)`;
  };

  /** Moves the dragged row in the preview when the pointer passes a neighbour's middle. */
  const reorderUnderPointer = () => {
    const d = drag.current;
    const current = orderRef.current;
    const at = current.indexOf(d.id);
    const middle = (id) => {
      const r = nodes.current.get(id)?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : null;
    };
    let to = at;
    while (to > 0 && d.pointerY < (middle(current[to - 1]) ?? -Infinity)) to--;
    while (to < current.length - 1 && d.pointerY > (middle(current[to + 1]) ?? Infinity)) to++;
    if (to === at) return;
    const next = current.filter((id) => id !== d.id);
    next.splice(to, 0, d.id);
    firstTops.current = new Map(
      [...nodes.current].map(([id, el]) => [id, el.getBoundingClientRect().top]),
    );
    setPreview(next);
  };

  const autoScroll = () => {
    const d = drag.current;
    if (!d?.active) return;
    const box = d.scroller?.getBoundingClientRect();
    if (box) {
      let speed = 0;
      if (d.pointerY < box.top + EDGE_PX) speed = -((box.top + EDGE_PX - d.pointerY) / EDGE_PX);
      else if (d.pointerY > box.bottom - EDGE_PX)
        speed = (d.pointerY - (box.bottom - EDGE_PX)) / EDGE_PX;
      if (speed) {
        d.scroller.scrollTop += Math.max(-1, Math.min(1, speed)) * MAX_SCROLL_PX;
        positionDragged();
        reorderUnderPointer();
      }
    }
    d.frame = requestAnimationFrame(autoScroll);
  };

  const finish = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    window.removeEventListener('pointermove', d.onPointerMove);
    window.removeEventListener('pointerup', d.onPointerUp);
    window.removeEventListener('pointercancel', d.onPointerUp);
    cancelAnimationFrame(d.frame);
    if (!d.active) return;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    // The click that follows a drag must not also select the row.
    const swallow = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    // Settle into the gap.
    const el = nodes.current.get(d.id);
    if (el) {
      el.style.transition = `transform ${SLIDE_MS}ms ease`;
      el.style.transform = '';
    }
    setDraggingId(null);
    const from = ids.indexOf(d.id);
    const to = orderRef.current.indexOf(d.id);
    if (from >= 0 && to >= 0 && from !== to) onMoveRef.current(from, to);
    else setPreview(null);
    // `ids` changes with every parent render; read it fresh via the closure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => finish, [finish]); // unmount mid-drag: clean up

  const rowProps = (id) => ({
    ref: (el) => {
      if (el) nodes.current.set(id, el);
      else nodes.current.delete(id);
    },
    'data-sort-id': id,
    style: draggingId === id ? { position: 'relative', zIndex: 20 } : undefined,
    onPointerDown: (e) => {
      if (disabled || ids.length < 2 || e.button !== 0 || drag.current) return;
      const el = nodes.current.get(id);
      // Lists can nest (steps inside a screen): the innermost row handles it.
      if (!el || e.target.closest?.('[data-sort-id]') !== el) return;
      const onHandle = !!e.target.closest?.('[data-drag-handle]');
      if (e.pointerType !== 'mouse' && !onHandle) return; // touch elsewhere scrolls
      if (!onHandle && e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const d = {
        id,
        active: false,
        startY: e.clientY,
        pointerY: e.clientY,
        startTop: el.getBoundingClientRect().top,
        offset: 0,
        scroller: scrollParent(el),
        frame: 0,
      };
      d.onPointerMove = (ev) => {
        d.pointerY = ev.clientY;
        if (!d.active) {
          if (Math.abs(ev.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
          d.active = true;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
          el.style.transition = 'none';
          setDraggingId(id);
          setPreview(orderRef.current);
          d.frame = requestAnimationFrame(autoScroll);
        }
        ev.preventDefault();
        positionDragged();
        reorderUnderPointer();
      };
      d.onPointerUp = finish;
      drag.current = d;
      window.addEventListener('pointermove', d.onPointerMove, { passive: false });
      window.addEventListener('pointerup', d.onPointerUp);
      window.addEventListener('pointercancel', d.onPointerUp);
    },
  });

  return { order, draggingId, rowProps };
}
