import { emptyStats, type EquipmentItem, type GearSet, type GearSlot } from '@xiv-gear-lab/domain';
import {
  isBuildWorkspaceState,
  prepareBuildWorkspaceStateForStorage,
  type BuildWorkspaceState
} from './workspace';

const DATABASE = 'xiv-gear-lab';
const DATABASE_VERSION = 5;
const SAVED_SET_STORE = 'saved-sets';
const CUSTOM_ITEM_STORE = 'custom-items';
const METADATA_STORE = 'metadata';
const WORKSPACE_STORE = 'workspaces';

const LEGACY_CALCULATION_CONTEXT = {
  status: 'unknown',
  reason: 'saved-before-calculation-context',
  message: 'This set predates calculation-version tracking. Its stored values were preserved without guessing which data or formula produced them.'
} as const;

const markLegacyCalculationContext = (set: GearSet): GearSet =>
  set.calculationContext || set.legacyCalculationContext
    ? set
    : { ...set, legacyCalculationContext: LEGACY_CALCULATION_CONTEXT };

export interface StoredCustomItem {
  id: string;
  item: EquipmentItem;
  preferredSlot: GearSlot;
}

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      if (!request.result.objectStoreNames.contains(SAVED_SET_STORE)) {
        request.result.createObjectStore(SAVED_SET_STORE, { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains(CUSTOM_ITEM_STORE)) {
        request.result.createObjectStore(CUSTOM_ITEM_STORE, { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains(METADATA_STORE)) {
        request.result.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
      if (!request.result.objectStoreNames.contains(WORKSPACE_STORE)) {
        request.result.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' });
      }
      const transaction = request.transaction;
      if (!transaction) return;
      if ((event.oldVersion ?? 0) < 4 && request.result.objectStoreNames.contains(SAVED_SET_STORE)) {
        const cursorRequest = transaction.objectStore(SAVED_SET_STORE).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const set = cursor.value as GearSet;
          const migrated = markLegacyCalculationContext(set);
          if (migrated !== set) cursor.update(migrated);
          cursor.continue();
        };
      }
      transaction.objectStore(METADATA_STORE).put({
        key: 'schema',
        databaseVersion: DATABASE_VERSION,
        savedSetSchema: 'saved-gear-set@2',
        customItemSchema: 'custom-item@1',
        workspaceSchema: 'build-workspace-state@1'
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
  });

export const saveSet = async (set: GearSet): Promise<void> => {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SAVED_SET_STORE, 'readwrite');
    transaction.objectStore(SAVED_SET_STORE).put({ ...set, origin: 'saved' });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the set.'));
  });
  database.close();
};

export const loadSavedSets = async (): Promise<GearSet[]> => {
  const database = await openDatabase();
  const result = await new Promise<GearSet[]>((resolve, reject) => {
    const request = database.transaction(SAVED_SET_STORE, 'readonly').objectStore(SAVED_SET_STORE).getAll();
    request.onsuccess = () => resolve(request.result as GearSet[]);
    request.onerror = () => reject(request.error ?? new Error('Could not load saved sets.'));
  });
  database.close();
  return result.map((storedSet) => {
    const set = markLegacyCalculationContext(storedSet);
    return {
      ...set,
      metrics: { ...set.metrics, stats: { ...emptyStats(), ...set.metrics.stats } }
    };
  });
};

export const pinnedSnapshotIdsForSavedSets = (sets: GearSet[]): string[] =>
  [...new Set(sets.flatMap((set) => set.calculationContext?.snapshotId ? [set.calculationContext.snapshotId] : []))];

export const deleteSavedSet = async (id: string): Promise<void> => {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SAVED_SET_STORE, 'readwrite');
    transaction.objectStore(SAVED_SET_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete the set.'));
  });
  database.close();
};

export const saveCustomItem = async (item: EquipmentItem, preferredSlot: GearSlot): Promise<void> => {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CUSTOM_ITEM_STORE, 'readwrite');
    const record: StoredCustomItem = { id: String(item.id), item, preferredSlot };
    transaction.objectStore(CUSTOM_ITEM_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the custom item.'));
  });
  database.close();
};

export const loadCustomItems = async (): Promise<StoredCustomItem[]> => {
  const database = await openDatabase();
  const result = await new Promise<StoredCustomItem[]>((resolve, reject) => {
    const request = database.transaction(CUSTOM_ITEM_STORE, 'readonly').objectStore(CUSTOM_ITEM_STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredCustomItem[]);
    request.onerror = () => reject(request.error ?? new Error('Could not load custom items.'));
  });
  database.close();
  return result.map((record) => ({
    ...record,
    item: {
      ...record.item,
      stats: { ...emptyStats(), ...record.item.stats },
      statCaps: { ...emptyStats(), ...record.item.statCaps }
    }
  }));
};

export const deleteCustomItem = async (id: number | string): Promise<void> => {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CUSTOM_ITEM_STORE, 'readwrite');
    transaction.objectStore(CUSTOM_ITEM_STORE).delete(String(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete the custom item.'));
  });
  database.close();
};

export const saveBuildWorkspaceState = async (state: BuildWorkspaceState): Promise<void> => {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WORKSPACE_STORE, 'readwrite');
    transaction.objectStore(WORKSPACE_STORE).put(prepareBuildWorkspaceStateForStorage(state));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save build workspaces.'));
  });
  database.close();
};

export const loadBuildWorkspaceState = async (
  fallback: BuildWorkspaceState
): Promise<BuildWorkspaceState> => {
  const database = await openDatabase();
  const stored = await new Promise<unknown>((resolve, reject) => {
    const request = database.transaction(WORKSPACE_STORE, 'readonly').objectStore(WORKSPACE_STORE).get('primary');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not load build workspaces.'));
  });
  database.close();
  if (!stored) {
    await saveBuildWorkspaceState(fallback);
    return fallback;
  }
  if (!isBuildWorkspaceState(stored)) {
    throw new Error('Stored build workspaces use an unsupported or malformed schema.');
  }
  return prepareBuildWorkspaceStateForStorage(stored);
};
