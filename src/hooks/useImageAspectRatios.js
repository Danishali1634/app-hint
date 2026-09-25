/**
 * @file useImageAspectRatios — preloads step screenshots and reports each one's
 * natural aspect ratio (width / height).
 *
 * WHY THIS HOOK EXISTS
 *   1. The player's stage and camera math need the real image ratio BEFORE the
 *      step is shown; otherwise the zoom would target the wrong spot.
 *   2. Preloading every screenshot up front means the next step can animate in
 *      instantly instead of popping in half-loaded.
 *
 * Used by: components/walkthrough/WalkthroughPlayer.js
 */

import { useEffect, useState } from 'react';

/** @typedef {import('@/types').WalkthroughStep} WalkthroughStep */

/**
 * @param {WalkthroughStep[]} steps
 * @returns {Record<string, number>} step id → aspect ratio. A step is missing
 *   from the map until its image has loaded (or if it has no image).
 */
export function useImageAspectRatios(steps) {
  const [ratios, setRatios] = useState({});

  useEffect(() => {
    let cancelled = false; // ignore loads that finish after unmount / new steps

    for (const step of steps) {
      if (!step.imageData) continue;
      const img = new Image();
      img.onload = () => {
        if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        setRatios((prev) => ({ ...prev, [step.id]: ratio }));
      };
      // A broken image still needs a ratio so the player doesn't wait forever.
      img.onerror = () => {
        if (!cancelled) setRatios((prev) => ({ ...prev, [step.id]: 16 / 10 }));
      };
      img.src = step.imageData;
    }

    return () => {
      cancelled = true;
    };
  }, [steps]);

  return ratios;
}
