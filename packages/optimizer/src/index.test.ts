import { describe, expect, it } from 'vitest';
import { gearSnapshot, whmSnapshot } from '@xiv-gear-lab/data';
import { isAugmentedCraftedItem, type CombatJob, type EquipmentItem, type GearSnapshot, type StatKey } from '@xiv-gear-lab/domain';
import {
  optimizeCombatJob,
  optimizeAstrologian,
  optimizeDarkKnight,
  optimizeGunbreaker,
  optimizePaladin,
  optimizeSage,
  optimizeScholar,
  optimizeWarrior,
  optimizeWhm
} from './index';

describe('WHM optimiser', () => {
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
    expect(result.best?.foodId).toBeUndefined();
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
    expect(result.best!.metrics.expectedAction100).toBeCloseTo(
      Math.max(...whmSnapshot.curatedSets.filter((set) => set.job === 'WHM').map((set) => set.metrics.expectedAction100)),
      2
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

  it.each([
    ['fast', 2.29],
    ['slow', 2.43]
  ])('returns a labelled closest-attainable Tomestone result for the %s target', (_profile, targetGcd) => {
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
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
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
});
