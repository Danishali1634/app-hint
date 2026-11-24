/**
 * @file "Created by Danish Akhtar" with his photo — on everything a viewer sees
 * when a walkthrough is shared (SharedCoursePage, the player's end card).
 * The photo is CREATOR.photo in /public; if it is missing or fails to load,
 * a round badge with the initials takes its place, so it never shows broken.
 */

import { useState } from 'react';
import { CREATOR } from '@/constants';

/**
 * @param {{
 *   size?: number,          // photo size, px
 *   tone?: 'page' | 'dark', // 'dark': white text, for the player's dimmed end card
 *   className?: string,
 * }} props
 */
export function CreatorBadge({ size = 28, tone = 'page', className = '' }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const textClass = tone === 'dark' ? 'text-white/70' : 'text-ink-soft dark:text-ink-faint-dark';
  const nameClass = tone === 'dark' ? 'text-white' : 'text-ink dark:text-white';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {photoFailed ? (
        <span
          aria-hidden
          className="rounded-full bg-gradient-to-br from-accent to-violet text-white font-bold flex items-center justify-center flex-shrink-0"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        >
          {CREATOR.initials}
        </span>
      ) : (
        <img
          src={CREATOR.photo}
          alt=""
          width={size}
          height={size}
          onError={() => setPhotoFailed(true)}
          className="rounded-full object-cover flex-shrink-0 ring-2 ring-white/70 dark:ring-white/20"
          style={{ width: size, height: size }}
        />
      )}
      <span className={`text-sm ${textClass}`}>
        Created by <span className={`font-semibold ${nameClass}`}>{CREATOR.name}</span>
      </span>
    </span>
  );
}
