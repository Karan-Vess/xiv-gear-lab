import { describe, expect, it } from 'vitest';
import {
  applyMateria,
  applyRelicStats,
  expectedAction100,
  gcdFromSpellSpeed,
  getCombatEvaluatorProfile,
  LEVEL_50,
  LEVEL_60,
  LEVEL_70,
  LEVEL_90,
  SUPPORTED_CALCULATION_SCHEMAS,
  pietyMpBonusPerTick,
  pietyMpPerTick,
  tenacityIncomingDamageMultiplier,
  tenacityMultiplier
} from './index';
import { emptyStats, type CombatEvaluatorProfile, type EquipmentItem, type Materia } from '@xiv-gear-lab/domain';

const whmProfile: CombatEvaluatorProfile = {
  id: 'test-whm@1',
  schemaVersion: 'generic-hit-profile@1',
  rulesetId: 'test-level-100@1',
  job: 'WHM',
  jobMode: 'standard',
  version: 'test@1',
  role: 'healer',
  mainStat: 'mind',
  mainStatLabel: 'Mind',
  mainStatAbbreviation: 'MND',
  speedStat: 'spellSpeed',
  speedStatLabel: 'Spell Speed',
  speedStatAbbreviation: 'SPS',
  resourceStat: 'piety',
  resourceLabel: 'Piety',
  resourceStatAbbreviation: 'PIE',
  meldStats: ['criticalHit', 'determination', 'directHit', 'spellSpeed'],
  baseStats: {
    ...emptyStats(),
    mind: 509,
    vitality: 438,
    piety: 440,
    criticalHit: 420,
    determination: 440,
    directHit: 420,
    spellSpeed: 420
  },
  attackPowerModifier: 237,
  mainStatModifier: 115,
  appliesTenacity: false,
  damageTrait: 1.3,
  baseGcdMs: 2500,
  hastePercent: 0,
  timingEffectId: 'base-gcd',
  objective: 'Test expected single 100-potency hit.',
  confidence: 'reference-validated-proxy',
  limitation: 'Test profile.'
};

