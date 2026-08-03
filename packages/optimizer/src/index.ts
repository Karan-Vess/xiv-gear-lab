import {
  STAT_KEYS,
  addStats,
  assessSnapshotCompatibility,
  assessItemAccess,
  assertSnapshotCompatible,
  emptyStats,
  gearSlotItemLevelWeight,
  gearSlotWeightTotal,
  gearSlotsForJob,
  getEvaluatorCapability,
  isAugmentedCraftedItem,
  resolveEvaluatorCapability,
  resolveOptimizerConstraints,
  type CombatEvaluatorProfile,
  type CatalogueReadinessIssue,
  type CatalogueReadinessReport,
  type CombatJob,
  type EquipmentItem,
  type EquippedItem,
  type GearSet,
  type GearSlot,
  type OptimizerConstraints,
  type OptimizerSearchMode,
  type RotationEvaluationMode,
  type ResolvedOptimizerConstraints,
  type SourceFamily,
  type StatKey,
  type StatBlock,
  type GearSnapshot
} from '@xiv-gear-lab/domain';
import {
  applyFood,
  applyMateria,
  expectedAction100,
  gcdFromSpeed,
  getCombatEvaluatorProfileForAccess,
  levelFormulaConstantsFor,
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
  evaluatorProfileSchemas: SUPPORTED_EVALUATOR_PROFILE_SCHEMAS,
  rotationProfileSchemas: ['combat-rotation-profile@1', 'combat-rotation-profile@2']
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
  relicStats?: EquippedItem['relicStats'];
  stats: StatBlock;
  waste: number;
}

interface SearchState {
  items: Partial<Record<GearSlot, EquippedItem>>;
  stats: StatBlock;
  weaponDamage: number;
  weaponDelayMs: number;
  itemLevelTotal: number;
  waste: number;
  sources: Set<SourceFamily>;
  uniqueRingItemIds: Set<string>;
}

export interface OptimizerResult {
  best?: GearSet;
  alternatives: GearSet[];
  /** Bounded proxy-selected candidates retained for an optional rotation rerank. */
  finalists?: GearSet[];
  evaluatedStates: number;
  durationMs: number;
  truncated: boolean;
  optimality?: {
    status: 'proven' | 'not-proven';
    objective: 'generic-hit' | RotationEvaluationMode;
    searchMode: OptimizerSearchMode;
    reason: string;
  };
  explanation: string[];
  speedFallback?: {
    requestedMinGcd: number;
    requestedMaxGcd: number;
    achievedGcd: number;
  };
  searchDiagnostics?: {
    legalItemCandidates: number;
    retainedItemCandidates: number;
    dominatedItemCandidates: number;
    generatedSlotVariants: number;
    retainedSlotVariants: number;
    peakFrontierStates: number;
  };
  rotationRerank?: {
    mode: RotationEvaluationMode;
    candidateCount: number;
    durationMs: number;
    proxyBestSetId: string;
    winnerChanged: boolean;
    timelineCacheHits: number;
    stability?: {
      durationMs: number;
      bestSetId: string;
      bestSetGcd: number;
      winnerChanged: boolean;
      gapToBestPercent: number;
    };
  };
}

export interface OptimizerProgress {
  progress: number;
  phase: 'preparing' | 'slot-variants' | 'gear-frontier' | 'finalizing';
  message: string;
}

export interface OptimizerControl {
  isCancelled?(): boolean;
  reportProgress?(update: OptimizerProgress): void;
}

export class OptimizerCancelledError extends Error {
  constructor() {
    super('Optimisation cancelled.');
    this.name = 'OptimizerCancelledError';
  }
}

export const selectSpeedDiverseFinalists = (
  sortedCandidates: readonly GearSet[],
  limit = 12
): GearSet[] => {
  const boundedLimit = Math.max(1, Math.floor(limit));
  if (sortedCandidates.length <= boundedLimit) return [...sortedCandidates];

  const selected: GearSet[] = [];
  const selectedIds = new Set<string>();
  const add = (candidate: GearSet | undefined) => {
    if (!candidate || selected.length >= boundedLimit || selectedIds.has(candidate.id)) return;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  };

  for (const candidate of sortedCandidates.slice(0, Math.min(4, boundedLimit))) add(candidate);
  const bestByTier = new Map<string, GearSet>();
  for (const candidate of sortedCandidates) {
    const tier = candidate.metrics.gcd.toFixed(2);
    if (!bestByTier.has(tier)) bestByTier.set(tier, candidate);
  }
  const tierWinners = [...bestByTier.values()]
    .sort((left, right) => left.metrics.gcd - right.metrics.gcd);
  const proxyTierLeaders = [...tierWinners].sort((left, right) => {
    const difference = right.metrics.expectedAction100 - left.metrics.expectedAction100;
    return difference !== 0 ? difference : right.metrics.gcd - left.metrics.gcd;
  });
  const proxyTierSlots = Math.min(4, Math.max(0, boundedLimit - selected.length));
  const proxyTierTarget = selected.length + proxyTierSlots;
  for (const candidate of proxyTierLeaders) {
    if (selected.length >= proxyTierTarget) break;
    add(candidate);
  }

  const throughputSlots = Math.min(2, Math.max(0, boundedLimit - selected.length));
  const throughputBestByTier = new Map<string, GearSet>();
  for (const candidate of sortedCandidates) {
    const tier = candidate.metrics.gcd.toFixed(2);
    const existing = throughputBestByTier.get(tier);
    if (
      !existing ||
      candidate.metrics.expectedAction100 / candidate.metrics.gcd >
        existing.metrics.expectedAction100 / existing.metrics.gcd
    ) {
      throughputBestByTier.set(tier, candidate);
    }
  }
  const throughputLeaders = [...throughputBestByTier.values()].sort((left, right) => {
    const leftThroughput = left.metrics.expectedAction100 / left.metrics.gcd;
    const rightThroughput = right.metrics.expectedAction100 / right.metrics.gcd;
    const difference = rightThroughput - leftThroughput;
    return difference !== 0
      ? difference
      : right.metrics.expectedAction100 - left.metrics.expectedAction100;
  });
  const throughputTarget = selected.length + throughputSlots;
  for (const candidate of throughputLeaders) {
    if (selected.length >= throughputTarget) break;
    add(candidate);
  }

  const remainingSlots = boundedLimit - selected.length;
  if (remainingSlots > 0 && tierWinners.length > 0) {
    const sampledIndices = remainingSlots === 1
      ? [Math.floor((tierWinners.length - 1) / 2)]
      : Array.from({ length: remainingSlots }, (_, index) =>
        Math.round(index * (tierWinners.length - 1) / (remainingSlots - 1))
      );
    for (const index of sampledIndices) add(tierWinners[index]);
  }
  for (const candidate of tierWinners) add(candidate);
  for (const candidate of sortedCandidates) add(candidate);
  return selected;
};

const candidateForSlot = (item: EquipmentItem, slot: GearSlot): boolean =>
  item.slot === slot || (item.slot === 'ring' && (slot === 'ringLeft' || slot === 'ringRight'));

