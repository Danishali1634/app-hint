/**
 * @file Route #/e/:encoded (older links: #/embed/:slug/:encoded) — the walkthrough ONLY,
 * for <iframe> embeds.
 *
 * Created by "Copy embed code" (services/sharing/share.buildEmbedCode). Same
 * course data as a share link, but: no app header, no summary page, no exit
 * button — just the player, filling the iframe. Opens paused with a big ▶,
 * like an embedded YouTube video.
 *
 * Runs without IndexedDB: everything is decoded from the URL.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { decodeShareableCourse, shareableToWalkthroughSteps } from '@/services/sharing/share';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';

export function EmbedPage() {
  const { encoded } = useParams();

  // Decoding is synchronous; memoised so it runs once per URL.
  const shareable = useMemo(() => (encoded ? decodeShareableCourse(encoded) : null), [encoded]);
  const steps = useMemo(
    () => (shareable ? shareableToWalkthroughSteps(shareable) : []),
    [shareable],
  );

  if (!shareable) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center bg-paper dark:bg-paper-dark">
        <AlertCircle className="w-8 h-8 text-danger" />
        <p className="text-sm font-semibold text-ink dark:text-ink-soft-dark">
          This walkthrough can&apos;t be loaded
        </p>
        <p className="text-xs text-ink-faint dark:text-ink-faint-dark">
          The embed code may be incomplete — copy it again from Hint Studio.
        </p>
      </div>
    );
  }

  return (
    <WalkthroughPlayer
      steps={steps}
      title={shareable.c.title || 'Walkthrough'}
      pace={shareable.c.pace}
      onExit={() => {}}
      embedded
    />
  );
}
