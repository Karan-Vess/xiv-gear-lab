import {
  STAT_KEYS,
  addStats,
  assertSnapshotCompatible,
  emptyStats,
  getEvaluatorCapability,
  gearSlotItemLevelWeight,
  gearSlotWeightTotal,
  gearSlotsForJob,
  type CombatEvaluatorProfile,
  type CombatJob,
  type EquipmentItem,
  type EquippedItem,
  type GearSet,
  type GearSlot,
  type OptimizerConstraints,
  type SourceFamily,
  type StatBlock,
  type GearSnapshot
} from '@xiv-gear-lab/domain';
import {
  applyFood,
  applyMateria,
  expectedAction100,
  gcdFromSpeed,
  getCombatEvaluatorProfile,
  recalculateGearSet,
  SUPPORTED_CALCULATION_SCHEMAS,
  SUPPORTED_EVALUATOR_PROFILE_SCHEMAS
} from '@xiv-gear-lab/calculations';

export const OPTIMIZER_RUNTIME_COMPATIBILITY = {
  appVersion: '0.6.3',
  snapshotSchemas: ['gear-snapshot@1'],
  registrySchemas: ['game-registry@1'],
  rulesetSchemas: ['combat-ruleset@1'],
  calculationSchemas: SUPPORTED_CALCULATION_SCHEMAS,
  evaluatorProfileSchemas: SUPPORTED_EVALUATOR_PROFILE_SCHEMAS
};

const validatedSnapshots = new WeakSet<GearSnapshot>();

const ensureSnapshotCompatible = (snapshot: GearSnapshot) => {
  if (validatedSnapshots.has(snapshot)) return;
  assertSnapshotCompatible(snapshot, OPTIMIZER_RUNTIME_COMPATIBILITY);
  validatedSnapshots.add(snapshot);
};

interface Variant {
  item: EquipmentItem;
  materiaIds: number[];
  stats: StatBlock;
  waste: number;
}

interface SearchState {
  items: Partial<Record<GearSlot, EquippedItem>>;
  stats: StatBlock;
  weaponDamage: number;
  itemLevelTotal: number;
  waste: number;
  sources: Set<SourceFamily>;
}

export interface OptimizerResult {
  best?: GearSet;
  alternatives: GearSet[];
  evaluatedStates: number;
  durationMs: number;
  truncated: boolean;
  explanation: string[];
  speedFallback?: {
    requestedMinGcd: number;
    requestedMaxGcd: number;
    achievedGcd: number;
  };
}

const candidateForSlot = (item: EquipmentItem, slot: GearSlot): boolean =>
  item.slot === slot || (item.slot === 'ring' && (slot === 'ringLeft' || slot === 'ringRight'));

const combinationsWithReplacement = (ids: number[], count: number, start = 0): number[][] => {
  if (count === 0) return [[]];
  const result: number[][] = [];
  for (let index = start; index < ids.length; index += 1) {
    const id = ids[index];
    if (id === undefined) continue;
    for (const tail of combinationsWithReplacement(ids, count - 1, index)) result.push([id, ...tail]);
  }
  return result;
};

const variantsForItem = (
  item: EquipmentItem,
  snapshot: GearSnapshot,
  profile: CombatEvaluatorProfile
): Variant[] => {
  const relevantMateria = snapshot.materia.filter((entry) =>
    profile.meldStats.includes(entry.stat)
  );
  const materiaChoices = combinationsWithReplacement(
    relevantMateria.map((entry) => entry.id),
    item.materiaSlots
  );

  return materiaChoices.map((materiaIds) => {
    const melded = applyMateria(item, materiaIds, snapshot.materia);
    return { item, materiaIds, stats: melded.stats, waste: melded.waste };
  });
};

const statsKey = (state: SearchState, constraints: OptimizerConstraints): string => {
  const selectedIds = new Set(Object.values(state.items).map((entry) => String(entry?.itemId)));
  const requiredMask = constraints.requiredItemIds.map((id) => (selectedIds.has(String(id)) ? '1' : '0')).join('');
  return `${STAT_KEYS.map((key) => state.stats[key]).join(':')}:${state.weaponDamage}:${requiredMask}`;
};

const stateHeuristic = (
  state: SearchState,
  constraints: OptimizerConstraints,
  profile: CombatEvaluatorProfile
): number => {
  const withBase = addStats(profile.baseStats, state.stats);
  const gcd = gcdFromSpeed(withBase[profile.speedStat], profile.baseGcdMs, profile.hastePercent);
  const target = Math.min(constraints.maxGcd, Math.max(constraints.minGcd, gcd));
  const gcdPenalty = Math.abs(gcd - target) * 1_000_000;
  return expectedAction100(withBase, state.weaponDamage, profile) - gcdPenalty - state.waste;
};

