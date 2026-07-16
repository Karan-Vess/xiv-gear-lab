import { describe, expect, it } from 'vitest';
import {
  expectedAction100,
  gcdFromSpellSpeed,
  getCombatEvaluatorProfile
} from './index';
import { emptyStats, type CombatEvaluatorProfile } from '@xiv-gear-lab/domain';

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

  it('refuses missing or unsupported profiles instead of silently applying a generic one', () => {
    expect(() => getCombatEvaluatorProfile('BLU', [whmProfile])).toThrow('No combat evaluator profile');
    expect(() => getCombatEvaluatorProfile('WHM', [{ ...whmProfile, schemaVersion: 'future-formula@9' }]))
      .toThrow('unsupported schema');
  });
});
