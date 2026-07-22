import { describe, expect, it } from 'vitest';
import { recalculateGearSet } from '@xiv-gear-lab/calculations';
import { assessSnapshotCompatibility } from '@xiv-gear-lab/domain';
import { gearSnapshot } from './index';

describe('live combat-job reference fixtures', () => {
  it('loads the current roster and evaluator profiles from snapshot data', () => {
    expect(gearSnapshot.registry.jobs).toHaveLength(21);
    expect(gearSnapshot.evaluatorProfiles).toHaveLength(85);
    expect(new Set(gearSnapshot.evaluatorProfiles.map((profile) => profile.id)).size).toBe(85);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'AST')?.baseStats.vitality).toBe(439);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'MCH')?.damageTrait).toBe(1.2);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'MNK')?.hastePercent).toBe(20);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'WHM' && profile.rulesetId.startsWith('shb-')))
      .toMatchObject({ confidence: 'internal-unverified', levelConstants: { baseMain: 340, baseSub: 380, levelDiv: 1300 } });
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'WHM' && profile.rulesetId.startsWith('sb-')))
      .toMatchObject({ confidence: 'internal-unverified', levelConstants: { baseMain: 292, baseSub: 364, levelDiv: 900 } });
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'WHM' && profile.rulesetId.startsWith('hw-')))
      .toMatchObject({ confidence: 'internal-unverified', levelConstants: { baseMain: 218, baseSub: 354, levelDiv: 600 } });
    const populatedHeavensward = gearSnapshot.items.some((item) => item.expansionId === 'hw');
    expect(gearSnapshot.materia).toHaveLength(populatedHeavensward ? 70 : 56);
    const expectedMateriaTiers = populatedHeavensward ? [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [5, 6, 7, 8, 9, 10, 11, 12];
    expect(Object.fromEntries(expectedMateriaTiers.map((tier) => [tier, gearSnapshot.materia.filter((entry) => entry.tier === tier).length])))
      .toEqual(Object.fromEntries(expectedMateriaTiers.map((tier) => [tier, 7])));
    expect(gearSnapshot.materia.find((entry) => entry.name === 'Savage Aim Materia XI')).toMatchObject({ value: 18, advancedMeldingLimit: 'unrestricted' });
  });

  it('passes the historical-cap runtime compatibility gate before activation', () => {
    const report = assessSnapshotCompatibility(gearSnapshot, {
      appVersion: '0.8.0',
      snapshotSchemas: ['gear-snapshot@1'],
      registrySchemas: ['game-registry@1'],
      rulesetSchemas: ['combat-ruleset@1'],
      calculationSchemas: [
        'ffxiv-combat-level-100@1',
        'ffxiv-combat-level-90@1',
        'ffxiv-combat-level-80@1',
        'ffxiv-combat-level-70@1',
        'ffxiv-combat-level-60@1'
      ],
      evaluatorProfileSchemas: ['generic-hit-profile@1']
    });
    expect(report.errors).toEqual([]);
    expect(report.compatible).toBe(true);
    expect(gearSnapshot.curatedSets.every((set) =>
      set.calculationContext?.snapshotId === gearSnapshot.manifest.id &&
      set.calculationContext.rulesetId === 'dt-7.51-level-100-standard@1'
    )).toBe(true);
  });

  it('keeps the current independently attributed reference count for every supported job', () => {
    expect(Object.fromEntries(['WHM', 'SCH', 'AST', 'SGE', 'PLD', 'WAR', 'DRK', 'GNB', 'MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR', 'BRD', 'MCH', 'DNC', 'BLM', 'SMN', 'RDM', 'PCT'].map((job) => [
      job,
      gearSnapshot.curatedSets.filter((set) => set.job === job).length
    ]))).toEqual({
      WHM: 6, SCH: 2, AST: 4, SGE: 4, PLD: 1, WAR: 2, DRK: 4, GNB: 3,
      MNK: 3, DRG: 1, NIN: 1, SAM: 2, RPR: 1, VPR: 3,
      BRD: 1, MCH: 1, DNC: 1, BLM: 6, SMN: 6, RDM: 5, PCT: 3
    });
  });

  it('cross-attributes matching Etro and Balance sets without duplicating cards', () => {
    expect(gearSnapshot.curatedSets).toHaveLength(60);
    expect(gearSnapshot.curatedSets.filter((set) =>
      set.provenance.some((entry) => entry.provider === 'The Balance')
    )).toHaveLength(55);
    expect(gearSnapshot.curatedSets.filter((set) =>
      set.provenance.some((entry) => entry.provider === 'Etro')
    )).toHaveLength(56);

    expect(gearSnapshot.curatedSets.filter((set) =>
      set.provenance.some((entry) => entry.provider === 'Etro') &&
      set.provenance.some((entry) => entry.provider === 'The Balance')
    )).toHaveLength(51);

    const scholarFast = gearSnapshot.curatedSets.find((set) =>
      set.job === 'SCH' && set.metrics.gcd === 2.31
    );
    expect(scholarFast?.name).toBe('2.31 Max Damage');
    expect(scholarFast?.provenance.map((entry) => entry.provider)).toEqual(['The Balance', 'XivGear']);
    expect(gearSnapshot.curatedSets.find((set) => set.job === 'DRK' && set.name === '2.46 The Balance')
      ?.provenance.map((entry) => entry.provider)).toEqual(['The Balance', 'XivGear']);
  });

  it('ships the current M11 access graph, HQ policy, routes, and fixed costs', () => {
    expect(gearSnapshot.items.length).toBeGreaterThanOrEqual(3498);
    expect(gearSnapshot.contentGraph?.schemaVersion).toBe('content-access@1');
    expect(gearSnapshot.contentGraph?.nodes.some((node) => node.id === 'duty:aac-heavyweight-savage')).toBe(true);
    expect(gearSnapshot.contentGraph?.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'duty:windurst-third-walk',
      'duty:unmaking-extreme',
      'vendor:uahshepya',
      'duty:dancing-mad-ultimate',
      'duty:aac-heavyweight-normal',
      'recipe:courtly-lover',
      'vendor:eirene-grade-3',
      'duty:the-clyteum',
      'duty:hell-on-rails-extreme',
      'quest:phantom-obscurum'
    ]));
    expect(gearSnapshot.items.every((item) => item.sourceFamily !== 'crafted' || item.quality === 'hq')).toBe(true);
    expect(gearSnapshot.items.every((item) => item.acquisitionRoutes && item.acquisitionRoutes.length > 0)).toBe(true);
    expect(gearSnapshot.items.every((item) => item.iconUrl?.startsWith('./icons/assets/'))).toBe(true);

    const shadowbringersItems = gearSnapshot.items.filter((item) => item.expansionId === 'shb');
    expect(shadowbringersItems).toHaveLength(609);
    expect(new Set(shadowbringersItems.flatMap((item) => item.jobs)).size).toBe(17);
    expect(new Set(shadowbringersItems.map((item) => item.sourceFamily))).toEqual(new Set([
      'crafted', 'normal-raid', 'savage', 'tomestone', 'tomestone-upgrade',
      'alliance-raid', 'dungeon', 'trial', 'relic', 'ultimate'
    ]));
    expect(shadowbringersItems.every((item) => item.acquisitionRoutes?.some((route) => route.status === 'partial'))).toBe(true);

    const stormbloodItems = gearSnapshot.items.filter((item) => item.expansionId === 'sb');
    expect(stormbloodItems).toHaveLength(1731);
    expect(stormbloodItems.every((item) => item.level === 70 && item.itemLevel >= 345 && item.itemLevel <= 405)).toBe(true);
    expect(new Set(stormbloodItems.flatMap((item) => item.jobs)).size).toBe(15);
    expect(new Set(stormbloodItems.map((item) => item.sourceFamily))).toEqual(new Set([
      'crafted', 'normal-raid', 'savage', 'tomestone', 'tomestone-upgrade',
      'alliance-raid', 'dungeon', 'trial', 'relic', 'ultimate', 'other'
    ]));
    expect(stormbloodItems.every((item) => item.sourceFamily !== 'crafted' || item.quality === 'hq')).toBe(true);
    expect(stormbloodItems.every((item) => item.acquisitionRoutes?.every((route) =>
      route.status === 'partial' && route.expansionId === 'sb' && route.minimumLevel === 70
    ))).toBe(true);

    const heavenswardItems = gearSnapshot.items.filter((item) => item.expansionId === 'hw');
    if (heavenswardItems.length > 0) {
      expect(heavenswardItems.every((item) => item.level === 60 && item.itemLevel >= 235 && item.itemLevel <= 275)).toBe(true);
      expect(new Set(heavenswardItems.flatMap((item) => item.jobs)).size).toBe(13);
      expect(heavenswardItems.every((item) => item.sourceFamily !== 'crafted' || item.quality === 'hq')).toBe(true);
      expect(heavenswardItems.every((item) => item.acquisitionRoutes?.every((route) =>
        route.status === 'partial' && route.expansionId === 'hw' && route.minimumLevel === 60
      ))).toBe(true);
    }

    const body = gearSnapshot.items.find((item) => item.name === 'Bygone Brass Shirt of Healing');
    expect(body?.sourceFamily).toBe('tomestone');
    expect(body?.acquisitionRoutes?.[0]?.costs).toContainEqual(expect.objectContaining({
      kind: 'currency',
      name: 'Allagan Tomestone of Mnemonics',
      amount: 825,
      frequency: 'weekly',
      valuation: 'fixed'
    }));

    const augmentedBody = gearSnapshot.items.find((item) => item.name === 'Augmented Bygone Brass Shirt of Healing');
    expect(augmentedBody?.acquisitionRoutes?.some((route) =>
      route.costs.some((cost) => cost.name === 'Thundersteeped Twine' && cost.amount === 1)
    )).toBe(true);

    const allianceBody = gearSnapshot.items.find((item) => item.name === "Vana'dielian Tabard of Healing");
    expect(allianceBody).toMatchObject({ sourceFamily: 'alliance-raid', itemLevel: 780 });
    expect(allianceBody?.acquisitionRoutes?.[0]).toMatchObject({
      status: 'validated',
      frequency: 'weekly',
      location: { kind: 'duty', name: 'Windurst: The Third Walk' }
    });

    const trialWeapon = gearSnapshot.items.find((item) => item.name === 'Star Globe of Naught');
    expect(trialWeapon).toMatchObject({ sourceFamily: 'trial', itemLevel: 785 });
    expect(trialWeapon?.acquisitionRoutes?.flatMap((route) => route.costs)).toContainEqual(expect.objectContaining({
      name: 'Totem of Naught', amount: 10, itemId: 50892
    }));

    const ultimateWeapon = gearSnapshot.items.find((item) => item.name === 'Palazzo Diamond Sextant');
    expect(ultimateWeapon).toMatchObject({ sourceFamily: 'ultimate', itemLevel: 795 });
    expect(ultimateWeapon?.acquisitionRoutes?.[0]?.costs).toContainEqual(expect.objectContaining({
      name: "Mad Harlequin's Totem", amount: 1, itemId: 52321
    }));

    const craftedBody = gearSnapshot.items.find((item) => item.name === "Courtly Lover's Longcoat of Healing");
    expect(craftedBody).toMatchObject({ sourceFamily: 'crafted', itemLevel: 770, quality: 'hq' });
    expect(craftedBody?.acquisitionRoutes?.[0]).toMatchObject({
      status: 'validated',
      location: { kind: 'recipe', name: 'Courtly Lover crafting recipe' }
    });

    const augmentedCraftedBody = gearSnapshot.items.find((item) => item.name === "Augmented Courtly Lover's Longcoat of Healing");
    expect(augmentedCraftedBody).toMatchObject({ sourceFamily: 'crafted', itemLevel: 780, quality: 'hq' });
    expect(augmentedCraftedBody?.acquisitionRoutes?.[0]?.costs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Everkeep Certificate of Grade 3 Import', amount: 17, itemId: 51188 }),
      expect.objectContaining({ name: 'Treno Rain', amount: 5, itemId: 51187 })
    ]));

    const normalRaidBody = gearSnapshot.items.find((item) => item.name === 'Heavyweight Bliaud of Healing');
    expect(normalRaidBody).toMatchObject({ sourceFamily: 'normal-raid', itemLevel: 770 });
    expect(normalRaidBody?.acquisitionRoutes?.[0]?.costs).toContainEqual(expect.objectContaining({
      name: 'Heavy Holoarmor', amount: 4, itemId: 49750
    }));

    const dungeonBody = gearSnapshot.items.find((item) => item.name === 'Praemagitek Coat of Healing');
    expect(dungeonBody).toMatchObject({ sourceFamily: 'dungeon', itemLevel: 765 });
    expect(dungeonBody?.acquisitionRoutes?.[0]?.location).toEqual({ kind: 'duty', name: 'The Clyteum' });

    const runawayWeapon = gearSnapshot.items.find((item) => item.name === 'Runaway Staff');
    expect(runawayWeapon).toMatchObject({ sourceFamily: 'trial', itemLevel: 775 });
    expect(runawayWeapon?.acquisitionRoutes?.flatMap((route) => route.costs)).toContainEqual(expect.objectContaining({
      name: 'Runaway Totem', amount: 10, itemId: 49748
    }));

    const phantomWeapon = gearSnapshot.items.find((item) => item.name === 'Phantom Cane Obscurum');
    expect(phantomWeapon).toMatchObject({ sourceFamily: 'relic', itemLevel: 775 });
    expect(phantomWeapon?.acquisitionRoutes?.at(-1)?.costs).toContainEqual(expect.objectContaining({
      name: 'Waning Arcanite', amount: 3, itemId: 50058
    }));
  });

  it('ships a complete Endwalker level-90 cap with historical rules, consumables, and routes', () => {
    const endwalkerItems = gearSnapshot.items.filter((item) => item.expansionId === 'ew');
    expect(endwalkerItems).toHaveLength(540);
    expect(endwalkerItems.every((item) =>
      item.level === 90 &&
      item.acquisitionRoutes?.length &&
      item.acquisitionRoutes.every((route) => route.expansionId === 'ew' && route.status === 'validated')
    )).toBe(true);
    const mandervillous = endwalkerItems.filter((item) => item.name.startsWith('Mandervillous'));
    expect(mandervillous).toHaveLength(20);
    expect(mandervillous.every((item) => item.sourceFamily === 'relic' && item.relicStatModel?.type === 'endwalker-discrete')).toBe(true);
    expect(mandervillous.find((item) => item.slot === 'weapon' && item.jobs.includes('PLD'))?.relicStatModel)
      .toMatchObject({ largeValue: 219, smallValue: 51 });
    expect(mandervillous.find((item) => item.slot === 'offHand')?.relicStatModel)
      .toMatchObject({ largeValue: 87, smallValue: 21 });
    expect(new Set(endwalkerItems.map((item) => item.sourceFamily))).toEqual(new Set([
      'crafted', 'normal-raid', 'savage', 'tomestone', 'tomestone-upgrade',
      'dungeon', 'trial', 'alliance-raid', 'ultimate', 'relic'
    ]));

    const profiles = gearSnapshot.evaluatorProfiles.filter((profile) => profile.rulesetId === 'ew-6.58-level-90-standard@1');
    expect(profiles).toHaveLength(19);
    expect(profiles.some((profile) => profile.job === 'VPR' || profile.job === 'PCT')).toBe(false);
    expect(profiles.every((profile) => profile.levelConstants?.baseMain === 390 && profile.levelConstants.levelDiv === 1900)).toBe(true);
    expect(gearSnapshot.foods.filter((food) => food.expansionId === 'ew')).toHaveLength(8);
    expect(gearSnapshot.materia.filter((materia) => materia.expansionId === 'ew')).toHaveLength(14);

    expect(gearSnapshot.contentGraph?.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'quest:endwalker-complete',
      'currency:comedy',
      'recipe:diadochos',
      'duty:anabaseios-normal',
      'duty:anabaseios-savage',
      'duty:lunar-subterrane',
      'duty:thaleia',
      'duty:abyssal-fracture-extreme',
      'duty:omega-protocol-ultimate'
    ]));

    const credendumBody = endwalkerItems.find((item) => item.name === 'Credendum Surcoat of Healing');
    expect(credendumBody?.acquisitionRoutes?.[0]?.costs).toContainEqual(expect.objectContaining({
      name: 'Allagan Tomestone of Comedy', amount: 825
    }));
    const ascensionWeapon = endwalkerItems.find((item) => item.name === 'Cane of Ascension');
    expect(ascensionWeapon?.acquisitionRoutes?.flatMap((route) => route.costs)).toContainEqual(expect.objectContaining({
      name: 'Anabaseios Mythos IV', amount: 8, itemId: 40306
    }));
    const trialWeapon = endwalkerItems.find((item) => item.name === 'Voidvessel Cane');
    expect(trialWeapon?.acquisitionRoutes?.flatMap((route) => route.costs)).toContainEqual(expect.objectContaining({
      name: 'Voidvessel Totem', amount: 10, itemId: 41053
    }));
  });

  for (const source of gearSnapshot.curatedSets) {
    it(`reproduces ${source.job} ${source.name}`, () => {
      const calculated = recalculateGearSet(
        source,
        gearSnapshot.items,
        gearSnapshot.materia,
        gearSnapshot.foods,
        gearSnapshot.evaluatorProfiles
      );
      expect(calculated.metrics.gcd).toBe(source.metrics.gcd);
      expect(calculated.metrics.stats).toEqual(source.metrics.stats);
      expect(calculated.metrics.expectedAction100).toBeCloseTo(source.metrics.expectedAction100, 2);
      expect(calculated.evaluation?.profileId).toBe(source.evaluation?.profileId);
    });
  }
});
