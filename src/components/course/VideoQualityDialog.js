/**
 * @file Asks how to download the walkthrough video, before the export starts:
 *   FORMAT   Web (16:9, as always) or Mobile app, upright or sideways (the
 *            phone's full screen, long descriptions in parts with the voice;
 *            see services/video/exportVideo). Remembered.
 *   QUALITY  480p (preselected every time: ready sooner, a small file) or
 *            Full HD 1080p (a sharper picture).
 * Driven by hooks/useCourseSharing.
 */

import { useEffect, useRef, useState } from 'react';
import { Film, Gauge, Monitor, Smartphone, Sparkles, X } from 'lucide-react';

/** The qualities: 480p first (the default), then the better one. */
const OPTIONS = [
  {
    value: 'fast',
    Icon: Gauge,
    title: '480p',
    text: 'Ready sooner, smaller file',
  },
  {
    value: 'hd',
    Icon: Sparkles,
    title: 'Full HD · 1080p',
    text: 'Sharper text and picture',
  },
];

/** The formats (with the voice chosen in Settings). */
const FORMATS = [
  {
    value: 'web',
    Icon: Monitor,
    title: 'Web · 16:9',
    text: 'For websites, computers and presentations.',
  },
  {
    value: 'mobile-portrait',
    Icon: Smartphone,
    title: 'Mobile app · Portrait 9:16',
    text: 'Fills a phone held upright. Long descriptions show in parts, in time with the voice.',
  },
  {
    value: 'mobile-landscape',
    Icon: Smartphone,
    rotate: true,
    title: 'Mobile app · Landscape 16:9',
    text: 'Fills a phone held sideways. Long descriptions show in parts, in time with the voice.',
  },
];

/**
 * @param {{
 *   title: string,                       // course title
 *   initial?: 'fast' | 'hd',             // preselected quality (default 480p)
 *   initialFormat?: import('@/services/video/exportVideo').VideoFormat,
 *   onChoose: (quality: 'fast' | 'hd', format: import('@/services/video/exportVideo').VideoFormat) => void,
 *   onClose: () => void,
 * }} props
 */
export function VideoQualityDialog({
  title,
  initial = 'fast',
  initialFormat = 'web',
  onChoose,
  onClose,
}) {
  const [quality, setQuality] = useState(() =>
    OPTIONS.some((o) => o.value === initial) ? initial : 'fast',
  );
  const [format, setFormat] = useState(() =>
    FORMATS.some((f) => f.value === initialFormat) ? initialFormat : 'web',
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

        <p
          id="video-format-label"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark"
        >
          Format
        </p>
        <div role="radiogroup" aria-labelledby="video-format-label" className="space-y-2">
          {FORMATS.map(({ value, Icon, rotate, title: optionTitle, text }) => {
            const selected = format === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                onClick={() => setFormat(value)}
                onDoubleClick={() => onChoose(quality, value)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                  selected
                    ? 'border-accent bg-accent/5 dark:bg-accent/10 ring-2 ring-accent/25'
                    : 'border-line dark:border-line-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
                }`}
              >
                <Icon
                  className={`w-5 h-5 mt-0.5 flex-shrink-0 ${rotate ? 'rotate-90' : ''} ${selected ? 'text-accent' : 'text-ink-faint dark:text-ink-faint-dark'}`}
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

        <p
          id="video-quality-label"
          className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark"
        >
          Quality
        </p>
        <div
          role="radiogroup"
          aria-labelledby="video-quality-label"
          className="grid grid-cols-2 gap-2"
        >
          {OPTIONS.map(({ value, Icon, title: optionTitle, text }) => {
            const selected = quality === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                onClick={() => setQuality(value)}
                onDoubleClick={() => onChoose(value, format)}
                className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                  selected
                    ? 'border-accent bg-accent/5 dark:bg-accent/10 ring-2 ring-accent/25'
                    : 'border-line dark:border-line-dark hover:border-ink-faint dark:hover:border-ink-faint-dark'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selected ? 'text-accent' : 'text-ink-faint dark:text-ink-faint-dark'}`}
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
        <p className="mt-3 text-xs text-ink-faint dark:text-ink-faint-dark">
          With the voice chosen in Settings.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            Cancel
          </button>
          <button
            ref={startRef}
            onClick={() => onChoose(quality, format)}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
