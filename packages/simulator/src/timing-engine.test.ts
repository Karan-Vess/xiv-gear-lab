import { describe, expect, it } from 'vitest';
import {
  emptyStats,
  type CombatActionProfile,
  type CombatRotationProfile
} from '@xiv-gear-lab/domain';
import {
  adjustedRecastMs,
  CombatTimelineCache,
  runCombatTimeline,
  timelineTemplateFrom,
  type CombatEvaluationStats,
  type CombatTimelineEngineOptions
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

const profileFor = (actions: CombatActionProfile[], overrides: Partial<CombatRotationProfile> = {}): CombatRotationProfile => ({
  id: 'synthetic-timing@1',
  schemaVersion: 'combat-rotation-profile@1',
  rulesetId: 'synthetic-ruleset@1',
  job: 'TST',
  jobMode: 'standard',
  version: 'synthetic@1',
  gamePatch: 'test',
  engineId: 'synthetic@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions,
  priorityRules: [],
  openers: [],
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
    title: 'Synthetic timing fixture',
    provider: 'XIV Gear Lab',
    gamePatch: 'test'
  }],
  limitation: 'Synthetic timing fixture.',
  ...overrides
});

const combatStats: CombatEvaluationStats = {
  stats: emptyStats(),
  weaponDamage: 140,
  weaponDelayMs: 2500,
  speedStatValue: 420,
  speedBaseSub: 420,
  speedLevelDiv: 2780,
  hastePercent: 0
};

const scripted = (
  ids: string[],
  overrides: Partial<Omit<CombatTimelineEngineOptions, 'profile' | 'combatStats' | 'durationMs' | 'chooseAction'>> = {}
) => {
  let index = 0;
  return {
    chooseAction: () => ids[index],
    onActionStarted: () => { index += 1; },
    ...overrides
  };
};

