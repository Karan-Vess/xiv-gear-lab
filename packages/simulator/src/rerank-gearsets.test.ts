import { describe, expect, it } from 'vitest';
import {
  getCombatEvaluatorProfileForSet,
  levelFormulaConstantsFor
} from '@xiv-gear-lab/calculations';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { GearSet } from '@xiv-gear-lab/domain';
import { createPilotCombatEvaluatorRegistry } from './pilot-evaluators';
import { rerankGearSetsByRotation } from './rerank-gearsets';

const samReference = gearSnapshot.curatedSets.find((set) =>
  set.job === 'SAM' &&
  set.calculationContext?.rulesetId === 'dt-7.51-level-100-standard@1'
)!;

const finalists = Array.from({ length: 12 }, (_, index): GearSet => ({
  ...structuredClone(samReference),
  id: `sam-rerank-${index}`,
  name: `SAM finalist ${index + 1}`,
  metrics: {
    ...structuredClone(samReference.metrics),
    gcd: 2.08 + (index % 7) * 0.01,
    expectedAction100: samReference.metrics.expectedAction100 + (12 - index),
    stats: {
      ...structuredClone(samReference.metrics.stats),
      skillSpeed: samReference.metrics.stats.skillSpeed + index * 35,
      criticalHit: samReference.metrics.stats.criticalHit + (11 - index) * 10
    }
  }
}));

describe('speed-diverse gear-set rotation reranking', () => {
  it('reranks twelve finalists deterministically within the M12 p95 budget', () => {
    const durations: number[] = [];
    let first: ReturnType<typeof rerankGearSetsByRotation> | undefined;
    for (let run = 0; run < 5; run += 1) {
      const result = rerankGearSetsByRotation(
        gearSnapshot,
        finalists,
        'SAM',
        'dummy-300',
        'none',
        finalists[0]!.id
      );
      first ??= result;
      durations.push(result.durationMs);
      expect(result.best.id).toBe(first.best.id);
      expect(result.best.rotationEvaluation?.totalDamage).toBe(first.best.rotationEvaluation?.totalDamage);
    }
    const sorted = [...durations].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;

    expect(first!.evaluatedCandidates).toBe(12);
    expect(first!.best.rotationEvaluation?.mode).toBe('dummy-300');
    expect(first!.best.rotationEvaluation?.rerankedCandidateCount).toBe(12);
    expect(first!.best.rotationEvaluation?.references.some((reference) => reference.kind === 'official')).toBe(true);
    expect(p95).toBeLessThan(5000);
  });

  it('reports aggregate progress and honours cancellation before the next finalist', () => {
    const progress: number[] = [];
    rerankGearSetsByRotation(
      gearSnapshot,
      finalists.slice(0, 3),
      'SAM',
      'opener-30',
      'included',
      finalists[0]!.id,
      {
        isCancelled: () => false,
        reportProgress: (value) => progress.push(value)
      }
    );
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);

    expect(() => rerankGearSetsByRotation(
      gearSnapshot,
      finalists,
      'SAM',
      'dummy-300',
      'none',
      finalists[0]!.id,
      { isCancelled: () => true }
    )).toThrow('cancelled');
  });

  it('reuses one timing timeline while preserving damage-only stat differences', () => {
    const damageOnlyFinalists = finalists.slice(0, 3).map((candidate, index): GearSet => ({
      ...structuredClone(candidate),
      id: `sam-damage-only-${index}`,
      metrics: {
        ...structuredClone(candidate.metrics),
        stats: {
          ...structuredClone(candidate.metrics.stats),
          skillSpeed: samReference.metrics.stats.skillSpeed,
          criticalHit: samReference.metrics.stats.criticalHit + index * 100
        }
      }
    }));
    const reranked = rerankGearSetsByRotation(
      gearSnapshot,
      damageOnlyFinalists,
      'SAM',
      'dummy-300',
      'none',
      damageOnlyFinalists[0]!.id
    );

    expect(reranked.timelineCacheHits).toBe(2);
    expect(reranked.best.rotationEvaluation?.timelineCacheHits).toBe(2);

    const profile = gearSnapshot.rotationProfiles!.find((entry) => entry.job === 'SAM')!;
    const evaluator = createPilotCombatEvaluatorRegistry().requireFor(profile);
    const damageBySet = new Map(
      [reranked.best, ...reranked.alternatives].map((set) => [
        set.id,
        set.rotationEvaluation!.totalDamage
      ])
    );
    for (const set of damageOnlyFinalists) {
      const damageProfile = getCombatEvaluatorProfileForSet(set, gearSnapshot);
      const constants = levelFormulaConstantsFor(damageProfile);
      const weapon = gearSnapshot.items.find((item) => String(item.id) === String(set.items.weapon?.itemId))!;
      const direct = evaluator.simulate({
        mode: 'dummy-300',
        profile,
        combatStats: {
          stats: set.metrics.stats,
          weaponDamage: set.metrics.weaponDamage,
          weaponDelayMs: weapon.weaponDelayMs,
          speedStatValue: set.metrics.stats.skillSpeed,
          speedBaseSub: constants.baseSub,
          speedLevelDiv: constants.levelDiv,
          hastePercent: 0
        },
        openerPreference: 'auto',
        potion: 'none',
        includeTimeline: false
      }, { isCancelled: () => false });
      expect(damageBySet.get(set.id)).toBeCloseTo(direct.totalDamage, 8);
    }
  });
});
