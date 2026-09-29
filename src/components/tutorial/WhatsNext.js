/**
 * @file "What to do next?" — a small button that opens a card listing the
 * choices a creator has right now, each in one plain sentence with a picture
 * and buttons to do it (or to watch how). So nobody has to guess what
 * "Add screen" does, or that drawing another box simply adds the next feature.
 *
 *   <WhatsNext options={[
 *     { art: 'draw', title: 'Highlight more on this screen',
 *       text: 'Just draw another box …', actions: [{ label: 'Show me', onClick }] },
 *     …
 *   ]}/>
 *
 * The card is portaled to <body> (fixed, above the button, kept on screen) so
 * no panel can clip it. Closes on a pick, a click outside, Esc or scrolling.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, X } from 'lucide-react';

const CARD_W = 340;

/**
 * @param {{
 *   options: { art?: 'draw' | 'screen' | 'save' | 'video', title: string, text: string,
 *              actions?: { label: string, onClick: () => void, primary?: boolean }[] }[],
 *   label?: string,
 * }} props
 */
export function WhatsNext({ options, label = 'What to do next?' }) {
  const [anchor, setAnchor] = useState(null);
  const btnRef = useRef(null);
  const cardRef = useRef(null);
  const close = () => setAnchor(null);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e) =>
      !btnRef.current?.contains(e.target) && !cardRef.current?.contains(e.target) && close();
    const onKey = (e) => e.key === 'Escape' && close();
    const onScroll = (e) => !cardRef.current?.contains(e.target) && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  let card = null;
  if (anchor) {
    const left = Math.min(
      window.innerWidth - CARD_W - 12,
      Math.max(12, anchor.left + anchor.width / 2 - CARD_W / 2),
    );
    const below = anchor.top < 420;
    card = createPortal(
      <div
        ref={cardRef}
        role="dialog"
        aria-label={label}
        className="fixed z-[150] rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-2xl p-3 animate-in"
        style={{
          left,
          width: CARD_W,
          ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }),
        }}
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink dark:text-white">
            <Lightbulb className="w-4 h-4 text-amber-500" /> {label}
          </p>
          <button
            onClick={close}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {options.map((option) => (
            <li
              key={option.title}
              className="flex gap-3 rounded-xl border border-line dark:border-line-dark p-2.5"
            >
              <Art kind={option.art} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink dark:text-white">{option.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-ink-soft dark:text-ink-faint-dark">
                  {option.text}
                </p>
                {option.actions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {option.actions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => {
                          close();
                          action.onClick();
                        }}
                        className={`px-2.5 h-7 rounded-lg text-xs font-semibold transition-colors ${
                          action.primary
                            ? 'bg-accent text-white hover:bg-accent-dark'
                            : 'border border-line dark:border-line-dark text-ink dark:text-ink-soft-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() =>
          setAnchor((a) => (a ? null : (btnRef.current?.getBoundingClientRect() ?? null)))
        }
        className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
      >
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {card}
    </>
  );
}

/** Tiny pictures that show each choice at a glance. */
function Art({ kind }) {
  const frame =
    'relative w-16 h-12 flex-shrink-0 rounded-lg overflow-hidden border border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark';
  if (kind === 'draw') {
    return (
      <span className={frame} aria-hidden="true">
        <span className="absolute inset-x-0 top-0 h-2 bg-[#1f2a44]" />
        <span className="absolute left-1.5 top-4 w-5 h-3 rounded-sm border-2 border-accent/50" />
        <span className="mini-select-box absolute left-[45%] top-[45%] rounded-sm border-2 border-dashed border-accent bg-accent/15" />
      </span>
    );
  }
  if (kind === 'screen') {
    return (
      <span className={frame} aria-hidden="true">
        <span className="absolute left-1 top-1.5 w-7 h-9 rounded bg-white dark:bg-white/10 border border-line dark:border-line-dark" />
        <span className="absolute left-5 top-2.5 w-7 h-8 rounded bg-white dark:bg-white/20 border-2 border-accent shadow" />
        <span className="absolute right-1 bottom-1 text-[9px] font-bold text-accent">+2</span>
      </span>
    );
  }
  if (kind === 'video') {
    return (
      <span className={`${frame} flex items-center justify-center`} aria-hidden="true">
        <span className="w-0 h-0 border-y-[7px] border-y-transparent border-l-[11px] border-l-accent ml-1" />
        <span className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-line dark:bg-line-dark">
          <span className="block w-1/2 h-full rounded-full bg-accent" />
        </span>
      </span>
    );
  }
  return (
    <span className={`${frame} flex items-center justify-center`} aria-hidden="true">
      <span className="w-7 h-7 rounded-full bg-teal text-white flex items-center justify-center text-sm font-bold">
        ✓
      </span>
    </span>
  );
}
