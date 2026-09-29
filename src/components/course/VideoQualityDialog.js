/**
 * @file Asks which quality to download the walkthrough video in, before the
 * export starts: Full HD (1080p). (The "Fast" 480p option is disabled for
 * now — kept commented out for later.) Driven by hooks/useCourseSharing.
 */

import { useEffect, useRef, useState } from 'react';
import { Film, Sparkles, X } from 'lucide-react';
// import { Gauge } from 'lucide-react'; // for the disabled "Fast" option

const OPTIONS = [
  // FAST 480p — disabled for now (kept for later): the picture was too soft.
  // {
  //   value: 'fast',
  //   Icon: Gauge,
  //   title: 'Fast · 480p',
  //   text: 'Ready much sooner and a smaller file. Good for chat and quick sharing.',
  // },
  {
    value: 'hd',
    Icon: Sparkles,
    title: 'Full HD · 1080p',
    text: 'Sharp text and pointer, with the voice chosen in Settings.',
  },
];

/**
 * @param {{
 *   title: string,                       // course title
 *   initial?: 'fast' | 'hd',
 *   onChoose: (quality: 'fast' | 'hd') => void,
 *   onClose: () => void,
 * }} props
 */
export function VideoQualityDialog({ title, initial = 'hd', onChoose, onClose }) {
  // Only offered qualities can be preselected (a remembered "fast" → HD).
  const [quality, setQuality] = useState(() =>
    OPTIONS.some((o) => o.value === initial) ? initial : 'hd',
  );
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current?.focus();
    // Capture on window: Esc closes only this dialog, not one underneath it
    // (e.g. the "Mark done" dialog, which listens on document).
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-quality-title"
        className="hs-caption-in relative w-full max-w-md rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl p-6"
      >
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="video-quality-title"
              className="text-base font-semibold text-ink dark:text-ink-soft-dark"
            >
              Download video
            </h2>
            <p className="text-sm text-ink-soft dark:text-ink-soft-dark truncate">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div role="radiogroup" aria-label="Video quality" className="space-y-2">
          {OPTIONS.map(({ value, Icon, title: optionTitle, text }) => {
            const selected = quality === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                onClick={() => setQuality(value)}
                onDoubleClick={() => onChoose(value)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                  selected
                    ? 'border-accent bg-accent/5 dark:bg-accent/10 ring-2 ring-accent/25'
                    : 'border-line dark:border-line-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
                }`}
              >
                <Icon
                  className={`w-5 h-5 mt-0.5 flex-shrink-0 ${selected ? 'text-accent' : 'text-ink-faint dark:text-ink-faint-dark'}`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink dark:text-ink-soft-dark">
                    {optionTitle}
                  </span>
                  <span className="block text-xs text-ink-soft dark:text-ink-faint-dark">
                    {text}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            Cancel
          </button>
          <button
            ref={startRef}
            onClick={() => onChoose(quality)}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
