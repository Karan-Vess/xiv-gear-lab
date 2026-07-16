import type { CombatJob, EquipmentItem, ItemSlot, SourceFamily } from '@xiv-gear-lab/domain';

const ITEM_SLOT_ORDER: ItemSlot[] = [
  'weapon',
  'offHand',
  'head',
  'body',
  'hands',
  'legs',
  'feet',
  'ears',
  'neck',
  'wrists',
  'ring'
];

const ITEM_SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: 'Weapon',
  offHand: 'Off-hand',
  head: 'Head',
  body: 'Body',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  ears: 'Earrings',
  neck: 'Necklace',
  wrists: 'Bracelet',
  ring: 'Rings'
};

export const equipmentSourceLabel = (source: SourceFamily): string => {
  if (source === 'savage') return 'Savage';
  if (source === 'tomestone-upgrade') return 'Tomestone upgrade';
  if (source === 'tomestone') return 'Tomestone';
  if (source === 'custom') return 'Custom';
  return 'Unknown source';
};

export interface OfficialCloneItemGroup {
  slot: ItemSlot;
  label: string;
  items: EquipmentItem[];
}

export const officialCloneItemGroups = (
  items: readonly EquipmentItem[],
  job: CombatJob
): OfficialCloneItemGroup[] => ITEM_SLOT_ORDER.flatMap((slot) => {
  const matching = items
    .filter((item) => item.origin === 'official' && item.jobs.includes(job) && item.slot === slot)
    .sort((left, right) =>
      right.itemLevel - left.itemLevel ||
      equipmentSourceLabel(left.sourceFamily).localeCompare(equipmentSourceLabel(right.sourceFamily)) ||
      left.name.localeCompare(right.name) ||
      String(left.id).localeCompare(String(right.id))
    );

  return matching.length > 0 ? [{ slot, label: ITEM_SLOT_LABEL[slot], items: matching }] : [];
});
