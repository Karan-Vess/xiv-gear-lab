import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { GearSet } from '@xiv-gear-lab/domain';
import { loadSavedSets, pinnedSnapshotIdsForSavedSets } from './storage';

const DATABASE = 'xiv-gear-lab';

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

describe('saved-set storage migration', () => {
  it('marks pre-context saves as unknown without inventing provenance and keeps real pins', async () => {
    const base = structuredClone(gearSnapshot.curatedSets[0]!);
    const legacy: GearSet = { ...base, id: 'legacy-save', origin: 'saved', calculationContext: undefined };
    delete legacy.legacyCalculationContext;
    const current: GearSet = {
      ...base,
      id: 'current-save',
      origin: 'saved',
      calculationContext: {
        snapshotId: 'real-snapshot-id',
        rulesetId: 'real-ruleset-id',
        evaluatorProfileId: 'real-profile-id',
        evaluatorVersion: 'real-profile-version',
        calculationSchema: 'real-calculation-schema'
      }
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 3);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('saved-sets', { keyPath: 'id' });
        request.result.createObjectStore('custom-items', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const write = database.transaction('saved-sets', 'readwrite');
    write.objectStore('saved-sets').put(legacy);
    write.objectStore('saved-sets').put(current);
    await transactionDone(write);
    database.close();

    const loaded = await loadSavedSets();
    const migratedLegacy = loaded.find((set) => set.id === legacy.id)!;
    const loadedCurrent = loaded.find((set) => set.id === current.id)!;
    expect(migratedLegacy.calculationContext).toBeUndefined();
    expect(migratedLegacy.legacyCalculationContext).toMatchObject({
      status: 'unknown',
      reason: 'saved-before-calculation-context'
    });
    expect(loadedCurrent.legacyCalculationContext).toBeUndefined();
    expect(pinnedSnapshotIdsForSavedSets(loaded)).toEqual(['real-snapshot-id']);

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(upgraded.version).toBe(4);
    expect(upgraded.objectStoreNames.contains('metadata')).toBe(true);
    upgraded.close();
  });
});
