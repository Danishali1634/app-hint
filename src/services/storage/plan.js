/**
 * @file The user's plan in LocalStorage: free / trial / pro + free-try usage.
 *
 *   { plan: 'free' | 'trial' | 'pro', trialEndsAt: number | null, usage: { [feature]: count } }
 *
 * LOCAL ONLY FOR NOW: there are no payments yet, so this is a soft gate. When
 * billing exists, load the plan from the server instead and keep `usage` here
 * (or move it server-side too). Components use hooks/usePlan.js, not this file.
 */

import { LS_PLAN, TRIAL_DAYS } from '@/constants';
import { readKey, writeKey } from '@/services/storage/settings';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAN = { plan: 'free', trialEndsAt: null, usage: {} };

/** @returns {{ plan: string, trialEndsAt: number | null, usage: Record<string, number> }} */
export function loadPlan() {
  try {
    return { ...DEFAULT_PLAN, ...JSON.parse(readKey(LS_PLAN) || '{}') };
  } catch {
    return DEFAULT_PLAN;
  }
}

export function savePlan(state) {
  writeKey(LS_PLAN, JSON.stringify(state));
}

/** Pro features unlocked? (paid, or a trial that hasn't ended) */
export function isProActive(state, now = Date.now()) {
  return state.plan === 'pro' || (state.plan === 'trial' && state.trialEndsAt > now);
}

/** Whole days left in the trial (0 when none / ended). */
export function trialDaysLeft(state, now = Date.now()) {
  if (state.plan !== 'trial' || !state.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((state.trialEndsAt - now) / DAY_MS));
}

export function withTrialStarted(state, now = Date.now()) {
  return { ...state, plan: 'trial', trialEndsAt: now + TRIAL_DAYS * DAY_MS };
}
