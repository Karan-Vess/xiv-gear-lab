import { gcdFromSpeed, getCombatEvaluatorProfile, getCombatEvaluatorProfileForSet, levelFormulaConstantsFor } from '@xiv-gear-lab/calculations';
import type { CombatEvaluatorProfile, GearSet, GearSnapshot, JobTimingEffect } from '@xiv-gear-lab/domain';

export interface DisplayedGcdState extends JobTimingEffect {
  gcd: number;
  isTarget: boolean;
}

export interface GearSetTimingDisplay {
  base: number;
  target: DisplayedGcdState;
  additionalStates: DisplayedGcdState[];
}

export const gearSetTimingDisplay = (set: GearSet, snapshot: GearSnapshot): GearSetTimingDisplay => {
  let profile: CombatEvaluatorProfile;
  try {
    profile = getCombatEvaluatorProfileForSet(set, snapshot);
  } catch {
    // Legacy and deliberately incompatible comparison fixtures still need a
    // readable timing row while their calculation context is flagged.
    profile = getCombatEvaluatorProfile(set.job, snapshot.evaluatorProfiles);
  }
  const constants = levelFormulaConstantsFor(profile);
  const definition = snapshot.registry.jobs.find((entry) => entry.id === set.job);
  const base = gcdFromSpeed(set.metrics.stats[profile.speedStat], profile.baseGcdMs, 0, constants);
  const timingEffects = definition?.timingEffects ?? [{
    id: 'base-gcd',
    name: 'Base GCD',
    kind: 'base' as const,
    hastePercent: 0
  }];
  const states = timingEffects.map((effect) => ({
    ...effect,
    gcd: gcdFromSpeed(set.metrics.stats[profile.speedStat], profile.baseGcdMs, effect.hastePercent, constants),
    isTarget: effect.id === profile.timingEffectId
  }));
  const target = states.find((state) => state.isTarget) ?? {
    id: profile.timingEffectId,
    name: profile.timingEffectId === 'base-gcd' ? 'Base GCD' : profile.timingEffectId,
    kind: 'base' as const,
    hastePercent: profile.hastePercent,
    gcd: set.metrics.gcd,
    isTarget: true
  };

  return {
    base,
    target,
    additionalStates: states.filter((state) => state.hastePercent > 0)
  };
};
