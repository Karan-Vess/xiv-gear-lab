import {
  CRAFTER_JOBS,
  CRAFTER_SOURCE_FAMILIES,
  CRAFTING_STAT_KEYS,
  emptyCraftingStats,
  type CrafterConstraints,
  type CrafterJob,
  type NonCombatDiscipline
} from '@xiv-gear-lab/domain';

export type ApplicationMode = 'combat' | 'non-combat';

export interface NonCombatWorkspaceState {
  schemaVersion: 'non-combat-workspace@1';
  discipline: NonCombatDiscipline;
  crafter: CrafterConstraints;
}

const MODE_STORAGE_KEY = 'xiv-gear-lab:application-mode@1';
const WORKSPACE_STORAGE_KEY = 'xiv-gear-lab:non-combat-workspace@1';

export const createInitialCrafterConstraints = (): CrafterConstraints => ({
  schemaVersion: 'crafter-constraints@1',
  job: 'CRP',
  level: 100,
  allowedSources: [...CRAFTER_SOURCE_FAMILIES],
  lockedItemIdsBySlot: {},
  excludedItemIds: [],
  minimumStats: emptyCraftingStats(),
  foodMode: 'automatic',
  medicineMode: 'none',
  allowedMateriaStats: [...CRAFTING_STAT_KEYS],
  allowedMateriaGrades: [],
  allowAdvancedMelding: true,
  objective: 'balanced'
});

export const createInitialNonCombatWorkspace = (): NonCombatWorkspaceState => ({
  schemaVersion: 'non-combat-workspace@1',
  discipline: 'crafting',
  crafter: createInitialCrafterConstraints()
});

export const readApplicationMode = (storage: Pick<Storage, 'getItem'>): ApplicationMode =>
  storage.getItem(MODE_STORAGE_KEY) === 'non-combat' ? 'non-combat' : 'combat';

export const writeApplicationMode = (
  storage: Pick<Storage, 'setItem'>,
  mode: ApplicationMode
): void => {
  try {
    storage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be disabled by the browser or an embedded desktop policy.
  }
};

const finiteNonNegativeInteger = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

export const migrateNonCombatWorkspace = (value: unknown): NonCombatWorkspaceState | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<NonCombatWorkspaceState>;
  const crafter = candidate.crafter as Partial<CrafterConstraints> | undefined;
  if (candidate.schemaVersion !== 'non-combat-workspace@1' || !crafter) return undefined;
  const defaults = createInitialCrafterConstraints();
  const job: CrafterJob = typeof crafter.job === 'string' && CRAFTER_JOBS.includes(crafter.job as CrafterJob)
    ? crafter.job as CrafterJob
    : defaults.job;
  return {
    schemaVersion: 'non-combat-workspace@1',
    discipline: candidate.discipline === 'gathering' ? 'gathering' : 'crafting',
    crafter: {
      ...defaults,
      ...crafter,
      schemaVersion: 'crafter-constraints@1',
      job,
      level: finiteNonNegativeInteger(crafter.level, defaults.level),
      allowedSources: Array.isArray(crafter.allowedSources)
        ? crafter.allowedSources.filter((source) => CRAFTER_SOURCE_FAMILIES.includes(source))
        : defaults.allowedSources,
      lockedItemIdsBySlot: crafter.lockedItemIdsBySlot ?? {},
      excludedItemIds: Array.isArray(crafter.excludedItemIds) ? crafter.excludedItemIds : [],
      minimumStats: {
        craftsmanship: finiteNonNegativeInteger(crafter.minimumStats?.craftsmanship, 0),
        control: finiteNonNegativeInteger(crafter.minimumStats?.control, 0),
        cp: finiteNonNegativeInteger(crafter.minimumStats?.cp, 0)
      },
      allowedMateriaStats: Array.isArray(crafter.allowedMateriaStats)
        ? crafter.allowedMateriaStats.filter((stat) => CRAFTING_STAT_KEYS.includes(stat))
        : defaults.allowedMateriaStats,
      allowedMateriaGrades: Array.isArray(crafter.allowedMateriaGrades)
        ? crafter.allowedMateriaGrades.filter((grade) => Number.isInteger(grade) && grade > 0)
        : []
    }
  };
};

export const readNonCombatWorkspace = (storage: Pick<Storage, 'getItem'>): NonCombatWorkspaceState => {
  try {
    const stored = storage.getItem(WORKSPACE_STORAGE_KEY);
    return stored ? migrateNonCombatWorkspace(JSON.parse(stored)) ?? createInitialNonCombatWorkspace() : createInitialNonCombatWorkspace();
  } catch {
    return createInitialNonCombatWorkspace();
  }
};

export const writeNonCombatWorkspace = (
  storage: Pick<Storage, 'setItem'>,
  state: NonCombatWorkspaceState
): void => {
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory workspace remains usable when persistent storage is unavailable.
  }
};