const materiaAdvancedMeldingLimit = (tier: number, explicit?: 'forbidden' | 'first-slot-only' | 'unrestricted') => {
  if (explicit) return explicit;
  if ([6, 8, 10, 12].includes(tier)) return 'first-slot-only' as const;
  if (tier >= 1 && tier <= 12) return 'unrestricted' as const;
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

const itemMateriaCapacity = (
  item: EquipmentItem,
  constraints: ResolvedOptimizerConstraints
) => item.materiaSlots + (
  constraints.allowOvermelds && item.advancedMelding
    ? Math.max(0, 5 - item.materiaSlots)
    : 0
);

const pruneDominatedEquipmentCandidates = (
  candidates: EquipmentItem[],
  slot: GearSlot,
  snapshot: GearSnapshot,
  profile: CombatEvaluatorProfile,
  constraints: ResolvedOptimizerConstraints,
  protectedItemIds: Set<string>
): EquipmentItem[] => {
  // Ring identities affect the two-slot unique-item constraint, so they are
  // deliberately left for whole-set search rather than pruned in isolation.
  if (slot === 'ringLeft' || slot === 'ringRight') return candidates;

  const relevantMateria = snapshot.materia.filter((entry) =>
    profile.meldStats.includes(entry.stat) &&
    constraints.allowedMateriaStats.includes(entry.stat) &&
    constraints.allowedMateriaTiers.includes(entry.tier) &&
    supportingRecordIsWithinAccess(entry, snapshot, constraints)
  );
  const relevantCapStats = [...new Set(relevantMateria.map((entry) => entry.stat))];

  const canReplicateMeldSpace = (superior: EquipmentItem, candidate: EquipmentItem) => {
    const candidateCapacity = itemMateriaCapacity(candidate, constraints);
    if (itemMateriaCapacity(superior, constraints) < candidateCapacity) return false;
    if (relevantCapStats.some((stat) => superior.statCaps[stat] < candidate.statCaps[stat])) return false;
    for (let index = 0; index < candidateCapacity; index += 1) {
      if (relevantMateria.some((materia) =>
        materiaAllowedAtItemIndex(candidate, index, materia) &&
        !materiaAllowedAtItemIndex(superior, index, materia)
      )) return false;
    }
    return true;
  };

  return candidates.filter((candidate) => {
    if (
      protectedItemIds.has(String(candidate.id)) ||
      candidate.origin === 'custom' ||
      candidate.relicStatModel
    ) return true;
    return !candidates.some((other) => {
      if (
        other === candidate ||
        protectedItemIds.has(String(other.id)) ||
        other.origin === 'custom' ||
        other.relicStatModel ||
        (slot === 'weapon' && other.weaponDelayMs !== candidate.weaponDelayMs) ||
        other.itemLevel < candidate.itemLevel ||
        other.weaponDamage < candidate.weaponDamage ||
        STAT_KEYS.some((stat) => other.stats[stat] < candidate.stats[stat]) ||
        !canReplicateMeldSpace(other, candidate)
      ) return false;
      return (
        other.itemLevel > candidate.itemLevel ||
        other.weaponDamage > candidate.weaponDamage ||
        STAT_KEYS.some((stat) => other.stats[stat] > candidate.stats[stat]) ||
        relevantCapStats.some((stat) => other.statCaps[stat] > candidate.statCaps[stat]) ||
        itemMateriaCapacity(other, constraints) > itemMateriaCapacity(candidate, constraints)
      );
    });
  });
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
    constraints.allowedMateriaTiers.includes(entry.tier) &&
    supportingRecordIsWithinAccess(entry, snapshot, constraints)
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
  const legalRelicStats = item.relicStatModel?.allowedStats.filter((stat) =>
    profile.meldStats.includes(stat) || stat === profile.resourceStat
  ) ?? [];
  const relicAllocations: Array<EquippedItem['relicStats']> = item.relicStatModel
    ? legalRelicStats.flatMap((first, firstIndex, stats) =>
      stats.slice(firstIndex + 1).flatMap((second) =>
        stats.filter((small) => small !== first && small !== second).map((small) => ({
          [first]: item.relicStatModel!.largeValue,
          [second]: item.relicStatModel!.largeValue,
          [small]: item.relicStatModel!.smallValue
        }))
      )
    )
    : [undefined];
  const evaluate = (materiaIds: number[], relicStats?: EquippedItem['relicStats']): Variant => {
    const melded = applyMateria(item, materiaIds, snapshot.materia, relicStats);
    return { item, materiaIds, relicStats, stats: melded.stats, waste: melded.waste };
  };
  const extend = (variant: Variant, materia: GearSnapshot['materia'][number]): Variant => {
    const room = Math.max(0, item.statCaps[materia.stat] - variant.stats[materia.stat]);
    const applied = Math.min(room, materia.value);
    return {
      ...variant,
      materiaIds: [...variant.materiaIds, materia.id],
      stats: { ...variant.stats, [materia.stat]: variant.stats[materia.stat] + applied },
      waste: variant.waste + materia.value - applied
    };
  };
  const preferredChoicesForVariant = (
    variant: Variant,
    legalChoices: GearSnapshot['materia']
  ): GearSnapshot['materia'] => {
    const retained = new Map<string, GearSnapshot['materia'][number]>();
    for (const materia of legalChoices) {
      const room = Math.max(0, item.statCaps[materia.stat] - variant.stats[materia.stat]);
      const applied = Math.min(room, materia.value);
      const resultingValue = variant.stats[materia.stat] + applied;
      const waste = materia.value - applied;
      const key = materia.stat === profile.speedStat
        ? `${materia.stat}:${resultingValue}`
        : materia.stat;
      const existing = retained.get(key);
      if (!existing) {
        retained.set(key, materia);
        continue;
      }
      const existingRoom = Math.max(0, item.statCaps[existing.stat] - variant.stats[existing.stat]);
      const existingApplied = Math.min(existingRoom, existing.value);
      const existingResultingValue = variant.stats[existing.stat] + existingApplied;
      const existingWaste = existing.value - existingApplied;
      if (
        resultingValue > existingResultingValue ||
        (resultingValue === existingResultingValue && waste < existingWaste) ||
        (
          resultingValue === existingResultingValue &&
          waste === existingWaste &&
          materia.id < existing.id
        )
      ) {
        retained.set(key, materia);
      }
    }
    return [...retained.values()];
  };
  const variantKey = (variant: Variant) => STAT_KEYS.map((stat) => variant.stats[stat]).join(':');
  const preferVariant = (left: Variant, right: Variant) => {
    if (left.waste !== right.waste) return left.waste < right.waste ? left : right;
    if (left.materiaIds.length !== right.materiaIds.length) return left.materiaIds.length < right.materiaIds.length ? left : right;
    return left.materiaIds.join(':').localeCompare(right.materiaIds.join(':')) <= 0 ? left : right;
  };
  const retainVariant = (retained: Map<string, Variant>, variant: Variant) => {
    const key = variantKey(variant);
    const existing = retained.get(key);
    retained.set(key, existing ? preferVariant(existing, variant) : variant);
  };
  const deduplicate = (variants: Iterable<Variant>) => {
    const retained = new Map<string, Variant>();
    for (const variant of variants) {
      retainVariant(retained, variant);
    }
    return [...retained.values()];
  };
  const pruneDominatedCompletedVariants = (variants: Variant[]) => {
    const comparisonStats = profile.meldStats.filter((stat) => stat !== profile.speedStat);
    const bySpeed = new Map<number, Variant[]>();
    for (const variant of variants) {
      const speed = variant.stats[profile.speedStat];
      const speedVariants = bySpeed.get(speed);
      if (speedVariants) speedVariants.push(variant);
      else bySpeed.set(speed, [variant]);
    }

    const retained: Variant[] = [];
    for (const speedVariants of bySpeed.values()) {
      speedVariants.sort((left, right) => {
        const statTotalDifference = comparisonStats.reduce(
          (total, stat) => total + right.stats[stat] - left.stats[stat],
          0
        );
        if (statTotalDifference !== 0) return statTotalDifference;
        if (left.waste !== right.waste) return left.waste - right.waste;
        return left.materiaIds.join(':').localeCompare(right.materiaIds.join(':'));
      });
      const skyline: Variant[] = [];
      for (const candidate of speedVariants) {
        const dominated = skyline.some((other) => {
          const atLeastAsMuchOfEveryRelevantStat = comparisonStats.every(
            (stat) => other.stats[stat] >= candidate.stats[stat]
          );
          if (!atLeastAsMuchOfEveryRelevantStat) return false;
          const strictlyMoreUsefulStats = comparisonStats.some(
            (stat) => other.stats[stat] > candidate.stats[stat]
          );
          return strictlyMoreUsefulStats || other.waste < candidate.waste;
        });
        if (!dominated) skyline.push(candidate);
      }
      for (const variant of skyline) retained.push(variant);
    }
    return retained;
  };

  let active = relicAllocations.map((allocation) => evaluate([...lockedMateria], allocation));
  const completed = new Map<string, Variant>();
  for (let absoluteIndex = lockedMateria.length; absoluteIndex < capacity; absoluteIndex += 1) {
    // Advanced slots are optional. Retaining the current path lets the optimiser
    // stop when every further legal meld would contribute no stats.
    if (absoluteIndex >= item.materiaSlots) {
      for (const variant of active) retainVariant(completed, variant);
    }
    const legalChoices = relevantMateria.filter((materia) => materiaAllowedAtItemIndex(item, absoluteIndex, materia));
    if (legalChoices.length === 0) {
      for (const variant of active) retainVariant(completed, variant);
      active = [];
      break;
    }
    const expanded = new Map<string, Variant>();
    for (const variant of active) {
      for (const materia of preferredChoicesForVariant(variant, legalChoices)) {
        retainVariant(expanded, extend(variant, materia));
      }
    }
    active = [...expanded.values()];
  }
  for (const variant of active) retainVariant(completed, variant);
  return pruneDominatedCompletedVariants(deduplicate(completed.values()));
};

const pruneDominatedSlotVariants = (
  variants: Variant[],
  slot: GearSlot,
  profile: CombatEvaluatorProfile
): Variant[] => {
  if (slot === 'ringLeft' || slot === 'ringRight') return variants;

  const comparisonStats = STAT_KEYS.filter((stat) => stat !== profile.speedStat);
  const byTiming = new Map<string, Variant[]>();
  for (const variant of variants) {
    const timingKey = `${variant.stats[profile.speedStat]}:${slot === 'weapon' ? variant.item.weaponDelayMs : 0}`;
    const timingVariants = byTiming.get(timingKey);
    if (timingVariants) timingVariants.push(variant);
    else byTiming.set(timingKey, [variant]);
  }

  const retained: Variant[] = [];
  for (const timingVariants of byTiming.values()) {
    timingVariants.sort((left, right) => {
      if (left.item.weaponDamage !== right.item.weaponDamage) {
        return right.item.weaponDamage - left.item.weaponDamage;
      }
      const statTotalDifference = comparisonStats.reduce(
        (total, stat) => total + right.stats[stat] - left.stats[stat],
        0
      );
      if (statTotalDifference !== 0) return statTotalDifference;
      if (left.waste !== right.waste) return left.waste - right.waste;
      if (left.item.itemLevel !== right.item.itemLevel) return right.item.itemLevel - left.item.itemLevel;
      return String(left.item.id).localeCompare(String(right.item.id));
    });

    const skyline: Variant[] = [];
    for (const candidate of timingVariants) {
      const dominated = skyline.some((other) => {
        if (other.item.weaponDamage < candidate.item.weaponDamage) return false;
        if (comparisonStats.some((stat) => other.stats[stat] < candidate.stats[stat])) return false;
        const strictlyMoreUsefulStats = comparisonStats.some(
          (stat) => other.stats[stat] > candidate.stats[stat]
        );
        return (
          other.item.weaponDamage > candidate.item.weaponDamage ||
          strictlyMoreUsefulStats ||
          other.waste < candidate.waste ||
          (
            other.waste === candidate.waste &&
            other.item.itemLevel > candidate.item.itemLevel
          )
        );
      });
      if (!dominated) skyline.push(candidate);
    }
    for (const variant of skyline) retained.push(variant);
  }
  return retained;
};

const keepBoundedSlotVariants = (
  variants: Variant[],
  limit: number,
  profile: CombatEvaluatorProfile
): { variants: Variant[]; truncated: boolean } => {
  if (variants.length <= limit) return { variants, truncated: false };

  const score = (variant: Variant) => expectedAction100(
    addStats(profile.baseStats, variant.stats),
    Math.max(100, variant.item.weaponDamage),
    profile
  );
  const compare = (left: Variant, right: Variant) => {
    const scoreDifference = score(right) - score(left);
    if (scoreDifference !== 0) return scoreDifference;
    if (left.waste !== right.waste) return left.waste - right.waste;
    if (left.item.itemLevel !== right.item.itemLevel) return right.item.itemLevel - left.item.itemLevel;
    const itemDifference = String(left.item.id).localeCompare(String(right.item.id));
    return itemDifference !== 0
      ? itemDifference
      : left.materiaIds.join(':').localeCompare(right.materiaIds.join(':'));
  };

  const bySpeed = new Map<number, Variant[]>();
  for (const variant of variants) {
    const speed = variant.stats[profile.speedStat];
    const speedVariants = bySpeed.get(speed);
    if (speedVariants) speedVariants.push(variant);
    else bySpeed.set(speed, [variant]);
  }
  for (const speedVariants of bySpeed.values()) speedVariants.sort(compare);

  const retained: Variant[] = [];
  const speedGroups = [...bySpeed.entries()].sort(([left], [right]) => left - right);
  if (speedGroups.length <= limit) {
    for (const [, speedVariants] of speedGroups) retained.push(speedVariants[0]!);
  } else {
    const step = speedGroups.length / limit;
    for (let index = 0; index < limit; index += 1) {
      retained.push(speedGroups[Math.floor(index * step)]![1][0]!);
    }
  }

  if (retained.length < limit) {
    const retainedSet = new Set(retained);
    const remaining = variants.filter((variant) => !retainedSet.has(variant)).sort(compare);
    retained.push(...remaining.slice(0, limit - retained.length));
  }
  return { variants: retained, truncated: true };
};

const statsKey = (state: SearchState, constraints: OptimizerConstraints): string => {
  const requiredMask = constraints.requiredItemIds.length === 0
    ? ''
    : (() => {
        const selectedIds = new Set(Object.values(state.items).map((entry) => String(entry?.itemId)));
        return constraints.requiredItemIds.map((id) => (selectedIds.has(String(id)) ? '1' : '0')).join('');
      })();
  const uniqueItemIdentity = [...state.uniqueRingItemIds].sort().join(',');
  return `${STAT_KEYS.map((key) => state.stats[key]).join(':')}:${state.weaponDamage}:${state.weaponDelayMs}:${requiredMask}:${uniqueItemIdentity}`;
};

const objectiveStatsFor = (profile: CombatEvaluatorProfile): StatKey[] => [
  ...new Set([
    profile.mainStat,
    'criticalHit' as const,
    'determination' as const,
    'directHit' as const,
    ...(profile.appliesTenacity ? ['tenacity' as const] : []),
    ...(profile.resourceStat ? [profile.resourceStat] : [])
  ])
].filter((stat) => stat !== profile.speedStat);

interface RemainingSlotBounds {
  maxStats: StatBlock;
  minSpeed: number;
  maxWeaponDamage: number;
}

const optimisticStateHeuristic = (
  state: SearchState,
  remaining: RemainingSlotBounds,
  constraints: OptimizerConstraints,
  profile: CombatEvaluatorProfile
): number => {
  const optimisticStats = addStats(state.stats, remaining.maxStats);
  const withBase = addStats(profile.baseStats, optimisticStats);
  const minimumFinalSpeed = profile.baseStats[profile.speedStat] +
    state.stats[profile.speedStat] +
    remaining.minSpeed;
  const maximumFinalSpeed = withBase[profile.speedStat];
  const slowestGcd = gcdFromSpeed(
    minimumFinalSpeed,
    profile.baseGcdMs,
    profile.hastePercent,
    levelFormulaConstantsFor(profile)
  );
  const fastestGcd = gcdFromSpeed(
    maximumFinalSpeed,
    profile.baseGcdMs,
    profile.hastePercent,
    levelFormulaConstantsFor(profile)
  );
  const gcdDistance = fastestGcd > constraints.maxGcd
    ? fastestGcd - constraints.maxGcd
    : slowestGcd < constraints.minGcd
      ? constraints.minGcd - slowestGcd
      : 0;
  return expectedAction100(
    withBase,
    Math.max(state.weaponDamage, remaining.maxWeaponDamage),
    profile
  ) - gcdDistance * 1_000_000;
};

interface SlotSearchPlan {
  slot: GearSlot;
  variants: Variant[];
  legalCandidateCount: number;
  retainedCandidateCount: number;
  generatedVariantCount: number;
  truncated: boolean;
}

interface ScoredSearchState {
  key: string;
  state: SearchState;
  score: number;
  order: number;
}

const isWorseScoredState = (left: ScoredSearchState, right: ScoredSearchState): boolean =>
  left.score < right.score || (left.score === right.score && left.order > right.order);

const pushScoredState = (heap: ScoredSearchState[], entry: ScoredSearchState) => {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!isWorseScoredState(heap[index]!, heap[parent]!)) break;
    [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
    index = parent;
  }
};

