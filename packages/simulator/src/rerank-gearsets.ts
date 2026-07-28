import {
  getCombatEvaluatorProfileForSet,
  levelFormulaConstantsFor
} from '@xiv-gear-lab/calculations';
import type {
  CombatJob,
  GearSet,
  GearSnapshot,
  RotationEvaluationMode,
  RotationEvaluationSummary
} from '@xiv-gear-lab/domain';
import {
  buildRotationTimingCacheKey,
  type CombatEvaluationRequest,
  type CombatEvaluationResult
} from './index';
import {
  createPilotCombatEvaluatorRegistry,
  rescorePilotCombatTimeline
} from './pilot-evaluators';
import {
  CombatTimelineCache,
  type CombatTimelineTemplate
} from './timing-engine';

export interface GearSetRotationRerankControl {
  isCancelled(): boolean;
  reportProgress?(progress: number, candidateIndex: number, candidateCount: number): void;
}

export interface GearSetRotationRerankResult {
  best: GearSet;
  alternatives: GearSet[];
  evaluatedCandidates: number;
  durationMs: number;
  proxyBestSetId: string;
  winnerChanged: boolean;
  timelineCacheHits: number;
}

export const evaluateGearSetByRotation = (
  snapshot: GearSnapshot,
  set: GearSet,
  mode: RotationEvaluationMode,
  potion: 'none' | 'included',
  control: GearSetRotationRerankControl = { isCancelled: () => false }
): RotationEvaluationSummary => {
  const evaluated = rerankGearSetsByRotation(
    snapshot,
    [set],
    set.job,
    mode,
    potion,
    set.id,
    control
  );
  const summary = evaluated.best.rotationEvaluation;
  if (!summary) throw new Error(`The ${mode} evaluator returned no result for ${set.name}.`);
  return summary;
};

const rotationSummary = (
  evaluation: CombatEvaluationResult,
  rerankedCandidateCount: number,
  rerankDurationMs: number,
  proxyBestSetId: string,
  winnerChanged: boolean,
  timelineCacheHits: number
): RotationEvaluationSummary => ({
  mode: evaluation.mode,
  label: evaluation.label,
  durationMs: evaluation.durationMs,
  totalDamage: evaluation.totalDamage,
  dps: evaluation.dps,
  profileId: evaluation.profileId,
  profileVersion: evaluation.profileVersion,
  rulesetId: evaluation.rulesetId,
  gamePatch: evaluation.gamePatch,
  engineId: evaluation.engineId,
  method: {
    kind: evaluation.method.kind,
    confidence: evaluation.method.confidence,
    ...(evaluation.method.opener ? { openerId: evaluation.method.opener.id } : {}),
    ...(evaluation.method.warning ? { warning: evaluation.method.warning } : {})
  },
  actionCount: evaluation.summary.actionCount,
  gcdCount: evaluation.summary.gcdCount,
  ogcdCount: evaluation.summary.ogcdCount,
  clippedMs: evaluation.summary.clippedMs,
  references: evaluation.references.map((reference) => ({ ...reference })),
  limitation: evaluation.limitation,
  rerankedCandidateCount,
  rerankDurationMs,
  proxyBestSetId,
  winnerChanged,
  timelineCacheHits
});

