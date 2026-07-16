import { gearSlotsForJob, type GearSet, type GearSlot, type GearSnapshot } from '@xiv-gear-lab/domain';

const XIVGEAR_SLOT: Record<GearSlot, string> = {
  weapon: 'Weapon',
  offHand: 'OffHand',
  head: 'Head',
  body: 'Body',
  hands: 'Hand',
  legs: 'Legs',
  feet: 'Feet',
  ears: 'Ears',
  neck: 'Neck',
  wrists: 'Wrist',
  ringLeft: 'RingLeft',
  ringRight: 'RingRight'
};

export class XivGearExportError extends Error {}

export const exportToXivGear = (set: GearSet, snapshot: GearSnapshot) => {
  const incompatible: string[] = [];
  const items: Record<string, { id: number; materia: Array<{ id: number }> }> = {};

  for (const [slot, equipped] of Object.entries(set.items) as Array<[GearSlot, NonNullable<GearSet['items'][GearSlot]>]>) {
    const item = snapshot.items.find((entry) => String(entry.id) === String(equipped.itemId));
    if (!item || item.origin !== 'official' || typeof item.id !== 'number') {
      incompatible.push(slot);
      continue;
    }
    items[XIVGEAR_SLOT[slot]] = {
      id: item.id,
      materia: equipped.materiaIds.map((id) => ({ id }))
    };
  }

  if (incompatible.length > 0) {
    throw new XivGearExportError(
      `XivGear export only accepts official items. Replace the custom or missing item in: ${incompatible.join(', ')}.`
    );
  }

  const requiredSlotCount = gearSlotsForJob(set.job).length;
  if (Object.keys(items).length !== requiredSlotCount) {
    throw new XivGearExportError(`XivGear export requires a complete ${requiredSlotCount}-slot level 100 ${set.job} set.`);
  }

  return {
    name: set.name,
    job: set.job,
    level: 100,
    food: set.foodId,
    items
  };
};

export const exportToXivGearJson = (set: GearSet, snapshot: GearSnapshot): string =>
  JSON.stringify(exportToXivGear(set, snapshot), null, 2);
