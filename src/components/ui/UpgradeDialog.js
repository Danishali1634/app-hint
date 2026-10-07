/**
 * @file "Unlock Pro" dialog. Opened by hooks/usePlan.js — when a free try runs
 * out (tryFeature) or from the header's plan pill (openUpgrade).
 *
 * Main button:
 *   trial not used yet → "Start N-day free trial" (unlocks Pro locally)
 *   otherwise          → "Upgrade to Pro" (no billing yet: says it's coming soon)
 * Closes on Escape, backdrop click, or the X button.
 */

import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { Check, Minus, Sparkles, X } from 'lucide-react';
import { PLAN_COMPARISON, PRO_FEATURES, TRIAL_DAYS } from '@/constants';

/** A Free / Pro cell: ✓, –, or a short text like "3 tries". */
function Cell({ value, pro }) {
  if (value === true)
    return <Check className={`w-4 h-4 mx-auto ${pro ? 'text-accent' : 'text-teal'}`} />;
  if (!value) return <Minus className="w-4 h-4 mx-auto text-ink-faint/60" />;
  return (
    <span className={`text-xs ${pro ? 'font-semibold text-accent dark:text-accent-ink-dark' : ''}`}>
      {value}
    </span>
  );
}

/**
 * @param {{
 *   feature: string,          // PRO_FEATURES key that opened it, '' = general
 *   plan: 'free' | 'trial' | 'pro',
 *   trialUsed: boolean,
 *   daysLeft: number,
 *   onStartTrial: () => void,
 *   onClose: () => void,
 * }} props
 */
export function UpgradeDialog({ feature, plan, trialUsed, daysLeft, onStartTrial, onClose }) {
  const info = PRO_FEATURES[feature];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const upgrade = () => {
    toast.info('Paid plans are coming soon — thanks for your interest!');
    onClose();
  };

  const title =
    plan !== 'free'
      ? plan === 'trial'
        ? `You're on Pro — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
        : "You're on Pro"
      : info
        ? `You've used your free ${info.unit}`
        : 'Unlock Hint Studio Pro';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-2xl"
      >
        {/* Gradient hero */}
        <div className="relative px-6 pt-7 pb-6 bg-gradient-to-br from-accent via-accent-dark to-violet text-white">
          <div
            className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_85%_15%,white,transparent_45%)]"
            aria-hidden="true"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 ring-1 ring-white/25 text-[11px] font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Pro
          </span>
          <h2 id="upgrade-title" className="relative mt-3 text-xl font-bold tracking-tight">
            {title}
          </h2>
          <p className="relative mt-1 text-sm text-white/85">
            {info?.pitch ?? 'Everything you need to make walkthroughs faster.'}
          </p>
        </div>

        {/* Free vs Pro */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-y-2.5 text-sm text-ink-soft dark:text-ink-soft-dark">
            <span />
            <span className="text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
              Free
            </span>
            <span className="text-center text-[11px] font-semibold uppercase tracking-wider text-accent dark:text-accent-ink-dark">
              Pro
            </span>
            {PLAN_COMPARISON.map((row) => (
              <div key={row.label} className="contents">
                <span className="text-ink dark:text-ink-soft-dark">{row.label}</span>
                <span className="text-center">
                  <Cell value={row.free} />
                </span>
                <span className="text-center">
                  <Cell value={row.pro} pro />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6">
          {plan !== 'free' ? (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent-dark transition-colors"
            >
              Keep creating
            </button>
          ) : (
            <>
              <button
                onClick={trialUsed ? upgrade : onStartTrial}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-accent to-violet text-white font-semibold shadow-glow hover:brightness-110 transition"
              >
                {trialUsed ? 'Upgrade to Pro' : `Start ${TRIAL_DAYS}-day free trial`}
              </button>
              <p className="mt-2.5 text-center text-xs text-ink-faint dark:text-ink-faint-dark">
                {trialUsed
                  ? 'Your free trial has ended.'
                  : 'No credit card needed · Back to Free automatically'}
              </p>
              <button
                onClick={onClose}
                className="mt-2 w-full py-2 text-sm font-medium text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark transition-colors"
              >
                Maybe later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
