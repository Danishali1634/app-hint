/**
 * @file useInView — true once an element has scrolled into view.
 *
 * WHY THIS HOOK EXISTS
 *   Section animations (e.g. stat cards counting up) should play when the
 *   visitor actually reaches them, not on page load where nobody sees them.
 *   IntersectionObserver reports that cheaply without scroll listeners.
 *   It fires once (`once` = stays true), so content never disappears again.
 *
 * Used by: components/tutorial/Highlights.js
 */

import { useEffect, useRef, useState } from 'react';

/**
 * @param {{ threshold?: number, rootMargin?: string }} [options]
 * @returns {[import('react').MutableRefObject<HTMLElement | null>, boolean]}
 */
export function useInView({ threshold = 0.15, rootMargin = '0px 0px -10% 0px' } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Old browsers / reduced motion: just show it.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
}
