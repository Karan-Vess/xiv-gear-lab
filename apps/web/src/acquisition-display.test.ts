import { describe, expect, it } from 'vitest';
import { emptyStats, type EquipmentItem } from '@xiv-gear-lab/domain';
import {
  acquisitionCostIconUrl,
  acquisitionLocationLabel,
  acquisitionSourceIconUrl,
  displayAcquisitionCosts,
  fixedAcquisitionCosts,
  groupAcquisitionRoutes
} from './acquisition-display';

const item: EquipmentItem = {
  id: 1,
  origin: 'official',
  name: 'Fixture Coat',
  jobs: ['WHM'],
  slot: 'body',
  level: 100,
  itemLevel: 790,
  stats: emptyStats(),
  statCaps: emptyStats(),
  weaponDamage: 0,
  weaponDelayMs: 0,
  materiaSlots: 2,
  advancedMelding: false,
  unique: true,
  sourceFamily: 'savage',
  acquisitionNote: 'Fixture',
  provenance: [],
  acquisitionRoutes: [{
    id: 'book',
    name: 'Book exchange',
    sourceFamily: 'savage',
    expansionId: 'dt',
    minimumLevel: 100,
    requirements: [],
    costs: [{ kind: 'item', name: 'AAC Illustrated: HW Edition III', amount: 6, itemId: 49762, frequency: 'weekly', valuation: 'fixed' }],
    frequency: 'weekly',
    status: 'validated',
    location: { kind: 'vendor', name: 'Hhihwi', area: 'Solution Nine', x: 8.7, y: 13.4 },
    note: 'Exchange six books.',
    provenance: []
  }]
};

describe('acquisition column presentation', () => {
  it('uses official local game assets for known source and cost families', () => {
    expect(acquisitionSourceIconUrl('savage')).toBe('./icons/acquisition/raid.png');
    expect(acquisitionCostIconUrl(item.acquisitionRoutes![0]!.costs[0]!)).toBe('./icons/acquisition/aac-book-3.png');
    expect(acquisitionSourceIconUrl('trial')).toBe('./icons/acquisition/trial.png');
    expect(acquisitionSourceIconUrl('ultimate')).toBe('./icons/acquisition/ultimate.png');
    expect(acquisitionCostIconUrl({
      kind: 'item', name: 'Totem of Naught', amount: 10, frequency: 'repeatable', valuation: 'fixed'
    })).toBe('./icons/acquisition/totem-of-naught.png');
    expect(acquisitionCostIconUrl({
      kind: 'item', name: "Mad Harlequin's Totem", amount: 1, frequency: 'weekly', valuation: 'fixed'
    })).toBe('./icons/acquisition/mad-harlequin-totem.png');
  });

  it('deduplicates fixed costs and formats an exact vendor location', () => {
    const duplicate = structuredClone(item);
    duplicate.acquisitionRoutes!.push({ ...structuredClone(duplicate.acquisitionRoutes![0]!), id: 'book-2' });
    expect(fixedAcquisitionCosts(duplicate)).toHaveLength(1);
    expect(acquisitionLocationLabel(item.acquisitionRoutes![0]!.location)).toBe('Hhihwi, Solution Nine (X:8.7 Y:13.4)');
  });

  it('groups alternate routes at one vendor and expands an upgrade prerequisite into its tome cost', () => {
    const base = structuredClone(item);
    base.id = 2;
    base.name = 'Bygone Brass Coat of Healing';
    base.sourceFamily = 'tomestone';
    base.acquisitionRoutes = [{
      ...structuredClone(item.acquisitionRoutes![0]!),
      id: 'base-purchase',
      costs: [{ kind: 'currency', name: 'Allagan Tomestone of Mnemonics', amount: 825, frequency: 'weekly', valuation: 'fixed' }]
    }];
    const augmented = structuredClone(item);
    augmented.id = 3;
    augmented.name = 'Augmented Bygone Brass Coat of Healing';
    augmented.sourceFamily = 'tomestone-upgrade';
    const upgradeCosts = [
      { kind: 'item' as const, name: base.name, amount: 1, frequency: 'one-time' as const, valuation: 'fixed' as const },
      { kind: 'item' as const, name: 'Thundersteeped Twine', amount: 1, frequency: 'weekly' as const, valuation: 'fixed' as const }
    ];
    augmented.acquisitionRoutes = ['savage', 'catch-up'].map((id) => ({
      ...structuredClone(item.acquisitionRoutes![0]!),
      id,
      location: { kind: 'vendor', name: 'Theone', area: 'Solution Nine', x: 8.5, y: 13.6 },
      costs: upgradeCosts
    }));

    expect(groupAcquisitionRoutes(augmented.acquisitionRoutes)).toHaveLength(1);
    expect(groupAcquisitionRoutes(augmented.acquisitionRoutes)[0]!.routes).toHaveLength(2);
    expect(displayAcquisitionCosts(augmented, [base, augmented]).map((cost) => [cost.name, cost.amount])).toEqual([
      ['Allagan Tomestone of Mnemonics', 825],
      ['Thundersteeped Twine', 1]
    ]);
  });
});
