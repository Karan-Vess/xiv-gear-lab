import {
  STAT_KEYS,
  addStats,
  assessSnapshotCompatibility,
  assessItemAccess,
  assertSnapshotCompatible,
  emptyStats,
  getEvaluatorCapability,
  gearSlotItemLevelWeight,
  gearSlotWeightTotal,
  gearSlotsForJob,
  isAugmentedCraftedItem,
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
  relicStats?: EquippedItem['relicStats'];
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
  const variantKey = (variant: Variant) => STAT_KEYS.map((stat) => variant.stats[stat]).join(':');
  const preferVariant = (left: Variant, right: Variant) => {
    if (left.waste !== right.waste) return left.waste < right.waste ? left : right;
    if (left.materiaIds.length !== right.materiaIds.length) return left.materiaIds.length < right.materiaIds.length ? left : right;
    return left.materiaIds.join(':').localeCompare(right.materiaIds.join(':')) <= 0 ? left : right;
  };
  const deduplicate = (variants: Variant[]) => {
    const retained = new Map<string, Variant>();
    for (const variant of variants) {
      const key = variantKey(variant);
      const existing = retained.get(key);
      retained.set(key, existing ? preferVariant(existing, variant) : variant);
    }
    return [...retained.values()];
  };

  let active = relicAllocations.map((allocation) => evaluate([...lockedMateria], allocation));
  const completed: Variant[] = [];
  for (let absoluteIndex = lockedMateria.length; absoluteIndex < capacity; absoluteIndex += 1) {
    // Advanced slots are optional. Retaining the current path lets the optimiser
    // stop when every further legal meld would contribute no stats.
    if (absoluteIndex >= item.materiaSlots) completed.push(...active);
    const legalChoices = relevantMateria.filter((materia) => materiaAllowedAtItemIndex(item, absoluteIndex, materia));
    if (legalChoices.length === 0) {
      completed.push(...active);
      active = [];
      break;
    }
    const expanded = active.flatMap((variant) => legalChoices.map((materia) =>
      evaluate([...variant.materiaIds, materia.id], variant.relicStats)
    ));
    active = deduplicate(expanded);
  }
  completed.push(...active);
  const variants = deduplicate(completed);
  return variants.filter((candidate, candidateIndex) => !variants.some((other, otherIndex) => {
    if (candidateIndex === otherIndex || other.stats[profile.speedStat] !== candidate.stats[profile.speedStat]) return false;
    const atLeastAsMuchOfEveryRelevantStat = profile.meldStats.every((stat) => other.stats[stat] >= candidate.stats[stat]);
    if (!atLeastAsMuchOfEveryRelevantStat) return false;
    const strictlyMoreUsefulStats = profile.meldStats.some((stat) => other.stats[stat] > candidate.stats[stat]);
    return strictlyMoreUsefulStats || other.waste < candidate.waste;
  }));
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
  const gcd = gcdFromSpeed(
    withBase[profile.speedStat],
    profile.baseGcdMs,
    profile.hastePercent,
    levelFormulaConstantsFor(profile)
  );
  const target = Math.min(constraints.maxGcd, Math.max(constraints.minGcd, gcd));
  const gcdPenalty = Math.abs(gcd - target) * 1_000_000;
  return expectedAction100(withBase, state.weaponDamage, profile) - gcdPenalty;
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
    accessLevel: options.accessLevel
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
      return getCombatEvaluatorProfileForAccess(job, snapshot, options.accessExpansion, options.accessLevel);
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
    constraints.accessLevel ?? snapshot.registry.expansions.at(-1)!.levelCap
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

  return {
    id: `generated-${rank}-${foodId}-${Math.round(gcd * 100)}`,
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
      calculationSchema: ruleset.calculationSchema
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

export const optimizeCombatJob = (snapshot: GearSnapshot, constraints: OptimizerConstraints, job: CombatJob): OptimizerResult => {
  const started = performance.now();
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
    explanation: [message]
  });
  const capability = getEvaluatorCapability(snapshot.registry, job, 'standard', 'generic-hit');
  if (capability?.status !== 'available') {
    throw new Error(`Generic-hit evaluation is ${capability?.status ?? 'unsupported'} for ${job}.`);
  }
  const profile = getCombatEvaluatorProfileForAccess(
    job,
    snapshot,
    resolved.accessExpansion ?? snapshot.registry.expansions.at(-1)!.id,
    resolved.accessLevel ?? snapshot.registry.expansions.at(-1)!.levelCap
  );
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
          items: { ...state.items, [slot]: { itemId: variant.item.id, materiaIds: variant.materiaIds, ...(variant.relicStats ? { relicStats: variant.relicStats } : {}) } },
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
  const availableFoodIds = snapshot.foods
    .filter((food) => supportingRecordIsWithinAccess(food, snapshot, resolved))
    .map((food) => food.id);
  const foodIds: Array<number | undefined> = resolved.foodMode === 'none'
    ? [undefined]
    : resolved.foodMode === 'locked'
      ? [resolved.lockedFoodId]
      : [undefined, ...availableFoodIds];
  for (const state of frontier) {
    const selectedIds = new Set(Object.values(state.items).map((entry) => String(entry?.itemId)));
    if ([...required].some((id) => !selectedIds.has(id))) continue;

    for (const foodId of foodIds) {
      const set = toGearSet(state, snapshot, itemsById, foodId, 0, job, resolved);
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
