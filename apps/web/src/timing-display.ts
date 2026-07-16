import { gcdFromSpeed, getCombatEvaluatorProfile } from '@xiv-gear-lab/calculations';
import type { GearSet, GearSnapshot, JobTimingEffect } from '@xiv-gear-lab/domain';

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
  const profile = getCombatEvaluatorProfile(set.job, snapshot.evaluatorProfiles);
  const definition = snapshot.registry.jobs.find((entry) => entry.id === set.job);
  const base = gcdFromSpeed(set.metrics.stats[profile.speedStat], profile.baseGcdMs, 0);
  const timingEffects = definition?.timingEffects ?? [{
    id: 'base-gcd',
    name: 'Base GCD',
    kind: 'base' as const,
    hastePercent: 0
  }];
  const states = timingEffects.map((effect) => ({
    ...effect,
    gcd: gcdFromSpeed(set.metrics.stats[profile.speedStat], profile.baseGcdMs, effect.hastePercent),
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
