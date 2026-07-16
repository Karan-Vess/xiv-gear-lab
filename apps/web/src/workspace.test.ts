import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { OptimizerConstraints } from '@xiv-gear-lab/domain';
import {
  createInitialBuildWorkspaceState,
  copyBuildLoadout,
  isBuildWorkspaceState,
  prepareBuildWorkspaceStateForStorage,
  workspaceBuildsUsingItem,
  workspaceSnapshotIds
} from './workspace';

const constraints: OptimizerConstraints = {
  minResource: 440,
  minGcd: 2.41,
  maxGcd: 2.41,
  allowedSources: ['savage', 'tomestone', 'tomestone-upgrade'],
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 1_800
};

const createState = () => createInitialBuildWorkspaceState({
  expansion: 'dawntrail',
  level: 100,
  job: 'WHM',
  constraints,
  gcdTarget: '2.41',
  selectedSet: gearSnapshot.curatedSets.find((set) => set.job === 'WHM')!,
  message: 'Ready.'
}, '2026-07-16T00:00:00.000Z');

describe('build workspaces', () => {
  it('creates three deep-independent builds from the existing default workspace', () => {
    const state = createState();
    state.builds['build-1'].constraints.allowedSources.pop();
    state.builds['build-1'].selectedSet.name = 'Changed only in build 1';

    expect(state.builds['build-2'].constraints.allowedSources).toHaveLength(3);
    expect(state.builds['build-2'].selectedSet.name).not.toBe('Changed only in build 1');
    expect(isBuildWorkspaceState(state)).toBe(true);
  });

  it('normalises interrupted searches before persistence without discarding results', () => {
    const state = createState();
    state.builds['build-2'].runState = 'running';
    state.builds['build-2'].result = { alternatives: [], evaluatedStates: 12, durationMs: 5, truncated: false, explanation: ['test'] };
    const stored = prepareBuildWorkspaceStateForStorage(state, '2026-07-16T01:00:00.000Z');

    expect(stored.builds['build-2'].runState).toBe('idle');
    expect(stored.builds['build-2'].result?.evaluatedStates).toBe(12);
    expect(stored.builds['build-2'].message).toContain('application closed');
  });

  it('tracks snapshot pins and item use across all builds', () => {
    const state = createState();
    const itemId = state.builds['build-1'].selectedSet.items.head!.itemId;
    delete state.builds['build-2'].selectedSet.items.head;

    expect(workspaceBuildsUsingItem(state, itemId).map((build) => build.name)).toEqual(['Build 1', 'Build 3']);
    expect(workspaceSnapshotIds(state)).toEqual([gearSnapshot.manifest.id]);
  });

  it('copies a loadout independently while retaining destination access and acquisition restrictions', () => {
    const state = createState();
    state.builds['build-1'].job = 'MNK';
    state.builds['build-1'].gcdTarget = '1.94';
    state.builds['build-1'].selectedSet = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'MNK')!);
    state.builds['build-1'].customFallbacks.custom = { slot: 'body' };
    state.builds['build-2'].expansion = 'endwalker';
    state.builds['build-2'].level = 90;
    state.builds['build-2'].constraints.allowedSources = ['tomestone'];
    state.builds['build-2'].result = { alternatives: [], evaluatedStates: 4, durationMs: 1, truncated: false, explanation: [] };

    const copied = copyBuildLoadout(state, 'build-1', 'build-2', 0, '2026-07-16T02:00:00.000Z');

    expect(copied.builds['build-2'].job).toBe('MNK');
    expect(copied.builds['build-2'].gcdTarget).toBe('1.94');
    expect(copied.builds['build-2'].selectedSet.name).toBe(state.builds['build-1'].selectedSet.name);
    expect(copied.builds['build-2'].expansion).toBe('endwalker');
    expect(copied.builds['build-2'].level).toBe(90);
    expect(copied.builds['build-2'].constraints.allowedSources).toEqual(['tomestone']);
    expect(copied.builds['build-2'].result).toBeUndefined();
    copied.builds['build-2'].selectedSet.name = 'Destination-only edit';
    expect(copied.builds['build-1'].selectedSet.name).not.toBe('Destination-only edit');
  });
});
