/**
 * @file The happy ending of the live player — the same card as the end of the
 * downloaded video (services/video/renderFrame drawOutro): the screen dims,
 * sparkles rise around a glowing circle, a check mark draws itself, then
 * "You're all set!", what was learned and "n steps · Happy working! 🎉"
 * (wording shared via OUTRO_TEXT). Plus a Watch again button.
 * Animations: .hs-outro* in index.css (off with prefers-reduced-motion).
 */

import { RotateCcw } from 'lucide-react';
import { OUTRO_TEXT } from '@/constants';

const SPARKS = 18;
const SPARK_COLORS = ['#FFFFFF', '#1570EF', '#2DD4BF']; // white · accent · teal (as in the video)

/**
 * @param {{
 *   title: string,
 *   stepCount: number,
 *   onRestart: () => void,
 *   compact?: boolean,     // small embeds
 * }} props
 */
export function OutroCard({ title, stepCount, onRestart, compact = false }) {
  const circle = compact ? 56 : 96;

  return (
    <div
      role="status"
      className="hs-outro absolute inset-0 z-30 flex flex-col items-center justify-center text-center px-6 bg-[rgba(9,9,11,0.78)] backdrop-blur-[2px] text-white overflow-hidden rounded-[inherit]"
    >
      {/* Badge: sparkles + glowing circle + self-drawing check */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: circle, height: circle }}
      >
        {!compact &&
          Array.from({ length: SPARKS }, (_, n) => {
            const angle = (n / SPARKS) * Math.PI * 2;
            const size = 5 + (n % 3) * 2;
            return (
              <span
                key={n}
                aria-hidden
                className="hs-outro-spark absolute rounded-full pointer-events-none"
                style={{
                  width: size,
                  height: size,
                  left: `calc(50% - ${size / 2}px)`,
                  top: `calc(50% - ${size / 2}px)`,
                  background: SPARK_COLORS[n % 3],
                  '--dx': Math.cos(angle).toFixed(3),
                  '--dy': Math.sin(angle).toFixed(3),
                  animationDelay: `${-((n * 0.37) % 1) * 1.6}s`,
                }}
              />
            );
          })}
        <svg
          viewBox="0 0 108 108"
          aria-hidden
          className="hs-outro-pop relative w-full h-full rounded-full"
          style={{ boxShadow: '0 0 40px rgba(21, 112, 239, 0.8)' }}
        >
          <circle cx="54" cy="54" r="54" fill="#1570EF" />
          <path
            className="hs-outro-check"
            d="M32 56 L48 72 L78 38"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <p
        className={`hs-outro-rise font-bold ${compact ? 'mt-3 text-lg' : 'mt-7 text-3xl sm:text-4xl'}`}
        style={{ animationDelay: '900ms' }}
      >
        {OUTRO_TEXT.heading}
      </p>
      <p
        className={`hs-outro-rise max-w-xl line-clamp-2 break-words font-medium text-white/80 ${
          compact ? 'mt-1 text-xs' : 'mt-2 text-base sm:text-lg'
        }`}
        style={{ animationDelay: '1000ms' }}
      >
        {OUTRO_TEXT.learned(title)}
      </p>
      {!compact && (
        <p
          className="hs-outro-rise mt-2 text-sm font-medium text-white/55"
          style={{ animationDelay: '1500ms' }}
        >
          {OUTRO_TEXT.tagline(stepCount)}
        </p>
      )}

      <button
        onClick={onRestart}
        className={`hs-outro-rise flex items-center gap-1.5 rounded-full bg-accent font-semibold hover:bg-accent-dark transition-colors shadow-lg ${
          compact ? 'mt-3 px-3 py-1.5 text-xs' : 'mt-6 px-4 py-2 text-sm'
        }`}
        style={{ animationDelay: '1700ms' }}
      >
        <RotateCcw className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> Watch again
      </button>
    </div>
  );
}