describe('integer-millisecond combat timing', () => {
  it('matches the nested speed and haste floor boundaries', () => {
    expect(adjustedRecastMs(2500, 420, 420, 2780, 0)).toBe(2500);
    expect(adjustedRecastMs(2500, 500, 420, 2780, 13)).toBe(2160);
    expect(() => adjustedRecastMs(2500, 500, 420, 0, 0)).toThrow('divisor');
    expect(() => adjustedRecastMs(2500, 500, 420, 2780, 100)).toThrow('Haste');
  });

  it('includes an application exactly at the cutoff and excludes one millisecond after it', () => {
    const strike = action('strike', { recastMs: 10_000, applicationDelayMs: 1 });
    const exact = runCombatTimeline({
      profile: profileFor([strike]),
      combatStats,
      durationMs: 10_001,
      ...scripted(['strike', 'strike'])
    });
    expect(exact.records.map((record) => record.appliedAtMs)).toEqual([1, 10_001]);

    const beyond = runCombatTimeline({
      profile: profileFor([strike]),
      combatStats,
      durationMs: 10_000,
      ...scripted(['strike', 'strike'])
    });
    expect(beyond.records.map((record) => record.appliedAtMs)).toEqual([1]);
    expect(beyond.summary.pendingApplicationsByAction).toEqual({ strike: 1 });
    expect(beyond.summary.pendingApplicationPotency).toBe(100);
    expect(exact.summary.pendingApplicationsByAction).toEqual({});
  });

  it('separates cast completion snapshots from later damage application', () => {
    const buff = action('buff', {
      kind: 'ogcd',
      potency: 0,
      recastMs: 60_000,
      effects: [{ kind: 'buff', buffId: 'brief', durationMs: 1000, damageMultiplier: 2 }]
    });
    const cast = action('cast', {
      potency: 200,
      castMs: 1500,
      applicationDelayMs: 500
    });
    const result = runCombatTimeline({
      profile: profileFor([buff, cast]),
      combatStats,
      durationMs: 3000,
      ...scripted(['buff', 'cast'])
    });
    const castRecord = result.records.find((record) => record.actionId === 'cast')!;
    expect(castRecord.startedAtMs).toBe(600);
    expect(castRecord.appliedAtMs).toBe(2600);
    expect(castRecord.snapshotBuffIds).toEqual([]);
    expect(castRecord.damage).toBe(200);
  });

  it('overlaps cast occupancy with the action lock instead of adding both delays', () => {
    const shortCast = action('short-cast', {
      castMs: 2300,
      animationLockMs: 600
    });
    const result = runCombatTimeline({
      profile: profileFor([shortCast], {
        assumptions: {
          ...profileFor([]).assumptions,
          latencyMs: 20
        }
      }),
      combatStats,
      durationMs: 5000,
      ...scripted(['short-cast', 'short-cast', 'short-cast'])
    });

    expect(result.records.map((record) => record.startedAtMs)).toEqual([0, 2500]);
    expect(result.summary.clippedMs).toBe(0);
  });

  it('scales cast duration with the same speed and haste context as its recast', () => {
    const cast = action('scaled-cast', {
      castMs: 2000,
      speedScaling: 'spell-speed'
    });
    const fasterStats = {
      ...combatStats,
      speedStatValue: 1800,
      hastePercent: 10
    };
    const expectedCastMs = adjustedRecastMs(2000, 1800, 420, 2780, 10);
    const expectedRecastMs = adjustedRecastMs(2500, 1800, 420, 2780, 10);
    const result = runCombatTimeline({
      profile: profileFor([cast]),
      combatStats: fasterStats,
      durationMs: expectedRecastMs + expectedCastMs,
      ...scripted(['scaled-cast', 'scaled-cast'])
    });

    expect(result.records.map((record) => [record.startedAtMs, record.appliedAtMs])).toEqual([
      [0, expectedCastMs],
      [expectedRecastMs, expectedRecastMs + expectedCastMs]
    ]);
    expect(result.summary.clippedMs).toBe(0);
  });

  it('records only the unavoidable cast overrun when a hardcast exceeds its recast', () => {
    const longCast = action('long-cast', {
      castMs: 2800,
      animationLockMs: 600
    });
    const result = runCombatTimeline({
      profile: profileFor([longCast], {
        assumptions: {
          ...profileFor([]).assumptions,
          latencyMs: 20
        }
      }),
      combatStats,
      durationMs: 6000,
      ...scripted(['long-cast', 'long-cast', 'long-cast'])
    });

    expect(result.records.map((record) => record.startedAtMs)).toEqual([0, 2820]);
    expect(result.summary.clippedMs).toBe(640);
  });

  it('allows the remaining recast window after a short cast to hold a legal weave', () => {
    const cast = action('cast', {
      castMs: 1500,
      animationLockMs: 600
    });
    const weave = action('weave', {
      kind: 'ogcd',
      potency: 50,
      recastMs: 60_000
    });
    const result = runCombatTimeline({
      profile: profileFor([cast, weave], {
        assumptions: {
          ...profileFor([]).assumptions,
          latencyMs: 20
        }
      }),
      combatStats,
      durationMs: 5000,
      ...scripted(['cast', 'weave', 'cast'])
    });

    expect(result.records.map((record) => [record.actionId, record.startedAtMs])).toEqual([
      ['cast', 0],
      ['weave', 1520],
      ['cast', 2500]
    ]);
    expect(result.summary.clippedMs).toBe(0);
  });

  it('allows a legal double weave and measures an intentionally clipped weave', () => {
    const gcd = action('gcd');
    const weave = action('weave', {
      kind: 'ogcd',
      potency: 50,
      recastMs: 10_000,
      charges: 2
    });
    const clean = runCombatTimeline({
      profile: profileFor([gcd, weave]),
      combatStats,
      durationMs: 5000,
      chooseAction: (state) => {
        if (state.canUse('gcd')) return 'gcd';
        if (state.canWeave('weave')) return 'weave';
        return 'gcd';
      }
    });
    expect(clean.records.filter((record) => record.actionId === 'weave').map((record) => record.startedAtMs))
      .toEqual([600, 1200]);
    expect(clean.summary.clippedMs).toBe(0);

    const longWeave = action('long-weave', {
      kind: 'ogcd',
      potency: 50,
      recastMs: 60_000,
      animationLockMs: 2000
    });
    const clipped = runCombatTimeline({
      profile: profileFor([gcd, longWeave]),
      combatStats,
      durationMs: 5000,
      ...scripted(['gcd', 'long-weave', 'gcd'])
    });
    expect(clipped.records.find((record) => record.actionId === 'long-weave')?.startedAtMs).toBe(600);
    expect(clipped.records.filter((record) => record.actionId === 'gcd').at(-1)?.startedAtMs).toBe(2600);
    expect(clipped.summary.clippedMs).toBe(100);
  });

  it('recovers charges sequentially and records held-cooldown drift', () => {
    const gcd = action('gcd');
    const charged = action('charged', {
      kind: 'ogcd',
      recastMs: 10_000,
      charges: 2
    });
    const starts: number[] = [];
    const result = runCombatTimeline({
      profile: profileFor([gcd, charged]),
      combatStats,
      durationMs: 21_000,
      chooseAction: (state) => {
        if (state.canUse('gcd')) return 'gcd';
        if (state.availableCharges('charged') > 0) return 'charged';
        return 'gcd';
      },
      onActionStarted: (used, atMs) => {
        if (used.id === 'charged') starts.push(atMs);
      }
    });
    expect(starts.slice(0, 4)).toEqual([600, 1200, 10_600, 20_600]);
    expect(result.summary.driftMsByAction.charged ?? 0).toBeGreaterThanOrEqual(0);

    const singleCharge = action('single-charge', {
      kind: 'ogcd',
      recastMs: 10_000,
      charges: 1
    });
    let uses = 0;
    const held = runCombatTimeline({
      profile: profileFor([gcd, singleCharge]),
      combatStats,
      durationMs: 16_000,
      chooseAction: (state) => {
        if (state.canUse('gcd')) return 'gcd';
        if (uses === 0 || state.nowMs >= 15_600) return 'single-charge';
        return 'gcd';
      },
      onActionStarted: (used) => {
        if (used.id === 'single-charge') uses += 1;
      }
    });
    expect({
      starts: held.records
        .filter((record) => record.actionId === 'single-charge')
        .map((record) => record.startedAtMs),
      drift: held.summary.driftMsByAction['single-charge'],
      uses
    }).toEqual({ starts: [600, 15_600], drift: 5000, uses: 2 });
  });

  it('snapshots damage buffs and applies haste only to recasts begun while active', () => {
    const buff = action('buff', {
      kind: 'ogcd',
      potency: 0,
      recastMs: 60_000,
      effects: [{
        kind: 'buff',
        buffId: 'burst',
        durationMs: 3000,
        damageMultiplier: 1.2,
        hastePercent: 20
      }]
    });
    const gcd = action('gcd', { speedScaling: 'skill-speed' });
    const result = runCombatTimeline({
      profile: profileFor([buff, gcd]),
      combatStats,
      durationMs: 6000,
      ...scripted(['buff', 'gcd', 'gcd', 'gcd'])
    });
    const gcdRecords = result.records.filter((record) => record.actionId === 'gcd');
    expect(gcdRecords[0]).toMatchObject({ startedAtMs: 600, damage: 120, snapshotBuffIds: ['burst'] });
    expect(gcdRecords[1]?.startedAtMs).toBe(2600);
    expect(gcdRecords[2]).toMatchObject({ startedAtMs: 4600, damage: 100, snapshotBuffIds: [] });
  });

  it('refreshes DoTs by generation and keeps their original damage snapshot', () => {
    const dot = action('dot', {
      potency: 50,
      effects: [{
        kind: 'dot',
        dotId: 'test-dot',
        durationMs: 12_000,
        tickPotency: 30
      }]
    });
    const result = runCombatTimeline({
      profile: profileFor([dot]),
      combatStats,
      durationMs: 12_000,
      ...scripted(['dot', 'dot'])
    });
    expect(result.records.filter((record) => record.source === 'dot').map((record) => record.appliedAtMs))
      .toEqual([3000, 6000, 9000, 12_000]);
    expect(result.summary.dotCadenceById['test-dot']).toEqual({
      applications: 2,
      refreshes: 1,
      earlyRefreshMs: 9500,
      lateRefreshMs: 0,
      missedTicks: 0
    });
  });

  it('measures DoT downtime and server ticks missed before a late refresh', () => {
    const dot = action('dot', {
      potency: 0,
      recastMs: 10_000,
      effects: [{
        kind: 'dot',
        dotId: 'short-dot',
        durationMs: 4000,
        tickPotency: 30
      }]
    });
    const result = runCombatTimeline({
      profile: profileFor([dot]),
      combatStats,
      durationMs: 11_000,
      ...scripted(['dot', 'dot'])
    });

    expect(result.summary.dotCadenceById['short-dot']).toEqual({
      applications: 2,
      refreshes: 1,
      earlyRefreshMs: 0,
      lateRefreshMs: 6000,
      missedTicks: 2
    });
  });

  it('tracks resource overcap, costs and expected proc values deterministically', () => {
    const gain = action('gain', {
      effects: [
        { kind: 'resource', resource: 'gauge', amount: 70 },
        { kind: 'expected-proc', procId: 'shiny', chance: 0.4 }
      ]
    });
    const spend = action('spend', {
      kind: 'ogcd',
      potency: 0,
      recastMs: 0,
      resourceCosts: [{ resource: 'gauge', amount: 50 }]
    });
    const result = runCombatTimeline({
      profile: profileFor([gain, spend]),
      combatStats,
      durationMs: 6000,
      initialResources: { gauge: 80 },
      resourceCaps: { gauge: 100 },
      resolvePotency: (used, state) => used.id === 'spend'
        ? Number(state.resources.gauge)
        : used.potency,
      ...scripted(['gain', 'spend', 'gain'])
    });
    expect(result.finalState.resources.gauge).toBe(100);
    expect(result.summary.overcappedResources.gauge).toBe(70);
    expect(result.finalState.expectedProcs.shiny).toBeCloseTo(0.8);
    expect(result.records.find((record) => record.actionId === 'spend')?.potency).toBe(100);

    expect(() => runCombatTimeline({
      profile: profileFor([spend]),
      combatStats,
      durationMs: 1000,
      initialResources: { gauge: 0 },
      resourceCaps: { gauge: 100 },
      ...scripted(['spend'])
    })).toThrow('resource costs');
  });

  it('keeps executable job-specific mechanic state inside the installed engine callback', () => {
    const stance = action('stance', {
      effects: [{ kind: 'mechanic', mechanicId: 'advance-phase' }]
    });
    const result = runCombatTimeline({
      profile: profileFor([stance]),
      combatStats,
      durationMs: 1000,
      initialMechanics: { phase: 1, label: 'opening' },
      applyMechanic: (mechanicId, state) => mechanicId === 'advance-phase'
        ? { phase: Number(state.mechanics.phase) + 1, label: 'active' }
        : undefined,
      ...scripted(['stance'])
    });
    expect(result.finalState.mechanics).toEqual({ label: 'active', phase: 2 });
  });

  it('schedules delayed pet actions and independent auto-attacks', () => {
    const pet = action('pet-hit', {
      kind: 'pet',
      potency: 100,
      recastMs: 0
    });
    const summon = action('summon', {
      kind: 'ogcd',
      potency: 0,
      recastMs: 60_000,
      effects: [{
        kind: 'schedule-action',
        actionId: 'pet-hit',
        delayMs: 2000,
        repeatEveryMs: 3000,
        repeatCount: 3
      }]
    });
    const auto = action('auto', {
      kind: 'auto-attack',
      potency: 90,
      recastMs: 0
    });
    const result = runCombatTimeline({
      profile: profileFor([summon, pet, auto]),
      combatStats,
      durationMs: 9000,
      autoAttackActionId: 'auto',
      firstAutoAttackAtMs: 1000,
      ...scripted(['summon'])
    });
    expect(result.records.filter((record) => record.source === 'pet').map((record) => record.appliedAtMs))
      .toEqual([2000, 5000, 8000]);
    expect(result.records.filter((record) => record.source === 'auto-attack').map((record) => record.appliedAtMs))
      .toEqual([1000, 3500, 6000, 8500]);
  });

  it('is deterministic, cancellable and reports bounded progress', () => {
    const gcd = action('gcd');
    const first = runCombatTimeline({
      profile: profileFor([gcd]),
      combatStats,
      durationMs: 30_000,
      chooseAction: () => 'gcd'
    });
    const second = runCombatTimeline({
      profile: profileFor([gcd]),
      combatStats,
      durationMs: 30_000,
      chooseAction: () => 'gcd'
    });
    expect(second).toEqual(first);
    expect(first.records).toHaveLength(13);
    expect(first.records.at(-1)?.appliedAtMs).toBe(30_000);

    const fiveMinutes = runCombatTimeline({
      profile: profileFor([gcd]),
      combatStats,
      durationMs: 300_000,
      chooseAction: () => 'gcd'
    });
    expect(fiveMinutes.records).toHaveLength(121);
    expect(fiveMinutes.records.at(-1)?.appliedAtMs).toBe(300_000);

    let checks = 0;
    const progress: number[] = [];
    const cancelled = runCombatTimeline({
      profile: profileFor([gcd]),
      combatStats,
      durationMs: 300_000,
      chooseAction: () => 'gcd',
      control: {
        isCancelled: () => ++checks > 5,
        reportProgress: (value) => progress.push(value)
      }
    });
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.records.length).toBeGreaterThan(0);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('exposes active combo state to potency rules and expires it on an exact boundary', () => {
    const opener = action('combo-start', {
      effects: [{ kind: 'combo', comboId: 'test-combo', nextStep: 'finish', durationMs: 3000 }]
    });
    const finisher = action('combo-finish', { potency: 100 });
    const active = runCombatTimeline({
      profile: profileFor([opener, finisher]),
      combatStats,
      durationMs: 3000,
      resolvePotency: (used, state) =>
        used.id === 'combo-finish' && state.combos.some((combo) => combo.id === 'test-combo' && combo.step === 'finish')
          ? 300
          : used.potency,
      ...scripted(['combo-start', 'combo-finish'])
    });
    expect(active.records.find((record) => record.actionId === 'combo-finish')?.potency).toBe(300);

    const expiredProfile = profileFor([
      action('short-combo', {
        effects: [{ kind: 'combo', comboId: 'short', nextStep: 'finish', durationMs: 2500 }]
      }),
      finisher
    ]);
    const expired = runCombatTimeline({
      profile: expiredProfile,
      combatStats,
      durationMs: 3000,
      resolvePotency: (used, state) =>
        used.id === 'combo-finish' && state.combos.some((combo) => combo.id === 'short')
          ? 300
          : used.potency,
      ...scripted(['short-combo', 'combo-finish'])
    });
    expect(expired.records.find((record) => record.actionId === 'combo-finish')?.potency).toBe(100);
  });

  it('stores immutable timing templates with bounded least-recently-used eviction', () => {
    const result = runCombatTimeline({
      profile: profileFor([action('gcd')]),
      combatStats,
      durationMs: 5000,
      chooseAction: () => 'gcd'
    });
    const template = timelineTemplateFrom(result);
    const cache = new CombatTimelineCache(2);
    cache.set('one', template);
    cache.set('two', template);
    const copy = cache.get('one')!;
    copy.records[0]!.potency = 9999;
    cache.set('three', template);

    expect(cache.get('two')).toBeUndefined();
    expect(cache.get('one')!.records[0]!.potency).toBe(100);
    expect(cache.getOrCreate('four', () => template).records).toHaveLength(result.records.length);
    expect(cache.size).toBe(2);
  });

  it('keeps a GCD action cooldown independent from the shared recast', () => {
    const burst = action('burst', { cooldownMs: 10_000 });
    const filler = action('filler');
    const result = runCombatTimeline({
      profile: profileFor([burst, filler]),
      combatStats,
      durationMs: 20_000,
      chooseAction: (state) => state.availableCharges('burst') > 0 ? 'burst' : 'filler'
    });

    expect(result.records.filter((record) => record.actionId === 'burst').map((record) => record.startedAtMs))
      .toEqual([0, 10_000, 20_000]);
  });

  it('spends deterministic accumulated proc expectation only after a full proc is available', () => {
    const generator = action('generator', {
      effects: [{ kind: 'expected-proc', procId: 'expected-proc', chance: 0.5 }]
    });
    const spender = action('spender', {
      expectedProcCosts: [{ resource: 'expected-proc', amount: 1 }]
    });
    const result = runCombatTimeline({
      profile: profileFor([generator, spender]),
      combatStats,
      durationMs: 7500,
      chooseAction: (state) => (state.expectedProcs['expected-proc'] ?? 0) >= 1
        ? 'spender'
        : 'generator'
    });

    expect(result.records.map((record) => record.actionId))
      .toEqual(['generator', 'generator', 'spender', 'generator']);
    expect(result.finalState.expectedProcs['expected-proc']).toBe(0.5);
  });

  it('applies explicit snapshot resources before delayed damage and bounded periodic gains', () => {
    const generator = action('cast-generator', {
      castMs: 1000,
      applicationDelayMs: 2000,
      effects: [{
        kind: 'resource',
        resource: 'gauge',
        amount: 1,
        timing: 'snapshot'
      }]
    });
    const spender = action('spender', {
      resourceCosts: [{ resource: 'gauge', amount: 1 }]
    });
    const result = runCombatTimeline({
      profile: profileFor([generator, spender]),
      combatStats,
      durationMs: 5000,
      initialResources: { periodic: 0 },
      resourceCaps: { gauge: 1, periodic: 3 },
      periodicResourceChanges: [{
        resource: 'periodic',
        amount: 1,
        firstAtMs: 1000,
        intervalMs: 2000,
        repeatCount: 3
      }],
      chooseAction: (state) => (state.resources.gauge ?? 0) >= 1
        ? 'spender'
        : 'cast-generator'
    });

    expect(result.records.find((record) => record.actionId === 'spender')?.startedAtMs).toBe(2500);
    expect(result.records.find((record) => record.actionId === 'cast-generator')?.appliedAtMs).toBe(3000);
    expect(result.finalState.resources.periodic).toBe(3);
  });

  it('resumes the rotation when an action-scheduled resource tick makes a GCD usable', () => {
    const lucid = action('lucid', {
      kind: 'ogcd',
      recastMs: 60_000,
      cooldownMs: 60_000,
      effects: [{
        kind: 'periodic-resource',
        resource: 'mp',
        amount: 1,
        firstDelayMs: 3000,
        intervalMs: 3000,
        repeatCount: 2
      }]
    });
    const spell = action('spell', {
      resourceCosts: [{ resource: 'mp', amount: 1 }]
    });
    const result = runCombatTimeline({
      profile: profileFor([lucid, spell]),
      combatStats,
      durationMs: 7000,
      initialResources: { mp: 0 },
      resourceCaps: { mp: 1 },
      chooseAction: (state) => {
        if (state.nowMs === 0) return 'lucid';
        if ((state.resources.mp ?? 0) >= 1) return 'spell';
        return undefined;
      }
    });

    expect(result.records.filter((record) => record.actionId === 'spell').map((record) => record.startedAtMs))
      .toEqual([3000, 6000]);
    expect(result.summary.finalResources.mp).toBe(0);
  });
});
