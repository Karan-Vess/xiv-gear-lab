import {
  getCombatEvaluatorProfileForSet,
  levelFormulaConstantsFor
} from '@xiv-gear-lab/calculations';
import type {
  CombatJob,
  CombatRotationProfile,
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
  stability?: RotationStabilityAudit;
}

export interface RotationStabilityAudit {
  durationMs: number;
  selectedSetDps: number;
  bestSetId: string;
  bestSetGcd: number;
  bestDps: number;
  winnerChanged: boolean;
  gapToBestPercent: number;
}

export const ROTATION_STABILITY_DURATION_MS = 510_000;

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
  timelineCacheHits: number,
  stability: RotationStabilityAudit | undefined,
  profile: CombatRotationProfile
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
  ...(evaluation.summary.finalResources.mp !== undefined ? {
    sustainability: {
      finalMp: evaluation.summary.finalResources.mp,
      overcappedMp: evaluation.summary.overcappedResources.mp ?? 0
    }
  } : {}),
  cadence: {
    cooldownDriftMs: Object.entries(evaluation.summary.driftMsByAction)
      .filter(([actionId]) => {
        const action = profile.actions.find((entry) => entry.id === actionId);
        const cooldownMs = action?.cooldownMs ?? (action?.kind === 'ogcd' ? action.recastMs : 0);
        return cooldownMs >= 30_000;
      })
      .reduce((total, [, drift]) => total + drift, 0),
    dotEarlyRefreshMs: Object.values(evaluation.summary.dotCadenceById)
      .reduce((total, cadence) => total + cadence.earlyRefreshMs, 0),
    dotLateRefreshMs: Object.values(evaluation.summary.dotCadenceById)
      .reduce((total, cadence) => total + cadence.lateRefreshMs, 0),
    missedDotTicks: Object.values(evaluation.summary.dotCadenceById)
      .reduce((total, cadence) => total + cadence.missedTicks, 0),
    pendingApplicationCount: Object.values(evaluation.summary.pendingApplicationsByAction)
      .reduce((total, count) => total + count, 0),
    pendingApplicationPotency: evaluation.summary.pendingApplicationPotency
  },
  ...(stability ? { stability } : {}),
  references: evaluation.references.map((reference) => ({ ...reference })),
  ...(evaluation.validation ? { validation: structuredClone(evaluation.validation) } : {}),
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

  const pinnedGenericProfile = snapshot.evaluatorProfiles.find((entry) =>
    entry.id === candidates[0]!.calculationContext?.evaluatorProfileId
  );
  const jobMode = candidates[0]!.calculationContext?.jobMode ?? pinnedGenericProfile?.jobMode ?? 'standard';
  const profile = snapshot.rotationProfiles?.find((entry) =>
    entry.job === job &&
    entry.jobMode === jobMode &&
    entry.supportedModes.includes(mode) &&
    entry.rulesetId === candidates[0]!.calculationContext?.rulesetId
  );
  if (!profile) {
    throw new Error(`${mode} is not installed for ${job} ${jobMode} under the selected ruleset.`);
  }
  const evaluator = createPilotCombatEvaluatorRegistry().requireFor(profile);
  const itemsById = new Map(snapshot.items.map((item) => [String(item.id), item]));
  const startedAt = performance.now();
  let lastProgress = -1;

  const evaluateAtDuration = (
    durationOverrideMs: number | undefined,
    progressOffset: number,
    progressScale: number
  ): {
    evaluated: Array<{ set: GearSet; result: CombatEvaluationResult }>;
    timelineCacheHits: number;
  } => {
    const evaluated: Array<{ set: GearSet; result: CombatEvaluationResult }> = [];
    const timelineCache = new CombatTimelineCache(Math.max(1, candidates.length));
    const metadataByTimingKey = new Map<string, CombatEvaluationResult>();
    let timelineCacheHits = 0;

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
        ...(durationOverrideMs ? { durationOverrideMs } : {}),
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
        includeTimeline: true,
        ...(damageProfile.role === 'healer' ? {
          rotationAffectingStats: { piety: set.metrics.stats.piety }
        } : {})
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
        const aggregate = progressOffset + ((index + 1) / candidates.length) * progressScale;
        lastProgress = aggregate;
        control.reportProgress?.(aggregate, index, candidates.length);
      } else {
        const simulated = evaluator.simulate(request, {
          isCancelled: control.isCancelled,
          reportProgress: (candidateProgress) => {
            const aggregate = progressOffset + ((index + candidateProgress) / candidates.length) * progressScale;
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
    return { evaluated, timelineCacheHits };
  };

  const runStabilityAudit = mode === 'dummy-300' && candidates.length > 1;
  const mainPass = evaluateAtDuration(undefined, 0, runStabilityAudit ? 0.5 : 1);
  const evaluated = mainPass.evaluated;

  evaluated.sort((left, right) => {
    const damage = right.result.totalDamage - left.result.totalDamage;
    if (damage !== 0) return damage;
    const proxy = right.set.metrics.expectedAction100 - left.set.metrics.expectedAction100;
    return proxy !== 0 ? proxy : left.set.id.localeCompare(right.set.id);
  });
  let stability: RotationStabilityAudit | undefined;
  let timelineCacheHits = mainPass.timelineCacheHits;
  if (runStabilityAudit) {
    const stabilityPass = evaluateAtDuration(ROTATION_STABILITY_DURATION_MS, 0.5, 0.5);
    timelineCacheHits += stabilityPass.timelineCacheHits;
    stabilityPass.evaluated.sort((left, right) => {
      const dps = right.result.dps - left.result.dps;
      if (dps !== 0) return dps;
      return left.set.id.localeCompare(right.set.id);
    });
    const selectedSetId = evaluated[0]!.set.id;
    const selectedAtLongDuration = stabilityPass.evaluated.find(({ set }) => set.id === selectedSetId)!;
    const bestAtLongDuration = stabilityPass.evaluated[0]!;
    const gapToBestPercent = bestAtLongDuration.result.dps === 0
      ? 0
      : (bestAtLongDuration.result.dps - selectedAtLongDuration.result.dps) / bestAtLongDuration.result.dps * 100;
    stability = {
      durationMs: ROTATION_STABILITY_DURATION_MS,
      selectedSetDps: selectedAtLongDuration.result.dps,
      bestSetId: bestAtLongDuration.set.id,
      bestSetGcd: bestAtLongDuration.set.metrics.gcd,
      bestDps: bestAtLongDuration.result.dps,
      winnerChanged: bestAtLongDuration.set.id !== selectedSetId,
      gapToBestPercent
    };
  }
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
      timelineCacheHits,
      stability,
      profile
    )
  }));

  return {
    best: labelled[0]!,
    alternatives: labelled.slice(1, 4),
    evaluatedCandidates: evaluated.length,
    durationMs,
    proxyBestSetId,
    winnerChanged,
    timelineCacheHits,
    ...(stability ? { stability } : {})
  };
};
