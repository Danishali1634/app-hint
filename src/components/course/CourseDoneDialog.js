/**
 * @file Dialog shown after "Mark done" in the editor.
 *
 * Three options:
 *   🔗 Copy link       — a URL that opens this app straight on this course
 *                        (the course is packed inside the link; no server).
 *   </> Copy embed code — YouTube-style <iframe> snippet: paste it into any web
 *                        page / wiki / LMS and the walkthrough plays right there.
 *   ⬇ Download video  — the animated walkthrough (zoom → click → next screen)
 *                       recorded as a video file, with recorded voices.
 *
 * The work itself is done by hooks/useCourseSharing; this component is UI only.
 */

import { useEffect, useState } from 'react';
import { Link2, Download, Check, X, PartyPopper, Loader2, Code2 } from 'lucide-react';

/** @typedef {import('@/types').Course} Course */

const OPTION_CLASS =
  'group flex items-start gap-4 w-full text-left p-5 rounded-2xl border border-line dark:border-line-dark hover:border-accent hover:bg-accent/5 disabled:opacity-60 disabled:pointer-events-none transition-all';

/**
 * @param {{
 *   course: Course,
 *   onCopyLink: () => Promise<boolean>,
 *   onCopyEmbed: () => Promise<boolean>,
 *   onDownloadVideo: () => void,
 *   linkBusy: boolean,
 *   videoBusy: boolean,
 *   onClose: () => void,
 *   onGoToLibrary: () => void,
 * }} props
 */
export function CourseDoneDialog({
  course,
  onCopyLink,
  onCopyEmbed,
  onDownloadVideo,
  linkBusy,
  videoBusy,
  onClose,
  onGoToLibrary,
}) {
  const [copied, setCopied] = useState(null); // 'link' | 'embed' | null

  useEffect(() => {
    const handleKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = async (kind) => {
    const ok = await (kind === 'link' ? onCopyLink() : onCopyEmbed());
    if (ok) setCopied(kind);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="done-title"
        className="hs-caption-in relative w-full max-w-lg rounded-3xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl p-6 sm:p-8"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-9 h-9 rounded-xl flex items-center justify-center text-ink-faint hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-teal-soft dark:bg-teal-soft-dark text-teal dark:text-teal-dark flex items-center justify-center mb-4">
          <PartyPopper className="w-7 h-7" />
        </div>
        <h2 id="done-title" className="text-xl font-bold text-ink dark:text-ink-soft-dark">
          Your walkthrough is ready
        </h2>
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark mt-1 mb-6">
          “{course.title}” is saved. How do you want to share it?
        </p>

        <div className="space-y-3">
          <button onClick={() => handleCopy('link')} disabled={linkBusy} className={OPTION_CLASS}>
            <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              {linkBusy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : copied === 'link' ? (
                <Check className="w-5 h-5" />
              ) : (
                <Link2 className="w-5 h-5" />
              )}
            </span>
            <span>
              <span className="block font-semibold text-ink dark:text-ink-soft-dark">
                {copied === 'link' ? 'Link copied!' : 'Copy link'}
              </span>
              <span className="block text-sm text-ink-soft dark:text-ink-soft-dark mt-0.5">
                Send it to anyone — it opens this app straight on this course.
              </span>
            </span>
          </button>

          <button onClick={() => handleCopy('embed')} disabled={linkBusy} className={OPTION_CLASS}>
            <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              {copied === 'embed' ? <Check className="w-5 h-5" /> : <Code2 className="w-5 h-5" />}
            </span>
            <span>
              <span className="block font-semibold text-ink dark:text-ink-soft-dark">
                {copied === 'embed' ? 'Embed code copied!' : 'Copy embed code'}
              </span>
              <span className="block text-sm text-ink-soft dark:text-ink-soft-dark mt-0.5">
                Like YouTube: paste it into any website, wiki or LMS and the walkthrough plays
                there.
              </span>
            </span>
          </button>

          <button onClick={onDownloadVideo} disabled={videoBusy} className={OPTION_CLASS}>
            <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink dark:text-ink-soft-dark">
                Download video
              </span>
              <span className="block text-sm text-ink-soft dark:text-ink-soft-dark mt-0.5">
                The animated walkthrough of your selected areas as a video file, with your recorded
                voice.
              </span>
            </span>
          </button>
        </div>

        <button
          onClick={onGoToLibrary}
          className="mt-6 w-full text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:text-ink transition-colors"
        >
          Back to all courses
        </button>
      </div>
    </div>
  );
}