export const rerankGearSetsByRotation = (
  snapshot: GearSnapshot,
  candidates: readonly GearSet[],
  job: CombatJob,
  mode: RotationEvaluationMode,
  potion: 'none' | 'included',
  proxyBestSetId = candidates[0]?.id,
  control: GearSetRotationRerankControl = { isCancelled: () => false }
): GearSetRotationRerankResult => {
  if (candidates.length === 0) throw new Error('Rotation reranking requires at least one finalist.');
  if (!proxyBestSetId) throw new Error('Rotation reranking requires a proxy-best set identity.');

  const profile = snapshot.rotationProfiles?.find((entry) =>
    entry.job === job &&
    entry.supportedModes.includes(mode) &&
    entry.rulesetId === candidates[0]!.calculationContext?.rulesetId
  );
  if (!profile) {
    throw new Error(`${mode} is not installed for ${job} under the selected ruleset.`);
  }
  const evaluator = createPilotCombatEvaluatorRegistry().requireFor(profile);
  const itemsById = new Map(snapshot.items.map((item) => [String(item.id), item]));
  const startedAt = performance.now();
  const evaluated: Array<{ set: GearSet; result: CombatEvaluationResult }> = [];
  const timelineCache = new CombatTimelineCache(Math.max(1, candidates.length));
  const metadataByTimingKey = new Map<string, CombatEvaluationResult>();
  let timelineCacheHits = 0;
  let lastProgress = -1;

  for (let index = 0; index < candidates.length; index += 1) {
    if (control.isCancelled()) throw new Error('Combat evaluation cancelled.');
    const set = candidates[index]!;
    if (set.job !== job) throw new Error(`Finalist ${set.id} belongs to ${set.job}, not ${job}.`);
    const damageProfile = getCombatEvaluatorProfileForSet(set, snapshot);
    const constants = levelFormulaConstantsFor(damageProfile);
    const weapon = itemsById.get(String(set.items.weapon?.itemId));
    if (!weapon || weapon.weaponDamage <= 0 || weapon.weaponDelayMs <= 0) {
      throw new Error(`Finalist ${set.id} has no usable weapon timing data.`);
    }
    const request: CombatEvaluationRequest = {
      mode,
      profile,
      combatStats: {
        stats: set.metrics.stats,
        weaponDamage: set.metrics.weaponDamage,
        weaponDelayMs: weapon.weaponDelayMs,
        speedStatValue: set.metrics.stats[damageProfile.speedStat],
        speedBaseSub: constants.baseSub,
        speedLevelDiv: constants.levelDiv,
        hastePercent: 0
      },
      openerPreference: 'auto',
      potion,
      includeTimeline: true
    };
    const timingKey = buildRotationTimingCacheKey(request);
    const cachedTimeline = timelineCache.get(timingKey);
    const cachedMetadata = metadataByTimingKey.get(timingKey);
    let result: CombatEvaluationResult;
    if (cachedTimeline && cachedMetadata) {
      timelineCacheHits += 1;
      const rescored = rescorePilotCombatTimeline(request, cachedTimeline);
      result = {
        ...cachedMetadata,
        totalDamage: rescored.totalDamage,
        dps: rescored.dps,
        summary: structuredClone(cachedTimeline.summary),
        timingCacheKey: timingKey
      };
      const aggregate = (index + 1) / candidates.length;
      lastProgress = aggregate;
      control.reportProgress?.(aggregate, index, candidates.length);
    } else {
      const simulated = evaluator.simulate(request, {
        isCancelled: control.isCancelled,
        reportProgress: (candidateProgress) => {
          const aggregate = (index + candidateProgress) / candidates.length;
          if (aggregate - lastProgress >= 0.01 || aggregate === 1) {
            lastProgress = aggregate;
            control.reportProgress?.(aggregate, index, candidates.length);
          }
        }
      });
      if (!simulated.timeline) {
        throw new Error(`Pilot evaluator ${simulated.engineId} did not return its requested timeline.`);
      }
      const template: CombatTimelineTemplate = {
        durationMs: simulated.durationMs,
        records: simulated.timeline.map(({ damage: _damage, ...record }) => structuredClone(record)),
        summary: structuredClone(simulated.summary)
      };
      timelineCache.set(timingKey, template);
      metadataByTimingKey.set(timingKey, { ...simulated, timeline: undefined });
      result = { ...simulated, timeline: undefined };
    }
    if (control.isCancelled()) throw new Error('Combat evaluation cancelled.');
    evaluated.push({ set, result });
  }

  evaluated.sort((left, right) => {
    const damage = right.result.totalDamage - left.result.totalDamage;
    if (damage !== 0) return damage;
    const proxy = right.set.metrics.expectedAction100 - left.set.metrics.expectedAction100;
    return proxy !== 0 ? proxy : left.set.id.localeCompare(right.set.id);
  });
  const durationMs = performance.now() - startedAt;
  const winnerChanged = evaluated[0]!.set.id !== proxyBestSetId;
  const labelled = evaluated.map(({ set, result }, index) => ({
    ...set,
    name: index === 0 ? `Best ${result.label.toLowerCase()} result` : `${result.label} alternative ${index + 1}`,
    rotationEvaluation: rotationSummary(
      result,
      evaluated.length,
      durationMs,
      proxyBestSetId,
      winnerChanged,
      timelineCacheHits
    )
  }));

  return {
    best: labelled[0]!,
    alternatives: labelled.slice(1, 4),
    evaluatedCandidates: evaluated.length,
    durationMs,
    proxyBestSetId,
    winnerChanged,
    timelineCacheHits
  };
};
