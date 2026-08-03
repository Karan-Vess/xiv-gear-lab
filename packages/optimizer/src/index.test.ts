import { describe, expect, it } from 'vitest';
import { gearSnapshot, whmSnapshot } from '@xiv-gear-lab/data';
import {
  addStats,
  emptyStats,
  gearSlotsForJob,
  isAugmentedCraftedItem,
  type CombatJob,
  type EquipmentItem,
  type GearSnapshot,
  type StatKey
} from '@xiv-gear-lab/domain';
import { expectedAction100, getCombatEvaluatorProfileForAccess } from '@xiv-gear-lab/calculations';
import {
  optimizeCombatJob,
  optimizeAstrologian,
  optimizeDarkKnight,
  optimizeGunbreaker,
  optimizePaladin,
  optimizeSage,
  OptimizerCancelledError,
  selectSpeedDiverseFinalists,
  optimizeScholar,
  optimizeWarrior,
  optimizeWhm
} from './index';

describe('M12E finalist integration', () => {
  it('retains the proxy leaders and representatives across reachable speed tiers', () => {
    const base = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'SAM')!);
    const candidates = Array.from({ length: 30 }, (_, index) => ({
      ...structuredClone(base),
      id: `finalist-${index}`,
      metrics: {
        ...structuredClone(base.metrics),
        gcd: 2.08 + (index % 7) * 0.01,
        expectedAction100: 10_000 - index
      }
    }));
    const finalists = selectSpeedDiverseFinalists(candidates, 12);

    expect(finalists).toHaveLength(12);
    expect(finalists.slice(0, 4).map((set) => set.id)).toEqual([
      'finalist-0',
      'finalist-1',
      'finalist-2',
      'finalist-3'
    ]);
    expect(new Set(finalists.map((set) => set.metrics.gcd)).size).toBeGreaterThan(4);
  });

  it('retains a lower-hit speed tier when its GCD throughput can beat the proxy leaders', () => {
    const base = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'SAM')!);
    const candidates = [
      ...Array.from({ length: 5 }, (_, index) => ({
        ...structuredClone(base),
        id: `slow-proxy-${index}`,
        metrics: {
          ...structuredClone(base.metrics),
          gcd: 2.5,
          expectedAction100: 10_000 - index
        }
      })),
      {
        ...structuredClone(base),
        id: 'fast-throughput',
        metrics: {
          ...structuredClone(base.metrics),
          gcd: 2,
          expectedAction100: 8_500
        }
      }
    ];

    const finalists = selectSpeedDiverseFinalists(candidates, 5);

    expect(finalists.slice(0, 4).map((set) => set.id)).toEqual([
      'slow-proxy-0',
      'slow-proxy-1',
      'slow-proxy-2',
      'slow-proxy-3'
    ]);
    expect(finalists.map((set) => set.id)).toContain('fast-throughput');
  });

  it('does not spend the finalist budget before retaining the strongest distinct proxy GCD tiers', () => {
    const base = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'SAM')!);
    const candidate = (id: string, gcd: number, expectedAction100: number) => ({
      ...structuredClone(base),
      id,
      metrics: {
        ...structuredClone(base.metrics),
        gcd,
        expectedAction100
      }
    });
    const candidates = [
      ...Array.from({ length: 5 }, (_, index) =>
        candidate(`proxy-217-${index}`, 2.17, 10_300 - index)
      ),
      candidate('proxy-214', 2.14, 10_175),
      candidate('proxy-211', 2.11, 10_035),
      candidate('proxy-208', 2.08, 9_905),
      candidate('throughput-198', 1.98, 9_420),
      candidate('throughput-187', 1.87, 8_510),
      candidate('throughput-186', 1.86, 8_330),
      candidate('throughput-196', 1.96, 9_295),
      candidate('throughput-202', 2.02, 9_605)
    ];

    const finalists = selectSpeedDiverseFinalists(candidates, 12);

    expect(finalists.map((set) => set.id)).toContain('proxy-214');
    expect(finalists.map((set) => set.id)).toContain('proxy-211');
  });

  it('reports proxy phases and can cancel before search work begins', () => {
    expect(() => optimizeCombatJob(
      gearSnapshot,
      {
        minResource: 0,
        minGcd: 2.08,
        maxGcd: 2.14,
        allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
        requiredItemIds: [],
        excludedItemIds: [],
        frontierLimit: 100
      },
      'SAM',
      { isCancelled: () => true }
    )).toThrow(OptimizerCancelledError);

    const progress: number[] = [];
    const result = optimizeCombatJob(
      gearSnapshot,
      {
        minResource: 0,
        minGcd: 2.08,
        maxGcd: 2.14,
        gcdMode: 'range',
        allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
        requiredItemIds: [],
        excludedItemIds: [],
        frontierLimit: 100
      },
      'SAM',
      {
        isCancelled: () => false,
        reportProgress: (update) => progress.push(update.progress)
      }
    );
    expect(result.best).toBeDefined();
    expect(result.finalists?.length).toBeGreaterThan(1);
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
  }, 20_000);

  it('uses a materially larger frontier and finalist pool in quality-first mode', () => {
    const constraints = {
      minResource: 0,
      minGcd: 2.08,
      maxGcd: 2.14,
      gcdMode: 'range' as const,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'] as const,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 100
    };
    const quick = optimizeCombatJob(
      gearSnapshot,
      { ...constraints, allowedSources: [...constraints.allowedSources], searchMode: 'quick' },
      'SAM'
    );
    const thorough = optimizeCombatJob(
      gearSnapshot,
      { ...constraints, allowedSources: [...constraints.allowedSources], searchMode: 'thorough' },
      'SAM'
    );

    expect(quick.optimality).toMatchObject({ searchMode: 'quick', status: 'not-proven' });
    expect(thorough.optimality).toMatchObject({ searchMode: 'thorough', status: 'not-proven' });
    expect(thorough.searchDiagnostics?.peakFrontierStates).toBeGreaterThan(
      quick.searchDiagnostics?.peakFrontierStates ?? 0
    );
    expect(thorough.evaluatedStates).toBeGreaterThan(quick.evaluatedStates);
    expect(thorough.finalists?.length).toBeGreaterThan(quick.finalists?.length ?? 0);
  }, 20_000);
});

