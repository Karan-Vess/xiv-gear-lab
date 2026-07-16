import { describe, expect, it } from 'vitest';
import {
  assessSnapshotCompatibility,
  effectiveLevel,
  emptyStats,
  getEvaluatorCapability,
  jobAvailableAtAccess,
  type CombatEvaluatorProfile,
  type GameRegistry,
  type GearSnapshot,
  type RuntimeCompatibility
} from './index';

const available = (profileId: string) => ({ status: 'available' as const, profileId });
const pending = { status: 'pending' as const, reason: 'Evaluator data has not been published yet.' };

const futureRegistry: GameRegistry = {
  schemaVersion: 'game-registry@1',
  expansions: [
    { id: 'dt', name: 'Dawntrail', levelCap: 100, order: 5 },
    { id: 'future', name: 'Synthetic Future', levelCap: 110, order: 6 }
  ],
  jobs: [
    {
      id: 'ALP',
      name: 'Alpha',
      role: 'dps',
      minimumLevel: 100,
      introducedIn: 'future',
      defaultGcdTarget: 2.5,
      recommendedGcdTargets: [2.5],
      targetTimingEffectId: 'base-gcd',
      timingEffects: [{ id: 'base-gcd', name: 'Base GCD', kind: 'base', hastePercent: 0 }],
      modes: [
        {
          id: 'standard',
          name: 'Standard',
          introducedIn: 'future',
          capabilities: {
            'generic-hit': available('alpha-generic@1'),
            'opener-30': pending,
            'dummy-300': pending
          }
        },
        {
          id: 'evolved',
          name: 'Evolved',
          introducedIn: 'future',
          capabilities: {
            'generic-hit': pending,
            'opener-30': pending,
            'dummy-300': pending
          }
        }
      ]
    },
    {
      id: 'BET',
      name: 'Beta',
      role: 'healer',
      minimumLevel: 100,
      introducedIn: 'future',
      defaultGcdTarget: 2.5,
      recommendedGcdTargets: [2.5],
      targetTimingEffectId: 'base-gcd',
      timingEffects: [{ id: 'base-gcd', name: 'Base GCD', kind: 'base', hastePercent: 0 }],
      modes: [{
        id: 'standard',
        name: 'Standard',
        introducedIn: 'future',
        capabilities: {
          'generic-hit': pending,
          'opener-30': pending,
          'dummy-300': pending
        }
      }]
    }
  ]
};

const alphaProfile: CombatEvaluatorProfile = {
  id: 'alpha-generic@1',
  schemaVersion: 'generic-hit-profile@1',
  rulesetId: 'future-standard@1',
  job: 'ALP',
  jobMode: 'standard',
  version: 'synthetic@1',
  role: 'dps',
  mainStat: 'intelligence',
  mainStatLabel: 'Intelligence',
  mainStatAbbreviation: 'INT',
  speedStat: 'spellSpeed',
  speedStatLabel: 'Spell Speed',
  speedStatAbbreviation: 'SPS',
  meldStats: ['criticalHit', 'determination', 'directHit', 'spellSpeed'],
  baseStats: { ...emptyStats(), intelligence: 500, vitality: 450, criticalHit: 420, determination: 440, directHit: 420, spellSpeed: 420 },
  attackPowerModifier: 237,
  mainStatModifier: 115,
  appliesTenacity: false,
  damageTrait: 1.3,
  baseGcdMs: 2500,
  hastePercent: 0,
  timingEffectId: 'base-gcd',
  objective: 'Synthetic generic hit.',
  confidence: 'reference-validated-proxy',
  limitation: 'Synthetic test fixture.'
};

const futureSnapshot: GearSnapshot = {
  manifest: {
    id: 'synthetic-future',
    schemaVersion: 'gear-snapshot@1',
    registrySchemaVersion: 'game-registry@1',
    rulesetSchemaVersion: 'combat-ruleset@1',
    minimumAppVersion: '0.5.0',
    generatedAt: '2026-07-15T00:00:00.000Z',
    gamePatch: '8.0',
    gearTierPatch: '8.0',
    xivapiVersion: 'fixture',
    xivapiSchema: 'fixture@1',
    calculationVersion: 'synthetic@1',
    status: 'online-current'
  },
  registry: futureRegistry,
  rulesets: [{
    id: 'future-standard@1',
    schemaVersion: 'combat-ruleset@1',
    calculationSchema: 'ffxiv-combat-level-100@1',
    expansionId: 'future',
    gamePatch: '8.0',
    minimumLevel: 100,
    maximumLevel: 110,
    jobMode: 'standard'
  }],
  evaluatorProfiles: [alphaProfile],
  items: [],
  materia: [],
  foods: [],
  curatedSets: []
};

