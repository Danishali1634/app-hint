/**
 * @file Closing call to action: a bold line and the same two ways to start
 * as the hero (screenshots → #/new, record → #/new?mode=video).
 *
 * BACKGROUND: a slowly panning blue → cyan gradient (hm-pan) with two soft
 * light blobs and a faint grid on top. It is the one intentionally "loud"
 * surface on the page, so it looks the same in light and dark mode
 * (white text on the brand gradient).
 */

import { useNavigate } from 'react-router-dom';
import { Images, ArrowRight } from 'lucide-react';
import { Reveal } from './HomeMotion';

const GRID_MASK = 'radial-gradient(ellipse at center, #000 20%, transparent 70%)';

export function FinalCta() {
  const navigate = useNavigate();
  return (
    <Reveal as="section">
      <div className="relative isolate overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 sm:py-20 text-center shadow-glow">
        {/* Animated brand gradient */}
        <div
          className="hm-pan absolute inset-0 -z-10 bg-gradient-to-br from-accent-dark via-accent to-violet"
          aria-hidden="true"
        />
        <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="hm-blob-a absolute -top-24 -left-10 w-80 h-80 rounded-full bg-white/20 blur-3xl" />
          <div className="hm-blob-b absolute -bottom-24 right-0 w-96 h-96 rounded-full bg-violet-dark/40 blur-3xl" />
          <div
            className="absolute inset-0 text-white/10"
            style={{
              backgroundImage:
                'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: GRID_MASK,
              WebkitMaskImage: GRID_MASK,
            }}
          />
        </div>

        <h2 className="mx-auto max-w-3xl text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white text-balance">
          Your next feature deserves a walkthrough.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg text-white/85">
          Make your first one in a few minutes. Works with any software.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/new')}
            className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-white text-accent-ink font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            <Images className="w-5 h-5" />
            Start with screenshots
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/new?mode=video')}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl border border-white/40 bg-white/10 backdrop-blur text-white font-semibold hover:bg-white/20 hover:-translate-y-0.5 transition-all"
          >
            <span className="w-3 h-3 rounded-full bg-white hm-rec" aria-hidden="true" />
            Record my screen
          </button>
        </div>
      </div>
    </Reveal>
  );
}
