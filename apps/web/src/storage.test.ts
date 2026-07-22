import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { GearSet, OptimizerConstraints } from '@xiv-gear-lab/domain';
import {
  deleteCustomItem,
  loadBuildWorkspaceState,
  loadCustomItems,
  loadSavedSets,
  pinnedSnapshotIdsForSavedSets,
  saveBuildWorkspaceState,
  saveCustomItem
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
    expect(upgraded.version).toBe(6);
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

  it('adds newly supported materia tiers to a legacy workspace exactly once', async () => {
    const base = gearSnapshot.curatedSets[0]!;
    const constraints: OptimizerConstraints = {
      minResource: 440,
      minGcd: 2.41,
      maxGcd: 2.41,
      allowedSources: ['crafted'],
      requiredItemIds: [],
      excludedItemIds: [],
      frontierLimit: 1_800,
      allowedMateriaTiers: [9, 10, 11, 12],
      materiaCatalogueVersion: 'combat-materia-ew-dt-9-12@2'
    };
    const fallback = createInitialBuildWorkspaceState({
      expansion: 'dt', level: 100, job: 'WHM', constraints, gcdTarget: '2.41', selectedSet: base, message: 'Ready.'
    });
    const legacy = structuredClone(fallback);
    for (const build of Object.values(legacy.builds)) {
      build.constraints.allowedMateriaTiers = [11, 12];
      build.constraints.materiaCatalogueVersion = 'combat-materia-dt-11-12@1';
    }
    await saveBuildWorkspaceState(legacy);

    const migrated = await loadBuildWorkspaceState(fallback);
    expect(migrated.builds['build-1'].constraints.allowedMateriaTiers).toEqual([11, 12, 9, 10]);
    expect(migrated.builds['build-1'].constraints.materiaCatalogueVersion).toBe('combat-materia-ew-dt-9-12@2');

    migrated.builds['build-1'].constraints.allowedMateriaTiers = [12];
    await saveBuildWorkspaceState(migrated);
    const deliberateSelection = await loadBuildWorkspaceState(fallback);
    expect(deliberateSelection.builds['build-1'].constraints.allowedMateriaTiers).toEqual([12]);
  });
});

describe('M10 custom-item persistence', () => {
  it('round-trips meldability, access metadata, notes, costs and a local user icon', async () => {
    const source = structuredClone(gearSnapshot.items.find((item) => item.jobs.includes('WHM') && item.slot === 'head')!);
    const custom = {
      ...source,
      id: 'custom-round-trip',
      origin: 'custom' as const,
      sourceFamily: 'custom' as const,
      materiaSlots: 2,
      advancedMelding: true,
      iconPath: undefined,
      iconUrl: 'data:image/png;base64,AA==',
      customData: {
        schemaVersion: 'custom-equipment@1' as const,
        mode: 'meldable-base' as const,
        role: 'healer' as const,
        expansionId: 'dawntrail',
        sourceDescription: 'Synthetic source',
        fixedCost: '10 test tokens',
        notes: 'Keep this note after restart.',
        iconProvenance: 'user' as const,
        clonedFromItemId: source.id
      }
    };
    await saveCustomItem(custom, 'head');
    const loaded = await loadCustomItems();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      id: custom.id,
      preferredSlot: 'head',
      item: {
        materiaSlots: 2,
        advancedMelding: true,
        iconUrl: custom.iconUrl,
        customData: custom.customData
      }
    });
    await deleteCustomItem(custom.id);
    expect(await loadCustomItems()).toEqual([]);
  });
});