const runtime: RuntimeCompatibility = {
  appVersion: '0.5.0',
  snapshotSchemas: ['gear-snapshot@1'],
  registrySchemas: ['game-registry@1'],
  rulesetSchemas: ['combat-ruleset@1'],
  calculationSchemas: ['ffxiv-combat-level-100@1'],
  evaluatorProfileSchemas: ['generic-hit-profile@1']
};

describe('data-driven expansion and job access', () => {
  it('caps effective level using registry data', () => {
    expect(effectiveLevel(futureRegistry, 'dt', 110)).toBe(100);
    expect(effectiveLevel(futureRegistry, 'future', 110)).toBe(110);
    expect(effectiveLevel(futureRegistry, 'future', 103)).toBe(103);
  });

  it('onboards two future jobs without extending a TypeScript job union', () => {
    expect(jobAvailableAtAccess(futureRegistry, 'ALP', 'dt', 100)).toBe(false);
    expect(jobAvailableAtAccess(futureRegistry, 'ALP', 'future', 99)).toBe(false);
    expect(jobAvailableAtAccess(futureRegistry, 'ALP', 'future', 100)).toBe(true);
    expect(jobAvailableAtAccess(futureRegistry, 'BET', 'future', 100)).toBe(true);
  });

  it('tracks standard and evolved capabilities independently', () => {
    expect(jobAvailableAtAccess(futureRegistry, 'ALP', 'future', 110, 'evolved')).toBe(true);
    expect(getEvaluatorCapability(futureRegistry, 'ALP', 'standard', 'generic-hit')).toEqual(available('alpha-generic@1'));
    expect(getEvaluatorCapability(futureRegistry, 'ALP', 'evolved', 'generic-hit')?.status).toBe('pending');
    expect(getEvaluatorCapability(futureRegistry, 'BET', 'standard', 'generic-hit')?.status).toBe('pending');
  });
});

describe('snapshot compatibility gate', () => {
  it('accepts compatible profile data while preserving evaluator-pending jobs and modes', () => {
    const report = assessSnapshotCompatibility(futureSnapshot, runtime);
    expect(report.compatible).toBe(true);
    expect(report.warnings.some((warning) => warning.includes('BET') && warning.includes('generic-hit'))).toBe(true);
    expect(report.warnings.some((warning) => warning.includes('ALP mode evolved'))).toBe(true);
  });

  it('fails closed on an unknown formula schema', () => {
    const snapshot = structuredClone(futureSnapshot);
    snapshot.rulesets[0]!.calculationSchema = 'future-formula@9';
    const report = assessSnapshotCompatibility(snapshot, runtime);
    expect(report.compatible).toBe(false);
    expect(report.errors).toContain('Ruleset future-standard@1 requires unsupported calculation schema future-formula@9.');
  });

  it('fails closed when the snapshot requires a newer app', () => {
    const snapshot = structuredClone(futureSnapshot);
    snapshot.manifest.minimumAppVersion = '9.0.0';
    expect(assessSnapshotCompatibility(snapshot, runtime).errors[0]).toContain('requires app 9.0.0');
  });

  it('rejects missing or unsupported evaluator profiles', () => {
    const missing = structuredClone(futureSnapshot);
    missing.evaluatorProfiles = [];
    expect(assessSnapshotCompatibility(missing, runtime).errors)
      .toContain('Job ALP mode standard references missing profile alpha-generic@1.');

    const unsupported = structuredClone(futureSnapshot);
    unsupported.evaluatorProfiles[0]!.schemaVersion = 'generic-hit-profile@99';
    expect(assessSnapshotCompatibility(unsupported, runtime).errors)
      .toContain('Profile alpha-generic@1 uses unsupported evaluator schema generic-hit-profile@99.');
  });

  it('validates signed snapshot provider freshness metadata', () => {
    const valid = structuredClone(futureSnapshot);
    valid.manifest.providerFreshness = [
      { id: 'xivapi', status: 'current', retrievedAt: '2026-07-15T00:00:00.000Z' },
      { id: 'etro', status: 'stale', message: 'Using last-known-good data.' }
    ];
    expect(assessSnapshotCompatibility(valid, runtime).compatible).toBe(true);

    const malformed = structuredClone(valid) as GearSnapshot & { manifest: { providerFreshness: unknown } };
    malformed.manifest.providerFreshness = [
      { id: 'xivapi', status: 'current' },
      { id: 'xivapi', status: 'mystery' }
    ];
    const report = assessSnapshotCompatibility(malformed, runtime);
    expect(report.errors).toContain('Snapshot provider freshness entry 1 has unsupported status mystery.');
    expect(report.errors).toContain('Duplicate provider freshness ID xivapi.');
  });
});
