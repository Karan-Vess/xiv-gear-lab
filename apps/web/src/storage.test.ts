import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { GearSet, OptimizerConstraints } from '@xiv-gear-lab/domain';
import {
  loadBuildWorkspaceState,
  loadSavedSets,
  pinnedSnapshotIdsForSavedSets,
  saveBuildWorkspaceState
} from './storage';
import { createInitialBuildWorkspaceState } from './workspace';

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
    expect(upgraded.version).toBe(5);
    expect(upgraded.objectStoreNames.contains('metadata')).toBe(true);
    expect(upgraded.objectStoreNames.contains('workspaces')).toBe(true);
    upgraded.close();
  });

  it('adds independent workspaces without altering v4 saved sets or custom items', async () => {
    const base = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'WHM')!);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 4);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('saved-sets', { keyPath: 'id' });
        request.result.createObjectStore('custom-items', { keyPath: 'id' });
        request.result.createObjectStore('metadata', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const write = database.transaction(['saved-sets', 'custom-items'], 'readwrite');
    write.objectStore('saved-sets').put({ ...base, id: 'preserved-save', origin: 'saved' });
    write.objectStore('custom-items').put({
      id: 'custom-preserved',
      preferredSlot: 'head',
      item: { ...gearSnapshot.items[0], id: 'custom-preserved', origin: 'custom', sourceFamily: 'custom' }
    });
    await transactionDone(write);
    database.close();

    const constraints: OptimizerConstraints = {
      minResource: 440,
      minGcd: 2.41,
      maxGcd: 2.41,
      allowedSources: ['savage', 'tomestone', 'tomestone-upgrade'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800
    };
    const fallback = createInitialBuildWorkspaceState({
      expansion: 'dawntrail',
      level: 100,
      job: 'WHM',
      constraints,
      gcdTarget: '2.41',
      selectedSet: base,
      message: 'Ready.'
    });
    const migrated = await loadBuildWorkspaceState(fallback);
    migrated.activeBuildId = 'build-2';
    migrated.activeTab = 'build-2';
    migrated.builds['build-2'].job = 'SCH';
    await saveBuildWorkspaceState(migrated);
    const reloaded = await loadBuildWorkspaceState(fallback);

    expect(reloaded.activeBuildId).toBe('build-2');
    expect(reloaded.builds['build-2'].job).toBe('SCH');
    expect(reloaded.builds['build-1'].job).toBe('WHM');
    expect((await loadSavedSets()).some((set) => set.id === 'preserved-save')).toBe(true);

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const customRecord = await new Promise<unknown>((resolve, reject) => {
      const request = upgraded.transaction('custom-items', 'readonly').objectStore('custom-items').get('custom-preserved');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(customRecord).toBeTruthy();
    upgraded.close();
  });
});
