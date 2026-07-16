import {
  STAT_KEYS,
  addStats,
  assertSnapshotCompatible,
  emptyStats,
  getEvaluatorCapability,
  gearSlotItemLevelWeight,
  gearSlotWeightTotal,
  gearSlotsForJob,
  resolveOptimizerConstraints,
  type CombatEvaluatorProfile,
  type CombatJob,
  type EquipmentItem,
  type EquippedItem,
  type GearSet,
  type GearSlot,
  type OptimizerConstraints,
  type ResolvedOptimizerConstraints,
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
  appVersion: '0.8.0',
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

const materiaAdvancedMeldingLimit = (tier: number, explicit?: 'forbidden' | 'first-slot-only' | 'unrestricted') => {
  if (explicit) return explicit;
  if ([8, 10, 12].includes(tier)) return 'first-slot-only' as const;
  if ([7, 9, 11].includes(tier)) return 'unrestricted' as const;
  return 'forbidden' as const;
};

const materiaAllowedAtItemIndex = (
  item: EquipmentItem,
  index: number,
  materia: GearSnapshot['materia'][number]
) => {
  if (index < item.materiaSlots) return true;
  const limit = materiaAdvancedMeldingLimit(materia.tier, materia.advancedMeldingLimit);
  if (limit === 'forbidden') return false;
  if (limit === 'first-slot-only') return index === item.materiaSlots;
  return true;
};

const variantsForItem = (
  item: EquipmentItem,
  slot: GearSlot,
  snapshot: GearSnapshot,
  profile: CombatEvaluatorProfile,
  constraints: ResolvedOptimizerConstraints
): Variant[] => {
  const relevantMateria = snapshot.materia.filter((entry) =>
    profile.meldStats.includes(entry.stat) &&
    constraints.allowedMateriaStats.includes(entry.stat) &&
    constraints.allowedMateriaTiers.includes(entry.tier)
  );
  const lockedMateria = constraints.lockedMateriaBySlot[slot] ?? [];
  const capacity = item.materiaSlots + (constraints.allowOvermelds && item.advancedMelding
    ? Math.max(0, 5 - item.materiaSlots)
    : 0);
  if (lockedMateria.length > capacity) return [];
  if (lockedMateria.some((id, index) => {
    const materia = snapshot.materia.find((entry) => entry.id === id);
    return !materia || !materiaAllowedAtItemIndex(item, index, materia);
  })) return [];
  const generatedChoices: number[][] = [];
  const generate = (ids: number[]) => {
    const absoluteIndex = lockedMateria.length + ids.length;
    if (absoluteIndex >= capacity) {
      generatedChoices.push(ids);
      return;
    }
    const legalChoices = relevantMateria.filter((materia) => materiaAllowedAtItemIndex(item, absoluteIndex, materia));
    if (legalChoices.length === 0) {
      generatedChoices.push(ids);
      return;
    }
    for (const materia of legalChoices) generate([...ids, materia.id]);
  };
  generate([]);
  const deduplicatedChoices = new Map<string, number[]>();
  for (const ids of generatedChoices) {
    const key = [...ids].sort((left, right) => left - right).join(':');
    if (!deduplicatedChoices.has(key)) deduplicatedChoices.set(key, ids);
  }
  const materiaChoices = [...deduplicatedChoices.values()].map((ids) => [...lockedMateria, ...ids]);

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

const customItemIsWithinAccess = (
  item: EquipmentItem,
  snapshot: GearSnapshot,
  constraints: ResolvedOptimizerConstraints
): boolean => {
  if (item.origin !== 'custom') return true;
  const levelAllowed = constraints.accessLevel === undefined || item.level <= constraints.accessLevel;
  if (!item.customData?.expansionId || !constraints.accessExpansion) return levelAllowed;
  const selectedExpansion = snapshot.registry.expansions.find((entry) => entry.id === constraints.accessExpansion);
  const itemExpansion = snapshot.registry.expansions.find((entry) => entry.id === item.customData?.expansionId);
  return levelAllowed && Boolean(selectedExpansion && itemExpansion && itemExpansion.order <= selectedExpansion.order);
};

const toGearSet = (
  state: SearchState,
  snapshot: GearSnapshot,
  foodId: number | undefined,
  rank: number,
  job: CombatJob,
  constraints: ResolvedOptimizerConstraints
): GearSet => {
  const profile = getCombatEvaluatorProfile(job, snapshot.evaluatorProfiles);
  const ruleset = snapshot.rulesets.find((entry) => entry.id === profile.rulesetId);
  if (!ruleset) throw new Error(`Evaluator profile ${profile.id} references missing ruleset ${profile.rulesetId}.`);
  const food = snapshot.foods.find((entry) => entry.id === foodId);
  let stats = addStats(profile.baseStats, state.stats);
  stats[profile.mainStat] = Math.floor(stats[profile.mainStat] * 1.05);
  stats.vitality = Math.floor(stats.vitality * 1.05);
  stats = applyFood(stats, food);
  const gcd = gcdFromSpeed(stats[profile.speedStat], profile.baseGcdMs, profile.hastePercent);
  const experimentalItems = Object.values(state.items).flatMap((entry) => {
    const item = snapshot.items.find((candidate) => String(candidate.id) === String(entry?.itemId));
    return item && item.origin === 'custom' && !customItemIsWithinAccess(item, snapshot, constraints) ? [item] : [];
  });

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
      `Search is limited to the verified patch 7.4 ${job} reference pool.`,
      ...(experimentalItems.length > 0
        ? [`Experimental access override: ${experimentalItems.map((item) => item.name).join(', ')} is beyond the selected expansion or level.`]
        : [])
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
    calculatedAt: new Date().toISOString(),
    ...(experimentalItems.length > 0 ? {
      hypotheticalAccess: {
        itemIds: experimentalItems.map((item) => item.id),
        reason: `Experimental access override includes ${experimentalItems.map((item) => item.name).join(', ')} beyond the selected expansion or level.`
      }
    } : {})
  };
};

export const optimizeCombatJob = (snapshot: GearSnapshot, constraints: OptimizerConstraints, job: CombatJob): OptimizerResult => {
  const started = performance.now();
  ensureSnapshotCompatible(snapshot);
  const resolved = resolveOptimizerConstraints(constraints, snapshot.materia);
  const fail = (message: string): OptimizerResult => ({
    alternatives: [],
    evaluatedStates: 0,
    durationMs: performance.now() - started,
    truncated: false,
    explanation: [message]
  });
  const capability = getEvaluatorCapability(snapshot.registry, job, 'standard', 'generic-hit');
  if (capability?.status !== 'available') {
    throw new Error(`Generic-hit evaluation is ${capability?.status ?? 'unsupported'} for ${job}.`);
  }
  const profile = getCombatEvaluatorProfile(job, snapshot.evaluatorProfiles);
  const gearSlots = gearSlotsForJob(job);
  const excluded = new Set(resolved.excludedItemIds.map(String));
  const required = new Set(resolved.requiredItemIds.map(String));
  const allowed = new Set(resolved.allowedSources);
  const lockedEntries = Object.entries(resolved.lockedItemIdsBySlot) as Array<[GearSlot, number | string]>;
  const lockedIds = new Set(lockedEntries.map(([, id]) => String(id)));

  if (!Number.isFinite(resolved.minGcd) || !Number.isFinite(resolved.maxGcd) || resolved.minGcd > resolved.maxGcd) {
    return fail('The GCD range is invalid. Set a minimum that is less than or equal to the maximum.');
  }
  const directConflict = [...required].find((id) => excluded.has(id));
  if (directConflict) {
    const item = snapshot.items.find((entry) => String(entry.id) === directConflict);
    return fail(`${item?.name ?? `Item ${directConflict}`} is both required and excluded. Remove one of those rules.`);
  }
  for (const [slot, id] of lockedEntries) {
    const item = snapshot.items.find((entry) => String(entry.id) === String(id));
    if (!item) return fail(`The item locked in ${slot} is missing from the active data. Choose another item or clear that lock.`);
    if (!candidateForSlot(item, slot) || !item.jobs.includes(job)) {
      return fail(`${item.name} cannot be equipped by ${job} in ${slot}. Clear or replace that equipment lock.`);
    }
    if (excluded.has(String(id))) return fail(`${item.name} is locked in ${slot} and also excluded. Remove one of those rules.`);
    if (item.origin === 'custom' && !resolved.allowCustomItems) {
      return fail(`${item.name} is locked in ${slot}, but hypothetical items are disabled. Enable custom items or clear the lock.`);
    }
    if (!customItemIsWithinAccess(item, snapshot, resolved) && !resolved.allowExperimentalAccess) {
      return fail(`${item.name} is locked in ${slot} but exceeds the selected expansion or level. Enable the experimental access override or clear the lock.`);
    }
  }
  for (const id of required) {
    const item = snapshot.items.find((entry) => String(entry.id) === id);
    if (!item) return fail(`Required item ${id} is missing from the active data. Remove the stale requirement or restore the custom item.`);
    if (!item.jobs.includes(job)) return fail(`${item.name} is required but cannot be equipped by ${job}.`);
    if (item.origin === 'custom' && !resolved.allowCustomItems) {
      return fail(`${item.name} is required, but hypothetical items are disabled. Enable custom items or remove the requirement.`);
    }
    if (!customItemIsWithinAccess(item, snapshot, resolved) && !resolved.allowExperimentalAccess) {
      return fail(`${item.name} is required but exceeds the selected expansion or level. Enable the experimental access override or remove it.`);
    }
  }
  const requiredNonRingSlots = new Map<string, EquipmentItem[]>();
  for (const id of required) {
    const item = snapshot.items.find((entry) => String(entry.id) === id);
    if (!item || item.slot === 'ring') continue;
    requiredNonRingSlots.set(item.slot, [...(requiredNonRingSlots.get(item.slot) ?? []), item]);
  }
  const duplicateRequirement = [...requiredNonRingSlots.entries()].find(([, items]) => items.length > 1);
  if (duplicateRequirement) return fail(`${duplicateRequirement[1].map((item) => item.name).join(' and ')} are both required for ${duplicateRequirement[0]}. Keep only one requirement.`);
  for (const [slot, id] of lockedEntries) {
    const requiredInSlot = requiredNonRingSlots.get(slot);
    if (requiredInSlot?.some((item) => String(item.id) !== String(id))) {
      const locked = snapshot.items.find((item) => String(item.id) === String(id));
      return fail(`${locked?.name ?? id} is locked in ${slot}, but a different item is required there. Remove one of those rules.`);
    }
  }
  for (const [slot, materiaIds] of Object.entries(resolved.lockedMateriaBySlot) as Array<[GearSlot, number[]]>) {
    for (const materiaId of materiaIds) {
      const materia = snapshot.materia.find((entry) => entry.id === materiaId);
      if (!materia) return fail(`A locked meld in ${slot} references missing materia ${materiaId}. Clear that meld lock.`);
      if (!profile.meldStats.includes(materia.stat)) return fail(`${materia.name} is not a relevant meld for ${job}. Clear the locked meld in ${slot}.`);
      if (!resolved.allowedMateriaStats.includes(materia.stat) || !resolved.allowedMateriaTiers.includes(materia.tier)) {
        return fail(`${materia.name} is locked in ${slot} but blocked by the materia-family or grade restrictions.`);
      }
    }
  }
  if (resolved.foodMode === 'locked' && !snapshot.foods.some((food) => food.id === resolved.lockedFoodId)) {
    return fail('The locked food is missing from the active data. Choose another food or change the food rule.');
  }
  const itemIsAllowed = (item: EquipmentItem) =>
    item.jobs.includes(job) &&
    !excluded.has(String(item.id)) &&
    (
      (item.origin === 'official' && allowed.has(item.sourceFamily)) ||
      (item.origin === 'custom' && resolved.allowCustomItems && (required.has(String(item.id)) || lockedIds.has(String(item.id))))
    ) &&
    (customItemIsWithinAccess(item, snapshot, resolved) || resolved.allowExperimentalAccess);
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
    const lockedItemId = resolved.lockedItemIdsBySlot[slot];
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
        (lockedItemId === undefined || String(item.id) === String(lockedItemId)) &&
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

    const variants = candidates.flatMap((item) => variantsForItem(item, slot, snapshot, profile, resolved));
    if (variants.length === 0) {
      return {
        alternatives: [],
        evaluatedStates,
        durationMs: performance.now() - started,
        truncated,
        explanation: [`No ${slot} item can accept the locked melds under the selected materia and overmelding rules.`]
      };
    }
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

    const bounded = keepBoundedFrontier(expanded, resolved.frontierLimit, resolved, profile);
    frontier = bounded.states;
    truncated ||= bounded.truncated;
  }

  const feasible: GearSet[] = [];
  const resourceFeasible: GearSet[] = [];
  const foodIds: Array<number | undefined> = resolved.foodMode === 'none'
    ? [undefined]
    : resolved.foodMode === 'locked'
      ? [resolved.lockedFoodId]
      : snapshot.foods.map((food) => food.id);
  for (const state of frontier) {
    const selectedIds = new Set(Object.values(state.items).map((entry) => String(entry?.itemId)));
    if ([...required].some((id) => !selectedIds.has(id))) continue;

    for (const foodId of foodIds) {
      const set = toGearSet(state, snapshot, foodId, 0, job, resolved);
      if (profile.resourceStat && set.metrics.stats[profile.resourceStat] < resolved.minResource) continue;
      resourceFeasible.push(set);
      if (set.metrics.gcd >= resolved.minGcd && set.metrics.gcd <= resolved.maxGcd) feasible.push(set);
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
    if (lockedEntries.some(([slot, id]) => String(sourceSet.items[slot]?.itemId) !== String(id))) continue;
    if (resolved.foodMode === 'none' && sourceSet.foodId !== undefined) continue;
    if (resolved.foodMode === 'locked' && sourceSet.foodId !== resolved.lockedFoodId) continue;
    const sourceLegal = equippedIds.every((id) => {
      const item = snapshot.items.find((candidate) => String(candidate.id) === id);
      return item?.origin === 'official' && item.jobs.includes(job) && allowed.has(item.sourceFamily);
    });
    if (!sourceLegal) continue;
    const meldsLegal = gearSlots.every((slot) => {
      const equipped = sourceSet.items[slot];
      if (!equipped) return false;
      const locked = resolved.lockedMateriaBySlot[slot] ?? [];
      if (locked.some((id, index) => equipped.materiaIds[index] !== id)) return false;
      return equipped.materiaIds.every((id) => {
        const materia = snapshot.materia.find((entry) => entry.id === id);
        return Boolean(materia && resolved.allowedMateriaStats.includes(materia.stat) && resolved.allowedMateriaTiers.includes(materia.tier));
      });
    });
    if (!meldsLegal) continue;

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
    if (!profile.resourceStat || calculated.metrics.stats[profile.resourceStat] >= resolved.minResource) {
      const verifiedWarmStart = {
        ...calculated,
        assumptions: [
          ...calculated.assumptions,
          'Known legal source configuration used as an independently recalculated warm start.'
        ]
      };
      resourceFeasible.push(verifiedWarmStart);
      if (calculated.metrics.gcd >= resolved.minGcd && calculated.metrics.gcd <= resolved.maxGcd) {
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
    if (set.metrics.gcd < resolved.minGcd) return resolved.minGcd - set.metrics.gcd;
    if (set.metrics.gcd > resolved.maxGcd) return set.metrics.gcd - resolved.maxGcd;
    return 0;
  };
  let candidates = feasible;
  let speedFallback: OptimizerResult['speedFallback'];
  if (candidates.length === 0 && resourceFeasible.length > 0 && resolved.gcdMode === 'exact') {
    resourceFeasible.sort((left, right) => {
      const distance = distanceFromRequestedBand(left) - distanceFromRequestedBand(right);
      return distance !== 0 ? distance : compareSetQuality(left, right);
    });
    const closestDistance = distanceFromRequestedBand(resourceFeasible[0]!);
    candidates = resourceFeasible
      .filter((set) => Math.abs(distanceFromRequestedBand(set) - closestDistance) < 0.000_001)
      .sort(compareSetQuality);
    speedFallback = {
      requestedMinGcd: resolved.minGcd,
      requestedMaxGcd: resolved.maxGcd,
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
  const requestedGcdLabel = resolved.minGcd === resolved.maxGcd
    ? `${resolved.minGcd.toFixed(2)}s`
    : `${resolved.minGcd.toFixed(2)}–${resolved.maxGcd.toFixed(2)}s`;
  const resourceRequirement = profile.resourceStat
    ? `${resolved.minResource} ${profile.resourceLabel}`
    : undefined;
  const unattainableExplanation = resourceFeasible.length > 0
    ? `No set reaches the ${resolved.gcdTargetName} GCD range of ${requestedGcdLabel}. Widen the range or relax equipment, materia, food, or source restrictions.`
    : profile.resourceStat
      ? `No set reaches the minimum ${resolved.minResource} ${profile.resourceLabel}. Lower that minimum or relax equipment, materia, food, or source restrictions.`
      : 'No complete set remains. Relax an equipment, materia, food, custom-item, or acquisition-source restriction.';

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
            `No set in the selected acquisition pool can reach ${resolved.gcdTargetName} at ${requestedGcdLabel}. Showing the closest attainable ${speedFallback.achievedGcd.toFixed(2)}s result${resourceRequirement ? ` satisfying ${resourceRequirement}` : ''}, then optimising its melds for the expected single 100-potency hit.`,
            truncated
              ? `The search retained a bounded ${resolved.frontierLimit.toLocaleString()}-state frontier; the result is a high-confidence prototype result, not a proof of global optimality.`
              : 'Every distinct stat state in the current reference pool was evaluated.'
          ]
          : [
            `Selected the highest expected single 100-potency hit result${resourceRequirement ? ` satisfying ${resourceRequirement}` : ''} at ${resolved.gcdTargetName} (${requestedGcdLabel}).`,
            truncated
              ? `The search retained a bounded ${resolved.frontierLimit.toLocaleString()}-state frontier; the result is a high-confidence prototype result, not a proof of global optimality.`
              : 'Every distinct stat state in the current reference pool was evaluated.'
          ]
        : [unattainableExplanation]
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