const replaceWorstScoredState = (heap: ScoredSearchState[], entry: ScoredSearchState): ScoredSearchState => {
  const removed = heap[0]!;
  heap[0] = entry;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let worst = index;
    if (left < heap.length && isWorseScoredState(heap[left]!, heap[worst]!)) worst = left;
    if (right < heap.length && isWorseScoredState(heap[right]!, heap[worst]!)) worst = right;
    if (worst === index) break;
    [heap[index], heap[worst]] = [heap[worst]!, heap[index]!];
    index = worst;
  }
  return removed;
};

const compareScoredSearchStates = (left: ScoredSearchState, right: ScoredSearchState): number => {
  const score = right.score - left.score;
  if (score !== 0) return score;
  if (left.state.waste !== right.state.waste) return left.state.waste - right.state.waste;
  if (left.state.itemLevelTotal !== right.state.itemLevelTotal) {
    return right.state.itemLevelTotal - left.state.itemLevelTotal;
  }
  return left.order - right.order;
};

const retainSpeedLaneCandidate = (
  lanes: Map<number, ScoredSearchState[]>,
  entry: ScoredSearchState,
  speedStat: CombatEvaluatorProfile['speedStat'],
  perLaneLimit = 2
) => {
  const speed = entry.state.stats[speedStat];
  const lane = lanes.get(speed) ?? [];
  const existing = lane.find((candidate) => candidate.key === entry.key);
  if (existing) {
    if (compareScoredSearchStates(entry, existing) < 0) {
      existing.state = entry.state;
      existing.score = entry.score;
      existing.order = entry.order;
    }
    return;
  }
  lane.push(entry);
  lane.sort(compareScoredSearchStates);
  if (lane.length > perLaneLimit) lane.length = perLaneLimit;
  lanes.set(speed, lane);
};

const evenlySampledIndices = (length: number, count: number): number[] => {
  if (length <= 0 || count <= 0) return [];
  if (count >= length) return Array.from({ length }, (_, index) => index);
  if (count === 1) return [Math.floor((length - 1) / 2)];
  return Array.from({ length: count }, (_, index) =>
    Math.round(index * (length - 1) / (count - 1))
  );
};

const mergeSpeedAwareFrontier = (
  globalHeap: ScoredSearchState[],
  speedLanes: Map<number, ScoredSearchState[]>,
  limit: number
): SearchState[] => {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const laneBudget = Math.min(
    boundedLimit,
    Math.max(1, Math.floor(boundedLimit * 0.35))
  );
  const laneGroups = [...speedLanes.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, entries]) => [...entries].sort(compareScoredSearchStates));
  const reserved: ScoredSearchState[] = [];

  if (laneGroups.length <= laneBudget) {
    for (const lane of laneGroups) {
      if (lane[0]) reserved.push(lane[0]);
    }
    let depth = 1;
    while (reserved.length < laneBudget) {
      let added = false;
      for (const lane of laneGroups) {
        if (reserved.length >= laneBudget) break;
        if (lane[depth]) {
          reserved.push(lane[depth]!);
          added = true;
        }
      }
      if (!added) break;
      depth += 1;
    }
  } else {
    for (const index of evenlySampledIndices(laneGroups.length, laneBudget)) {
      if (laneGroups[index]?.[0]) reserved.push(laneGroups[index]![0]!);
    }
  }

  const selected = new Map<string, ScoredSearchState>();
  const add = (entry: ScoredSearchState) => {
    const existing = selected.get(entry.key);
    if (!existing || compareScoredSearchStates(entry, existing) < 0) {
      selected.set(entry.key, entry);
    }
  };
  for (const entry of reserved) add(entry);
  for (const entry of [...globalHeap].sort(compareScoredSearchStates)) {
    if (selected.size >= boundedLimit && !selected.has(entry.key)) break;
    add(entry);
  }

  return [...selected.values()]
    .sort(compareScoredSearchStates)
    .slice(0, boundedLimit)
    .map((entry) => entry.state);
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

const supportingRecordIsWithinAccess = (
  record: { expansionId?: string; requiredLevel?: number },
  snapshot: GearSnapshot,
  constraints: ResolvedOptimizerConstraints
): boolean => {
  if (constraints.accessLevel !== undefined && record.requiredLevel !== undefined && record.requiredLevel > constraints.accessLevel) {
    return false;
  }
  if (!record.expansionId || !constraints.accessExpansion) return true;
  const selectedExpansion = snapshot.registry.expansions.find((entry) => entry.id === constraints.accessExpansion);
  const recordExpansion = snapshot.registry.expansions.find((entry) => entry.id === record.expansionId);
  return Boolean(selectedExpansion && recordExpansion && recordExpansion.order <= selectedExpansion.order);
};

