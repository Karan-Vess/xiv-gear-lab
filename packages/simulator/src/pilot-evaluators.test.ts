import { describe, expect, it } from 'vitest';
import {
  BLM_ROTATION_PROFILE,
  CURRENT_ROTATION_PROFILES,
  DNC_ROTATION_PROFILE,
  DRK_ROTATION_PROFILE,
  SAM_ROTATION_PROFILE
} from '@xiv-gear-lab/data';
import { emptyStats, type CombatRotationProfile } from '@xiv-gear-lab/domain';
import type { CombatEvaluationRequest, CombatEvaluationResult } from './index';
import { createPilotCombatEvaluatorRegistry } from './pilot-evaluators';

const representativeStats = {
  ...emptyStats(),
  strength: 6500,
  dexterity: 6500,
  intelligence: 6500,
  criticalHit: 3000,
  directHit: 2000,
  determination: 2000,
  tenacity: 1200,
  skillSpeed: 700,
  spellSpeed: 1400
};

const requestFor = (
  profile: CombatRotationProfile,
  mode: CombatEvaluationRequest['mode'],
  speedStatValue = profile.job === 'BLM'
    ? representativeStats.spellSpeed
    : representativeStats.skillSpeed
): CombatEvaluationRequest => ({
  mode,
  profile,
  combatStats: {
    stats: representativeStats,
    weaponDamage: 140,
    weaponDelayMs: profile.job === 'BLM' ? 3300 : 2600,
    speedStatValue,
    speedBaseSub: 420,
    speedLevelDiv: 2780,
    hastePercent: 0
  },
  openerPreference: 'auto',
  potion: 'included',
  includeTimeline: true
});

const simulate = (
  profile: CombatRotationProfile,
  mode: CombatEvaluationRequest['mode'],
  speedStatValue?: number
): CombatEvaluationResult => {
  const evaluator = createPilotCombatEvaluatorRegistry().requireFor(profile);
  return evaluator.simulate(requestFor(profile, mode, speedStatValue), {
    isCancelled: () => false
  });
};

const playerActions = (result: CombatEvaluationResult): string[] =>
  result.timeline
    ?.filter((record) => record.source === 'player')
    .map((record) => record.actionId) ?? [];

describe('Dawntrail pilot combat evaluators', () => {
  it.each(CURRENT_ROTATION_PROFILES.map((profile) => [profile.job, profile] as const))(
    '%s evaluates both bounded modes deterministically with explicit provenance',
    (_job, profile) => {
      for (const mode of ['opener-30', 'dummy-300'] as const) {
        const first = simulate(profile, mode);
        const second = simulate(profile, mode);

        expect(second).toEqual(first);
        expect(first.durationMs).toBe(mode === 'opener-30' ? 30_000 : 300_000);
        expect(first.totalDamage).toBeGreaterThan(0);
        expect(first.summary.actionCount).toBeGreaterThan(0);
        expect(first.method.kind).toBe('generated-priority');
        expect(first.method.warning).toContain('No current community opener');
        expect(first.decisionTrace.every((entry) => entry.source === 'generated-priority')).toBe(true);
        expect(first.references.some((reference) => reference.kind === 'official')).toBe(true);
        expect(first.references.some((reference) => reference.kind === 'xivgear-reference')).toBe(true);
        expect(first.references.some((reference) => reference.id === 'combat-potion-reference')).toBe(true);
      }
    }
  );

  it('runs the Samurai deterministic Sen, Iaijutsu and Ikishoten chain', () => {
    const result = simulate(SAM_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('sam-higanbana');
    expect(actions).toContain('sam-midare');
    expect(actions).toContain('sam-ikishoten');
    expect(actions).toContain('sam-ogi');
    expect(actions).toContain('sam-kaeshi-namikiri');
    expect(actions.indexOf('sam-ogi')).toBeLessThan(actions.indexOf('sam-kaeshi-namikiri'));
  });

  it('uses deterministic expected-value Dancer procs instead of random rolls', () => {
    const result = simulate(DNC_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('dnc-technical-finish');
    expect(actions).toContain('dnc-standard-finish');
    expect(actions).toContain('dnc-reverse-cascade');
    expect(actions).toContain('dnc-fountainfall');
    expect(actions).toContain('dnc-fan-dance');
    expect(result.method.confidence).toBe('generated-preliminary');
    expect(DNC_ROTATION_PROFILE.assumptions.rngMode).toBe('expected-value');
  });

  it('cycles Black Mage through fire, Flare Star, ice and timed Polyglot spending', () => {
    const result = simulate(BLM_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('blm-fire-iv');
    expect(actions).toContain('blm-flare-star');
    expect(actions).toContain('blm-despair');
    expect(actions).toContain('blm-blizzard-iii');
    expect(actions).toContain('blm-blizzard-iv');
    expect(actions).toContain('blm-xenoglossy');
    expect(actions.indexOf('blm-fire-iii')).toBeLessThan(actions.indexOf('blm-fire-iv'));
    expect(actions.indexOf('blm-fire-iv')).toBeLessThan(actions.indexOf('blm-blizzard-iii'));
  });

  it('replays Living Shadow after the referenced 6.8-second delay and 2.18-second cadence', () => {
    const result = simulate(DRK_ROTATION_PROFILE, 'opener-30');
    const trigger = result.timeline?.find((record) =>
      record.actionId === 'drk-living-shadow' && record.source === 'player'
    );
    const pet = result.timeline?.filter((record) => record.source === 'pet') ?? [];

    expect(trigger).toBeDefined();
    expect(pet.map((record) => record.actionId)).toEqual([
      'drk-shadow-abyssal',
      'drk-shadow-stride',
      'drk-shadow-shadowbringer',
      'drk-shadow-edge',
      'drk-shadow-bloodspiller',
      'drk-shadow-disesteem'
    ]);
    expect(pet.map((record) => record.startedAtMs - trigger!.appliedAtMs)).toEqual([
      6800,
      8980,
      11_160,
      13_340,
      15_520,
      17_700
    ]);

    const exaggeratedDarkside = structuredClone(DRK_ROTATION_PROFILE);
    const edge = exaggeratedDarkside.actions.find((action) => action.id === 'drk-edge')!;
    const darkside = edge.effects?.find((effect) =>
      effect.kind === 'buff' && effect.buffId === 'drk-darkside'
    );
    if (darkside?.kind !== 'buff') throw new Error('DRK fixture is missing Darkside.');
    darkside.damageMultiplier = 9;
    const exaggeratedPetDamage = simulate(exaggeratedDarkside, 'opener-30').timeline
      ?.filter((record) => record.source === 'pet')
      .map((record) => record.damage);
    expect(exaggeratedPetDamage).toEqual(pet.map((record) => record.damage));
  });

  it('changes cast timing and output when a speed tier changes', () => {
    const slower = simulate(BLM_ROTATION_PROFILE, 'dummy-300', 420);
    const faster = simulate(BLM_ROTATION_PROFILE, 'dummy-300', 1800);

    expect(faster.timingCacheKey).not.toBe(slower.timingCacheKey);
    expect(faster.totalDamage).not.toBe(slower.totalDamage);
    expect(faster.decisionTrace.map((entry) => entry.startedAtMs))
      .not.toEqual(slower.decisionTrace.map((entry) => entry.startedAtMs));
  });
});