describe('level 100 combat proxy calculations', () => {
  it('keeps historical-cap formula constants available for data-only catalogue updates', () => {
    expect(LEVEL_70).toEqual({ baseMain: 292, baseSub: 364, levelDiv: 900 });
    expect(LEVEL_60).toEqual({ baseMain: 218, baseSub: 354, levelDiv: 600 });
    expect(LEVEL_50).toEqual({ baseMain: 202, baseSub: 341, levelDiv: 341 });
    expect(SUPPORTED_CALCULATION_SCHEMAS).toEqual(expect.arrayContaining([
      'ffxiv-combat-level-70@1',
      'ffxiv-combat-level-60@1',
      'ffxiv-combat-level-50@1'
    ]));
  });

  it('matches the published 2.29 reference GCD', () => {
    expect(gcdFromSpellSpeed(2155)).toBe(2.29);
  });

  it('matches the published expected-action reference within display rounding', () => {
    const result = expectedAction100(
      {
        ...emptyStats(),
        mind: 6841,
        vitality: 7117,
        piety: 588,
        directHit: 420,
        criticalHit: 3023,
        determination: 2767,
        spellSpeed: 2155
      },
      158,
      whmProfile
    );
    expect(result).toBeCloseTo(12203.66, 2);
  });

  it('resolves a compatible declarative profile for an arbitrary future job ID', () => {
    const profile = { ...whmProfile, id: 'future-alpha@1', job: 'ALP' };
    expect(getCombatEvaluatorProfile('ALP', [profile])).toBe(profile);
  });

  it('applies profile-supplied role traits and haste', () => {
    const hasted = { ...whmProfile, job: 'ALP', role: 'dps' as const, damageTrait: 1.2, hastePercent: 20 };
    expect(getCombatEvaluatorProfile('ALP', [hasted]).damageTrait).toBe(1.2);
    expect(gcdFromSpellSpeed(959, 2500, hasted.hastePercent)).toBe(1.94);
    expect(gcdFromSpellSpeed(420, 2500, 15)).toBe(2.12);
  });

  it('matches the published Paladin expected-hit reference within display rounding', () => {
    const profile: CombatEvaluatorProfile = {
      ...whmProfile,
      id: 'test-pld@1',
      job: 'PLD',
      role: 'tank',
      mainStat: 'strength',
      mainStatLabel: 'Strength',
      mainStatAbbreviation: 'STR',
      speedStat: 'skillSpeed',
      speedStatLabel: 'Skill Speed',
      speedStatAbbreviation: 'SKS',
      resourceStat: 'tenacity',
      resourceLabel: 'Tenacity',
      resourceStatAbbreviation: 'TEN',
      attackPowerModifier: 190,
      mainStatModifier: 100,
      appliesTenacity: true,
      damageTrait: 1
    };
    expect(expectedAction100({
      ...emptyStats(),
      strength: 6772,
      vitality: 7874,
      tenacity: 622,
      criticalHit: 3595,
      determination: 3066,
      directHit: 1230,
      skillSpeed: 420
    }, 158, profile)).toBeCloseTo(7979.5, 2);
  });

  it('matches the published level-100 Dawntrail Tenacity tiers', () => {
    expect(tenacityMultiplier(420)).toBe(1);
    expect(tenacityIncomingDamageMultiplier(420)).toBe(1);
    expect(tenacityMultiplier(622)).toBe(1.008);
    expect(tenacityIncomingDamageMultiplier(622)).toBe(0.986);
  });

  it('matches the published level-100 Piety recovery tick examples', () => {
    expect(pietyMpBonusPerTick(440)).toBe(0);
    expect(pietyMpPerTick(440)).toBe(200);
    expect(pietyMpBonusPerTick(929)).toBe(26);
    expect(pietyMpPerTick(929)).toBe(226);
  });

  it('uses the Endwalker level-90 constants instead of level-100 scaling', () => {
    expect(gcdFromSpellSpeed(400, 2500, 0, LEVEL_90)).toBe(2.5);
    expect(gcdFromSpellSpeed(1000, 2500, 0, LEVEL_90)).toBeLessThan(gcdFromSpellSpeed(1000));
    expect(tenacityMultiplier(622, LEVEL_90)).toBe(1.013);
    expect(pietyMpBonusPerTick(929, LEVEL_90)).toBe(42);
  });

  it('refuses missing or unsupported profiles instead of silently applying a generic one', () => {
    expect(() => getCombatEvaluatorProfile('BLU', [whmProfile])).toThrow('No combat evaluator profile');
    expect(() => getCombatEvaluatorProfile('WHM', [{ ...whmProfile, schemaVersion: 'future-formula@9' }]))
      .toThrow('unsupported schema');
  });

  it('rejects a high-grade materia in the second advanced meld slot', () => {
    const item: EquipmentItem = {
      id: 'advanced-test', origin: 'custom', name: 'Advanced test item', jobs: ['WHM'], slot: 'head', level: 100, itemLevel: 790,
      stats: emptyStats(), statCaps: { ...emptyStats(), criticalHit: 999 }, weaponDamage: 0, weaponDelayMs: 0,
      materiaSlots: 2, advancedMelding: true, unique: false, sourceFamily: 'custom', acquisitionNote: 'Test', provenance: []
    };
    const materia: Materia = { id: 1, name: 'Grade XII test', stat: 'criticalHit', value: 54, tier: 12, advancedMeldingLimit: 'first-slot-only' };
    expect(() => applyMateria(item, [1, 1, 1], [materia])).not.toThrow();
    expect(() => applyMateria(item, [1, 1, 1, 1], [materia])).toThrow('advanced meld slot 2');
  });

  it('applies and validates the discrete Endwalker relic allocation', () => {
    const item: EquipmentItem = {
      id: 40949, origin: 'official', name: 'Mandervillous Wings', jobs: ['SGE'], slot: 'weapon', level: 90, itemLevel: 665,
      stats: { ...emptyStats(), mind: 416, vitality: 458 }, statCaps: { ...emptyStats(), criticalHit: 306, determination: 306, directHit: 306, spellSpeed: 306, piety: 306 },
      weaponDamage: 132, weaponDelayMs: 3120, materiaSlots: 0, advancedMelding: false, unique: true, sourceFamily: 'relic', acquisitionNote: 'Test', provenance: [],
      relicStatModel: {
        schemaVersion: 'relic-stat-allocation@1', type: 'endwalker-discrete', largeValue: 306, largeStatCount: 2,
        smallValue: 72, smallStatCount: 1, allowedStats: ['criticalHit', 'determination', 'directHit', 'spellSpeed', 'piety']
      }
    };
    const applied = applyRelicStats(item, { criticalHit: 306, determination: 306, spellSpeed: 72 });
    expect(applied).toMatchObject({ criticalHit: 306, determination: 306, spellSpeed: 72 });
    expect(() => applyRelicStats(item, { criticalHit: 306, determination: 306 })).toThrow('requires 2 large and 1 small');
    expect(() => applyRelicStats(item, { criticalHit: 305, determination: 306, spellSpeed: 72 })).toThrow('must use 306 or 72');
  });
});
