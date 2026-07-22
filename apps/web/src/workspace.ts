import type {
  CombatJob,
  EquippedItem,
  EvaluationMode,
  ExpansionId,
  GearSet,
  GearSlot,
  OptimizerConstraints
} from '@xiv-gear-lab/domain';
import type { OptimizerResult } from '@xiv-gear-lab/optimizer';

export const BUILD_IDS = ['build-1', 'build-2', 'build-3'] as const;
export type BuildId = (typeof BUILD_IDS)[number];
export type WorkspaceTab = BuildId | 'comparison';
export type WorkspaceRunState = 'idle' | 'running' | 'done' | 'error';

export interface CustomItemFallback {
  slot: GearSlot;
  equipped?: EquippedItem;
}

export interface BuildWorkspace {
  schemaVersion: 'build-workspace@1';
  id: BuildId;
  name: string;
  expansion: ExpansionId;
  level: number;
  job: CombatJob;
  jobMode: string;
  evaluationMode: EvaluationMode;
  constraints: OptimizerConstraints;
  gcdTarget: string;
  selectedSet: GearSet;
  result?: OptimizerResult;
  previousOptimizedSet?: GearSet;
  customFallbacks: Record<string, CustomItemFallback>;
  runState: WorkspaceRunState;
  message: string;
  updatedAt: string;
}

export interface BuildWorkspaceState {
  id: 'primary';
  schemaVersion: 'build-workspace-state@1';
  activeTab: WorkspaceTab;
  activeBuildId: BuildId;
  baselineBuildId: BuildId;
  builds: Record<BuildId, BuildWorkspace>;
  updatedAt: string;
}

export interface InitialBuildWorkspaceOptions {
  expansion: ExpansionId;
  level: number;
  job: CombatJob;
  constraints: OptimizerConstraints;
  gcdTarget: string;
  selectedSet: GearSet;
  message: string;
}

export interface ExpansionConstraintContext {
  minimumResource: number;
  materiaTiers: number[];
  lockedFoodIsAvailable: boolean;
  hasAvailableFood: boolean;
  materiaCatalogueVersion: string;
}

const clone = <T,>(value: T): T => structuredClone(value);

export const constraintsForExpansion = (
  constraints: OptimizerConstraints,
  context: ExpansionConstraintContext
): OptimizerConstraints => {
  const selectedTiers = constraints.allowedMateriaTiers;
  const compatibleSelection = selectedTiers?.filter((tier) => context.materiaTiers.includes(tier)) ?? [];
  const allowedMateriaTiers = selectedTiers?.length === 0
    ? []
    : compatibleSelection.length > 0
      ? compatibleSelection
      : [...context.materiaTiers];
  const lockedFoodBecameUnavailable = constraints.foodMode === 'locked' && !context.lockedFoodIsAvailable;

  return {
    ...constraints,
    minResource: context.minimumResource,
    allowedMateriaTiers,
    materiaCatalogueVersion: context.materiaCatalogueVersion,
    foodMode: lockedFoodBecameUnavailable
      ? context.hasAvailableFood ? 'allowed' : 'none'
      : constraints.foodMode,
    lockedFoodId: lockedFoodBecameUnavailable ? undefined : constraints.lockedFoodId
  };
};

const createBuild = (
  id: BuildId,
  index: number,
  options: InitialBuildWorkspaceOptions,
  now: string
): BuildWorkspace => ({
  schemaVersion: 'build-workspace@1',
  id,
  name: `Build ${index + 1}`,
  expansion: options.expansion,
  level: options.level,
  job: options.job,
  jobMode: 'standard',
  evaluationMode: 'generic-hit',
  constraints: clone(options.constraints),
  gcdTarget: options.gcdTarget,
  selectedSet: clone(options.selectedSet),
  customFallbacks: {},
  runState: 'idle',
  message: index === 0 ? options.message : `Build ${index + 1} is ready for an independent brief.`,
  updatedAt: now
});

