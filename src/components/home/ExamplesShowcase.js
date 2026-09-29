/**
 * @file "See it in action" — the real example courses (src/examples) as a
 * gallery: one big player + a row of selectable example cards.
 *
 * PLAYER: the real WalkthroughPlayer (variant "inline", no step list). It
 *   NEVER autoplays (the player always opens paused on step 1), and it is only
 *   mounted only when the visitor presses ▶ on the same-sized poster (the first
 *   screenshot), and then starts right away, so one click plays it. Mounting on
 *   scroll would make the player prepare the AI voice (a large one-time model
 *   download) for people who only scroll past.
 *   Picking another card remounts the player (key) so it starts fresh.
 *
 * KEYBOARD: the player listens for Space / ← / → on the whole window (it was
 *   built for full-screen playback). On a long page that would hijack Space
 *   scrolling, so a capture-phase listener lets those keys through only when
 *   focus is inside the player (typing, dialogs and menus are left alone).
 *
 * CARDS: Netflix-style row — horizontal snap-scroll on phones, 4 columns on
 *   desktop; hover lifts the card and zooms the thumbnail. Each card selects
 *   its example; "Full view" opens #/examples/:id.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Layers, Play } from 'lucide-react';
import { EXAMPLES } from '@/examples';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { Reveal, SectionHeading } from './HomeMotion';

const PLAYER_KEYS = new Set([' ', 'ArrowLeft', 'ArrowRight']);

/** Stops the player's window-level shortcuts unless focus is inside `ref`. */
function useScopedPlayerKeys(ref) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!PLAYER_KEYS.has(e.key)) return;
      const target = e.target;
      if (ref.current && ref.current.contains(target)) return;
      // The player already ignores typing; dialogs and menus keep their keys.
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.closest('[role="dialog"], [role="menu"], [role="listbox"]'))
      ) {
        return;
      }
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [ref]);
}

function ExampleCard({ example, active, onSelect, onOpen, delay }) {
  return (
    <Reveal delay={delay} className="snap-start flex-shrink-0 w-[78%] sm:w-[46%] lg:w-auto">
      <div
        className={`group relative h-full rounded-3xl border bg-panel dark:bg-panel-dark overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-glow ${
          active
            ? 'border-accent ring-2 ring-accent/30 shadow-glow'
            : 'border-line dark:border-line-dark shadow-premium hover:border-accent/50'
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={active}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-3xl"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-paper-2 dark:bg-paper-2-dark">
            <img
              src={example.steps[0].imageData}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
            <span className="absolute left-3 top-3 rounded-full bg-black/55 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white">
              {example.useCase}
            </span>
            <span
              className={`absolute right-3 bottom-3 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                active
                  ? 'bg-accent text-white scale-100'
                  : 'bg-white/90 text-ink scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100'
              }`}
              aria-hidden="true"
            >
              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
            </span>
            {active && (
              <span className="absolute left-3 bottom-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-dark hm-rec" /> In the player
              </span>
            )}
          </div>
          <div className="p-4 pb-2">
            <h3 className="font-semibold text-ink dark:text-white leading-snug line-clamp-2 min-h-[2.75rem]">
              {example.title}
            </h3>
          </div>
        </button>
        <div className="px-4 pb-4 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint dark:text-ink-faint-dark">
            <Layers className="w-3.5 h-3.5" /> {example.steps.length} steps
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            Full view <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export function ExamplesShowcase() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(EXAMPLES[0]?.id);
  const [started, setStarted] = useState(false); // player mounted by a click on the poster
  const playerWrapRef = useRef(null);
  useScopedPlayerKeys(playerWrapRef);
  // Right after the poster click mounts the player, press its ▶ (still the same user gesture).
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (!started || !autoStartRef.current) return;
    autoStartRef.current = false;
    // The ▶ appears once the first screenshot has loaded: look for it briefly.
    let tries = 0;
    const timer = setInterval(() => {
      const play = playerWrapRef.current?.querySelector('button[aria-label="Play walkthrough"]');
      if (play || ++tries > 20) clearInterval(timer);
      play?.click();
    }, 100);
    return () => clearInterval(timer);
  }, [started, selectedId]);

  const example = EXAMPLES.find((ex) => ex.id === selectedId) ?? EXAMPLES[0];
  if (!example) return null;

  return (
    <section className="relative">
      <SectionHeading
        eyebrow="See it in action"
        title="Real walkthroughs, ready to play"
        intro="Complete example courses, made with Hint Studio. Press play — this is exactly what your viewers will see."
      />

      <Reveal>
        <div className="relative rounded-[2rem] p-px bg-gradient-to-b from-accent/40 via-line to-line dark:from-accent/50 dark:via-line-dark dark:to-line-dark shadow-premium">
          <div className="rounded-[calc(2rem-1px)] bg-panel dark:bg-panel-dark p-2 sm:p-3">
            {/* Title bar */}
            <div className="flex items-center justify-between gap-3 px-2 sm:px-3 pt-1 pb-3">
              <p className="min-w-0 flex items-center gap-2 text-xs font-semibold text-ink-soft dark:text-ink-soft-dark">
                <span className="relative flex w-2 h-2 flex-shrink-0">
                  <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-50 motion-reduce:animate-none" />
                  <span className="relative w-2 h-2 rounded-full bg-accent" />
                </span>
                <span className="hidden sm:inline whitespace-nowrap uppercase tracking-[0.14em] text-accent">
                  Now playing
                </span>
                <span className="truncate">
                  {example.useCase} · {example.steps.length} steps
                </span>
              </p>
              <button
                type="button"
                onClick={() => navigate(`/examples/${example.id}`)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-line dark:border-line-dark text-sm font-semibold text-ink dark:text-ink-soft-dark hover:border-accent hover:text-accent transition-colors"
              >
                <span className="hidden sm:inline">Open full view</span>
                <span className="sm:hidden">Open</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            {/* Player (or its poster until the visitor presses ▶) */}
            <div ref={playerWrapRef} className="h-[min(64vh,600px)] min-h-[340px] sm:min-h-[420px]">
              {started ? (
                <WalkthroughPlayer
                  key={example.id}
                  steps={example.steps}
                  title={example.title}
                  variant="inline"
                  hideStepList
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    autoStartRef.current = true;
                    setStarted(true);
                  }}
                  className="group relative w-full h-full rounded-3xl overflow-hidden border border-line dark:border-line-dark bg-paper dark:bg-paper-dark"
                  aria-label={`Play “${example.title}”`}
                >
                  <img
                    src={example.steps[0].imageData}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain opacity-70 group-hover:opacity-90 transition-opacity"
                  />
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <span className="w-20 h-20 rounded-full bg-accent text-white flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
                      <Play className="w-9 h-9 ml-1" fill="currentColor" />
                    </span>
                    <span className="px-4 py-1.5 rounded-full bg-panel/90 dark:bg-panel-dark/90 text-sm font-semibold text-ink dark:text-ink-soft-dark shadow">
                      Play “{example.title}”
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Example row */}
      <div className="mt-6 -mx-4 px-4 sm:mx-0 sm:px-0 flex lg:grid lg:grid-cols-4 gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pt-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {EXAMPLES.map((ex, i) => (
          <ExampleCard
            key={ex.id}
            example={ex}
            active={ex.id === example.id}
            delay={i * 90}
            onSelect={() => setSelectedId(ex.id)}
            onOpen={() => navigate(`/examples/${ex.id}`)}
          />
        ))}
      </div>
    </section>
  );
}
