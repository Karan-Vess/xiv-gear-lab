import { describe, expect, it } from 'vitest';
import {
  emptyStats,
  type CombatActionProfile,
  type CombatPriorityCondition,
  type CombatRotationProfile
} from '@xiv-gear-lab/domain';
import {
  createHybridRotationPolicy,
  evaluatePriorityCondition,
  resolveRotationMethod,
  runHybridCombatEvaluation,
  validateHybridRotationProfile,
  type CombatEvaluationRequest,
  type CombatTimelineStateView
} from './index';

const action = (
  id: string,
  overrides: Partial<CombatActionProfile> = {}
): CombatActionProfile => ({
  id,
  name: id,
  kind: 'gcd',
  potency: 100,
  recastMs: 2500,
  castMs: 0,
  animationLockMs: 600,
  applicationDelayMs: 0,
  charges: 1,
  speedScaling: 'none',
  referenceIds: ['internal'],
  ...overrides
});

const filler = action('filler');
const potion = action('potion', {
  kind: 'ogcd',
  consumable: 'potion',
  potency: 0,
  recastMs: 270_000,
  effects: [{ kind: 'buff', buffId: 'potion', durationMs: 30_000, damageMultiplier: 1.1 }]
});
const burst = action('burst', {
  kind: 'ogcd',
  potency: 200,
  recastMs: 60_000
});
const spender = action('spender', {
  potency: 300,
  resourceCosts: [{ resource: 'gauge', amount: 50 }]
});

const profile: CombatRotationProfile = {
  id: 'synthetic-hybrid@1',
  schemaVersion: 'combat-rotation-profile@1',
  rulesetId: 'synthetic-ruleset@1',
  job: 'TST',
  jobMode: 'standard',
  version: 'synthetic-hybrid@1',
  gamePatch: '7.51',
  engineId: 'synthetic-hybrid@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: [filler, potion, burst, spender],
  priorityRules: [{
    id: 'use-potion',
    actionId: 'potion',
    conditions: [{ kind: 'cooldown-ready', actionId: 'potion' }],
    explanation: 'Use the configured potion in a safe weave window.',
    referenceIds: ['internal']
  }, {
    id: 'use-burst',
    actionId: 'burst',
    conditions: [{ kind: 'cooldown-ready', actionId: 'burst' }],
    explanation: 'Use burst in a safe weave window.',
    referenceIds: ['internal']
  }, {
    id: 'spend-gauge',
    actionId: 'spender',
    conditions: [{ kind: 'resource-at-least', resource: 'gauge', amount: 50 }],
    explanation: 'Spend gauge before filler.',
    referenceIds: ['internal']
  }, {
    id: 'filler',
    actionId: 'filler',
    conditions: [{ kind: 'always' }],
    explanation: 'Use filler when no higher rule applies.',
    referenceIds: ['internal']
  }],
  openers: [{
    id: 'community-current',
    name: 'Current community opener',
    gamePatch: '7.51',
    actionIds: ['filler', 'potion', 'burst'],
    confidence: 'community-validated',
    potion: 'included',
    externalPartyBuffs: false,
    referenceIds: ['community']
  }, {
    id: 'community-stale',
    name: 'Stale community opener',
    gamePatch: '7.50',
    actionIds: ['filler', 'potion', 'burst'],
    confidence: 'community-validated',
    potion: 'included',
    externalPartyBuffs: false,
    referenceIds: ['community']
  }],
  defaultOpenerId: 'community-current',
  assumptions: {
    targetCount: 1,
    uptimePercent: 100,
    movement: false,
    downtime: false,
    externalPartyBuffs: false,
    rngMode: 'expected-value',
    latencyMs: 0,
    weaveWindowMs: 700,
    cutoffPolicy: 'strict-application'
  },
  references: [{
    id: 'internal',
    kind: 'xiv-gear-lab',
    title: 'Synthetic generated priority',
    provider: 'XIV Gear Lab',
    gamePatch: '7.51'
  }, {
    id: 'community',
    kind: 'community',
    title: 'Synthetic community opener',
    provider: 'Fixture community',
    url: 'https://example.com/opener',
    gamePatch: '7.51'
  }],
  limitation: 'Synthetic M12C hybrid policy fixture.'
};

const state = (
  overrides: Partial<CombatTimelineStateView> = {}
): CombatTimelineStateView => ({
  nowMs: 1000,
  gcdReadyAtMs: 2500,
  actorReadyAtMs: 1000,
  resources: { gauge: 80 },
  resourceCaps: { gauge: 100 },
  expectedProcs: { ready: 0.5 },
  mechanics: { special: true },
  buffs: [{
    id: 'active-buff',
    expiresAtMs: 1500,
    stacks: 1,
    damageMultiplier: 1,
    hastePercent: 0
  }],
  dots: [{
    id: 'active-dot',
    actionId: 'filler',
    expiresAtMs: 1750,
    generation: 1
  }],
  combos: [{
    id: 'combo',
    step: 'second',
    expiresAtMs: 10_000
  }],
  availableCharges: (actionId) => actionId === 'burst' ? 2 : 1,
  nextChargeAtMs: () => undefined,
  canUse: () => true,
  canWeave: () => true,
  ...overrides
});

const request = (
  overrides: Partial<CombatEvaluationRequest> = {}
): CombatEvaluationRequest => ({
  mode: 'opener-30',
  profile,
  combatStats: {
    stats: emptyStats(),
    weaponDamage: 140,
    weaponDelayMs: 2500,
    speedStatValue: 420,
    speedBaseSub: 420,
    speedLevelDiv: 2780,
    hastePercent: 0
  },
  openerPreference: 'auto',
  potion: 'included',
  includeTimeline: true,
  ...overrides
});

