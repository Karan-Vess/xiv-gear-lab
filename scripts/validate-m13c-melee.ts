import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type {
  CombatJob,
  GearSet,
  OptimizerConstraints
} from '@xiv-gear-lab/domain';
import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import {
  evaluateGearSetByRotation,
  rerankGearSetsByRotation
} from '@xiv-gear-lab/simulator/rerank-gearsets';

const deep = process.argv.includes('--deep');
const meleeTargets = [
  { job: 'MNK', targetGcd: 1.94 },
  { job: 'DRG', targetGcd: 2.50 },
  { job: 'NIN', targetGcd: 2.12 },
  { job: 'RPR', targetGcd: 2.49 },
  { job: 'VPR', targetGcd: 2.10 }
] as const satisfies ReadonlyArray<{ job: CombatJob; targetGcd: number }>;

const constraintsFor = (targetGcd: number): OptimizerConstraints => ({
  minResource: 0,
  minGcd: targetGcd,
  maxGcd: targetGcd,
  gcdMode: 'exact',
  gcdTargetName: `${targetGcd.toFixed(2)}s M13C melee validation target`,
  allowedSources: ['savage', 'tomestone-upgrade', 'tomestone', 'relic'],
  includeUpgradedTomestoneGear: true,
  includeAugmentedCraftedGear: true,
  itemLevelMode: 'any',
  minItemLevel: 780,
  maxItemLevel: 795,
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: deep ? 1800 : 500,
  foodMode: 'allowed',
  allowedMateriaStats: [...new Set(gearSnapshot.materia.map((materia) => materia.stat))],
  allowedMateriaTiers: [12, 11],
  allowOvermelds: false,
  allowCustomItems: false,
  allowExperimentalAccess: false,
  accessExpansion: 'dt',
  accessLevel: 100,
  searchMode: deep ? 'thorough' : 'quick'
});

const equippedEntries = (set: GearSet) => Object.entries(set.items)
  .sort(([left], [right]) => left.localeCompare(right));

const equippedSignature = (set: GearSet) => equippedEntries(set)
  .map(([slot, equipped]) => [
    slot,
    String(equipped?.itemId),
    equipped?.materiaIds,
    equipped?.relicStats ?? null
  ]);

const itemIds = (set: GearSet) => equippedEntries(set)
  .map(([, equipped]) => String(equipped?.itemId));

const percentGap = (value: number, reference: number) =>
  reference === 0 ? 0 : ((value / reference) - 1) * 100;

const ablatedSnapshot = structuredClone(gearSnapshot);
ablatedSnapshot.curatedSets = [];
const rows = [];
let failed = false;

for (const { job, targetGcd } of meleeTargets) {
  const constraints = constraintsFor(targetGcd);
  const normalSearch = optimizeCombatJob(gearSnapshot, constraints, job);
  const ablatedSearch = optimizeCombatJob(ablatedSnapshot, constraints, job);
  if (!normalSearch.finalists?.length || !ablatedSearch.finalists?.length) {
    throw new Error(`${job} produced no validation finalists.`);
  }

  const normal = rerankGearSetsByRotation(
    gearSnapshot,
    normalSearch.finalists,
    job,
    'dummy-300',
    'none',
    normalSearch.best?.id
  ).best;
  const ablated = rerankGearSetsByRotation(
    ablatedSnapshot,
    ablatedSearch.finalists,
    job,
    'dummy-300',
    'none',
    ablatedSearch.best?.id
  ).best;
  const community = gearSnapshot.curatedSets
    .filter((set) => set.job === job && set.metrics.gcd === targetGcd)
    .map((set) => ({
      set,
      rotation: evaluateGearSetByRotation(gearSnapshot, set, 'dummy-300', 'none')
    }))
    .sort((left, right) => right.rotation.totalDamage - left.rotation.totalDamage)[0];
  if (!community) {
    throw new Error(`${job} has no ${targetGcd.toFixed(2)}s community comparison set.`);
  }

  const overlap = itemIds(normal).filter((id) => itemIds(ablated).includes(id)).length;
  const row = {
    job,
    targetGcd,
    normal: {
      proxy: normal.metrics.expectedAction100,
      rotationDamage: normal.rotationEvaluation!.totalDamage,
      equipment: equippedSignature(normal)
    },
    curatedFree: {
      proxy: ablated.metrics.expectedAction100,
      rotationDamage: ablated.rotationEvaluation!.totalDamage,
      equipment: equippedSignature(ablated),
      itemOverlapWithNormal: overlap,
      slotCount: equippedEntries(ablated).length
    },
    community: {
      id: community.set.id,
      provider: community.set.provenance.find((entry) =>
        entry.kind === 'community-curated'
      )?.provider ?? 'Unknown',
      proxy: community.set.metrics.expectedAction100,
      rotationDamage: community.rotation.totalDamage
    },
    gapsPercent: {
      curatedFreeVsNormalProxy: percentGap(
        ablated.metrics.expectedAction100,
        normal.metrics.expectedAction100
      ),
      curatedFreeVsNormalRotation: percentGap(
        ablated.rotationEvaluation!.totalDamage,
        normal.rotationEvaluation!.totalDamage
      ),
      curatedFreeVsCommunityProxy: percentGap(
        ablated.metrics.expectedAction100,
        community.set.metrics.expectedAction100
      ),
      curatedFreeVsCommunityRotation: percentGap(
        ablated.rotationEvaluation!.totalDamage,
        community.rotation.totalDamage
      )
    },
    search: {
      normalTruncated: normalSearch.truncated,
      curatedFreeTruncated: ablatedSearch.truncated,
      normalStates: normalSearch.evaluatedStates,
      curatedFreeStates: ablatedSearch.evaluatedStates
    }
  };
  rows.push(row);

  const comparable =
    overlap >= 8 &&
    row.gapsPercent.curatedFreeVsCommunityProxy >= -1 &&
    row.gapsPercent.curatedFreeVsCommunityRotation >= -1;
  failed ||= !comparable;
  console.log(
    `${job} ${targetGcd.toFixed(2)}s: curated-free vs community ` +
    `${row.gapsPercent.curatedFreeVsCommunityProxy.toFixed(3)}% proxy, ` +
    `${row.gapsPercent.curatedFreeVsCommunityRotation.toFixed(3)}% rotation; ` +
    `${overlap}/${row.curatedFree.slotCount} items match normal`
  );
}

const report = {
  schemaVersion: 'm13c-melee-validation@1',
  generatedAt: new Date().toISOString(),
  snapshotId: gearSnapshot.manifest.id,
  snapshotPatch: gearSnapshot.manifest.gamePatch,
  mode: deep ? 'deep' : 'routine',
  note: 'Community values are recalculated by XIV Gear Lab for an apples-to-apples melee optimiser ablation. Job-owned trace assumptions and explicit omissions are recorded on each melee rotation profile.',
  rows
};
const output = resolve('artifacts/m13c-melee-validation.json');
await mkdir(resolve('artifacts'), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);

if (failed) {
  throw new Error('One or more curated-free melee results fell outside the declared M13C comparability threshold.');
}