const officialItemAccess = (
  item: EquipmentItem,
  snapshot: GearSnapshot,
  constraints: ResolvedOptimizerConstraints,
  job: CombatJob
) => assessItemAccess(item, snapshot.registry, {
  expansionId: constraints.accessExpansion ?? snapshot.registry.expansions.at(-1)!.id,
  level: constraints.accessLevel ?? Math.max(...snapshot.registry.expansions.map((entry) => entry.levelCap)),
  job
}, snapshot.contentGraph);

const hasValidatedAcquisitionRoute = (item: EquipmentItem): boolean =>
  (item.acquisitionRoutes ?? []).some((route) => route.status === 'validated');

export interface CatalogueReadinessOptions {
  accessExpansion: string;
  accessLevel: number;
  jobMode?: string;
  previousSnapshot?: GearSnapshot;
}

export const assessCatalogueReadiness = (
  snapshot: GearSnapshot,
  job: CombatJob,
  options: CatalogueReadinessOptions
): CatalogueReadinessReport => {
  const issues: CatalogueReadinessIssue[] = [];
  const compatibility = assessSnapshotCompatibility(snapshot, OPTIMIZER_RUNTIME_COMPATIBILITY);
  if (!compatibility.compatible) {
    issues.push({
      code: 'incompatible-evaluator',
      severity: 'blocking',
      message: compatibility.errors.join(' ')
    });
  }
  const accessConstraints = resolveOptimizerConstraints({
    minResource: 0,
    minGcd: 1.5,
    maxGcd: 2.5,
    allowedSources: [],
    requiredItemIds: [],
    excludedItemIds: [],
    frontierLimit: 1,
    accessExpansion: options.accessExpansion,
    accessLevel: options.accessLevel,
    jobMode: options.jobMode ?? 'standard'
  }, snapshot.materia);
  const candidates = snapshot.items.filter((item) =>
    item.origin === 'official' &&
    item.jobs.includes(job) &&
    item.level === options.accessLevel &&
    officialItemAccess(item, snapshot, accessConstraints, job).status !== 'blocked'
  );
  const coveredSlots = gearSlotsForJob(job).filter((slot) => candidates.some((item) => candidateForSlot(item, slot)));
  for (const slot of gearSlotsForJob(job)) {
    const slotItems = candidates.filter((item) => candidateForSlot(item, slot));
    const hasCoverage = slot === 'ringLeft' || slot === 'ringRight'
      ? slotItems.some((left) => slotItems.some((right) => String(left.id) !== String(right.id) || (!left.unique && !right.unique)))
      : slotItems.length > 0;
    if (!hasCoverage) {
      issues.push({ code: 'missing-slot', severity: 'blocking', message: `No legal ${slot} catalogue candidate exists for ${job}.` });
    }
  }

  const invalidItems = candidates.filter((item) =>
    !Number.isFinite(item.itemLevel) || item.itemLevel <= 0 ||
    !Number.isFinite(item.level) || item.level <= 0 ||
    !Number.isFinite(item.weaponDamage) || item.weaponDamage < 0 ||
    STAT_KEYS.some((stat) =>
      !Number.isFinite(item.stats[stat]) || item.stats[stat] < 0 ||
      !Number.isFinite(item.statCaps[stat]) || item.statCaps[stat] < 0 ||
      item.stats[stat] > item.statCaps[stat]
    )
  );
  if (invalidItems.length > 0) {
    issues.push({
      code: 'invalid-item',
      severity: 'blocking',
      message: `${invalidItems.length} official item records contain invalid stats, caps, levels, or weapon damage.`,
      itemIds: invalidItems.map((item) => item.id)
    });
  }
  const nqCraftedItems = candidates.filter((item) => item.sourceFamily === 'crafted' && item.quality !== 'hq');
  if (nqCraftedItems.length > 0) {
    issues.push({
      code: 'nq-crafted-item',
      severity: 'blocking',
      message: `${nqCraftedItems.length} crafted equipment records are not explicitly HQ and were rejected.`,
      itemIds: nqCraftedItems.map((item) => item.id)
    });
  }
  const incompleteAcquisition = candidates.filter((item) => !hasValidatedAcquisitionRoute(item));
  if (incompleteAcquisition.length > 0) {
    issues.push({
      code: 'incomplete-acquisition',
      severity: 'warning',
      message: `${incompleteAcquisition.length} official items have incomplete acquisition access data.`,
      itemIds: incompleteAcquisition.map((item) => item.id)
    });
  }
  const missingIcons = candidates.filter((item) => !item.iconUrl && !item.iconPath);
  if (missingIcons.length > 0) {
    issues.push({
      code: 'missing-icon',
      severity: 'warning',
      message: `${missingIcons.length} official items are missing an icon.`,
      itemIds: missingIcons.map((item) => item.id)
    });
  }
  const accessProfile = (() => {
    try {
      return getCombatEvaluatorProfileForAccess(
        job,
        snapshot,
        options.accessExpansion,
        options.accessLevel,
        options.jobMode ?? 'standard'
      );
    } catch {
      return undefined;
    }
  })();
  if (!snapshot.curatedSets.some((set) =>
    set.job === job &&
    set.level === options.accessLevel &&
    (!accessProfile || set.calculationContext?.rulesetId === accessProfile.rulesetId)
  )) {
    issues.push({
      code: 'missing-curation',
      severity: 'warning',
      message: `No compatible community-curated ${job} set is active; official-data recommendations remain preliminary.`
    });
  }

  const previousCandidates = options.previousSnapshot?.items.filter((item) => item.origin === 'official' && item.jobs.includes(job)) ?? [];
  if (previousCandidates.length > 0 && candidates.length < Math.floor(previousCandidates.length * 0.5)) {
    issues.push({
      code: 'suspicious-item-count',
      severity: 'blocking',
      message: `Official ${job} catalogue count fell from ${previousCandidates.length} to ${candidates.length}.`
    });
  }
  if (previousCandidates.length > 0) {
    const previousMaximum = Math.max(...previousCandidates.map((item) => Math.max(item.weaponDamage, ...STAT_KEYS.map((stat) => item.stats[stat]))));
    const candidateMaximum = Math.max(0, ...candidates.map((item) => Math.max(item.weaponDamage, ...STAT_KEYS.map((stat) => item.stats[stat]))));
    if (previousMaximum > 0 && candidateMaximum > previousMaximum * 1.6) {
      issues.push({
        code: 'suspicious-stat-jump',
        severity: 'blocking',
        message: `Maximum official ${job} item stat jumped from ${previousMaximum} to ${candidateMaximum}.`
      });
    }
  }

  const blocked = issues.some((issue) => issue.severity === 'blocking');
  const warning = issues.some((issue) => issue.severity === 'warning');
  const confidence = issues.some((issue) => issue.code === 'incompatible-evaluator')
    ? 'evaluator-outdated'
    : issues.some((issue) => issue.code === 'incomplete-acquisition')
      ? 'incomplete-acquisition'
      : issues.some((issue) => issue.code === 'missing-curation')
        ? 'official-preliminary'
        : 'community-validated';
  return {
    status: blocked ? 'blocked' : warning ? 'preliminary' : 'ready',
    confidence,
    issues,
    checkedItemCount: candidates.length,
    coveredSlots
  };
};

