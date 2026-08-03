import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getCombatEvaluatorProfileForSet,
  levelFormulaConstantsFor
} from '@xiv-gear-lab/calculations';
import { CURRENT_ROTATION_PROFILES, gearSnapshot } from '@xiv-gear-lab/data';
import type { CombatJob, GearSet } from '@xiv-gear-lab/domain';
import { createPilotCombatEvaluatorRegistry } from '@xiv-gear-lab/simulator/pilot-evaluators';

const healerJobs = ['WHM', 'SCH', 'AST', 'SGE'] as const satisfies readonly CombatJob[];
const itemsById = new Map(gearSnapshot.items.map((item) => [String(item.id), item]));
const registry = createPilotCombatEvaluatorRegistry();

const representativeSet = (job: CombatJob): GearSet => {
  const set = gearSnapshot.curatedSets.find((candidate) =>
    candidate.job === job &&
    candidate.calculationContext?.rulesetId === 'dt-7.51-level-100-standard@1'
  );
  if (!set) throw new Error(`No current representative set is available for ${job}.`);
  return set;
};

const rows = [];
for (const job of healerJobs) {
  const set = representativeSet(job);
  const profile = CURRENT_ROTATION_PROFILES.find((candidate) => candidate.job === job)!;
  const evaluator = registry.requireFor(profile);
  const damageProfile = getCombatEvaluatorProfileForSet(set, gearSnapshot);
  const constants = levelFormulaConstantsFor(damageProfile);
  const weapon = itemsById.get(String(set.items.weapon?.itemId));
  if (!weapon?.weaponDelayMs) throw new Error(`${job} representative set has no weapon delay.`);

  const evaluate = (durationMs: number, piety: number) => evaluator.simulate({
    mode: 'dummy-300',
    ...(durationMs === 300_000 ? {} : { durationOverrideMs: durationMs }),
    profile,
    combatStats: {
      stats: { ...set.metrics.stats, piety },
      weaponDamage: set.metrics.weaponDamage,
      weaponDelayMs: weapon.weaponDelayMs,
      speedStatValue: set.metrics.stats[damageProfile.speedStat],
      speedBaseSub: constants.baseSub,
      speedLevelDiv: constants.levelDiv,
      hastePercent: 0
    },
    openerPreference: 'auto',
    potion: 'none',
    includeTimeline: true,
    rotationAffectingStats: { piety }
  }, { isCancelled: () => false });

  const basePiety = set.metrics.stats.piety;
  const highPiety = basePiety + 1400;
  const base300 = evaluate(300_000, basePiety);
  const base510 = evaluate(510_000, basePiety);
  const high510 = evaluate(510_000, highPiety);
  const actionCount = (actionId: string) => base510.timeline?.filter((record) =>
    record.source === 'player' && record.actionId === actionId
  ).length ?? 0;

  if (base300.summary.finalResources.mp < 0 || base510.summary.finalResources.mp < 0) {
    throw new Error(`${job} produced negative MP.`);
  }
  if (actionCount('healer-lucid-dreaming') < 1) {
    throw new Error(`${job} did not use Lucid Dreaming in the long-window audit.`);
  }
  if (high510.timingCacheKey === base510.timingCacheKey) {
    throw new Error(`${job} Piety did not invalidate the timing cache identity.`);
  }
  if (high510.summary.gcdCount < base510.summary.gcdCount || high510.totalDamage < base510.totalDamage) {
    throw new Error(`${job} gained Piety but lost executable actions or damage.`);
  }

  rows.push({
    job,
    gcd: set.metrics.gcd,
    basePiety,
    highPiety,
    base300: {
      damage: base300.totalDamage,
      gcdCount: base300.summary.gcdCount,
      finalMp: base300.summary.finalResources.mp
    },
    base510: {
      damage: base510.totalDamage,
      gcdCount: base510.summary.gcdCount,
      finalMp: base510.summary.finalResources.mp,
      lucidUses: actionCount('healer-lucid-dreaming'),
      assizeUses: actionCount('whm-assize'),
      aetherflowUses: actionCount('sch-aetherflow'),
      drawUses: actionCount('ast-draw')
    },
    high510: {
      damage: high510.totalDamage,
      gcdCount: high510.summary.gcdCount,
      finalMp: high510.summary.finalResources.mp
    }
  });

  console.log(
    `${job}: ${base510.summary.gcdCount} GCDs / ${base510.summary.finalResources.mp} MP at base Piety; ` +
    `${high510.summary.gcdCount} GCDs / ${high510.summary.finalResources.mp} MP at +1400 Piety`
  );
}

const sage = rows.find((row) => row.job === 'SGE')!;
if (sage.high510.damage <= sage.base510.damage) {
  throw new Error('The 510-second Sage fixture did not expose a Piety-dependent sustainability difference.');
}

const report = {
  schemaVersion: 'm13e-healer-sustainability@1',
  generatedAt: new Date().toISOString(),
  snapshotId: gearSnapshot.manifest.id,
  snapshotPatch: gearSnapshot.manifest.gamePatch,
  assumptions: {
    durationMs: [300_000, 510_000],
    naturalMpTickMs: 3000,
    lucidRefreshPotency: 55,
    lucidExpectedMpPerTick: 550,
    lucidTickCount: 7,
    highPietyDelta: 1400
  },
  rows
};
const output = resolve('artifacts/m13e-healer-sustainability.json');
await mkdir(resolve('artifacts'), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);