describe('WHM optimiser', () => {
  it('builds a preliminary A Realm Reborn level-50 set from the backfilled cap catalogue', () => {
    const result = optimizeWhm(gearSnapshot, {
      minResource: 202,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['normal-raid', 'tomestone-upgrade'],
      allowedMateriaTiers: [1, 2],
      foodMode: 'allowed',
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 400,
      accessExpansion: 'arr',
      accessLevel: 50
    });
    expect(result.best).toBeDefined();
    expect(gearSnapshot.foods.find((food) => food.id === result.best?.foodId)?.expansionId).toBe('arr');
    expect(result.best?.calculationContext).toMatchObject({
      rulesetId: 'arr-2.58-level-50-standard@1',
      evaluatorProfileId: 'whm-healer-damage-proxy-arr50@1',
      calculationSchema: 'ffxiv-combat-level-50@1'
    });
    expect(result.best?.evaluation?.confidence).toBe('internal-unverified');
    for (const equipped of Object.values(result.best!.items)) {
      const item = gearSnapshot.items.find((candidate) => String(candidate.id) === String(equipped?.itemId));
      expect(item).toMatchObject({ expansionId: 'arr', level: 50 });
      for (const materiaId of equipped?.materiaIds ?? []) {
        expect(gearSnapshot.materia.find((materia) => materia.id === materiaId)?.tier).toBeLessThanOrEqual(2);
      }
    }
  }, 20_000);

  it('builds a preliminary Stormblood level-70 set from a data-channel catalogue', () => {
    const result = optimizeWhm(gearSnapshot, {
      minResource: 292,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade'],
      allowedMateriaTiers: [5, 6],
      foodMode: 'none',
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 400,
      accessExpansion: 'sb',
      accessLevel: 70
    });
    expect(result.best).toBeDefined();
    expect(result.best?.calculationContext).toMatchObject({
      rulesetId: 'sb-4.58-level-70-standard@1',
      evaluatorProfileId: 'whm-healer-damage-proxy-sb70@1',
      calculationSchema: 'ffxiv-combat-level-70@1'
    });
    expect(result.best?.evaluation?.confidence).toBe('internal-unverified');
    for (const equipped of Object.values(result.best!.items)) {
      const item = gearSnapshot.items.find((candidate) => String(candidate.id) === String(equipped?.itemId));
      expect(item).toMatchObject({ expansionId: 'sb', level: 70 });
      for (const materiaId of equipped?.materiaIds ?? []) {
        expect(gearSnapshot.materia.find((materia) => materia.id === materiaId)?.tier).toBeLessThanOrEqual(6);
      }
    }
  }, 20_000);

  it('builds a preliminary Shadowbringers level-80 set from the backfilled cap catalogue', () => {
    const result = optimizeWhm(gearSnapshot, {
      minResource: 340,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade'],
      allowedMateriaTiers: [7, 8],
      foodMode: 'allowed',
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 400,
      accessExpansion: 'shb',
      accessLevel: 80
    });
    expect(result.best).toBeDefined();
    expect(result.best?.calculationContext).toMatchObject({
      rulesetId: 'shb-5.58-level-80-standard@1',
      evaluatorProfileId: 'whm-healer-damage-proxy-shb80@1',
      calculationSchema: 'ffxiv-combat-level-80@1'
    });
    expect(result.best?.evaluation?.confidence).toBe('internal-unverified');
    expect(gearSnapshot.foods.find((food) => food.id === result.best?.foodId)?.expansionId).toBe('shb');
    for (const equipped of Object.values(result.best!.items)) {
      const item = gearSnapshot.items.find((candidate) => String(candidate.id) === String(equipped?.itemId));
      expect(item).toMatchObject({ expansionId: 'shb', level: 80 });
      for (const materiaId of equipped?.materiaIds ?? []) {
        expect(gearSnapshot.materia.find((materia) => materia.id === materiaId)?.tier).toBeLessThanOrEqual(8);
      }
    }
  }, 20_000);

  it('builds a legal Endwalker level-90 set with its own ruleset and consumable boundary', () => {
    const result = optimizeWhm(gearSnapshot, {
      minResource: 390,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade'],
      allowedMateriaTiers: [9, 10],
      foodMode: 'none',
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 400,
      accessExpansion: 'ew',
      accessLevel: 90
    });
    expect(result.best).toBeDefined();
    expect(result.best?.calculationContext).toMatchObject({
      rulesetId: 'ew-6.58-level-90-standard@1',
      evaluatorProfileId: 'whm-healer-damage-proxy-ew90@1',
      calculationSchema: 'ffxiv-combat-level-90@1'
    });
    expect(result.best?.recommendationConfidence.status).toBe('official-preliminary');
    for (const equipped of Object.values(result.best!.items)) {
      const item = gearSnapshot.items.find((candidate) => String(candidate.id) === String(equipped?.itemId));
      expect(item).toMatchObject({ expansionId: 'ew', level: 90 });
      for (const materiaId of equipped?.materiaIds ?? []) {
        expect(gearSnapshot.materia.find((materia) => materia.id === materiaId)?.tier).toBeLessThanOrEqual(10);
      }
    }
  }, 20_000);

  it('chooses and preserves a legal allocation for a required Mandervillous weapon', () => {
    const result = optimizeWhm(gearSnapshot, {
      minResource: 390,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['relic', 'savage', 'tomestone-upgrade'],
      allowedMateriaTiers: [9, 10],
      foodMode: 'none',
      requiredItemIds: [40940],
      excludedItemIds: [],
      frontierLimit: 400,
      accessExpansion: 'ew',
      accessLevel: 90
    });
    const allocation = result.best?.items.weapon?.relicStats;
    expect(result.best?.items.weapon?.itemId).toBe(40940);
    expect(Object.values(allocation ?? {}).filter((value) => value === 306)).toHaveLength(2);
    expect(Object.values(allocation ?? {}).filter((value) => value === 72)).toHaveLength(1);
  }, 45_000);

  it('returns a complete legal set from the verified reference pool', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.44,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect(Object.keys(result.best?.items ?? {})).toHaveLength(11);
    expect(result.best!.metrics.gcd).toBeGreaterThanOrEqual(2.29);
    expect(result.best!.metrics.gcd).toBeLessThanOrEqual(2.44);
    expect(result.best!.metrics.expectedAction100).toBeGreaterThanOrEqual(
      Math.max(...whmSnapshot.curatedSets.filter((set) => set.job === 'WHM').map((set) => set.metrics.expectedAction100))
    );
    expect(result.best!.calculationContext).toMatchObject({
      snapshotId: whmSnapshot.manifest.id,
      rulesetId: 'dt-7.51-level-100-standard@1',
      evaluatorProfileId: 'whm-healer-damage-proxy@1',
      calculationSchema: 'ffxiv-combat-level-100@1'
    });
  }, 20_000);

  it('can avoid savage gear and honour a required item', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['tomestone-upgrade', 'tomestone'],
      requiredItemIds: [49509],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect(Object.values(result.best!.items).some((entry) => entry?.itemId === 49509)).toBe(true);
    for (const equipped of Object.values(result.best!.items)) {
      const item = whmSnapshot.items.find((candidate) => candidate.id === equipped?.itemId);
      expect(item?.sourceFamily).not.toBe('savage');
    }
  }, 20_000);

  it('returns a Tomestone-only result for the default balanced speed profile', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.4,
      maxGcd: 2.42,
      allowedSources: ['tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    for (const equipped of Object.values(result.best!.items)) {
      const item = whmSnapshot.items.find((candidate) => candidate.id === equipped?.itemId);
      expect(item?.sourceFamily).not.toBe('savage');
    }
  }, 20_000);

  it('returns a labelled closest-attainable Tomestone result for an unattainable fast target', () => {
    const targetGcd = 2.29;
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: targetGcd,
      maxGcd: targetGcd,
      allowedSources: ['tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect(result.speedFallback).toEqual({
      requestedMinGcd: targetGcd,
      requestedMaxGcd: targetGcd,
      achievedGcd: result.best!.metrics.gcd
    });
    expect(result.best!.name).toBe('Closest attainable result');
    expect(result.explanation[0]).toContain('closest attainable');
    for (const equipped of Object.values(result.best!.items)) {
      const item = whmSnapshot.items.find((candidate) => candidate.id === equipped?.itemId);
      expect(item?.sourceFamily).not.toBe('savage');
    }
  }, 20_000);

  it('returns an exact Tomestone result when the requested slow target is attainable', () => {
    const targetGcd = 2.43;
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: targetGcd,
      maxGcd: targetGcd,
      allowedSources: ['tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best?.metrics.gcd).toBe(targetGcd);
    expect(result.speedFallback).toBeUndefined();
    expect(result.best?.name).toBe('Best reference-pool result found (quick)');
  }, 20_000);

  it('explains when exclusions remove every weapon', () => {
    const weaponIds = whmSnapshot.items.filter((item) => item.slot === 'weapon').map((item) => item.id);
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: weaponIds,
      frontierLimit: 100
    });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('weapon');
  });

  it('explains why a Savage-only set cannot fill both unique ring slots', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 100
    });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('a second ring');
  });

  it('reports every missing accessory for a trial-plus-alliance set with one custom ring', () => {
    const sourceRing = gearSnapshot.items.find((item) =>
      item.slot === 'ring' && item.jobs.includes('NIN') && item.sourceFamily === 'tomestone'
    )!;
    const customRing: EquipmentItem = {
      ...sourceRing,
      id: 'custom-ninja-tomestone-ring',
      origin: 'custom',
      name: `${sourceRing.name} copy`,
      sourceFamily: 'custom',
      acquisitionNote: 'Screenshot regression fixture.',
      provenance: [{
        kind: 'custom',
        provider: 'Optimizer test',
        schemaVersion: 'custom-item@1',
        retrievedAt: '2026-07-18T00:00:00.000Z',
        status: 'custom'
      }]
    };
    const result = optimizeCombatJob({
      ...gearSnapshot,
      items: [...gearSnapshot.items, customRing]
    }, {
      minResource: 0,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['trial', 'alliance-raid'],
      requiredItemIds: [customRing.id],
      excludedItemIds: [],
      frontierLimit: 100
    }, 'NIN');
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('earrings');
    expect(result.explanation[0]).toContain('a necklace');
    expect(result.explanation[0]).toContain('a bracelet');
    expect(result.explanation[0]).toContain('a second ring');
  });

  it('uses a required custom ring to complete a source with only one unique official ring', () => {
    const sourceRing = whmSnapshot.items.find((item) =>
      item.slot === 'ring' && item.jobs.includes('WHM') && item.sourceFamily === 'tomestone'
    )!;
    const customRing: EquipmentItem = {
      ...sourceRing,
      id: 'custom-test-ring',
      origin: 'custom',
      name: 'Custom test ring',
      sourceFamily: 'custom',
      acquisitionNote: 'Optimizer regression fixture.',
      customData: {
        schemaVersion: 'custom-equipment@1',
        mode: 'final-stats',
        role: 'healer',
        expansionId: 'dt',
        sourceDescription: 'Cloned from an official tomestone ring.',
        fixedCost: '',
        notes: '',
        iconProvenance: 'reused-official',
        clonedFromItemId: sourceRing.id
      },
      provenance: [{
        kind: 'custom',
        provider: 'Optimizer test',
        schemaVersion: 'custom-item@1',
        retrievedAt: '2026-07-18T00:00:00.000Z',
        status: 'custom'
      }]
    };
    const snapshot: GearSnapshot = {
      ...whmSnapshot,
      items: [...whmSnapshot.items, customRing]
    };
    const result = optimizeWhm(snapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['tomestone', 'tomestone-upgrade'],
      includeUpgradedTomestoneGear: false,
      requiredItemIds: [customRing.id],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect([result.best?.items.ringLeft?.itemId, result.best?.items.ringRight?.itemId]).toContain(customRing.id);
  }, 20_000);

  it('excludes augmented tomestone pieces when the upgraded-gear toggle is off', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone', 'tomestone-upgrade'],
      includeUpgradedTomestoneGear: false,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    const equipped = Object.values(result.best!.items).map((entry) =>
      whmSnapshot.items.find((item) => String(item.id) === String(entry?.itemId))
    );
    expect(equipped.some((item) => item?.sourceFamily === 'tomestone-upgrade')).toBe(false);
  }, 20_000);

  it('excludes augmented crafted pieces when the augmented-crafted toggle is off', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['crafted'],
      includeAugmentedCraftedGear: false,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    const equipped = Object.values(result.best!.items).map((entry) =>
      whmSnapshot.items.find((item) => String(item.id) === String(entry?.itemId))!
    );
    expect(equipped.some(isAugmentedCraftedItem)).toBe(false);
    expect(new Set(equipped.map((item) => item.itemLevel))).toEqual(new Set([770]));
  }, 20_000);

  it('explains a locked augmented crafted item that conflicts with its toggle', () => {
    const augmentedBody = whmSnapshot.items.find((item) =>
      item.slot === 'body' && item.jobs.includes('WHM') && isAugmentedCraftedItem(item)
    )!;
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources: ['crafted'],
      includeAugmentedCraftedGear: false,
      requiredItemIds: [],
      excludedItemIds: [],
      lockedItemIdsBySlot: { body: augmentedBody.id },
      frontierLimit: 100
    });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('augmented crafted gear is disabled');
  });

  it('builds an exact item-level set when every slot is covered at that level', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      itemLevelMode: 'exact',
      minItemLevel: 790,
      maxItemLevel: 790,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    const itemLevels = Object.values(result.best!.items).map((entry) =>
      whmSnapshot.items.find((item) => String(item.id) === String(entry?.itemId))!.itemLevel
    );
    expect(new Set(itemLevels)).toEqual(new Set([790]));
  }, 20_000);

  it('keeps every generated item inside an item-level range', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone', 'ultimate'],
      itemLevelMode: 'range',
      minItemLevel: 790,
      maxItemLevel: 795,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    const itemLevels = Object.values(result.best!.items).map((entry) =>
      whmSnapshot.items.find((item) => String(item.id) === String(entry?.itemId))!.itemLevel
    );
    expect(itemLevels.every((itemLevel) => itemLevel >= 790 && itemLevel <= 795)).toBe(true);
  }, 20_000);

  it('rejects invalid item-level ranges before searching', () => {
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage'],
      itemLevelMode: 'range',
      minItemLevel: 790,
      maxItemLevel: 780,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 100
    });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('item-level filter is invalid');
  });

  it('explains a locked augmented item that conflicts with the upgraded-gear toggle', () => {
    const augmentedBody = whmSnapshot.items.find((item) =>
      item.slot === 'body' && item.jobs.includes('WHM') && item.sourceFamily === 'tomestone-upgrade'
    )!;
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone', 'tomestone-upgrade'],
      includeUpgradedTomestoneGear: false,
      requiredItemIds: [],
      excludedItemIds: [],
      lockedItemIdsBySlot: { body: augmentedBody.id },
      frontierLimit: 100
    });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('upgraded tomestone gear is disabled');
  });

  it('explains a required item outside the selected item level', () => {
    const trialWeapon = whmSnapshot.items.find((item) =>
      item.slot === 'weapon' && item.jobs.includes('WHM') && item.sourceFamily === 'trial'
    )!;
    const result = optimizeWhm(whmSnapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['trial', 'tomestone'],
      itemLevelMode: 'exact',
      minItemLevel: 780,
      requiredItemIds: [trialWeapon.id],
      excludedItemIds: [],
      frontierLimit: 100
    });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain(`item level ${trialWeapon.itemLevel}`);
    expect(result.explanation[0]).toContain('outside');
  });

  it('keeps a required custom item while optimising every other slot', () => {
    const sourceHead = whmSnapshot.items.find((item) => item.slot === 'head' && item.jobs.includes('WHM'))!;
    const customHead: EquipmentItem = {
      ...sourceHead,
      id: 'custom-test-head',
      origin: 'custom',
      name: 'Custom test circlet',
      sourceFamily: 'custom',
      acquisitionNote: 'Optimizer regression fixture.',
      provenance: [{
        kind: 'custom',
        provider: 'Optimizer test',
        schemaVersion: 'custom-item@1',
        retrievedAt: '2026-07-15T00:00:00.000Z',
        status: 'custom'
      }]
    };
    const snapshot: GearSnapshot = {
      ...whmSnapshot,
      items: [...whmSnapshot.items, customHead]
    };
    const result = optimizeWhm(snapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [customHead.id],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect(result.best!.items.head?.itemId).toBe(customHead.id);
    expect(Object.keys(result.best!.items)).toHaveLength(11);
  }, 20_000);
});