const toGearSet = (
  state: SearchState,
  snapshot: GearSnapshot,
  itemsById: ReadonlyMap<string, EquipmentItem>,
  foodId: number | undefined,
  rank: number,
  job: CombatJob,
  constraints: ResolvedOptimizerConstraints
): GearSet => {
  const profile = getCombatEvaluatorProfileForAccess(
    job,
    snapshot,
    constraints.accessExpansion ?? snapshot.registry.expansions.at(-1)!.id,
    constraints.accessLevel ?? snapshot.registry.expansions.at(-1)!.levelCap,
    constraints.jobMode
  );
  const ruleset = snapshot.rulesets.find((entry) => entry.id === profile.rulesetId);
  if (!ruleset) throw new Error(`Evaluator profile ${profile.id} references missing ruleset ${profile.rulesetId}.`);
  const food = snapshot.foods.find((entry) => entry.id === foodId);
  let stats = addStats(profile.baseStats, state.stats);
  stats[profile.mainStat] = Math.floor(stats[profile.mainStat] * 1.05);
  stats.vitality = Math.floor(stats.vitality * 1.05);
  stats = applyFood(stats, food);
  const gcd = gcdFromSpeed(stats[profile.speedStat], profile.baseGcdMs, profile.hastePercent, levelFormulaConstantsFor(profile));
  const experimentalItems = Object.values(state.items).flatMap((entry) => {
    const item = entry ? itemsById.get(String(entry.itemId)) : undefined;
    return item && item.origin === 'custom' && !customItemIsWithinAccess(item, snapshot, constraints) ? [item] : [];
  });
  const uncertainAcquisitionItems = Object.values(state.items).flatMap((entry) => {
    const item = entry ? itemsById.get(String(entry.itemId)) : undefined;
    return item?.origin === 'official' && !hasValidatedAcquisitionRoute(item) ? [item] : [];
  });
  const preliminary = !snapshot.curatedSets.some((set) =>
    set.job === job &&
    set.level === ruleset.maximumLevel &&
    set.calculationContext?.rulesetId === ruleset.id
  );
  const recommendationConfidence = uncertainAcquisitionItems.length > 0
    ? {
      status: 'incomplete-acquisition' as const,
      reasons: [
        `Acquisition data is incomplete for ${uncertainAcquisitionItems.map((item) => item.name).join(', ')}.`,
        ...(preliminary ? ['No compatible curated overlay is active; this result was generated from official item data.'] : [])
      ]
    }
    : preliminary
      ? {
        status: 'official-preliminary' as const,
        reasons: ['No compatible curated overlay is active; this result was generated from official item data.']
      }
      : {
        status: 'official-validated' as const,
        reasons: ['Official item and acquisition data passed the active access checks.']
      };
  const identityText = Object.entries(state.items)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slot, equipped]) => `${slot}:${String(equipped?.itemId)}:${equipped?.materiaIds.join('.') ?? ''}:${JSON.stringify(equipped?.relicStats ?? {})}`)
    .join('|');
  let identityHash = 2_166_136_261;
  for (let index = 0; index < identityText.length; index += 1) {
    identityHash ^= identityText.charCodeAt(index);
    identityHash = Math.imul(identityHash, 16_777_619);
  }

  return {
    id: `generated-${rank}-${foodId ?? 'none'}-${Math.round(gcd * 100)}-${(identityHash >>> 0).toString(36)}`,
    origin: 'generated',
    name: rank === 1 ? (preliminary ? 'Best preliminary official-data result' : 'Best reference-pool result') : `Alternative ${rank}`,
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
      calculationSchema: ruleset.calculationSchema,
      jobMode: profile.jobMode,
      evaluationMode: 'generic-hit'
    },
    recommendationConfidence,
    assumptions: [
      'Expected single 100-potency hit proxy; not an encounter or rotation simulation.',
      'Five percent party bonus.',
      `${job} baseline stats match the current source fixtures.`,
      `${job} uses ${profile.id}, a reference-validated level-100 ${profile.role} damage proxy.`,
      profile.limitation,
      `Search is limited to the verified patch 7.4 ${job} reference pool.`,
      ...(preliminary ? ['Community curation is absent; this is a preliminary official-data recommendation.'] : []),
      ...(uncertainAcquisitionItems.length > 0
        ? [`Acquisition data is incomplete for ${uncertainAcquisitionItems.map((item) => item.name).join(', ')}.`]
        : []),
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

export const optimizeCombatJob = (
  snapshot: GearSnapshot,
  constraints: OptimizerConstraints,
  job: CombatJob,
  control?: OptimizerControl
): OptimizerResult => {
  const started = performance.now();
  const ensureNotCancelled = () => {
    if (control?.isCancelled?.()) throw new OptimizerCancelledError();
  };
  const reportProgress = (
    progress: number,
    phase: OptimizerProgress['phase'],
    message: string
  ) => control?.reportProgress?.({ progress: Math.max(0, Math.min(1, progress)), phase, message });
  ensureNotCancelled();
  reportProgress(0.01, 'preparing', 'Checking catalogue compatibility and constraints.');
  ensureSnapshotCompatible(snapshot);
  const latestExpansion = snapshot.registry.expansions.at(-1)!;
  const resolved = {
    ...resolveOptimizerConstraints(constraints, snapshot.materia),
    accessExpansion: constraints.accessExpansion ?? latestExpansion.id,
    accessLevel: constraints.accessLevel ?? latestExpansion.levelCap
  };
  const itemsById = new Map(snapshot.items.map((item) => [String(item.id), item]));
  const fail = (message: string): OptimizerResult => ({
    alternatives: [],
    evaluatedStates: 0,
    durationMs: performance.now() - started,
    truncated: false,
    optimality: {
      status: 'not-proven',
      objective: 'generic-hit',
      searchMode: resolved.searchMode,
      reason: 'No legal result was produced.'
    },
    explanation: [message]
  });
  let profile: CombatEvaluatorProfile;
  try {
    profile = getCombatEvaluatorProfileForAccess(
      job,
      snapshot,
      resolved.accessExpansion ?? snapshot.registry.expansions.at(-1)!.id,
      resolved.accessLevel ?? snapshot.registry.expansions.at(-1)!.levelCap,
      resolved.jobMode
    );
  } catch (error) {
    const declared = getEvaluatorCapability(snapshot.registry, job, resolved.jobMode, 'generic-hit');
    if (!declared || declared.status !== 'available') {
      throw new Error(
        `Generic-hit evaluation is ${declared?.status ?? 'unsupported'} for ${job}. Mode ${resolved.jobMode}.${declared?.reason ? ` ${declared.reason}` : ''}`
      );
    }
    throw error;
  }
  const capability = resolveEvaluatorCapability(
    snapshot,
    job,
    resolved.jobMode,
    'generic-hit',
    profile.rulesetId
  );
  if (capability.status !== 'available' || capability.profileId !== profile.id) {
    throw new Error(capability.reason ?? `Generic-hit evaluation is ${capability.status} for ${job} ${resolved.jobMode}.`);
  }
  const gearSlots = gearSlotsForJob(job);
  const excluded = new Set(resolved.excludedItemIds.map(String));
  const required = new Set(resolved.requiredItemIds.map(String));
  const allowed = new Set(resolved.allowedSources);
  const lockedEntries = Object.entries(resolved.lockedItemIdsBySlot) as Array<[GearSlot, number | string]>;
  const lockedIds = new Set(lockedEntries.map(([, id]) => String(id)));

  if (!Number.isFinite(resolved.minGcd) || !Number.isFinite(resolved.maxGcd) || resolved.minGcd > resolved.maxGcd) {
    return fail('The GCD range is invalid. Set a minimum that is less than or equal to the maximum.');
  }
  if (!['any', 'exact', 'range'].includes(resolved.itemLevelMode)) {
    return fail('The item-level filter mode is invalid. Choose Any, Exact, or Range.');
  }
  const minimumItemLevel = resolved.itemLevelMode === 'any' ? 1 : resolved.minItemLevel;
  const maximumItemLevel = resolved.itemLevelMode === 'any'
    ? 9999
    : resolved.itemLevelMode === 'exact' ? resolved.minItemLevel : resolved.maxItemLevel;
  if (
    !Number.isFinite(minimumItemLevel) || !Number.isFinite(maximumItemLevel) ||
    minimumItemLevel < 1 || maximumItemLevel < 1 || minimumItemLevel > maximumItemLevel
  ) {
    return fail('The item-level filter is invalid. Use positive values and keep the minimum no higher than the maximum.');
  }
  const itemLevelIsAllowed = (item: EquipmentItem) =>
    item.itemLevel >= minimumItemLevel && item.itemLevel <= maximumItemLevel;
  const directConflict = [...required].find((id) => excluded.has(id));
  if (directConflict) {
    const item = itemsById.get(directConflict);
    return fail(`${item?.name ?? `Item ${directConflict}`} is both required and excluded. Remove one of those rules.`);
  }
  for (const [slot, id] of lockedEntries) {
    const item = itemsById.get(String(id));
    if (!item) return fail(`The item locked in ${slot} is missing from the active data. Choose another item or clear that lock.`);
    if (!candidateForSlot(item, slot) || !item.jobs.includes(job)) {
      return fail(`${item.name} cannot be equipped by ${job} in ${slot}. Clear or replace that equipment lock.`);
    }
    if (excluded.has(String(id))) return fail(`${item.name} is locked in ${slot} and also excluded. Remove one of those rules.`);
    if (item.origin === 'custom' && !resolved.allowCustomItems) {
      return fail(`${item.name} is locked in ${slot}, but hypothetical items are disabled. Enable custom items or clear the lock.`);
    }
    if (item.origin === 'official' && item.sourceFamily === 'tomestone-upgrade' && !resolved.includeUpgradedTomestoneGear) {
      return fail(`${item.name} is locked in ${slot}, but upgraded tomestone gear is disabled. Enable upgraded tomestone gear or clear that lock.`);
    }
    if (item.origin === 'official' && isAugmentedCraftedItem(item) && !resolved.includeAugmentedCraftedGear) {
      return fail(`${item.name} is locked in ${slot}, but augmented crafted gear is disabled. Enable augmented crafted gear or clear that lock.`);
    }
    if (!itemLevelIsAllowed(item)) {
      return fail(`${item.name} is locked in ${slot} at item level ${item.itemLevel}, outside the selected ${minimumItemLevel}${minimumItemLevel === maximumItemLevel ? '' : `-${maximumItemLevel}`} item-level filter.`);
    }
    if (item.origin === 'official' && officialItemAccess(item, snapshot, resolved, job).status === 'blocked') {
      return fail(`${item.name} is locked in ${slot} but is unavailable at the selected expansion or level. Clear or replace that equipment lock.`);
    }
    if (!customItemIsWithinAccess(item, snapshot, resolved) && !resolved.allowExperimentalAccess) {
      return fail(`${item.name} is locked in ${slot} but exceeds the selected expansion or level. Enable the experimental access override or clear the lock.`);
    }
  }
  for (const id of required) {
    const item = itemsById.get(id);
    if (!item) return fail(`Required item ${id} is missing from the active data. Remove the stale requirement or restore the custom item.`);
    if (!item.jobs.includes(job)) return fail(`${item.name} is required but cannot be equipped by ${job}.`);
    if (item.origin === 'custom' && !resolved.allowCustomItems) {
      return fail(`${item.name} is required, but hypothetical items are disabled. Enable custom items or remove the requirement.`);
    }
    if (item.origin === 'official' && item.sourceFamily === 'tomestone-upgrade' && !resolved.includeUpgradedTomestoneGear) {
      return fail(`${item.name} is required, but upgraded tomestone gear is disabled. Enable upgraded tomestone gear or remove the requirement.`);
    }
    if (item.origin === 'official' && isAugmentedCraftedItem(item) && !resolved.includeAugmentedCraftedGear) {
      return fail(`${item.name} is required, but augmented crafted gear is disabled. Enable augmented crafted gear or remove the requirement.`);
    }
    if (!itemLevelIsAllowed(item)) {
      return fail(`${item.name} is required at item level ${item.itemLevel}, outside the selected ${minimumItemLevel}${minimumItemLevel === maximumItemLevel ? '' : `-${maximumItemLevel}`} item-level filter.`);
    }
    if (item.origin === 'official' && officialItemAccess(item, snapshot, resolved, job).status === 'blocked') {
      return fail(`${item.name} is required but unavailable at the selected expansion or level.`);
    }
    if (!customItemIsWithinAccess(item, snapshot, resolved) && !resolved.allowExperimentalAccess) {
      return fail(`${item.name} is required but exceeds the selected expansion or level. Enable the experimental access override or remove it.`);
    }
  }
  const requiredNonRingSlots = new Map<string, EquipmentItem[]>();
  for (const id of required) {
    const item = itemsById.get(id);
    if (!item || item.slot === 'ring') continue;
    requiredNonRingSlots.set(item.slot, [...(requiredNonRingSlots.get(item.slot) ?? []), item]);
  }
  const duplicateRequirement = [...requiredNonRingSlots.entries()].find(([, items]) => items.length > 1);
  if (duplicateRequirement) return fail(`${duplicateRequirement[1].map((item) => item.name).join(' and ')} are both required for ${duplicateRequirement[0]}. Keep only one requirement.`);
  for (const [slot, id] of lockedEntries) {
    const requiredInSlot = requiredNonRingSlots.get(slot);
    if (requiredInSlot?.some((item) => String(item.id) !== String(id))) {
      const locked = itemsById.get(String(id));
      return fail(`${locked?.name ?? id} is locked in ${slot}, but a different item is required there. Remove one of those rules.`);
    }
  }
  for (const [slot, materiaIds] of Object.entries(resolved.lockedMateriaBySlot) as Array<[GearSlot, number[]]>) {
    for (const materiaId of materiaIds) {
      const materia = snapshot.materia.find((entry) => entry.id === materiaId);
      if (!materia) return fail(`A locked meld in ${slot} references missing materia ${materiaId}. Clear that meld lock.`);
      if (!supportingRecordIsWithinAccess(materia, snapshot, resolved)) {
        return fail(`${materia.name} is locked in ${slot} but belongs to a later expansion or level.`);
      }
      if (!profile.meldStats.includes(materia.stat)) return fail(`${materia.name} is not a relevant meld for ${job}. Clear the locked meld in ${slot}.`);
      if (!resolved.allowedMateriaStats.includes(materia.stat) || !resolved.allowedMateriaTiers.includes(materia.tier)) {
        return fail(`${materia.name} is locked in ${slot} but blocked by the materia-family or grade restrictions.`);
      }
    }
  }
  if (resolved.foodMode === 'locked' && !snapshot.foods.some((food) =>
    food.id === resolved.lockedFoodId && supportingRecordIsWithinAccess(food, snapshot, resolved)
  )) {
    return fail('The locked food is missing or unavailable at the selected expansion and level. Choose another food or change the food rule.');
  }
  const itemIsAllowed = (item: EquipmentItem) =>
    item.jobs.includes(job) &&
    (item.origin !== 'official' || resolved.accessLevel === undefined || item.level === resolved.accessLevel) &&
    itemLevelIsAllowed(item) &&
    !excluded.has(String(item.id)) &&
    (
      (item.origin === 'official' && allowed.has(item.sourceFamily) && (
        item.sourceFamily !== 'tomestone-upgrade' || resolved.includeUpgradedTomestoneGear
      ) && (
        !isAugmentedCraftedItem(item) || resolved.includeAugmentedCraftedGear
      )) ||
      (item.origin === 'custom' && resolved.allowCustomItems && (required.has(String(item.id)) || lockedIds.has(String(item.id))))
    ) &&
    (item.origin === 'official'
      ? officialItemAccess(item, snapshot, resolved, job).status !== 'blocked'
      : customItemIsWithinAccess(item, snapshot, resolved) || resolved.allowExperimentalAccess);
  const ringCandidates = snapshot.items.filter(
    (item) =>
      item.slot === 'ring' &&
      itemIsAllowed(item)
  );
  const canFillBothRingSlots = ringCandidates.some((left) =>
    ringCandidates.some((right) => String(left.id) !== String(right.id) || (!left.unique && !right.unique))
  );
  const diagnosticSlotLabels: Partial<Record<GearSlot, string>> = {
    weapon: 'a weapon',
    offHand: 'an off-hand item',
    head: 'head armour',
    body: 'body armour',
    hands: 'hand armour',
    legs: 'leg armour',
    feet: 'foot armour',
    ears: 'earrings',
    neck: 'a necklace',
    wrists: 'a bracelet'
  };
  const missingCoverage = gearSlots
    .filter((slot) => slot !== 'ringLeft' && slot !== 'ringRight')
    .filter((slot) => !snapshot.items.some((item) => candidateForSlot(item, slot) && itemIsAllowed(item)))
    .map((slot) => diagnosticSlotLabels[slot] ?? slot);
  if (!canFillBothRingSlots) {
    missingCoverage.push(ringCandidates.length === 0 ? 'both ring slots' : 'a second ring');
  }
  if (missingCoverage.length > 0) {
    const coverageList = missingCoverage.length === 1
      ? missingCoverage[0]
      : `${missingCoverage.slice(0, -1).join(', ')}, and ${missingCoverage.at(-1)}`;
    return fail(`The selected acquisition categories and equipped custom items cannot fill ${coverageList}. Add a source or compatible custom item covering the missing slots.`);
  }
  const protectedItemIds = new Set([...required, ...lockedIds]);
  const slotPlans: SlotSearchPlan[] = [];
  const slotVariantLimit = Math.min(
    300,
    Math.max(96, Math.ceil(Math.sqrt(Math.max(1, resolved.frontierLimit)) * 6))
  );
  for (let slotIndex = 0; slotIndex < gearSlots.length; slotIndex += 1) {
    ensureNotCancelled();
    const slot = gearSlots[slotIndex]!;
    reportProgress(
      0.04 + 0.16 * slotIndex / Math.max(1, gearSlots.length),
      'slot-variants',
      `Building legal ${slot} variants.`
    );
    const lockedItemId = resolved.lockedItemIdsBySlot[slot];
    const requiredForSlot = snapshot.items.filter(
      (item) => candidateForSlot(item, slot) && required.has(String(item.id))
    );
    const hardRequiredIds = new Set(
      requiredForSlot
        .filter((item) => item.slot !== 'ring')
        .map((item) => String(item.id))
    );
    const legalCandidates = snapshot.items.filter(
      (item) =>
        candidateForSlot(item, slot) &&
        itemIsAllowed(item) &&
        (lockedItemId === undefined || String(item.id) === String(lockedItemId)) &&
        (hardRequiredIds.size === 0 || hardRequiredIds.has(String(item.id)))
    );

    if (legalCandidates.length === 0) {
      return fail(`No legal ${slot} candidate remains after the selected source and exclusion filters.`);
    }

    const retainedCandidates = pruneDominatedEquipmentCandidates(
      legalCandidates,
      slot,
      snapshot,
      profile,
      resolved,
      protectedItemIds
    );
    const generatedVariants = retainedCandidates.flatMap((item) =>
      variantsForItem(item, slot, snapshot, profile, resolved)
    );
    const safelyPrunedVariants = pruneDominatedSlotVariants(
      generatedVariants,
      slot,
      profile
    );
    const slotVariantFrontier = keepBoundedSlotVariants(
      safelyPrunedVariants,
      resolved.searchMode === 'thorough' ? slotVariantLimit * 2 : slotVariantLimit,
      profile
    );
    const variants = slotVariantFrontier.variants;
    if (variants.length === 0) {
      return fail(`No ${slot} item can accept the locked melds under the selected materia and overmelding rules.`);
    }
    slotPlans.push({
      slot,
      variants,
      legalCandidateCount: legalCandidates.length,
      retainedCandidateCount: retainedCandidates.length,
      generatedVariantCount: generatedVariants.length,
      truncated: slotVariantFrontier.truncated
    });
  }

  const remainingBounds: RemainingSlotBounds[] = new Array(slotPlans.length + 1);
  remainingBounds[slotPlans.length] = {
    maxStats: emptyStats(),
    minSpeed: 0,
    maxWeaponDamage: 0
  };
  for (let index = slotPlans.length - 1; index >= 0; index -= 1) {
    const plan = slotPlans[index]!;
    const after = remainingBounds[index + 1]!;
    const maxStats = emptyStats();
    for (const stat of STAT_KEYS) {
      maxStats[stat] = after.maxStats[stat] + Math.max(...plan.variants.map((variant) => variant.stats[stat]));
    }
    remainingBounds[index] = {
      maxStats,
      minSpeed: after.minSpeed + Math.min(...plan.variants.map((variant) => variant.stats[profile.speedStat])),
      maxWeaponDamage: Math.max(after.maxWeaponDamage, ...plan.variants.map((variant) => variant.item.weaponDamage))
    };
  }

  const speedFoods = snapshot.foods.filter((food) =>
    supportingRecordIsWithinAccess(food, snapshot, resolved) &&
    (
      resolved.foodMode === 'allowed' ||
      (resolved.foodMode === 'locked' && food.id === resolved.lockedFoodId)
    )
  );
  const speedWithFood = (speed: number, food: GearSnapshot['foods'][number]) => {
    const bonus = food.bonuses.find((entry) => entry.stat === profile.speedStat);
    return bonus
      ? speed + Math.min(Math.floor(speed * bonus.percent / 100), bonus.cap)
      : speed;
  };
  const reachableGcdBand = (state: SearchState, remaining: RemainingSlotBounds) => {
    const minimumRawSpeed =
      profile.baseStats[profile.speedStat] +
      state.stats[profile.speedStat] +
      remaining.minSpeed;
    const maximumRawSpeed =
      profile.baseStats[profile.speedStat] +
      state.stats[profile.speedStat] +
      remaining.maxStats[profile.speedStat];
    const minimumFinalSpeed = resolved.foodMode === 'locked' && speedFoods[0]
      ? speedWithFood(minimumRawSpeed, speedFoods[0])
      : minimumRawSpeed;
    const maximumFinalSpeed = speedFoods.reduce(
      (maximum, food) => Math.max(maximum, speedWithFood(maximumRawSpeed, food)),
      maximumRawSpeed
    );
    return {
      fastest: gcdFromSpeed(
        maximumFinalSpeed,
        profile.baseGcdMs,
        profile.hastePercent,
        levelFormulaConstantsFor(profile)
      ),
      slowest: gcdFromSpeed(
        minimumFinalSpeed,
        profile.baseGcdMs,
        profile.hastePercent,
        levelFormulaConstantsFor(profile)
      )
    };
  };

  let frontier: SearchState[] = [
    {
      items: {},
      stats: emptyStats(),
      weaponDamage: 0,
      weaponDelayMs: 0,
      itemLevelTotal: 0,
      waste: 0,
      sources: new Set(),
      uniqueRingItemIds: new Set()
    }
  ];
  let evaluatedStates = 0;
  let truncated = slotPlans.some((plan) => plan.truncated);
  let peakFrontierStates = frontier.length;
  const searchFrontierLimit = resolved.searchMode === 'thorough'
    ? Math.min(20_000, Math.max(resolved.frontierLimit, resolved.frontierLimit * 6))
    : Math.max(1, resolved.frontierLimit);

  for (let planIndex = 0; planIndex < slotPlans.length; planIndex += 1) {
    ensureNotCancelled();
    const { slot, variants } = slotPlans[planIndex]!;
    reportProgress(
      0.2 + 0.58 * planIndex / Math.max(1, slotPlans.length),
      'gear-frontier',
      `Combining ${slot} with the retained gear frontier.`
    );
    const remaining = remainingBounds[planIndex + 1]!;
    const retained = new Map<string, ScoredSearchState>();
    const scoredHeap: ScoredSearchState[] = [];
    const speedLaneCandidates = new Map<number, ScoredSearchState[]>();
    const boundedLimit = searchFrontierLimit;
    let slotTruncated = false;
    let insertionOrder = 0;

    for (const state of frontier) {
      ensureNotCancelled();
      for (const variant of variants) {
        if (
          (slot === 'ringRight' || slot === 'ringLeft') &&
          state.uniqueRingItemIds.has(String(variant.item.id)) &&
          variant.item.unique
        ) {
          continue;
        }

        const nextState: SearchState = {
          items: { ...state.items, [slot]: { itemId: variant.item.id, materiaIds: variant.materiaIds, ...(variant.relicStats ? { relicStats: variant.relicStats } : {}) } },
          stats: addStats(state.stats, variant.stats),
          weaponDamage: Math.max(state.weaponDamage, variant.item.weaponDamage),
          weaponDelayMs: slot === 'weapon' ? variant.item.weaponDelayMs : state.weaponDelayMs,
          itemLevelTotal: state.itemLevelTotal + variant.item.itemLevel * gearSlotItemLevelWeight(job, slot),
          waste: state.waste + variant.waste,
          sources: state.sources.has(variant.item.sourceFamily)
            ? state.sources
            : new Set([...state.sources, variant.item.sourceFamily]),
          uniqueRingItemIds: variant.item.slot === 'ring' && variant.item.unique
            ? new Set([...state.uniqueRingItemIds, String(variant.item.id)])
            : state.uniqueRingItemIds
        };
        evaluatedStates += 1;
        if (
          profile.resourceStat &&
          profile.baseStats[profile.resourceStat] +
            nextState.stats[profile.resourceStat] +
            remaining.maxStats[profile.resourceStat] <
            resolved.minResource
        ) {
          continue;
        }
        const reachableGcd = reachableGcdBand(nextState, remaining);
        if (
          resolved.gcdMode === 'range' &&
          (
            reachableGcd.fastest > resolved.maxGcd ||
            reachableGcd.slowest < resolved.minGcd
          )
        ) {
          continue;
        }
        const key = statsKey(nextState, resolved);
        const entry: ScoredSearchState = {
          key,
          state: nextState,
          score: optimisticStateHeuristic(nextState, remaining, resolved, profile),
          order: insertionOrder
        };
        insertionOrder += 1;
        retainSpeedLaneCandidate(speedLaneCandidates, entry, profile.speedStat);
        const existing = retained.get(key);
        if (existing) {
          if (
            nextState.waste < existing.state.waste ||
            (
              nextState.waste === existing.state.waste &&
              nextState.itemLevelTotal > existing.state.itemLevelTotal
            )
          ) {
            existing.state = nextState;
          }
          continue;
        }

        if (scoredHeap.length < boundedLimit) {
          retained.set(key, entry);
          pushScoredState(scoredHeap, entry);
          continue;
        }

        slotTruncated = true;
        const worst = scoredHeap[0]!;
        if (entry.score > worst.score) {
          const removed = replaceWorstScoredState(scoredHeap, entry);
          retained.delete(removed.key);
          retained.set(key, entry);
        }
      }
    }

    frontier = mergeSpeedAwareFrontier(scoredHeap, speedLaneCandidates, boundedLimit);
    peakFrontierStates = Math.max(peakFrontierStates, frontier.length);
    truncated ||= slotTruncated;
  }
  const searchDiagnostics: NonNullable<OptimizerResult['searchDiagnostics']> = {
    legalItemCandidates: slotPlans.reduce((total, plan) => total + plan.legalCandidateCount, 0),
    retainedItemCandidates: slotPlans.reduce((total, plan) => total + plan.retainedCandidateCount, 0),
    dominatedItemCandidates: slotPlans.reduce(
      (total, plan) => total + plan.legalCandidateCount - plan.retainedCandidateCount,
      0
    ),
    generatedSlotVariants: slotPlans.reduce((total, plan) => total + plan.generatedVariantCount, 0),
    retainedSlotVariants: slotPlans.reduce((total, plan) => total + plan.variants.length, 0),
    peakFrontierStates
  };

  const feasible: GearSet[] = [];
  const resourceFeasible: GearSet[] = [];
  const availableFoodIds = snapshot.foods
    .filter((food) => supportingRecordIsWithinAccess(food, snapshot, resolved))
    .map((food) => food.id);
  const foodIds: Array<number | undefined> = resolved.foodMode === 'none'
    ? [undefined]
    : resolved.foodMode === 'locked'
      ? [resolved.lockedFoodId]
      : [undefined, ...availableFoodIds];
  for (const state of frontier) {
    ensureNotCancelled();
    const selectedIds = new Set(Object.values(state.items).map((entry) => String(entry?.itemId)));
    if ([...required].some((id) => !selectedIds.has(id))) continue;

    for (const foodId of foodIds) {
      const set = toGearSet(state, snapshot, itemsById, foodId, 0, job, resolved);
      if (profile.resourceStat && set.metrics.stats[profile.resourceStat] < resolved.minResource) continue;
      resourceFeasible.push(set);
      if (set.metrics.gcd >= resolved.minGcd && set.metrics.gcd <= resolved.maxGcd) feasible.push(set);
    }
  }

  const warmStartCandidates: GearSet[] = [];
  // Known legal source configurations are warm starts, not trusted answers:
  // they pass through the same local item, meld, food, source and formula checks.
  for (const sourceSet of snapshot.curatedSets) {
    ensureNotCancelled();
    if (sourceSet.job !== job) continue;
    const equippedIds = Object.values(sourceSet.items).map((entry) => String(entry?.itemId));
    if (equippedIds.length !== gearSlots.length) continue;
    if ([...required].some((id) => !equippedIds.includes(id))) continue;
    if (equippedIds.some((id) => excluded.has(id))) continue;
    if (lockedEntries.some(([slot, id]) => String(sourceSet.items[slot]?.itemId) !== String(id))) continue;
    if (resolved.foodMode === 'none' && sourceSet.foodId !== undefined) continue;
    if (resolved.foodMode === 'locked' && sourceSet.foodId !== resolved.lockedFoodId) continue;
    const sourceLegal = equippedIds.every((id) => {
      const item = itemsById.get(id);
      return Boolean(item && itemIsAllowed(item));
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
        calculationSchema: snapshot.rulesets.find((entry) => entry.id === profile.rulesetId)!.calculationSchema,
        jobMode: profile.jobMode,
        evaluationMode: 'generic-hit'
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
        warmStartCandidates.push(verifiedWarmStart);
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

  const searchStateForItems = (
    equippedItems: GearSet['items']
  ): SearchState | undefined => {
    const state: SearchState = {
      items: equippedItems,
      stats: emptyStats(),
      weaponDamage: 0,
      weaponDelayMs: 0,
      itemLevelTotal: 0,
      waste: 0,
      sources: new Set(),
      uniqueRingItemIds: new Set()
    };
    for (const slot of gearSlots) {
      const equipped = equippedItems[slot];
      const item = equipped ? itemsById.get(String(equipped.itemId)) : undefined;
      if (!equipped || !item) return undefined;
      const applied = applyMateria(
        item,
        equipped.materiaIds,
        snapshot.materia,
        equipped.relicStats
      );
      state.stats = addStats(state.stats, applied.stats);
      state.weaponDamage = Math.max(state.weaponDamage, item.weaponDamage);
      if (slot === 'weapon') state.weaponDelayMs = item.weaponDelayMs;
      state.itemLevelTotal += item.itemLevel * gearSlotItemLevelWeight(job, slot);
      state.waste += applied.waste;
      state.sources.add(item.sourceFamily);
      if (item.slot === 'ring' && item.unique) state.uniqueRingItemIds.add(String(item.id));
    }
    return state;
  };

  const expandFinalistNeighbors = (
    seeds: readonly GearSet[],
    mode: 'strictly-dominating' | 'all-single-slot'
  ): GearSet[] => {
    const expanded: GearSet[] = [];
    const seen = new Set<string>();
    for (const seed of seeds) {
      ensureNotCancelled();
      for (const plan of slotPlans) {
        const currentEquipped = seed.items[plan.slot];
        const currentItem = currentEquipped
          ? itemsById.get(String(currentEquipped.itemId))
          : undefined;
        if (!currentEquipped || !currentItem) continue;
        const currentApplied = applyMateria(
          currentItem,
          currentEquipped.materiaIds,
          snapshot.materia,
          currentEquipped.relicStats
        );

        for (const variant of plan.variants) {
          const sameIdentity =
            String(variant.item.id) === String(currentItem.id) &&
            variant.materiaIds.join(':') === currentEquipped.materiaIds.join(':') &&
            JSON.stringify(variant.relicStats ?? {}) === JSON.stringify(currentEquipped.relicStats ?? {});
          if (sameIdentity) continue;
          if (mode === 'strictly-dominating') {
            if (
              plan.slot === 'weapon' &&
              variant.item.weaponDelayMs !== currentItem.weaponDelayMs
            ) continue;
            if (variant.item.weaponDamage < currentItem.weaponDamage) continue;
            if (variant.stats[profile.speedStat] !== currentApplied.stats[profile.speedStat]) continue;
            if (STAT_KEYS.some((stat) => variant.stats[stat] < currentApplied.stats[stat])) continue;
            const strictlyBetter =
              variant.item.weaponDamage > currentItem.weaponDamage ||
              STAT_KEYS.some((stat) => variant.stats[stat] > currentApplied.stats[stat]);
            if (!strictlyBetter) continue;
          }

          const nextItems: GearSet['items'] = {
            ...seed.items,
            [plan.slot]: {
              itemId: variant.item.id,
              materiaIds: variant.materiaIds,
              ...(variant.relicStats ? { relicStats: variant.relicStats } : {})
            }
          };
          if (plan.slot === 'ringLeft' || plan.slot === 'ringRight') {
            const otherSlot = plan.slot === 'ringLeft' ? 'ringRight' : 'ringLeft';
            const otherItem = nextItems[otherSlot]
              ? itemsById.get(String(nextItems[otherSlot]!.itemId))
              : undefined;
            if (
              variant.item.unique &&
              otherItem?.unique &&
              String(otherItem.id) === String(variant.item.id)
            ) continue;
          }
          const selectedIds = new Set(Object.values(nextItems).map((entry) => String(entry?.itemId)));
          if ([...required].some((id) => !selectedIds.has(id))) continue;

          const state = searchStateForItems(nextItems);
          if (!state) continue;
          const candidate = toGearSet(
            state,
            snapshot,
            itemsById,
            seed.foodId,
            expanded.length + 1,
            job,
            resolved
          );
          if (profile.resourceStat && candidate.metrics.stats[profile.resourceStat] < resolved.minResource) continue;
          if (candidate.metrics.gcd < resolved.minGcd || candidate.metrics.gcd > resolved.maxGcd) continue;
          const identity = `${candidate.metrics.gcd.toFixed(2)}:${STAT_KEYS.map((stat) => candidate.metrics.stats[stat]).join(':')}:${candidate.metrics.weaponDamage}:${String(candidate.items.weapon?.itemId)}:${candidate.items.weapon?.materiaIds.join('.') ?? ''}:${JSON.stringify(candidate.items.weapon?.relicStats ?? {})}`;
          if (seen.has(identity)) continue;
          seen.add(identity);
          expanded.push(candidate);
        }
      }
    }
    return expanded;
  };

  const retainRotationParetoCandidates = (sets: readonly GearSet[]): GearSet[] => {
    const comparisonStats = objectiveStatsFor(profile);
    const groups = new Map<string, GearSet[]>();
    const dominates = (left: GearSet, right: GearSet) => {
      if (left.metrics.weaponDamage < right.metrics.weaponDamage) return false;
      if (comparisonStats.some((stat) => left.metrics.stats[stat] < right.metrics.stats[stat])) return false;
      const strictlyStronger =
        left.metrics.weaponDamage > right.metrics.weaponDamage ||
        comparisonStats.some((stat) => left.metrics.stats[stat] > right.metrics.stats[stat]);
      if (strictlyStronger) return true;
      if (left.metrics.materiaWaste !== right.metrics.materiaWaste) {
        return left.metrics.materiaWaste < right.metrics.materiaWaste;
      }
      return left.metrics.averageItemLevel >= right.metrics.averageItemLevel;
    };

    for (const candidate of sets) {
      const weapon = candidate.items.weapon
        ? itemsById.get(String(candidate.items.weapon.itemId))
        : undefined;
      const key = `${candidate.metrics.stats[profile.speedStat]}:${weapon?.weaponDelayMs ?? 0}`;
      const skyline = groups.get(key) ?? [];
      if (skyline.some((other) => dominates(other, candidate))) continue;
      groups.set(key, [
        ...skyline.filter((other) => !dominates(candidate, other)),
        candidate
      ]);
    }
    return [...groups.values()].flat().sort(compareSetQuality);
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

  ensureNotCancelled();
  reportProgress(
    0.96,
    'finalizing',
    resolved.searchMode === 'thorough'
      ? 'Refining the larger quality-first simulator candidate pool.'
      : 'Selecting the strongest proxy result and speed-diverse finalists.'
  );
  const finalistLimit = resolved.searchMode === 'thorough' ? 48 : 12;
  const preliminaryFinalists = selectSpeedDiverseFinalists(candidates, finalistLimit);
  const dominatingNeighbors = expandFinalistNeighbors(
    [...preliminaryFinalists, ...warmStartCandidates],
    'strictly-dominating'
  );
  const localNeighbors = resolved.searchMode === 'thorough'
    ? expandFinalistNeighbors(preliminaryFinalists.slice(0, 12), 'all-single-slot')
    : [];
  const finalistPool = resolved.searchMode === 'thorough'
    ? retainRotationParetoCandidates(
      selectSpeedDiverseFinalists(
        [...preliminaryFinalists, ...dominatingNeighbors, ...localNeighbors]
          .sort(compareSetQuality),
        192
      )
    )
    : [...preliminaryFinalists, ...dominatingNeighbors].sort(compareSetQuality);
  const finalists = selectSpeedDiverseFinalists(finalistPool, finalistLimit);
  const selected = candidates.slice(0, 4).map((set, index) => ({
    ...set,
    id: `${set.id}-${index + 1}`,
    name: index === 0
      ? speedFallback
        ? 'Closest attainable result'
        : !truncated
          ? 'Optimal reference-pool result'
          : resolved.searchMode === 'thorough'
            ? 'Best reference-pool result found (thorough)'
            : 'Best reference-pool result found (quick)'
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

  const optimality = {
    status: !truncated
      ? 'proven' as const
      : 'not-proven' as const,
    objective: 'generic-hit' as const,
    searchMode: resolved.searchMode,
    reason: !truncated
      ? 'Every remaining legal stat state was retained or removed only by exact equivalence or mathematical dominance.'
      : `${resolved.searchMode === 'thorough' ? 'Thorough search' : 'Quick preview'} retained a bounded ${searchFrontierLimit.toLocaleString()}-state frontier and cannot prove global optimality.`
  };
  reportProgress(1, 'finalizing', selected.length > 0
    ? optimality.status === 'proven'
      ? 'Thorough proxy search complete with an optimality proof.'
      : 'Quick proxy preview complete.'
    : 'Search complete without a legal result.');
  return {
    best: selected[0],
    alternatives: selected.slice(1),
    finalists,
    evaluatedStates,
    durationMs: performance.now() - started,
    truncated,
    optimality,
    speedFallback,
    searchDiagnostics,
    explanation:
      selected.length > 0
        ? speedFallback
          ? [
            `No set in the selected acquisition pool can reach ${resolved.gcdTargetName} at ${requestedGcdLabel}. Showing the closest attainable ${speedFallback.achievedGcd.toFixed(2)}s result${resourceRequirement ? ` satisfying ${resourceRequirement}` : ''}, then optimising its melds for the expected single 100-potency hit.`,
            truncated
              ? `The ${resolved.searchMode} search retained a bounded ${searchFrontierLimit.toLocaleString()}-state frontier; this is the strongest result found, not a proof of global optimality.`
              : 'Every remaining legal stat state was retained or removed only when another state was mathematically at least as strong under the same timing.'
          ]
          : [
            `Selected the highest expected single 100-potency hit result${resourceRequirement ? ` satisfying ${resourceRequirement}` : ''} at ${resolved.gcdTargetName} (${requestedGcdLabel}).`,
            truncated
              ? `The ${resolved.searchMode} search retained a bounded ${searchFrontierLimit.toLocaleString()}-state frontier; this is the strongest result found, not a proof of global optimality.`
              : 'Every remaining legal stat state was retained or removed only when another state was mathematically at least as strong under the same timing.'
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
