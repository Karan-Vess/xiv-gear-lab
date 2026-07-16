import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { itemStatDisplay, materiaSlotDisplay } from './item-display';

describe('equipment item stat display', () => {
  it('shows every non-zero modelled weapon stat including damage and delay', () => {
    const weapon = gearSnapshot.items.find((item) => item.slot === 'weapon' && item.jobs.includes('WHM'))!;
    const displayed = itemStatDisplay(weapon);

    expect(displayed.some((entry) => entry.label === 'WD')).toBe(true);
    expect(displayed.some((entry) => entry.label === 'Delay')).toBe(true);
    expect(displayed.some((entry) => entry.label === 'MND')).toBe(true);
    expect(displayed.some((entry) => entry.label === 'VIT')).toBe(true);
    expect(displayed).toHaveLength(Object.values(weapon.stats).filter((value) => value > 0).length + 2);
  });

  it('omits zero weapon fields and zero-value stats from non-weapons', () => {
    const accessory = gearSnapshot.items.find((item) => item.slot === 'ears' && item.jobs.includes('WHM'))!;
    const displayed = itemStatDisplay(accessory);

    expect(displayed.some((entry) => entry.label === 'WD' || entry.label === 'Delay')).toBe(false);
    expect(displayed.every((entry) => !entry.value.includes('+0'))).toBe(true);
  });

  it('shows final capped item stats and the actual contribution from every materia slot', () => {
    const item = gearSnapshot.items.find((candidate) => candidate.materiaSlots > 0
      && gearSnapshot.materia.some((meld) => candidate.statCaps[meld.stat] > candidate.stats[meld.stat]))!;
    const meld = gearSnapshot.materia.find((candidate) => item.statCaps[candidate.stat] > item.stats[candidate.stat])!;
    const room = item.statCaps[meld.stat] - item.stats[meld.stat];
    const expectedApplied = Math.min(room, meld.value);
    const displayed = itemStatDisplay(item, [meld.id], gearSnapshot.materia);
    const slots = materiaSlotDisplay(item, [meld.id], gearSnapshot.materia);

    expect(displayed.find((entry) => entry.key === meld.stat)?.value).toBe(`+${item.stats[meld.stat] + expectedApplied}`);
    expect(slots[0]).toMatchObject({ materia: meld, applied: expectedApplied, waste: meld.value - expectedApplied });
    expect(slots).toHaveLength(item.materiaSlots);
    expect(slots.slice(1).every((slot) => slot.materia === undefined && slot.applied === 0)).toBe(true);
  });
});
