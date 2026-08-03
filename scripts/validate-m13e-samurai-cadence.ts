import { gearSnapshot } from '@xiv-gear-lab/data';
import type { OptimizerConstraints } from '@xiv-gear-lab/domain';
import {
  getCombatEvaluatorProfileForSet,
  levelFormulaConstantsFor
} from '@xiv-gear-lab/calculations';
import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import { createPilotCombatEvaluatorRegistry } from '@xiv-gear-lab/simulator/pilot-evaluators';
import { rerankGearSetsByRotation } from '@xiv-gear-lab/simulator/rerank-gearsets';

const constraintsFor = (
  minGcd: number,
  maxGcd: number,
  gcdMode: OptimizerConstraints['gcdMode']
): OptimizerConstraints => ({
  minResource: 0,
  minGcd,
  maxGcd,
  gcdMode,
  gcdTargetName: gcdMode === 'exact' ? `${minGcd.toFixed(2)}s cadence audit` : 'Broad cadence audit',
  allowedSources: [
    'crafted',
    'normal-raid',
    'savage',
    'tomestone',
    'tomestone-upgrade',
    'dungeon',
    'trial',
    'alliance-raid',
    'relic',
    'quest',
    'vendor'
  ],
  includeUpgradedTomestoneGear: true,
  includeAugmentedCraftedGear: true,
  itemLevelMode: 'any',
  minItemLevel: 780,
  maxItemLevel: 795,
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 1800,
  lockedItemIdsBySlot: {},
  lockedMateriaBySlot: {},
  foodMode: 'allowed',
  allowedMateriaStats: [...new Set(gearSnapshot.materia.map((materia) => materia.stat))],
  allowedMateriaTiers: [12, 11],
  allowOvermelds: true,
  allowCustomItems: false,
  allowExperimentalAccess: false,
  accessExpansion: 'dt',
  accessLevel: 100,
  searchMode: 'thorough'
});

const requestedTarget = process.argv.find((argument) => argument.startsWith('--target='));
const parsedTarget = requestedTarget ? Number(requestedTarget.slice('--target='.length)) : undefined;
if (parsedTarget !== undefined && !Number.isFinite(parsedTarget)) {
  throw new Error(`Invalid Samurai cadence target ${requestedTarget}.`);
}
const targets: readonly number[] = parsedTarget === undefined
  ? [2.08, 2.11, 2.14, 2.17]
  : [parsedTarget];
const results = [];
for (const target of targets) {
  const search = optimizeCombatJob(gearSnapshot, constraintsFor(target, target, 'exact'), 'SAM');
  if (!search.best || !search.finalists?.length) throw new Error(`No Samurai ${target.toFixed(2)}s finalists were found.`);
  const reranked = rerankGearSetsByRotation(
    gearSnapshot,
    search.finalists,
    'SAM',
    'dummy-300',
    'none',
    search.best.id
  );
  const cadence = reranked.best.rotationEvaluation?.cadence;
  if (!cadence) throw new Error(`Samurai ${target.toFixed(2)}s produced no cadence diagnostics.`);
  const damageProfile = getCombatEvaluatorProfileForSet(reranked.best, gearSnapshot);
  const constants = levelFormulaConstantsFor(damageProfile);
  const weapon = gearSnapshot.items.find((item) => String(item.id) === String(reranked.best.items.weapon?.itemId))!;
  const profile = gearSnapshot.rotationProfiles!.find((entry) => entry.job === 'SAM')!;
  const evaluator = createPilotCombatEvaluatorRegistry().requireFor(profile);
  const request = {
    mode: 'dummy-300',
    profile,
    combatStats: {
      stats: reranked.best.metrics.stats,
      weaponDamage: reranked.best.metrics.weaponDamage,
      weaponDelayMs: weapon.weaponDelayMs,
      speedStatValue: reranked.best.metrics.stats.skillSpeed,
      speedBaseSub: constants.baseSub,
      speedLevelDiv: constants.levelDiv,
      hastePercent: 0
    },
    openerPreference: 'auto',
    potion: 'none',
    includeTimeline: true
  } as const;
  const simulation = evaluator.simulate(request, { isCancelled: () => false });
  const stabilitySimulation = evaluator.simulate({
    ...request,
    durationOverrideMs: 510_000
  }, { isCancelled: () => false });
  const importantActions = [
    'sam-higanbana',
    'sam-midare',
    'sam-tendo-setsugekka',
    'sam-meikyo-shisui',
    'sam-senei',
    'sam-shinten'
  ];
  const actionCounts = Object.fromEntries(importantActions.map((actionId) => [
    actionId,
    simulation.timeline!.filter((record) => record.source === 'player' && record.actionId === actionId).length
  ]));
  const stabilityActionCounts = Object.fromEntries(importantActions.map((actionId) => [
    actionId,
    stabilitySimulation.timeline!.filter((record) => record.source === 'player' && record.actionId === actionId).length
  ]));
  results.push({
    target,
    achievedGcd: reranked.best.metrics.gcd,
    dps300: reranked.best.rotationEvaluation!.dps,
    earlyHiganbanaMs: cadence.dotEarlyRefreshMs,
    lateHiganbanaMs: cadence.dotLateRefreshMs,
    missedHiganbanaTicks: cadence.missedDotTicks,
    cooldownDriftMs: cadence.cooldownDriftMs,
    actionCount: simulation.summary.actionCount,
    gcdCount: simulation.summary.gcdCount,
    actionCounts,
    stabilityActionCounts,
    stability: reranked.stability
  });
}

const strongestExact = [...results].sort((left, right) => right.dps300 - left.dps300)[0]!;
console.table(results);
if (parsedTarget !== undefined) {
  console.log(JSON.stringify(results[0], null, 2));
  process.exit(0);
}

const broadSearch = optimizeCombatJob(gearSnapshot, constraintsFor(1.5, 2.5, 'range'), 'SAM');
if (!broadSearch.best || !broadSearch.finalists?.length) throw new Error('No broad Samurai finalists were found.');
const broad = rerankGearSetsByRotation(
  gearSnapshot,
  broadSearch.finalists,
  'SAM',
  'dummy-300',
  'none',
  broadSearch.best.id
);
if (broad.best.rotationEvaluation!.dps + 0.000001 < strongestExact.dps300) {
  throw new Error(
    `Broad Samurai search scored ${broad.best.rotationEvaluation!.dps.toFixed(3)} DPS, below the retained exact ${strongestExact.target.toFixed(2)}s result at ${strongestExact.dps300.toFixed(3)} DPS.`
  );
}
const twoEleven = results.find((result) => result.target === 2.11)!;
const twoFourteen = results.find((result) => result.target === 2.14)!;
if (
  twoEleven.dps300 >= twoFourteen.dps300 ||
  twoEleven.missedHiganbanaTicks <= twoFourteen.missedHiganbanaTicks
) {
  throw new Error('The Samurai cadence audit no longer exposes the expected 2.11s Higanbana alignment loss relative to 2.14s.');
}

console.log(JSON.stringify({
  broad: {
    gcd: broad.best.metrics.gcd,
    dps300: broad.best.rotationEvaluation!.dps,
    cadence: broad.best.rotationEvaluation!.cadence,
    stability: broad.stability
  },
  strongestExact
}, null, 2));
