/**
 * @file Small pill marking a Pro feature.
 *
 *   <ProBadge />           → "PRO"
 *   <ProBadge left={2} />  → "2 free" (Free user with tries left)
 *   <ProBadge left={0} />  → "PRO" with a lock
 *   left = Infinity (Pro / trial) → nothing, the feature is simply unlocked
 */

import { Lock, Sparkles } from 'lucide-react';

/** @param {{ left?: number, className?: string }} props */
export function ProBadge({ left, className = '' }) {
  if (left === Infinity) return null;
  const hasTries = left > 0;
  const Icon = left === 0 ? Lock : Sparkles;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide leading-none ${
        hasTries
          ? 'bg-accent-soft text-accent dark:bg-accent-soft-dark dark:text-accent-ink-dark'
          : 'bg-gradient-to-r from-accent to-violet text-white'
      } ${className}`}
    >
      <Icon className="w-3 h-3" />
      {hasTries ? `${left} free` : 'Pro'}
    </span>
  );
}