const keepBoundedFrontier = (
  states: Iterable<SearchState>,
  limit: number,
  constraints: OptimizerConstraints,
  profile: CombatEvaluatorProfile
): { states: SearchState[]; truncated: boolean } => {
  const deduplicated = new Map<string, SearchState>();
  for (const state of states) {
    const key = statsKey(state, constraints);
    const existing = deduplicated.get(key);
    if (
      !existing ||
      state.waste < existing.waste ||
      (state.waste === existing.waste && state.itemLevelTotal > existing.itemLevelTotal)
    ) {
      deduplicated.set(key, state);
    }
  }

  const values = [...deduplicated.values()];
  if (values.length <= limit) return { states: values, truncated: false };
  values.sort((a, b) => stateHeuristic(b, constraints, profile) - stateHeuristic(a, constraints, profile));
  return { states: values.slice(0, limit), truncated: true };
};

const toGearSet = (state: SearchState, snapshot: GearSnapshot, foodId: number, rank: number, job: CombatJob): GearSet => {
  const profile = getCombatEvaluatorProfile(job, snapshot.evaluatorProfiles);
  const ruleset = snapshot.rulesets.find((entry) => entry.id === profile.rulesetId);
  if (!ruleset) throw new Error(`Evaluator profile ${profile.id} references missing ruleset ${profile.rulesetId}.`);
  const food = snapshot.foods.find((entry) => entry.id === foodId);
  let stats = addStats(profile.baseStats, state.stats);
  stats[profile.mainStat] = Math.floor(stats[profile.mainStat] * 1.05);
  stats.vitality = Math.floor(stats.vitality * 1.05);
  stats = applyFood(stats, food);
  const gcd = gcdFromSpeed(stats[profile.speedStat], profile.baseGcdMs, profile.hastePercent);

  return {
    id: `generated-${rank}-${foodId}-${Math.round(gcd * 100)}`,
    origin: 'generated',
    name: rank === 1 ? 'Best reference-pool result' : `Alternative ${rank}`,
    job,
    level: ruleset.maximumLevel,
    patch: snapshot.manifest.gamePatch,
    items: state.items,
    foodId,
    metrics: {
      stats,
      weaponDamage: state.weaponDamage,
      gcd,
      expectedAction100: expectedAction100(stats, state.weaponDamage, profile),
      averageItemLevel: state.itemLevelTotal / gearSlotWeightTotal(job),
      materiaWaste: state.waste
    },
    evaluation: {
      profileId: profile.id,
      version: profile.version,
      objective: profile.objective,
      confidence: profile.confidence,
      limitation: profile.limitation
    },
    calculationContext: {
      snapshotId: snapshot.manifest.id,
      rulesetId: ruleset.id,
      evaluatorProfileId: profile.id,
      evaluatorVersion: profile.version,
      calculationSchema: ruleset.calculationSchema
    },
    assumptions: [
      'Expected single 100-potency hit proxy; not an encounter or rotation simulation.',
      'Five percent party bonus.',
      `${job} baseline stats match the current source fixtures.`,
      `${job} uses ${profile.id}, a reference-validated level-100 ${profile.role} damage proxy.`,
      profile.limitation,
      `Search is limited to the verified patch 7.4 ${job} reference pool.`
    ],
    provenance: [
      {
        kind: 'calculated',
        provider: 'XIV Gear Lab',
        sourcePatch: snapshot.manifest.gamePatch,
        sourceVersion: snapshot.manifest.calculationVersion,
        schemaVersion: 'generated-set@1',
        retrievedAt: snapshot.manifest.generatedAt,
        verifiedAt: new Date().toISOString(),
        status: 'current'
      }
    ],
    calculatedAt: new Date().toISOString()
  };
};

