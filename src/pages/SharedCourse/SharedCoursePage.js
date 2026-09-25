/**
 * @file Route #/s/:slug/:encoded — opens a course from a share link.
 *
 * Runs WITHOUT IndexedDB: the whole course (text, screenshots, audio) is inside
 * the `encoded` URL segment (see services/sharing/share.js).
 *
 * FLOW: decodeShareableCourse(encoded)
 *   ├─ fails (truncated / corrupted link) → error screen
 *   └─ ok → inline WalkthroughPlayer (YouTube-style, paused with a big ▶ —
 *           nothing plays until the viewer clicks) + course info below.
 *
 * Rendered without the app sidebar (see AppRouter): viewers see only the course.
 */

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Mic } from 'lucide-react';
import { decodeShareableCourse, shareableToWalkthroughSteps } from '@/services/sharing/share';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { CourseInfo } from '@/components/walkthrough/CourseInfo';

export function SharedCoursePage() {
  const { encoded } = useParams();
  const navigate = useNavigate();

  // Decoding is synchronous; memoised so it runs once per URL.
  const shareable = useMemo(() => (encoded ? decodeShareableCourse(encoded) : null), [encoded]);
  const steps = useMemo(
    () => (shareable ? shareableToWalkthroughSteps(shareable) : []),
    [shareable],
  );

  if (!shareable) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
        <h1 className="text-xl font-bold text-ink dark:text-ink-soft-dark mb-2">
          Cannot open this course
        </h1>
        <p className="text-sm text-ink-soft dark:text-ink-faint-dark mb-6">
          {encoded
            ? 'The link may be corrupted or incomplete — ask for it to be copied again.'
            : 'Invalid share link — no course data found.'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-dark transition-colors"
        >
          Go to Hint Studio
        </button>
      </div>
    );
  }

  const { title = 'Shared course', pageName, description } = shareable.c;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-5">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-violet flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </span>
          Hint Studio
        </span>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-ink-soft dark:text-ink-faint-dark hover:text-accent transition-colors"
        >
          Create your own →
        </button>
      </div>

      <div className="h-[min(72vh,720px)] min-h-[420px]">
        <WalkthroughPlayer steps={steps} title={title} variant="inline" />
      </div>

      <CourseInfo title={title} pageName={pageName} description={description} steps={steps} />
    </div>
  );
}
