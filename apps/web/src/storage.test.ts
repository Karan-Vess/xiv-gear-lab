import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type {
  GearSet,
  OptimizerConstraints,
  RotationEvaluationMode,
  RotationEvaluationSummary
} from '@xiv-gear-lab/domain';
import {
  deleteCustomItem,
  loadBuildWorkspaceState,
  loadCustomItems,
  loadSavedSets,
  pinnedSnapshotIdsForSavedSets,
  resetBuildWorkspaceState,
  saveBuildWorkspaceState,
  saveCustomItem,
  saveSet
} from './storage';
import { createInitialBuildWorkspaceState } from './workspace';

const DATABASE = 'xiv-gear-lab';

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});

const rotationSummary = (
  mode: RotationEvaluationMode,
  totalDamage: number
): RotationEvaluationSummary => ({
  mode,
  label: mode === 'opener-30' ? '30-second burst' : 'Five-minute dummy',
  durationMs: mode === 'opener-30' ? 30_000 : 300_000,
  totalDamage,
  dps: totalDamage / (mode === 'opener-30' ? 30 : 300),
  profileId: 'test-rotation@1',
  profileVersion: 'test@1',
  rulesetId: 'dt-test@1',
  gamePatch: 'test',
  engineId: 'test-engine@1',
  method: {
    kind: 'generated-priority',
    confidence: 'generated-preliminary'
  },
  actionCount: 10,
  gcdCount: 8,
  ogcdCount: 2,
  clippedMs: 0,
  references: [],
  limitation: 'Persistence fixture.',
  rerankedCandidateCount: 1,
  rerankDurationMs: 1,
  proxyBestSetId: 'test-set',
  winnerChanged: false,
  timelineCacheHits: 0
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
    expect(upgraded.version).toBe(7);
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

  it('round-trips independent evaluator modes and equipped-set results without cross-contamination', async () => {
    const base = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'SAM')!);
    const fallback = createInitialBuildWorkspaceState({
      expansion: 'dt',
      level: 100,
      job: 'SAM',
      constraints: {
        minResource: 0,
        minGcd: 2.08,
        maxGcd: 2.14,
        allowedSources: ['savage', 'relic'],
        requiredItemIds: [],
        excludedItemIds: [],
        frontierLimit: 500
      },
      gcdTarget: '2.14',
      selectedSet: base,
      message: 'Ready.'
    });
    const opener = rotationSummary('opener-30', 900_000);
    const dummy = rotationSummary('dummy-300', 9_500_000);
    fallback.builds['build-1'].evaluationMode = 'generic-hit';
    fallback.builds['build-2'].evaluationMode = 'opener-30';
    fallback.builds['build-2'].rotationPotion = 'included';
    fallback.builds['build-2'].selectedSet.rotationEvaluation = opener;
    fallback.builds['build-2'].equippedSetEvaluation = {
      setFingerprint: 'build-2-fingerprint',
      potion: 'included',
      evaluatedAt: '2026-07-29T00:00:00.000Z',
      results: {
        'opener-30': opener,
        'dummy-300': dummy
      }
    };
    fallback.builds['build-3'].evaluationMode = 'dummy-300';
    fallback.builds['build-3'].rotationPotion = 'none';

    await saveBuildWorkspaceState(fallback);
    const reloaded = await loadBuildWorkspaceState(createInitialBuildWorkspaceState({
      expansion: 'dt',
      level: 100,
      job: 'SAM',
      constraints: fallback.builds['build-1'].constraints,
      gcdTarget: '2.14',
      selectedSet: base,
      message: 'Fresh fallback.'
    }));

    expect(reloaded.builds['build-1'].evaluationMode).toBe('generic-hit');
    expect(reloaded.builds['build-1'].equippedSetEvaluation).toBeUndefined();
    expect(reloaded.builds['build-2'].evaluationMode).toBe('opener-30');
    expect(reloaded.builds['build-2'].rotationPotion).toBe('included');
    expect(reloaded.builds['build-2'].selectedSet.rotationEvaluation).toEqual(opener);
    expect(reloaded.builds['build-2'].equippedSetEvaluation?.results).toEqual({
      'opener-30': opener,
      'dummy-300': dummy
    });
    expect(reloaded.builds['build-3'].evaluationMode).toBe('dummy-300');
    expect(reloaded.builds['build-3'].rotationPotion).toBe('none');
    expect(reloaded.builds['build-3'].equippedSetEvaluation).toBeUndefined();
  });

  it('resets only the three-build workspace while preserving saved sets and custom items', async () => {
    const fallback = createInitialBuildWorkspaceState({
      expansion: 'dt',
      level: 100,
      job: 'WHM',
      constraints: { minResource: 440, minGcd: 2.41, maxGcd: 2.41, allowedSources: ['savage'], requiredItemIds: [], excludedItemIds: [], frontierLimit: 100 },
      gcdTarget: '2.41',
      selectedSet: structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'WHM')!),
      message: 'Ready.'
    });
    fallback.builds['build-1'].job = 'SCH';
    await saveBuildWorkspaceState(fallback);
    await saveSet({ ...structuredClone(fallback.builds['build-1'].selectedSet), id: 'reset-preserved-save' });
    const custom = structuredClone(gearSnapshot.items[0]!);
    custom.id = 'reset-preserved-custom';
    custom.origin = 'custom';
    await saveCustomItem(custom, 'body');

    await resetBuildWorkspaceState();
    const reloaded = await loadBuildWorkspaceState(createInitialBuildWorkspaceState({
      expansion: 'dt', level: 100, job: 'WHM', constraints: fallback.builds['build-1'].constraints,
      gcdTarget: '2.41', selectedSet: fallback.builds['build-1'].selectedSet, message: 'Fresh.'
    }));

    expect(reloaded.builds['build-1'].job).toBe('WHM');
    expect((await loadSavedSets()).some((set) => set.id === 'reset-preserved-save')).toBe(true);
    expect((await loadCustomItems()).some((record) => record.id === 'reset-preserved-custom')).toBe(true);
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
