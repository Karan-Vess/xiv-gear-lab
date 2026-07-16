import { describe, expect, it } from 'vitest';
import { gearSnapshot, whmSnapshot } from '@xiv-gear-lab/data';
import { exportToXivGear, XivGearExportError } from './index';

describe('XivGear export', () => {
  it('maps an official curated set to the external slot contract', () => {
    const exported = exportToXivGear(whmSnapshot.curatedSets[0]!, whmSnapshot);
    expect(exported.job).toBe('WHM');
    expect(exported.level).toBe(100);
    expect(exported.items.Weapon?.id).toBe(49663);
    expect(Object.keys(exported.items)).toHaveLength(11);
  });

  it('fails closed for a custom item', () => {
    const source = whmSnapshot.curatedSets[0]!;
    const customSet = {
      ...source,
      items: { ...source.items, head: { itemId: 'custom-head', materiaIds: [] } }
    };
    expect(() => exportToXivGear(customSet, whmSnapshot)).toThrow(XivGearExportError);
  });

  it('preserves Sage as the exported job', () => {
    const sageSet = gearSnapshot.curatedSets.find((set) => set.job === 'SGE')!;
    const exported = exportToXivGear(sageSet, gearSnapshot);
    expect(exported.job).toBe('SGE');
    const weapon = gearSnapshot.items.find((item) => item.id === exported.items.Weapon?.id);
    expect(weapon?.jobs).toEqual(['SGE']);
  });

  it.each(['SCH', 'AST'] as const)('preserves %s and its job-specific weapon', (job) => {
    const set = gearSnapshot.curatedSets.find((entry) => entry.job === job)!;
    const exported = exportToXivGear(set, gearSnapshot);
    expect(exported.job).toBe(job);
    const weapon = gearSnapshot.items.find((item) => item.id === exported.items.Weapon?.id);
    expect(weapon?.jobs).toEqual([job]);
  });

  it('exports Paladin with its separate off-hand shield', () => {
    const set = gearSnapshot.curatedSets.find((entry) => entry.job === 'PLD')!;
    const exported = exportToXivGear(set, gearSnapshot);
    expect(exported.job).toBe('PLD');
    expect(Object.keys(exported.items)).toHaveLength(12);
    expect(exported.items.Weapon?.id).toBe(49658);
    expect(exported.items.OffHand?.id).toBe(49679);
  });
});
