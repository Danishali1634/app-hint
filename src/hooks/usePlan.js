/**
 * @file Free / Pro plan as React context, plus the upgrade dialog.
 *
 *   const { isPro, triesLeft, tryFeature, openUpgrade } = usePlan();
 *
 *   // Gate a Pro feature: uses one free try, or opens the upgrade dialog.
 *   if (!tryFeature('screenRecording')) return;
 *
 * Features and their free tries live in constants (PRO_FEATURES).
 * Persistence lives in services/storage/plan.js. Mounted in AppRouter
 * (authoring pages only — shared links and embeds never see a paywall).
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { PRO_FEATURES, TRIAL_DAYS } from '@/constants';
import {
  isProActive,
  loadPlan,
  savePlan,
  trialDaysLeft,
  withTrialStarted,
} from '@/services/storage/plan';
import { UpgradeDialog } from '@/components/ui/UpgradeDialog';

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [state, setState] = useState(loadPlan);
  // Which feature opened the dialog ('' = opened from the header), null = closed.
  const [upgradeFor, setUpgradeFor] = useState(null);

  const update = useCallback((next) => {
    savePlan(next);
    setState(next);
  }, []);

  const isPro = isProActive(state);
  // An ended trial counts as Free again.
  const plan = isPro ? state.plan : 'free';
  const trialUsed = state.trialEndsAt != null;

  const triesLeft = useCallback(
    (feature) => {
      if (isPro) return Infinity;
      const free = PRO_FEATURES[feature]?.freeUses ?? 0;
      return Math.max(0, free - (state.usage[feature] || 0));
    },
    [isPro, state.usage],
  );

  const tryFeature = useCallback(
    (feature) => {
      if (isPro) return true;
      const left = triesLeft(feature);
      if (left <= 0) {
        setUpgradeFor(feature);
        return false;
      }
      update({ ...state, usage: { ...state.usage, [feature]: (state.usage[feature] || 0) + 1 } });
      if (left === 1) {
        toast.info(`That was your last free try of ${PRO_FEATURES[feature].label.toLowerCase()}.`);
      }
      return true;
    },
    [isPro, triesLeft, update, state],
  );

  const startTrial = useCallback(() => {
    update(withTrialStarted(state));
    setUpgradeFor(null);
    toast.success(`Pro unlocked — enjoy ${TRIAL_DAYS} days free.`);
  }, [update, state]);

  const value = useMemo(
    () => ({
      plan,
      isPro,
      trialUsed,
      trialDaysLeft: trialDaysLeft(state),
      triesLeft,
      tryFeature,
      startTrial,
      openUpgrade: (feature = '') => setUpgradeFor(feature),
    }),
    [plan, isPro, trialUsed, state, triesLeft, tryFeature, startTrial],
  );

  return (
    <PlanContext.Provider value={value}>
      {children}
      {upgradeFor !== null && (
        <UpgradeDialog
          feature={upgradeFor}
          plan={plan}
          trialUsed={trialUsed}
          daysLeft={value.trialDaysLeft}
          onStartTrial={startTrial}
          onClose={() => setUpgradeFor(null)}
        />
      )}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