export const createInitialBuildWorkspaceState = (
  options: InitialBuildWorkspaceOptions,
  now = new Date().toISOString()
): BuildWorkspaceState => ({
  id: 'primary',
  schemaVersion: 'build-workspace-state@1',
  activeTab: 'build-1',
  activeBuildId: 'build-1',
  baselineBuildId: 'build-1',
  builds: Object.fromEntries(
    BUILD_IDS.map((id, index) => [id, createBuild(id, index, options, now)])
  ) as Record<BuildId, BuildWorkspace>,
  updatedAt: now
});

export const isBuildId = (value: unknown): value is BuildId =>
  typeof value === 'string' && BUILD_IDS.includes(value as BuildId);

export const isBuildWorkspaceState = (value: unknown): value is BuildWorkspaceState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BuildWorkspaceState>;
  if (
    candidate.id !== 'primary' ||
    candidate.schemaVersion !== 'build-workspace-state@1' ||
    !candidate.builds ||
    !isBuildId(candidate.activeBuildId) ||
    !isBuildId(candidate.baselineBuildId) ||
    !(candidate.activeTab === 'comparison' || isBuildId(candidate.activeTab))
  ) return false;

  return BUILD_IDS.every((id) => {
    const build = candidate.builds?.[id];
    return Boolean(
      build &&
      build.schemaVersion === 'build-workspace@1' &&
      build.id === id &&
      typeof build.job === 'string' &&
      typeof build.gcdTarget === 'string' &&
      build.selectedSet &&
      build.constraints &&
      Array.isArray(build.constraints.allowedSources) &&
      build.customFallbacks
    );
  });
};

export const prepareBuildWorkspaceStateForStorage = (
  state: BuildWorkspaceState,
  now = new Date().toISOString()
): BuildWorkspaceState => ({
  ...state,
  builds: Object.fromEntries(BUILD_IDS.map((id) => {
    const build = state.builds[id];
    return [id, {
      ...build,
      runState: build.runState === 'running' ? 'idle' : build.runState,
      message: build.runState === 'running'
        ? 'The previous search ended when the application closed. Its constraints were preserved.'
        : build.message
    }];
  })) as Record<BuildId, BuildWorkspace>,
  updatedAt: now
});

export const workspaceSnapshotIds = (state: BuildWorkspaceState): string[] => {
  const ids = BUILD_IDS.flatMap((id) => {
    const build = state.builds[id];
    const sets = [
      build.selectedSet,
      build.previousOptimizedSet,
      build.result?.best,
      ...(build.result?.alternatives ?? [])
    ];
    return sets.flatMap((set) => set?.calculationContext?.snapshotId ? [set.calculationContext.snapshotId] : []);
  });
  return [...new Set(ids)].sort();
};

export const buildUsesItem = (build: BuildWorkspace, itemId: number | string): boolean =>
  Object.values(build.selectedSet.items).some((entry) => String(entry?.itemId) === String(itemId));

export const workspaceBuildsUsingItem = (
  state: BuildWorkspaceState,
  itemId: number | string
): BuildWorkspace[] => BUILD_IDS.map((id) => state.builds[id]).filter((build) => buildUsesItem(build, itemId));

export const copyBuildLoadout = (
  state: BuildWorkspaceState,
  sourceId: BuildId,
  targetId: BuildId,
  minimumResource: number,
  now = new Date().toISOString()
): BuildWorkspaceState => {
  if (sourceId === targetId) return state;
  const source = state.builds[sourceId];
  const target = state.builds[targetId];
  return {
    ...state,
    builds: {
      ...state.builds,
      [sourceId]: {
        ...source,
        message: `Current loadout copied to ${target.name}.`,
        updatedAt: now
      },
      [targetId]: {
        ...target,
        job: source.job,
        jobMode: source.jobMode,
        evaluationMode: source.evaluationMode,
        constraints: { ...clone(target.constraints), minResource: minimumResource },
        gcdTarget: source.gcdTarget,
        selectedSet: clone(source.selectedSet),
        result: undefined,
        previousOptimizedSet: undefined,
        customFallbacks: clone(source.customFallbacks),
        runState: 'idle',
        message: `Loadout copied from ${source.name}. Expansion, level and acquisition restrictions from ${target.name} were retained.`,
        updatedAt: now
      }
    },
    updatedAt: now
  };
};