describe('Sage optimiser', () => {
  it('returns a complete Sage set with a Sage weapon at a current reference target', () => {
    const result = optimizeSage(gearSnapshot, {
      minResource: 440,
      minGcd: 2.44,
      maxGcd: 2.44,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect(result.best!.job).toBe('SGE');
    expect(Object.keys(result.best!.items)).toHaveLength(11);
    const weaponId = result.best!.items.weapon?.itemId;
    const weapon = gearSnapshot.items.find((item) => String(item.id) === String(weaponId));
    expect(weapon?.slot).toBe('weapon');
    expect(weapon?.jobs).toContain('SGE');
    expect(weapon?.jobs).not.toContain('WHM');
    expect(result.best!.metrics.expectedAction100).toBeCloseTo(
      Math.max(...gearSnapshot.curatedSets.filter((set) => set.job === 'SGE' && set.metrics.gcd === 2.44).map((set) => set.metrics.expectedAction100)),
      2
    );
  }, 20_000);
});

describe('Scholar and Astrologian optimisers', () => {
  it.each([
    ['SCH', 2.4, optimizeScholar, 'sch-healer-damage-proxy@1'],
    ['AST', 2.43, optimizeAstrologian, 'ast-healer-damage-proxy@1']
  ] as const)('returns a complete independently profiled %s set', (job, targetGcd, optimize, profileId) => {
    const result = optimize(gearSnapshot, {
      minResource: 440,
      minGcd: targetGcd,
      maxGcd: targetGcd,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    expect(result.best!.job).toBe(job);
    expect(result.best!.evaluation?.profileId).toBe(profileId);
    expect(Object.keys(result.best!.items)).toHaveLength(11);
    const weaponId = result.best!.items.weapon?.itemId;
    const weapon = gearSnapshot.items.find((item) => String(item.id) === String(weaponId));
    expect(weapon?.jobs).toEqual([job]);
    expect(result.best!.metrics.expectedAction100).toBeGreaterThanOrEqual(
      Math.max(...gearSnapshot.curatedSets.filter((set) => set.job === job && set.metrics.gcd === targetGcd).map((set) => set.metrics.expectedAction100)) - 0.01
    );
  }, 20_000);
});

describe('tank optimisers', () => {
  it.each([
    ['PLD', 2.5, optimizePaladin, 12, 'pld-tank-damage-proxy@1'],
    ['WAR', 2.45, optimizeWarrior, 11, 'war-tank-damage-proxy@1'],
    ['DRK', 2.46, optimizeDarkKnight, 11, 'drk-tank-damage-proxy@1'],
    ['GNB', 2.4, optimizeGunbreaker, 11, 'gnb-tank-damage-proxy@1']
  ] as const)('returns a complete independently profiled %s set', (job, targetGcd, optimize, slotCount, profileId) => {
    const result = optimize(gearSnapshot, {
      minResource: 420,
      minGcd: targetGcd,
      maxGcd: targetGcd,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      allowedMateriaTiers: [11, 12],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800,
      accessExpansion: 'dt',
      accessLevel: 100
    });
    expect(result.best).toBeDefined();
    expect(result.best!.job).toBe(job);
    expect(result.best!.evaluation?.profileId).toBe(profileId);
    expect(Object.keys(result.best!.items)).toHaveLength(slotCount);
    expect(result.best!.metrics.gcd).toBe(targetGcd);
    expect(result.best!.metrics.stats.strength).toBeGreaterThan(6_000);
    expect(result.best!.metrics.stats.tenacity).toBeGreaterThanOrEqual(420);
    if (job === 'PLD') expect(result.best!.items.offHand).toBeDefined();
    else expect(result.best!.items.offHand).toBeUndefined();
  }, 45_000);
});

describe('DPS optimisers', () => {
  it.each([
    ['MNK', 1.94, 'strength', 'mnk-dps-damage-proxy@1'],
    ['DRG', 2.5, 'strength', 'drg-dps-damage-proxy@1'],
    ['NIN', 2.12, 'dexterity', 'nin-dps-damage-proxy@1'],
    ['SAM', 2.14, 'strength', 'sam-dps-damage-proxy@1'],
    ['RPR', 2.49, 'strength', 'rpr-dps-damage-proxy@1'],
    ['VPR', 2.1, 'dexterity', 'vpr-dps-damage-proxy@1'],
    ['BRD', 2.49, 'dexterity', 'brd-dps-damage-proxy@1'],
    ['MCH', 2.5, 'dexterity', 'mch-dps-damage-proxy@1'],
    ['DNC', 2.5, 'dexterity', 'dnc-dps-damage-proxy@1'],
    ['BLM', 2.41, 'intelligence', 'blm-dps-damage-proxy@1'],
    ['SMN', 2.48, 'intelligence', 'smn-dps-damage-proxy@1'],
    ['RDM', 2.49, 'intelligence', 'rdm-dps-damage-proxy@1'],
    ['PCT', 2.5, 'intelligence', 'pct-dps-damage-proxy@1']
  ] as const)('returns a complete independently profiled %s set', (job, targetGcd, mainStat, profileId) => {
    const result = optimizeCombatJob(gearSnapshot, {
      minResource: 0,
      minGcd: targetGcd,
      maxGcd: targetGcd,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 500
    }, job as CombatJob);
    expect(result.best).toBeDefined();
    expect(result.best!.job).toBe(job);
    expect(result.best!.evaluation?.profileId).toBe(profileId);
    expect(Object.keys(result.best!.items)).toHaveLength(11);
    expect(result.best!.metrics.gcd).toBe(targetGcd);
    expect(result.best!.metrics.stats[mainStat as StatKey]).toBeGreaterThan(6_000);
    expect(result.explanation.join(' ')).not.toContain('undefined');
  }, 20_000);
});

describe('M10 optimiser restrictions', () => {
  const base = {
    minResource: 440,
    minGcd: 1.5,
    maxGcd: 2.5,
    allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'] as const,
    requiredItemIds: [] as Array<number | string>,
    excludedItemIds: [] as Array<number | string>,
    frontierLimit: 300,
    gcdMode: 'range' as const,
    gcdTargetName: 'Regression range'
  };

  it('reports a minimal required/excluded conflict', () => {
    const item = gearSnapshot.items.find((entry) => entry.jobs.includes('WHM'))!;
    const result = optimizeWhm(gearSnapshot, { ...base, allowedSources: [...base.allowedSources], requiredItemIds: [item.id], excludedItemIds: [item.id] });
    expect(result.best).toBeUndefined();
    expect(result.explanation[0]).toContain('both required and excluded');
  }, 20_000);

  it('honours an exact slot lock and locked meld prefix', () => {
    const weapon = gearSnapshot.items.find((entry) => entry.jobs.includes('WHM') && entry.slot === 'weapon')!;
    const materia = gearSnapshot.materia.find((entry) => entry.stat === 'criticalHit')!;
    const result = optimizeWhm(gearSnapshot, {
      ...base,
      allowedSources: [...base.allowedSources],
      lockedItemIdsBySlot: { weapon: weapon.id },
      lockedMateriaBySlot: { weapon: [materia.id] }
    });
    expect(result.best?.items.weapon?.itemId).toBe(weapon.id);
    expect(result.best?.items.weapon?.materiaIds[0]).toBe(materia.id);
  }, 20_000);

  it('supports no food and one locked food', () => {
    const noFood = optimizeWhm(gearSnapshot, { ...base, allowedSources: [...base.allowedSources], foodMode: 'none' });
    expect(noFood.best?.foodId).toBeUndefined();
    const food = gearSnapshot.foods[0]!;
    const locked = optimizeWhm(gearSnapshot, { ...base, allowedSources: [...base.allowedSources], foodMode: 'locked', lockedFoodId: food.id });
    expect(locked.best?.foodId).toBe(food.id);
  }, 20_000);

  it('treats an impossible GCD range as a failure rather than a closest-result success', () => {
    const result = optimizeWhm(gearSnapshot, { ...base, allowedSources: [...base.allowedSources], minGcd: 1.5, maxGcd: 1.51 });
    expect(result.best).toBeUndefined();
    expect(result.speedFallback).toBeUndefined();
    expect(result.explanation[0]).toContain('GCD range');
  }, 20_000);

  it('honours high-grade advanced-meld slot legality', () => {
    const source = gearSnapshot.items.find((entry) => entry.jobs.includes('WHM') && entry.slot === 'head')!;
    const custom: EquipmentItem = {
      ...source,
      id: 'custom-overmeld-head',
      origin: 'custom',
      sourceFamily: 'custom',
      advancedMelding: true,
      materiaSlots: 2,
      stats: { ...source.stats, criticalHit: 0 },
      statCaps: { ...source.statCaps, criticalHit: 190 },
      unique: false
    };
    const snapshot: GearSnapshot = { ...gearSnapshot, items: [...gearSnapshot.items, custom] };
    const result = optimizeWhm(snapshot, {
      ...base,
      allowedSources: [...base.allowedSources],
      requiredItemIds: [custom.id],
      allowedMateriaStats: ['criticalHit'],
      allowedMateriaTiers: [12],
      allowOvermelds: true,
      allowCustomItems: true
    });
    expect(result.best?.items.head?.materiaIds).toHaveLength(3);

    const fullPentameld = optimizeWhm(snapshot, {
      ...base,
      allowedSources: [...base.allowedSources],
      requiredItemIds: [custom.id],
      allowedMateriaStats: ['criticalHit'],
      allowedMateriaTiers: [11, 12],
      allowOvermelds: true,
      allowCustomItems: true
    });
    expect(fullPentameld.best?.items.head?.materiaIds).toHaveLength(5);
    expect(fullPentameld.best?.metrics.materiaWaste).toBeGreaterThan(0);
    expect(new Set(fullPentameld.best?.items.head?.materiaIds.map((id) => snapshot.materia.find((entry) => entry.id === id)?.tier))).toEqual(new Set([11, 12]));
  }, 20_000);

  it('allows Grade I materia in every advanced-meld slot', () => {
    const source = gearSnapshot.items.find((entry) => entry.jobs.includes('WHM') && entry.slot === 'head')!;
    const custom: EquipmentItem = {
      ...source,
      id: 'custom-grade-one-overmeld-head',
      origin: 'custom',
      sourceFamily: 'custom',
      advancedMelding: true,
      materiaSlots: 2,
      stats: { ...source.stats, criticalHit: 0 },
      statCaps: { ...source.statCaps, criticalHit: 190 },
      unique: false
    };
    const snapshot: GearSnapshot = { ...gearSnapshot, items: [...gearSnapshot.items, custom] };
    const result = optimizeWhm(snapshot, {
      ...base,
      allowedSources: [...base.allowedSources],
      requiredItemIds: [custom.id],
      allowedMateriaStats: ['criticalHit'],
      allowedMateriaTiers: [1],
      allowOvermelds: true,
      allowCustomItems: true
    });

    expect(result.best?.items.head?.materiaIds).toHaveLength(5);
    expect(result.best?.items.head?.materiaIds.every((id) =>
      snapshot.materia.find((entry) => entry.id === id)?.tier === 1
    )).toBe(true);
  }, 20_000);

  it('can produce a five-slot overmeld on official crafted equipment', () => {
    const result = optimizeWhm(gearSnapshot, {
      ...base,
      allowedSources: ['crafted'],
      includeAugmentedCraftedGear: false,
      allowedMateriaTiers: [11, 12],
      allowOvermelds: true,
      frontierLimit: 1_800
    });
    expect(result.best).toBeDefined();
    const craftedMeldCounts = Object.values(result.best!.items).map((entry) => entry?.materiaIds.length ?? 0);
    expect(craftedMeldCounts).toContain(5);
  }, 20_000);

  it('requires an explicit override and marks an out-of-access custom result hypothetical', () => {
    const source = gearSnapshot.items.find((entry) => entry.jobs.includes('WHM') && entry.slot === 'head')!;
    const custom: EquipmentItem = {
      ...source,
      id: 'custom-future-head',
      origin: 'custom',
      sourceFamily: 'custom',
      level: 110,
      customData: {
        schemaVersion: 'custom-equipment@1', mode: 'final-stats', role: 'healer', expansionId: 'future',
        sourceDescription: 'Test', fixedCost: '', notes: '', iconProvenance: 'generic'
      }
    };
    const snapshot: GearSnapshot = { ...gearSnapshot, items: [...gearSnapshot.items, custom] };
    const denied = optimizeWhm(snapshot, { ...base, allowedSources: [...base.allowedSources], requiredItemIds: [custom.id], allowCustomItems: true, accessExpansion: 'dt', accessLevel: 100 });
    expect(denied.best).toBeUndefined();
    expect(denied.explanation[0]).toContain('experimental access override');
    const allowed = optimizeWhm(snapshot, { ...base, allowedSources: [...base.allowedSources], requiredItemIds: [custom.id], allowCustomItems: true, accessExpansion: 'dt', accessLevel: 100, allowExperimentalAccess: true });
    expect(allowed.best?.hypotheticalAccess?.itemIds).toContain(custom.id);
  }, 20_000);
});

describe('optimizer search hardening', () => {
  const makeCompactWhmSnapshot = () => {
    const slots = gearSlotsForJob('WHM');
    const withoutRoutes = (item: EquipmentItem): EquipmentItem => ({
      ...item,
      acquisitionRoutes: []
    });
    const nonRingItems = slots
      .filter((slot) => slot !== 'ringLeft' && slot !== 'ringRight')
      .map((slot) => withoutRoutes(whmSnapshot.items.find((item) =>
        item.slot === slot &&
        item.jobs.includes('WHM') &&
        item.expansionId === 'dt' &&
        item.level === 100
      )!));
    const rings = whmSnapshot.items.filter((item) =>
      item.slot === 'ring' &&
      item.jobs.includes('WHM') &&
      item.expansionId === 'dt' &&
      item.level === 100
    ).slice(0, 2).map(withoutRoutes);
    const baseHead = nonRingItems.find((item) => item.slot === 'head')!;
    const lowerItemLevelHead: EquipmentItem = {
      ...baseHead,
      id: 'search-regression-lower-item-level-head',
      name: 'Lower item-level critical-hit test head',
      itemLevel: baseHead.itemLevel - 10,
      stats: {
        ...baseHead.stats,
        criticalHit: baseHead.stats.criticalHit + 60
      },
      statCaps: {
        ...baseHead.statCaps,
        criticalHit: baseHead.statCaps.criticalHit + 60
      }
    };
    return {
      snapshot: {
        ...whmSnapshot,
        manifest: {
          ...whmSnapshot.manifest,
          id: 'optimizer-search-hardening-fixture'
        },
        items: [...nonRingItems, ...rings, lowerItemLevelHead],
        materia: [],
        foods: [],
        curatedSets: [],
        contentGraph: undefined
      } satisfies GearSnapshot,
      lowerItemLevelHead,
      baseHead,
      rings
    };
  };

  const compactConstraints = (snapshot: GearSnapshot) => ({
    minResource: 0,
    minGcd: 1.5,
    maxGcd: 2.5,
    allowedSources: [...new Set(snapshot.items.map((item) => item.sourceFamily))],
    includeUpgradedTomestoneGear: true,
    includeAugmentedCraftedGear: true,
    requiredItemIds: [],
    excludedItemIds: [],
    frontierLimit: 10_000,
    foodMode: 'none' as const,
    allowedMateriaStats: [] as StatKey[],
    allowedMateriaTiers: [],
    accessExpansion: 'dt' as const,
    accessLevel: 100
  });

  it('matches exhaustive enumeration on a compact pool and keeps a stronger lower-item-level option', () => {
    const { snapshot, lowerItemLevelHead } = makeCompactWhmSnapshot();
    const result = optimizeWhm(snapshot, compactConstraints(snapshot));
    const profile = getCombatEvaluatorProfileForAccess('WHM', snapshot, 'dt', 100);
    const slots = gearSlotsForJob('WHM');
    let exhaustiveBest = Number.NEGATIVE_INFINITY;

    const visit = (
      index: number,
      stats = emptyStats(),
      weaponDamage = 0,
      uniqueRingIds = new Set<string>()
    ) => {
      if (index === slots.length) {
        const finalStats = addStats(profile.baseStats, stats);
        finalStats[profile.mainStat] = Math.floor(finalStats[profile.mainStat] * 1.05);
        finalStats.vitality = Math.floor(finalStats.vitality * 1.05);
        exhaustiveBest = Math.max(
          exhaustiveBest,
          expectedAction100(finalStats, weaponDamage, profile)
        );
        return;
      }
      const slot = slots[index]!;
      const candidates = snapshot.items.filter((item) =>
        item.jobs.includes('WHM') &&
        (
          item.slot === slot ||
          (item.slot === 'ring' && (slot === 'ringLeft' || slot === 'ringRight'))
        )
      );
      for (const item of candidates) {
        const itemId = String(item.id);
        if (item.slot === 'ring' && item.unique && uniqueRingIds.has(itemId)) continue;
        visit(
          index + 1,
          addStats(stats, item.stats),
          Math.max(weaponDamage, item.weaponDamage),
          item.slot === 'ring' && item.unique
            ? new Set([...uniqueRingIds, itemId])
            : uniqueRingIds
        );
      }
    };
    visit(0);

    expect(result.truncated).toBe(false);
    expect(result.optimality).toMatchObject({ status: 'proven', objective: 'generic-hit' });
    expect(result.best?.name).toBe('Optimal reference-pool result');
    expect(result.best?.items.head?.itemId).toBe(lowerItemLevelHead.id);
    expect(result.best?.metrics.expectedAction100).toBeCloseTo(exhaustiveBest, 8);
  });

  it('removes only a provably dominated official item before generating meld variants', () => {
    const { snapshot } = makeCompactWhmSnapshot();
    const baseBody = snapshot.items.find((item) => item.slot === 'body')!;
    const dominatedBody: EquipmentItem = {
      ...baseBody,
      id: 'search-regression-dominated-body',
      name: 'Provably dominated test body',
      itemLevel: baseBody.itemLevel - 1
    };
    const withDominated: GearSnapshot = {
      ...snapshot,
      manifest: {
        ...snapshot.manifest,
        id: 'optimizer-search-hardening-dominated-fixture'
      },
      items: [...snapshot.items, dominatedBody]
    };
    const baseline = optimizeWhm(snapshot, compactConstraints(snapshot));
    const result = optimizeWhm(withDominated, compactConstraints(withDominated));

    expect(result.best?.metrics.expectedAction100).toBeCloseTo(baseline.best!.metrics.expectedAction100, 8);
    expect(result.searchDiagnostics?.legalItemCandidates).toBe(
      (baseline.searchDiagnostics?.legalItemCandidates ?? 0) + 1
    );
    expect(result.searchDiagnostics?.retainedItemCandidates).toBe(
      baseline.searchDiagnostics?.retainedItemCandidates
    );
    expect(result.searchDiagnostics?.dominatedItemCandidates).toBe(
      (baseline.searchDiagnostics?.dominatedItemCandidates ?? 0) + 1
    );
  });

  it('keeps equal-stat weapons with different delays as distinct timing candidates', () => {
    const { snapshot } = makeCompactWhmSnapshot();
    const weapon = snapshot.items.find((item) => item.slot === 'weapon')!;
    const alternateDelayWeapon: EquipmentItem = {
      ...weapon,
      id: 'search-regression-alternate-delay-weapon',
      name: 'Alternate-delay test weapon',
      weaponDelayMs: weapon.weaponDelayMs + 160
    };
    const withAlternateDelay: GearSnapshot = {
      ...snapshot,
      manifest: {
        ...snapshot.manifest,
        id: 'optimizer-search-hardening-delay-fixture'
      },
      items: [...snapshot.items, alternateDelayWeapon]
    };

    const result = optimizeWhm(withAlternateDelay, compactConstraints(withAlternateDelay));
    const finalistWeaponIds = new Set(
      result.finalists?.map((set) => String(set.items.weapon?.itemId))
    );

    expect(result.truncated).toBe(false);
    expect(finalistWeaponIds).toContain(String(weapon.id));
    expect(finalistWeaponIds).toContain(String(alternateDelayWeapon.id));
  });

  it('keeps equal-stat unique ring identities distinct when one ring slot is locked', () => {
    const { snapshot, rings } = makeCompactWhmSnapshot();
    const lockedRing = rings[0]!;
    const alternateRing: EquipmentItem = {
      ...lockedRing,
      id: 'search-regression-equal-stat-ring',
      name: 'Equal-stat unique test ring',
      unique: true
    };
    const ringFixture: GearSnapshot = {
      ...snapshot,
      manifest: {
        ...snapshot.manifest,
        id: 'optimizer-search-hardening-ring-fixture'
      },
      items: [
        ...snapshot.items.filter((item) => item.slot !== 'ring'),
        lockedRing,
        alternateRing
      ]
    };
    const result = optimizeWhm(ringFixture, {
      ...compactConstraints(ringFixture),
      lockedItemIdsBySlot: { ringRight: lockedRing.id }
    });

    expect(result.best?.items.ringRight?.itemId).toBe(lockedRing.id);
    expect(result.best?.items.ringLeft?.itemId).toBe(alternateRing.id);
  });

  it('keeps the broad all-materia Paladin search inside its protected state budget', () => {
    const allowedSources = [...new Set(
      gearSnapshot.items
        .filter((item) => item.expansionId === 'dt')
        .map((item) => item.sourceFamily)
    )];
    const result = optimizePaladin(gearSnapshot, {
      minResource: 0,
      minGcd: 1.5,
      maxGcd: 2.5,
      allowedSources,
      includeUpgradedTomestoneGear: true,
      includeAugmentedCraftedGear: true,
      itemLevelMode: 'any',
      minItemLevel: 1,
      maxItemLevel: 9999,
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800,
      lockedItemIdsBySlot: {},
      lockedMateriaBySlot: {},
      gcdMode: 'range',
      foodMode: 'none',
      allowedMateriaStats: ['directHit', 'criticalHit', 'determination', 'tenacity', 'skillSpeed'],
      allowedMateriaTiers: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      allowOvermelds: true,
      allowCustomItems: true,
      accessExpansion: 'dt',
      accessLevel: 100,
      allowExperimentalAccess: false
    });

    expect(result.best?.metrics.expectedAction100).toBeGreaterThanOrEqual(7901.77511628755);
    expect(result.searchDiagnostics?.dominatedItemCandidates).toBeGreaterThan(0);
    expect(result.searchDiagnostics?.peakFrontierStates).toBeLessThanOrEqual(1_800);
    expect(result.evaluatedStates).toBeLessThan(4_500_000);
  }, 20_000);
});

describe('future job onboarding contract', () => {
  const makeFutureSnapshot = (): GearSnapshot => {
    const snapshot = structuredClone(whmSnapshot);
    const whmJob = snapshot.registry.jobs.find((entry) => entry.id === 'WHM')!;
    const whmProfile = snapshot.evaluatorProfiles.find((entry) => entry.job === 'WHM')!;
    snapshot.manifest = {
      ...snapshot.manifest,
      id: 'synthetic-next-expansion',
      gamePatch: '8.0',
      gearTierPatch: '8.0'
    };
    snapshot.registry.expansions.push({ id: 'future', name: 'Synthetic Future', levelCap: 110, order: 6 });
    snapshot.registry.jobs.push(
      {
        ...whmJob,
        id: 'ALP',
        name: 'Alpha',
        introducedIn: 'future',
        modes: [
          {
            id: 'standard',
            name: 'Standard',
            introducedIn: 'future',
            capabilities: {
              'generic-hit': { status: 'available', profileId: 'alpha-generic@1' },
              'opener-30': { status: 'pending', reason: 'Synthetic fixture.' },
              'dummy-300': { status: 'pending', reason: 'Synthetic fixture.' }
            }
          },
          {
            id: 'evolved',
            name: 'Evolved',
            introducedIn: 'future',
            capabilities: {
              'generic-hit': { status: 'pending', reason: 'Formula evidence pending.' },
              'opener-30': { status: 'pending', reason: 'Formula evidence pending.' },
              'dummy-300': { status: 'pending', reason: 'Formula evidence pending.' }
            }
          }
        ]
      },
      {
        ...whmJob,
        id: 'BET',
        name: 'Beta',
        introducedIn: 'future',
        modes: [{
          id: 'standard',
          name: 'Standard',
          introducedIn: 'future',
          capabilities: {
            'generic-hit': { status: 'pending', reason: 'Formula evidence pending.' },
            'opener-30': { status: 'pending', reason: 'Formula evidence pending.' },
            'dummy-300': { status: 'pending', reason: 'Formula evidence pending.' }
          }
        }]
      }
    );
    snapshot.rulesets.push({
      id: 'future-standard@1',
      schemaVersion: 'combat-ruleset@1',
      calculationSchema: 'ffxiv-combat-level-100@1',
      expansionId: 'future',
      gamePatch: '8.0',
      minimumLevel: 100,
      maximumLevel: 110,
      jobMode: 'standard'
    });
    snapshot.evaluatorProfiles.push({
      ...whmProfile,
      id: 'alpha-generic@1',
      rulesetId: 'future-standard@1',
      job: 'ALP'
    });
    snapshot.items = snapshot.items.map((item) => ({
      ...item,
      jobs: ['ALP'],
      expansionId: 'future',
      level: 110,
      minimumEffectiveLevel: 110
    }));
    snapshot.curatedSets = [];
    return snapshot;
  };

  it('optimises a new job supplied entirely through compatible registry and profile data', () => {
    const snapshot = makeFutureSnapshot();
    const result = optimizeCombatJob(snapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 300
    }, 'ALP');
    expect(result.best?.job).toBe('ALP');
    expect(result.best?.evaluation?.profileId).toBe('alpha-generic@1');
    expect(result.best?.calculationContext).toMatchObject({
      jobMode: 'standard',
      evaluationMode: 'generic-hit'
    });
    expect(Object.keys(result.best?.items ?? {})).toHaveLength(11);
  }, 20_000);

  it('refuses a catalogued new job whose evaluator is still pending', () => {
    const snapshot = makeFutureSnapshot();
    expect(() => optimizeCombatJob(snapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 300
    }, 'BET')).toThrow('Generic-hit evaluation is pending for BET.');
  });

  it('does not borrow a standard profile when the selected evolved evaluator is pending', () => {
    const snapshot = makeFutureSnapshot();
    expect(() => optimizeCombatJob(snapshot, {
      minResource: 440,
      minGcd: 2.29,
      maxGcd: 2.5,
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 300,
      jobMode: 'evolved'
    }, 'ALP')).toThrow('Generic-hit evaluation is pending for ALP. Mode evolved.');
  });
});