export const optimizeCombatJob = (snapshot: GearSnapshot, constraints: OptimizerConstraints, job: CombatJob): OptimizerResult => {
  const started = performance.now();
  ensureSnapshotCompatible(snapshot);
  const capability = getEvaluatorCapability(snapshot.registry, job, 'standard', 'generic-hit');
  if (capability?.status !== 'available') {
    throw new Error(`Generic-hit evaluation is ${capability?.status ?? 'unsupported'} for ${job}.`);
  }
  const profile = getCombatEvaluatorProfile(job, snapshot.evaluatorProfiles);
  const gearSlots = gearSlotsForJob(job);
  const excluded = new Set(constraints.excludedItemIds.map(String));
  const required = new Set(constraints.requiredItemIds.map(String));
  const allowed = new Set(constraints.allowedSources);
  const itemIsAllowed = (item: EquipmentItem) =>
    item.jobs.includes(job) &&
    !excluded.has(String(item.id)) &&
    (
      (item.origin === 'official' && allowed.has(item.sourceFamily)) ||
      (item.origin === 'custom' && required.has(String(item.id)))
    );
  const ringCandidates = snapshot.items.filter(
    (item) =>
      item.slot === 'ring' &&
      itemIsAllowed(item)
  );
  const canFillBothRingSlots = ringCandidates.some((left) =>
    ringCandidates.some((right) => String(left.id) !== String(right.id) || (!left.unique && !right.unique))
  );
  if (!canFillBothRingSlots) {
    return {
      alternatives: [],
      evaluatedStates: 0,
      durationMs: performance.now() - started,
      truncated: false,
      explanation: [
        'The selected acquisition categories provide only one unique ring. Add another available category so both ring slots can be filled legally.'
      ]
    };
  }
  let frontier: SearchState[] = [
    {
      items: {},
      stats: emptyStats(),
      weaponDamage: 0,
      itemLevelTotal: 0,
      waste: 0,
      sources: new Set()
    }
  ];
  let evaluatedStates = 0;
  let truncated = false;

  for (const slot of gearSlots) {
    const requiredForSlot = snapshot.items.filter(
      (item) => candidateForSlot(item, slot) && required.has(String(item.id))
    );
    const hardRequiredIds = new Set(
      requiredForSlot
        .filter((item) => item.slot !== 'ring')
        .map((item) => String(item.id))
    );
    const candidates = snapshot.items.filter(
      (item) =>
        candidateForSlot(item, slot) &&
        itemIsAllowed(item) &&
        (hardRequiredIds.size === 0 || hardRequiredIds.has(String(item.id)))
    );

    if (candidates.length === 0) {
      return {
        alternatives: [],
        evaluatedStates,
        durationMs: performance.now() - started,
        truncated,
        explanation: [`No legal ${slot} candidate remains after the selected source and exclusion filters.`]
      };
    }

    const variants = candidates.flatMap((item) => variantsForItem(item, snapshot, profile));
    const expanded: SearchState[] = [];

    for (const state of frontier) {
      for (const variant of variants) {
        if (
          (slot === 'ringRight' || slot === 'ringLeft') &&
          Object.values(state.items).some((entry) => String(entry?.itemId) === String(variant.item.id)) &&
          variant.item.unique
        ) {
          continue;
        }

        expanded.push({
          items: { ...state.items, [slot]: { itemId: variant.item.id, materiaIds: variant.materiaIds } },
          stats: addStats(state.stats, variant.stats),
          weaponDamage: Math.max(state.weaponDamage, variant.item.weaponDamage),
          itemLevelTotal: state.itemLevelTotal + variant.item.itemLevel * gearSlotItemLevelWeight(job, slot),
          waste: state.waste + variant.waste,
          sources: new Set([...state.sources, variant.item.sourceFamily])
        });
        evaluatedStates += 1;
      }
    }

    const bounded = keepBoundedFrontier(expanded, constraints.frontierLimit, constraints, profile);
    frontier = bounded.states;
    truncated ||= bounded.truncated;
  }

  const feasible: GearSet[] = [];
  const resourceFeasible: GearSet[] = [];
  for (const state of frontier) {
    const selectedIds = new Set(Object.values(state.items).map((entry) => String(entry?.itemId)));
    if ([...required].some((id) => !selectedIds.has(id))) continue;

    for (const food of snapshot.foods) {
      const set = toGearSet(state, snapshot, food.id, 0, job);
      if (profile.resourceStat && set.metrics.stats[profile.resourceStat] < constraints.minResource) continue;
      resourceFeasible.push(set);
      if (set.metrics.gcd >= constraints.minGcd && set.metrics.gcd <= constraints.maxGcd) feasible.push(set);
    }
  }

  // Known legal source configurations are warm starts, not trusted answers:
  // they pass through the same local item, meld, food, source and formula checks.
  for (const sourceSet of snapshot.curatedSets) {
    if (sourceSet.job !== job) continue;
    const equippedIds = Object.values(sourceSet.items).map((entry) => String(entry?.itemId));
    if (equippedIds.length !== gearSlots.length) continue;
    if ([...required].some((id) => !equippedIds.includes(id))) continue;
    if (equippedIds.some((id) => excluded.has(id))) continue;
    const sourceLegal = equippedIds.every((id) => {
      const item = snapshot.items.find((candidate) => String(candidate.id) === id);
      return item?.origin === 'official' && item.jobs.includes(job) && allowed.has(item.sourceFamily);
    });
    if (!sourceLegal) continue;

    const calculated = recalculateGearSet(
      { ...sourceSet, id: `warm-${sourceSet.id}`, origin: 'generated' },
      snapshot.items,
      snapshot.materia,
      snapshot.foods,
      snapshot.evaluatorProfiles,
      {
        snapshotId: snapshot.manifest.id,
        rulesetId: profile.rulesetId,
        evaluatorProfileId: profile.id,
        evaluatorVersion: profile.version,
        calculationSchema: snapshot.rulesets.find((entry) => entry.id === profile.rulesetId)!.calculationSchema
      }
    );
    if (!profile.resourceStat || calculated.metrics.stats[profile.resourceStat] >= constraints.minResource) {
      const verifiedWarmStart = {
        ...calculated,
        assumptions: [
          ...calculated.assumptions,
          'Known legal source configuration used as an independently recalculated warm start.'
        ]
      };
      resourceFeasible.push(verifiedWarmStart);
      if (calculated.metrics.gcd >= constraints.minGcd && calculated.metrics.gcd <= constraints.maxGcd) {
        feasible.push(verifiedWarmStart);
      }
    }
  }

  const compareSetQuality = (left: GearSet, right: GearSet) => {
    const score = right.metrics.expectedAction100 - left.metrics.expectedAction100;
    if (score !== 0) return score;
    if (left.metrics.materiaWaste !== right.metrics.materiaWaste) {
      return left.metrics.materiaWaste - right.metrics.materiaWaste;
    }
    return left.id.localeCompare(right.id);
  };
  feasible.sort(compareSetQuality);

  const distanceFromRequestedBand = (set: GearSet) => {
    if (set.metrics.gcd < constraints.minGcd) return constraints.minGcd - set.metrics.gcd;
    if (set.metrics.gcd > constraints.maxGcd) return set.metrics.gcd - constraints.maxGcd;
    return 0;
  };
  let candidates = feasible;
  let speedFallback: OptimizerResult['speedFallback'];
  if (candidates.length === 0 && resourceFeasible.length > 0) {
    resourceFeasible.sort((left, right) => {
      const distance = distanceFromRequestedBand(left) - distanceFromRequestedBand(right);
      return distance !== 0 ? distance : compareSetQuality(left, right);
    });
    const closestDistance = distanceFromRequestedBand(resourceFeasible[0]!);
    candidates = resourceFeasible
      .filter((set) => Math.abs(distanceFromRequestedBand(set) - closestDistance) < 0.000_001)
      .sort(compareSetQuality);
    speedFallback = {
      requestedMinGcd: constraints.minGcd,
      requestedMaxGcd: constraints.maxGcd,
      achievedGcd: candidates[0]!.metrics.gcd
    };
  }

  const selected = candidates.slice(0, 4).map((set, index) => ({
    ...set,
    id: `${set.id}-${index + 1}`,
    name: index === 0
      ? speedFallback ? 'Closest attainable result' : 'Best reference-pool result'
      : `Alternative ${index + 1}`
  }));
  const requestedGcdLabel = constraints.minGcd === constraints.maxGcd
    ? `${constraints.minGcd.toFixed(2)}s`
    : `${constraints.minGcd.toFixed(2)}–${constraints.maxGcd.toFixed(2)}s`;
  const resourceRequirement = profile.resourceStat
    ? `${constraints.minResource} ${profile.resourceLabel}`
    : undefined;

  return {
    best: selected[0],
    alternatives: selected.slice(1),
    evaluatedStates,
    durationMs: performance.now() - started,
    truncated,
    speedFallback,
    explanation:
      selected.length > 0
        ? speedFallback
          ? [
            `No set in the selected acquisition pool can reach ${requestedGcdLabel}. Showing the closest attainable ${speedFallback.achievedGcd.toFixed(2)}s result${resourceRequirement ? ` satisfying ${resourceRequirement}` : ''}, then optimising its melds for the expected single 100-potency hit.`,
            truncated
              ? `The search retained a bounded ${constraints.frontierLimit.toLocaleString()}-state frontier; the result is a high-confidence prototype result, not a proof of global optimality.`
              : 'Every distinct stat state in the current reference pool was evaluated.'
          ]
          : [
            `Selected the highest expected single 100-potency hit result${resourceRequirement ? ` satisfying ${resourceRequirement}` : ''} at the ${requestedGcdLabel} GCD target.`,
            truncated
              ? `The search retained a bounded ${constraints.frontierLimit.toLocaleString()}-state frontier; the result is a high-confidence prototype result, not a proof of global optimality.`
              : 'Every distinct stat state in the current reference pool was evaluated.'
          ]
        : ['No set in the current reference pool satisfies all selected constraints.']
  };
};

export const optimizeWhm = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'WHM');

export const optimizeSage = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'SGE');

export const optimizeScholar = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'SCH');

export const optimizeAstrologian = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'AST');

export const optimizePaladin = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'PLD');

export const optimizeWarrior = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'WAR');

export const optimizeDarkKnight = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'DRK');

export const optimizeGunbreaker = (snapshot: GearSnapshot, constraints: OptimizerConstraints): OptimizerResult =>
  optimizeCombatJob(snapshot, constraints, 'GNB');