describe('M12C hybrid rotation policy', () => {
  it('evaluates every declarative condition without executable profile code', () => {
    const conditions: CombatPriorityCondition[] = [
      { kind: 'always' },
      { kind: 'cooldown-ready', actionId: 'burst', minimumCharges: 2 },
      { kind: 'resource-at-least', resource: 'gauge', amount: 80 },
      { kind: 'resource-at-most', resource: 'gauge', amount: 80 },
      { kind: 'resource-would-overcap', resource: 'gauge', incoming: 30, maximum: 100 },
      { kind: 'buff-active', buffId: 'active-buff', active: true },
      { kind: 'buff-active', buffId: 'missing-buff', active: false },
      { kind: 'buff-remaining-at-most', buffId: 'active-buff', durationMs: 500 },
      { kind: 'dot-remaining-at-most', dotId: 'active-dot', durationMs: 750 },
      { kind: 'combo-step', comboId: 'combo', step: 'second' },
      { kind: 'proc-active', procId: 'ready', active: true },
      { kind: 'mechanic', mechanicId: 'special' }
    ];
    expect(conditions.every((condition) => evaluatePriorityCondition(condition, state()))).toBe(true);
    expect(evaluatePriorityCondition(
      { kind: 'mechanic', mechanicId: 'app-owned' },
      state({ mechanics: {} }),
      (id) => id === 'app-owned'
    )).toBe(true);
  });

  it('runs the exact current opener and then hands off to generated priorities', () => {
    const result = runHybridCombatEvaluation(request());
    expect(result.method).toMatchObject({
      kind: 'community-opener',
      opener: { id: 'community-current' }
    });
    expect(result.decisionTrace.slice(0, 4)).toEqual([
      { actionId: 'filler', source: 'community-opener', startedAtMs: 0 },
      { actionId: 'potion', source: 'community-opener', startedAtMs: 600 },
      { actionId: 'burst', source: 'community-opener', startedAtMs: 1200 },
      { actionId: 'filler', source: 'generated-priority', ruleId: 'filler', startedAtMs: 2500 }
    ]);
  });

  it('uses safe weaving, skips disabled consumables and records the chosen rules', () => {
    const method = resolveRotationMethod(profile, 'generated', 'none');
    const policy = createHybridRotationPolicy({ profile, method, potion: 'none' });
    expect(policy.chooseAction(state({
      nowMs: 0,
      gcdReadyAtMs: 0,
      resources: { gauge: 0 },
      canWeave: () => false
    }))).toBe('filler');
    policy.onActionStarted(filler, 0);
    expect(policy.chooseAction(state({
      nowMs: 600,
      canWeave: (actionId) => actionId === 'burst'
    }))).toBe('burst');
    policy.onActionStarted(burst, 600);
    expect(policy.trace()).toEqual([
      { actionId: 'filler', source: 'generated-priority', ruleId: 'filler', startedAtMs: 0 },
      { actionId: 'burst', source: 'generated-priority', ruleId: 'use-burst', startedAtMs: 600 }
    ]);
  });

  it('falls back cleanly for missing, stale, potion-mismatched and buff-mismatched openers', () => {
    expect(resolveRotationMethod(profile, 'missing', 'included').warning).toContain('unavailable');
    expect(resolveRotationMethod(profile, 'community-stale', 'included').warning).toContain('patch 7.50');
    expect(resolveRotationMethod(profile, 'auto', 'none').warning).toContain('potion use');
    const partyBuffProfile = {
      ...profile,
      openers: profile.openers.map((opener) =>
        opener.id === 'community-current' ? { ...opener, externalPartyBuffs: true } : opener
      )
    };
    expect(resolveRotationMethod(partyBuffProfile, 'auto', 'included').warning)
      .toContain('external-party-buff assumptions');
    for (const method of [
      resolveRotationMethod(profile, 'missing', 'included'),
      resolveRotationMethod(profile, 'community-stale', 'included'),
      resolveRotationMethod(profile, 'auto', 'none'),
      resolveRotationMethod(partyBuffProfile, 'auto', 'included')
    ]) {
      expect(method.kind).toBe('generated-priority');
    }
  });

  it('uses exact 30-second and 300-second evaluation windows', () => {
    const burstResult = runHybridCombatEvaluation(request({
      mode: 'opener-30',
      openerPreference: 'generated',
      potion: 'none'
    }));
    const sustainedResult = runHybridCombatEvaluation(request({
      mode: 'dummy-300',
      openerPreference: 'generated',
      potion: 'none',
      includeTimeline: false
    }));
    expect(burstResult.durationMs).toBe(30_000);
    expect(burstResult.label).toBe('30-second burst');
    expect(Math.max(...burstResult.timeline!.map((record) => record.appliedAtMs))).toBeLessThanOrEqual(30_000);
    expect(sustainedResult.durationMs).toBe(300_000);
    expect(sustainedResult.label).toBe('Five-minute dummy rotation');
    expect(sustainedResult.timeline).toBeUndefined();
    expect(sustainedResult.decisionTrace.at(-1)!.startedAtMs).toBeLessThanOrEqual(300_000);
  });

  it('rejects a generated policy without a safe unconditional GCD fallback', () => {
    const unsafe = {
      ...profile,
      priorityRules: profile.priorityRules.filter((rule) => rule.id !== 'filler')
    };
    expect(validateHybridRotationProfile(unsafe)).toContain(
      'Generated priority rules require an unconditional GCD fallback.'
    );
    expect(() => runHybridCombatEvaluation(request({ profile: unsafe }))).toThrow(
      'unconditional GCD fallback'
    );
  });
});
