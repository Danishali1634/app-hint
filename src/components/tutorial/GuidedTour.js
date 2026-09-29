/**
 * @file Coach-mark tour: spotlights real elements of the page one by one.
 *
 *   <GuidedTour
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     steps={[{ target: 'save', title: 'Save once', text: 'One sentence.' }]}
 *   />
 *
 * Each step's `target` matches an element with `data-tour="<target>"`. Steps
 * whose element is not on the page are skipped. The page is dimmed by one
 * huge box-shadow around a cut-out over the element (recomputed on resize and
 * scroll); a small card next to it shows the title, one sentence, "n of N",
 * Back / Next / Got it and Skip. Esc closes, ← / → move.
 *
 * Portaled to document.body above the page (tooltips still show on top).
 * With prefers-reduced-motion the spotlight jumps instead of gliding.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

const PAD = 8; // space between the element and the cut-out, px
const GAP = 12; // space between the cut-out and the card, px
const CARD_WIDTH = 300;
const EDGE = 12;

const findTarget = (id) => document.querySelector(`[data-tour="${id}"]`);

/**
 * @param {{
 *   steps: { target: string, title: string, text: string }[],
 *   open: boolean,
 *   onClose: () => void,
 * }} props
 */
export function GuidedTour({ steps, open, onClose }) {
  const [visible, setVisible] = useState([]); // steps whose target exists
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardHeight, setCardHeight] = useState(180);
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const latest = useRef({ steps, onClose });
  latest.current = { steps, onClose };

  // Opening: keep only steps that are on the page right now.
  useEffect(() => {
    if (!open) return;
    const present = latest.current.steps.filter((s) => findTarget(s.target));
    setVisible(present);
    setIndex(0);
    if (!present.length) latest.current.onClose();
  }, [open]);

  const step = visible[index];

  const measure = useCallback(() => {
    const el = step && findTarget(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const box = el.getBoundingClientRect();
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [step]);

  // New step: bring the element into view, then measure.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
  }, [open, step, measure]);

  useEffect(() => {
    if (!open || !step) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const el = findTarget(step.target);
    const observer =
      el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (el) observer?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
    };
  }, [open, step, measure]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [step, rect]);

  useEffect(() => {
    if (open && step) nextRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  const isLast = index >= visible.length - 1;
  const next = useCallback(() => {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  }, [isLast, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [open, onClose, next, back]);

  if (!open || !step || !rect) return null;

  // Cut-out around the element, kept inside the window.
  const hole = {
    top: Math.max(4, rect.top - PAD),
    left: Math.max(4, rect.left - PAD),
    width: Math.min(window.innerWidth - 8, rect.width + PAD * 2),
    height: Math.min(window.innerHeight - 8, rect.height + PAD * 2),
  };

  // Card: below the element, else above, else over its bottom edge.
  const width = Math.min(CARD_WIDTH, window.innerWidth - EDGE * 2);
  const left = Math.min(
    window.innerWidth - EDGE - width,
    Math.max(EDGE, hole.left + hole.width / 2 - width / 2),
  );
  let top = hole.top + hole.height + GAP;
  if (top + cardHeight > window.innerHeight - EDGE) {
    const above = hole.top - GAP - cardHeight;
    top =
      above >= EDGE
        ? above
        : Math.max(
            EDGE,
            Math.min(
              window.innerHeight - EDGE - cardHeight,
              hole.top + hole.height - cardHeight - GAP,
            ),
          );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[150]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hs-tour-title"
    >
      {/* Blocks the page while the tour is open */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Spotlight */}
      <div
        className="absolute rounded-xl ring-2 ring-accent pointer-events-none transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{ ...hole, boxShadow: '0 0 0 9999px rgba(8, 8, 10, 0.6)' }}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        ref={cardRef}
        className="absolute rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl p-4 transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{ top, left, width }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="hs-tour-title" className="text-base font-bold text-ink dark:text-ink-soft-dark">
            {step.title}
          </h2>
          <Tooltip label="Close the tour" shortcut="Esc">
            <button
              onClick={onClose}
              className="w-7 h-7 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-ink-faint dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
        <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">{step.text}</p>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-faint dark:text-ink-faint-dark tabular-nums mr-auto">
            {index + 1} of {visible.length}
          </span>
          {!isLast && (
            <Tooltip label="Skip the tour">
              <button
                onClick={onClose}
                className="px-2 h-8 text-xs font-semibold text-ink-soft dark:text-ink-soft-dark hover:underline"
              >
                Skip
              </button>
            </Tooltip>
          )}
          {index > 0 && (
            <Tooltip label="Previous tip" shortcut="←">
              <button
                onClick={back}
                className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            </Tooltip>
          )}
          <Tooltip
            label={isLast ? 'Close the tour' : 'Next tip'}
            shortcut={isLast ? undefined : '→'}
          >
            <button
              ref={nextRef}
              onClick={next}
              className="flex items-center gap-1 px-3 h-8 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark"
            >
              {isLast ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Got it
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}
