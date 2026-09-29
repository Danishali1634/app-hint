/**
 * @file Looping animated demo on the Home page: shows in ~10 seconds what a
 * Hint Studio walkthrough does, so visitors understand the product without
 * reading anything.
 *
 * STORY (timings in index.css → "Tutorial animations")
 *   1. A pointer drags a box over the "View graph data" button (select area)
 *   2. The camera zooms in and the rest of the page dims (focus)
 *   3. The pointer clicks — ripple (show the click)
 *   4. The graph modal opens out of the button, bars grow (next screen)
 *
 * Pure CSS (no JS timers): cheap, smooth, and it freezes for users who prefer
 * reduced motion. Everything is positioned in % of a 16:10 box.
 */

import { Crosshair, ZoomIn, MousePointerClick, PanelsTopLeft } from 'lucide-react';

const CAPTIONS = [
  { Icon: Crosshair, text: 'Select the feature' },
  { Icon: ZoomIn, text: 'It zooms in' },
  { Icon: MousePointerClick, text: 'It shows the click' },
  { Icon: PanelsTopLeft, text: 'The next screen opens' },
];

/** The same pointer shape the real player uses. */
function Pointer({ className = '' }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 2 L3 19.5 L7.8 15.2 L11 22 L14.2 20.6 L11.1 13.9 L17.6 13.9 Z"
        fill="#ffffff"
        stroke="#111827"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HowItWorksDemo() {
  return (
    <div className="w-full">
      {/* App window */}
      <div className="relative mx-auto max-w-3xl rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 h-9 border-b border-line dark:border-line-dark bg-paper-2/60 dark:bg-paper-2-dark/60">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] text-ink-faint dark:text-ink-faint-dark">
            your-app.com / business-reports
          </span>
        </div>

        <div className="relative aspect-[16/10] overflow-hidden bg-[#f5f6fa]">
          {/* Camera: the fake page zooms in on the button */}
          <div className="demo-loop demo-camera absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[9%] bg-[#1f2a44] flex items-center px-[3%]">
              <span className="h-[28%] w-[18%] rounded bg-white/70" />
            </div>
            <div className="absolute left-[4%] top-[15%] h-[5%] w-[26%] rounded bg-[#1f2a44]/80" />
            {/* The feature: "View graph data" button */}
            <div className="absolute left-[66%] top-[14%] w-[22%] h-[9%] rounded-md bg-[#0F766E] flex items-center justify-center">
              <span className="text-[9px] sm:text-[11px] font-semibold text-white whitespace-nowrap">
                View graph data
              </span>
            </div>
            {/* Table rows */}
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="absolute left-[4%] right-[4%] h-[6.5%] border border-[#dde1ea] bg-white flex items-center gap-[4%] px-[2%]"
                style={{ top: `${29 + i * 8}%` }}
              >
                <span className="h-[30%] w-[14%] rounded bg-[#cfd5e2]" />
                <span className="h-[30%] w-[22%] rounded bg-[#e3e7ef]" />
                <span className="h-[30%] w-[10%] rounded bg-[#e3e7ef]" />
              </div>
            ))}
            {/* Spotlight (dims everything except the button) */}
            <div
              className="demo-loop demo-spot absolute left-[65%] top-[13%] w-[24%] h-[11%] rounded-lg ring-2 ring-accent"
              style={{ boxShadow: '0 0 0 999px rgba(8,8,10,0.55)' }}
            />
            {/* Selection box being dragged */}
            <div className="demo-loop demo-select absolute left-[65%] top-[13%] rounded-md border-2 border-dashed border-accent bg-accent/15" />
          </div>

          {/* Pointer + click ripple (outside the camera, stays crisp) */}
          <div className="demo-loop demo-pointer absolute z-10 -ml-[3px] -mt-[2px]">
            <div className="demo-loop demo-press" style={{ transformOrigin: '0 0' }}>
              <Pointer className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]" />
            </div>
          </div>
          <span
            className="demo-loop demo-ripple absolute z-10 w-16 h-16 rounded-full border-4 border-accent"
            style={{ left: '77%', top: '18.5%' }}
          />

          {/* Next screen: the graph modal opens out of the button */}
          <div className="demo-loop demo-modal absolute z-20 left-[20%] top-[18%] w-[60%] h-[64%] rounded-xl bg-white shadow-2xl border border-black/5 p-[3%]">
            <div className="h-[9%] w-[35%] rounded bg-[#1f2a44]/80" />
            <div className="absolute left-[8%] right-[8%] bottom-[10%] top-[26%] flex items-end gap-[5%] border-l-2 border-b-2 border-[#333]/60 px-[3%]">
              {[40, 70, 55, 92, 34].map((h, i) => (
                <span
                  key={i}
                  className="demo-loop demo-bar flex-1 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: i === 3 ? '#f97316' : '#1570EF',
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Captions light up in turn with the animation */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl mx-auto">
        {CAPTIONS.map(({ Icon, text }, i) => (
          <div
            key={text}
            className="demo-caption flex items-center gap-2 justify-center rounded-xl border border-line dark:border-line-dark bg-panel/70 dark:bg-panel-dark/70 px-3 py-2 text-xs font-medium text-ink dark:text-ink-soft-dark"
            style={{ animationDelay: `${i * 2.5 - 0.2}s` }}
          >
            <span className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <Icon className="w-3.5 h-3.5 text-accent" />
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}
