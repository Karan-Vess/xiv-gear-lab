import { STAT_KEYS, type EquipmentItem, type Materia, type StatBlock, type StatKey } from '@xiv-gear-lab/domain';
import { applyRelicStats } from '@xiv-gear-lab/calculations';

export const statLabel: Record<StatKey, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  mind: 'MND',
  vitality: 'VIT',
  piety: 'PIE',
  tenacity: 'TEN',
  criticalHit: 'CRT',
  determination: 'DET',
  directHit: 'DHT',
  skillSpeed: 'SKS',
  spellSpeed: 'SPS'
};

export interface ItemStatDisplay {
  key: string;
  label: string;
  value: string;
}

export interface MateriaSlotDisplay {
  index: number;
  advanced: boolean;
  materia?: Materia;
  statLabel?: string;
  applied: number;
  waste: number;
}

const meldedItemStats = (item: EquipmentItem, materiaIds: number[], materia: Materia[], relicStats?: Partial<Record<StatKey, number>>) => {
  const stats: StatBlock = applyRelicStats(item, relicStats);
  const slots: MateriaSlotDisplay[] = [];

  for (let index = 0; index < Math.max(item.materiaSlots, materiaIds.length); index += 1) {
    const meld = materia.find((entry) => entry.id === materiaIds[index]);
    if (!meld) {
      slots.push({ index, advanced: index >= item.materiaSlots, applied: 0, waste: 0 });
      continue;
    }
    const room = Math.max(0, item.statCaps[meld.stat] - stats[meld.stat]);
    const applied = Math.min(room, meld.value);
    stats[meld.stat] += applied;
    slots.push({
      index,
      advanced: index >= item.materiaSlots,
      materia: meld,
      statLabel: statLabel[meld.stat],
      applied,
      waste: meld.value - applied
    });
  }

  return { stats, slots };
};

export const materiaSlotDisplay = (
  item: EquipmentItem,
  materiaIds: number[],
  materia: Materia[],
  relicStats?: Partial<Record<StatKey, number>>
) => meldedItemStats(item, materiaIds, materia, relicStats).slots;

export const itemStatDisplay = (item: EquipmentItem, materiaIds: number[] = [], materia: Materia[] = [], relicStats?: Partial<Record<StatKey, number>>): ItemStatDisplay[] => {
  const stats = meldedItemStats(item, materiaIds, materia, relicStats).stats;
  return [
  ...(item.weaponDamage > 0
    ? [{ key: 'weaponDamage', label: 'WD', value: String(item.weaponDamage) }]
    : []),
  ...(item.weaponDelayMs > 0
    ? [{ key: 'weaponDelay', label: 'Delay', value: `${(item.weaponDelayMs / 1_000).toFixed(2)}s` }]
    : []),
  ...STAT_KEYS.flatMap((key) => stats[key] > 0
    ? [{ key, label: statLabel[key], value: `+${stats[key]}` }]
    : [])
  ];
};
