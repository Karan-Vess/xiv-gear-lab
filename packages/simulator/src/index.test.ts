import { describe, expect, it } from 'vitest';
import { emptyStats, type CombatRotationProfile } from '@xiv-gear-lab/domain';
import {
  buildRotationTimingCacheKey,
  CombatEvaluatorRegistry,
  durationForMode,
  labelForMode,
  resolveRotationMethod,
  ROTATION_PROFILE_SCHEMA_VERSION,
  type CombatEvaluationRequest,
  type CombatEvaluatorPlugin
} from './index';

const profile: CombatRotationProfile = {
  id: 'sam-dt-standard-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: 'dt-7.51-level-100-standard@1',
  job: 'SAM',
  jobMode: 'standard',
  version: 'sam-7.51@1',
  gamePatch: '7.51',
  engineId: 'sam-standard@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: [{
    id: 'hakaze',
    name: 'Hakaze',
    kind: 'gcd',
    potency: 200,
    recastMs: 2500,
    castMs: 0,
    animationLockMs: 600,
    applicationDelayMs: 0,
    charges: 1,
    speedScaling: 'skill-speed',
    referenceIds: ['official-actions']
  }, {
    id: 'tincture',
    name: 'Grade 2 Gemdraught',
    kind: 'ogcd',
    consumable: 'potion',
    potency: 0,
    recastMs: 270_000,
    castMs: 0,
    animationLockMs: 600,
    applicationDelayMs: 0,
    charges: 1,
    speedScaling: 'none',
    referenceIds: ['official-actions']
  }],
  priorityRules: [{
    id: 'filler',
    actionId: 'hakaze',
    conditions: [{ kind: 'always' }],
    explanation: 'Use the available filler action.',
    referenceIds: ['internal-priority']
  }],
  openers: [{
    id: 'community-751',
    name: 'Community 7.51 opener',
    gamePatch: '7.51',
    actionIds: ['hakaze', 'tincture'],
    confidence: 'community-validated',
    potion: 'included',
    externalPartyBuffs: false,
    referenceIds: ['community-opener']
  }, {
    id: 'community-750',
    name: 'Community 7.50 opener',
    gamePatch: '7.50',
    actionIds: ['hakaze', 'tincture'],
    confidence: 'community-validated',
    potion: 'included',
    externalPartyBuffs: false,
    referenceIds: ['community-opener']
  }],
  defaultOpenerId: 'community-751',
  assumptions: {
    targetCount: 1,
    uptimePercent: 100,
    movement: false,
    downtime: false,
    externalPartyBuffs: false,
    rngMode: 'expected-value',
    latencyMs: 20,
    weaveWindowMs: 700,
    cutoffPolicy: 'strict-application'
  },
  references: [{
    id: 'official-actions',
    kind: 'official',
    title: 'Official action data',
    provider: 'Square Enix',
    url: 'https://na.finalfantasyxiv.com/jobguide/samurai/',
    gamePatch: '7.51'
  }, {
    id: 'community-opener',
    kind: 'community',
    title: 'Community opener',
    provider: 'Fixture community',
    url: 'https://example.com/opener',
    gamePatch: '7.51'
  }, {
    id: 'internal-priority',
    kind: 'xiv-gear-lab',
    title: 'Generated priority',
    provider: 'XIV Gear Lab',
    gamePatch: '7.51'
  }],
  limitation: 'Synthetic M12 contract fixture.'
};

const request = (overrides: Partial<CombatEvaluationRequest> = {}): CombatEvaluationRequest => ({
  mode: 'dummy-300',
  profile,
  combatStats: {
    stats: emptyStats(),
    weaponDamage: 140,
    weaponDelayMs: 2640,
    speedStatValue: 500,
    speedBaseSub: 420,
    speedLevelDiv: 2780,
    hastePercent: 13
  },
  openerPreference: 'auto',
  potion: 'included',
  includeTimeline: false,
  ...overrides
});

describe('bounded combat evaluator contracts', () => {
  it('uses readable fixed-duration mode labels', () => {
    expect(durationForMode('opener-30')).toBe(30_000);
    expect(durationForMode('dummy-300')).toBe(300_000);
    expect(labelForMode('opener-30')).toBe('30-second burst');
    expect(labelForMode('dummy-300')).toBe('Five-minute dummy rotation');
  });

  it('uses the current community opener and safely falls back from stale data', () => {
    expect(resolveRotationMethod(profile, 'auto')).toMatchObject({
      kind: 'community-opener',
      confidence: 'community-validated',
      opener: { id: 'community-751' }
    });
    expect(resolveRotationMethod(profile, 'community-750')).toMatchObject({
      kind: 'generated-priority',
      confidence: 'generated-preliminary'
    });
    expect(resolveRotationMethod(profile, 'community-750').warning).toContain('patch 7.50');
  });

  it('caches timelines by timing inputs rather than damage-only stats', () => {
    const baseline = request();
    const damageOnly = request({
      combatStats: {
        ...baseline.combatStats,
        stats: { ...baseline.combatStats.stats, criticalHit: 9000, determination: 8000 }
      }
    });
    const faster = request({
      combatStats: { ...baseline.combatStats, speedStatValue: 501 }
    });
    const critAffectsRotation = request({
      rotationAffectingStats: { criticalHit: 9000 }
    });
    expect(buildRotationTimingCacheKey(damageOnly)).toBe(buildRotationTimingCacheKey(baseline));
    expect(buildRotationTimingCacheKey(faster)).not.toBe(buildRotationTimingCacheKey(baseline));
    expect(buildRotationTimingCacheKey(critAffectsRotation)).not.toBe(buildRotationTimingCacheKey(baseline));
  });

  it('refuses missing, duplicate, unsupported, or profile-invalid engines', () => {
    const plugin: CombatEvaluatorPlugin = {
      engineId: profile.engineId,
      supportedProfileSchemas: [ROTATION_PROFILE_SCHEMA_VERSION],
      validateProfile: () => [],
      simulate: () => { throw new Error('Not part of the M12A contract test.'); }
    };
    const registry = new CombatEvaluatorRegistry([plugin]);
    expect(registry.requireFor(profile)).toBe(plugin);
    expect(() => registry.register(plugin)).toThrow('already registered');
    expect(() => new CombatEvaluatorRegistry().requireFor(profile)).toThrow('is not installed');
    expect(() => registry.requireFor({ ...profile, schemaVersion: 'future@9' })).toThrow('does not support');

    const invalidPlugin: CombatEvaluatorPlugin = {
      ...plugin,
      engineId: 'invalid@1',
      validateProfile: () => ['Missing required mechanic.']
    };
    expect(() => new CombatEvaluatorRegistry([invalidPlugin]).requireFor({
      ...profile,
      engineId: invalidPlugin.engineId
    })).toThrow('Missing required mechanic');
  });
});
