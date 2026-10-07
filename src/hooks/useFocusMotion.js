/**
 * @file Drives the walkthrough's one persistent focus (utils/focusMotion).
 *
 * Give it where the focus should be NOW (camera view + target boxes); it
 * returns the frame to draw this instant. When the target changes, the focus
 * morphs from wherever it currently is — even mid-move — to the new target on
 * one requestAnimationFrame clock, so camera and focus can never drift apart.
 * Nothing is recreated between steps: as long as the component using it stays
 * mounted (the same page), it is the same focus.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { easeInOut, focusFrameAt, matchFocusBoxes } from '@/utils/focusMotion';

/** @typedef {import('@/utils/focusMotion').FocusFrame} FocusFrame */

const round = (n) => Math.round(n * 1000) / 1000;
const keyOf = ({ view, boxes }) =>
  [view.s, view.tx, view.ty, ...boxes.flatMap((b) => [b.x, b.y, b.w, b.h])].map(round).join(',');

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {FocusFrame} target    where the focus should be
 * @param {number} durationMs    how long a move takes (the course's pace)
 * @returns {FocusFrame}
 */
export function useFocusMotion(target, durationMs) {
  const [frame, setFrame] = useState(target);
  const frameRef = useRef(target);
  const targetRef = useRef(target);
  targetRef.current = target;
  const key = keyOf(target);

  useLayoutEffect(() => {
    const from = frameRef.current;
    let to = targetRef.current;
    // No target (a step without an area): the focus keeps its shape where it
    // is while it fades; only the camera moves.
    if (!to.boxes.length) to = { ...to, boxes: from.boxes };
    if (keyOf(from) === keyOf(to)) return undefined;

    const finish = () => {
      frameRef.current = to;
      setFrame(to);
    };
    if (durationMs <= 0 || reducedMotion()) {
      finish();
      return undefined;
    }

    const pairs = matchFocusBoxes(from.boxes, to.boxes);
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / durationMs);
      if (p >= 1) {
        finish();
        return;
      }
      const next = focusFrameAt(from, to, easeInOut(p), pairs);
      frameRef.current = next;
      setFrame(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, durationMs]);

  return frame;
}
