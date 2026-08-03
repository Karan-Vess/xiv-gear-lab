import { describe, expect, it, vi } from 'vitest';
import {
  createInitialNonCombatWorkspace,
  migrateNonCombatWorkspace,
  readApplicationMode,
  readNonCombatWorkspace,
  writeApplicationMode,
  writeNonCombatWorkspace
} from './noncombat-workspace';

describe('non-combat workspace persistence', () => {
  it('defaults to combat and a complete, independent crafter brief', () => {
    expect(readApplicationMode({ getItem: () => null })).toBe('combat');
    expect(createInitialNonCombatWorkspace()).toMatchObject({
      schemaVersion: 'non-combat-workspace@1',
      discipline: 'crafting',
      crafter: {
        schemaVersion: 'crafter-constraints@1',
        job: 'CRP',
        level: 100,
        allowedSources: ['crafted', 'scrip'],
        minimumStats: { craftsmanship: 0, control: 0, cp: 0 },
        objective: 'balanced'
      }
    });
  });

  it('keeps valid settings and repairs damaged provider values', () => {
    const migrated = migrateNonCombatWorkspace({
      ...createInitialNonCombatWorkspace(),
      discipline: 'gathering',
      crafter: {
        ...createInitialNonCombatWorkspace().crafter,
        job: 'WVR',
        allowedSources: ['crafted', 'savage'],
        minimumStats: { craftsmanship: 5_000.9, control: -20, cp: 700 }
      }
    });
    expect(migrated).toMatchObject({
      discipline: 'gathering',
      crafter: {
        job: 'WVR',
        allowedSources: ['crafted'],
        minimumStats: { craftsmanship: 5_000, control: 0, cp: 700 }
      }
    });
  });

  it('round-trips JSON and fails open when local storage is blocked', () => {
    const state = createInitialNonCombatWorkspace();
    state.crafter.job = 'CUL';
    state.crafter.minimumStats.cp = 650;
    const setItem = vi.fn();
    writeApplicationMode({ setItem }, 'non-combat');
    writeNonCombatWorkspace({ setItem }, state);
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(readNonCombatWorkspace({ getItem: () => JSON.stringify(state) })).toEqual(state);
    expect(() => writeNonCombatWorkspace({ setItem: () => { throw new Error('blocked'); } }, state)).not.toThrow();
  });
});
