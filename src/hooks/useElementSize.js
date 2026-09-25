/**
 * @file useElementSize — live width/height of a DOM element.
 *
 * WHY THIS HOOK EXISTS
 *   The walkthrough "stage" must have EXACTLY the screenshot's aspect ratio
 *   (so region percentages line up with the pixels they were drawn on) while
 *   fitting inside whatever space the player has — which changes with window
 *   size, mobile rotation, fullscreen, etc. CSS alone can't "fit a fixed ratio
 *   inside a box of unknown height", so we measure the box and compute the size.
 *
 * WHY ResizeObserver (not window 'resize')
 *   It reports the element's own size changes (including layout changes that
 *   aren't window resizes) and fires once immediately on observe.
 *
 * WHY A CALLBACK REF (not useRef)
 *   The measured element can be REPLACED — e.g. the player swaps between its
 *   normal and compact layouts. A callback ref tells us about every new node,
 *   so we always observe the element that is actually on screen.
 *
 * Used by: components/walkthrough/WalkthroughPlayer.js
 */

import { useCallback, useEffect, useState } from 'react';

/**
 * @returns {[
 *   (node: HTMLElement | null) => void,   // pass as `ref={...}`
 *   { width: number, height: number },
 *   HTMLElement | null,                   // the element itself (e.g. for fullscreen)
 * ]}
 */
export function useElementSize() {
  const [node, setNode] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((element) => setNode(element), []);

  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Only update on real changes, to avoid needless re-renders.
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, size, node];
}
