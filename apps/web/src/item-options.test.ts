import { describe, expect, it } from 'vitest';
import { emptyStats, type EquipmentItem } from '@xiv-gear-lab/domain';
import { officialCloneItemGroups } from './item-options';

const item = (
  id: number,
  name: string,
  slot: EquipmentItem['slot'],
  itemLevel: number,
  sourceFamily: EquipmentItem['sourceFamily'],
  jobs = ['WHM']
): EquipmentItem => ({
  id,
  origin: 'official',
  name,
  jobs,
  slot,
  level: 100,
  itemLevel,
  stats: emptyStats(),
  statCaps: emptyStats(),
  weaponDamage: 0,
  weaponDelayMs: 0,
  materiaSlots: 0,
  advancedMelding: false,
  unique: false,
  sourceFamily,
  acquisitionNote: '',
  provenance: []
});

describe('officialCloneItemGroups', () => {
  it('groups by equipment slot and orders each group by item level, source, and name', () => {
    const groups = officialCloneItemGroups([
      item(1, 'Lower head', 'head', 780, 'savage'),
      item(2, 'Tome head', 'head', 790, 'tomestone'),
      item(3, 'Savage Z', 'head', 790, 'savage'),
      item(4, 'Savage A', 'head', 790, 'savage'),
      item(5, 'Weapon', 'weapon', 780, 'tomestone'),
      item(6, 'Other job', 'body', 800, 'savage', ['PLD'])
    ], 'WHM');

    expect(groups.map((group) => group.label)).toEqual(['Weapon', 'Head']);
    expect(groups[1]?.items.map((entry) => entry.name)).toEqual([
      'Savage A',
      'Savage Z',
      'Tome head',
      'Lower head'
    ]);
  });
});
