export const STAT_KEYS = [
  'strength',
  'dexterity',
  'intelligence',
  'mind',
  'vitality',
  'piety',
  'tenacity',
  'criticalHit',
  'determination',
  'directHit',
  'skillSpeed',
  'spellSpeed'
] as const;

export type StatKey = (typeof STAT_KEYS)[number];
export type StatBlock = Record<StatKey, number>;

export const GEAR_SLOTS = [
  'weapon',
  'offHand',
  'head',
  'body',
  'hands',
  'legs',
  'feet',
  'ears',
  'neck',
  'wrists',
  'ringLeft',
  'ringRight'
] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];
export type ItemSlot = Exclude<GearSlot, 'ringLeft' | 'ringRight'> | 'ring';
export const SOURCE_FAMILIES = [
  'crafted',
  'normal-raid',
  'savage',
  'tomestone',
  'tomestone-upgrade',
  'dungeon',
  'trial',
  'alliance-raid',
  'relic',
  'ultimate',
  'quest',
  'vendor',
  'custom',
  'other',
  'unknown'
] as const;
export type SourceFamily = (typeof SOURCE_FAMILIES)[number];
/**
 * Job identifiers are provider data, not a closed TypeScript union. Known IDs
 * are still validated through the active snapshot registry before use.
 */
export type CombatJob = string;
export type ExpansionId = string;

export const gearSlotsForJob = (job: CombatJob): GearSlot[] =>
  job === 'PLD' ? [...GEAR_SLOTS] : GEAR_SLOTS.filter((slot) => slot !== 'offHand');

export const gearSlotItemLevelWeight = (job: CombatJob, slot: GearSlot): number => {
  if (job !== 'PLD') return 1;
  if (slot === 'weapon') return 5 / 7;
  if (slot === 'offHand') return 2 / 7;
  return 1;
};

export const gearSlotWeightTotal = (job: CombatJob): number =>
  gearSlotsForJob(job).reduce((total, slot) => total + gearSlotItemLevelWeight(job, slot), 0);

export type JobRole = 'healer' | 'tank' | 'dps';
export type EvaluationMode = 'generic-hit' | 'opener-30' | 'dummy-300';
export type OptimizerSearchMode = 'thorough' | 'quick';
export type CapabilityStatus = 'available' | 'pending' | 'unsupported';
export type JobModeId = string;
export type JobModeKind = 'standard' | 'evolved';

export interface ExpansionDefinition {
  id: ExpansionId;
  name: string;
  levelCap: number;
  order: number;
}

export interface EvaluatorCapability {
  status: CapabilityStatus;
  profileId?: string;
  reason?: string;
}

export interface JobModeDefinition {
  id: JobModeId;
  name: string;
  introducedIn: ExpansionId;
  /** Optional on pre-M13 snapshots; inferred from the ID when absent. */
  kind?: JobModeKind;
  capabilities: Record<EvaluationMode, EvaluatorCapability>;
}

export interface JobTimingEffect {
  id: string;
  name: string;
  kind: 'base' | 'passive' | 'maintained' | 'temporary';
  hastePercent: number;
}

export interface JobDefinition {
  id: CombatJob;
  name: string;
  role: JobRole;
  minimumLevel: number;
  introducedIn: ExpansionId;
  defaultGcdTarget: number;
  recommendedGcdTargets: number[];
  targetTimingEffectId: string;
  timingEffects: JobTimingEffect[];
  modes: JobModeDefinition[];
}

export interface GameRegistry {
  schemaVersion: string;
  expansions: ExpansionDefinition[];
  jobs: JobDefinition[];
}

export interface CalculationRuleset {
  id: string;
  schemaVersion: string;
  calculationSchema: string;
  expansionId: ExpansionId;
  gamePatch: string;
  minimumLevel: number;
  maximumLevel: number;
  jobMode: JobModeId;
  /** Optional on pre-M13 snapshots; inferred from jobMode when absent. */
  jobModeKind?: JobModeKind;
}

export interface LevelFormulaConstants {
  baseMain: number;
  baseSub: number;
  levelDiv: number;
}

/**
 * A safe declarative profile for formula structures already implemented by the
 * calculation package. New mechanics require a new calculation schema.
 */
export interface CombatEvaluatorProfile {
  id: string;
  schemaVersion: string;
  rulesetId: string;
  job: CombatJob;
  jobMode: JobModeId;
  version: string;
  role: JobRole;
  mainStat: StatKey;
  mainStatLabel: string;
  mainStatAbbreviation: string;
  speedStat: StatKey;
  speedStatLabel: string;
  speedStatAbbreviation: string;
  resourceStat?: StatKey;
  resourceLabel?: string;
  resourceStatAbbreviation?: string;
  meldStats: StatKey[];
  baseStats: StatBlock;
  /** Level-dependent combat formula constants. Older level-100 profiles omit this and use the legacy defaults. */
  levelConstants?: LevelFormulaConstants;
  attackPowerModifier: number;
  mainStatModifier: number;
  appliesTenacity: boolean;
  damageTrait: number;
  baseGcdMs: number;
  hastePercent: number;
  timingEffectId: string;
  objective: string;
  confidence: 'reference-validated-proxy' | 'internal-unverified';
  limitation: string;
  /** Component-level method attribution. Optional for pre-M13 signed snapshots. */
  references?: CombatMethodReference[];
}

export type RotationEvaluationMode = Exclude<EvaluationMode, 'generic-hit'>;
export type RotationProfileConfidence = 'generated-preliminary' | 'community-validated';
export type RotationRngMode = 'expected-value';
export type RotationCutoffPolicy = 'strict-application';
export type CombatActionKind = 'gcd' | 'ogcd' | 'auto-attack' | 'dot' | 'pet';
export type CombatActionSpeedScaling = 'none' | 'skill-speed' | 'spell-speed';

export interface CombatMethodReference {
  id: string;
  kind: 'official' | 'community' | 'xivgear-reference' | 'xiv-gear-lab';
  title: string;
  provider: string;
  /** Original author or community when provider is only the hosting platform. */
  author?: string;
  /** Hosting platform when it differs from the author or community. */
  host?: string;
  /** Formula, data, timing, or ranking components supported by this reference. */
  components?: string[];
  url?: string;
  gamePatch: string;
  publishedAt?: string;
  accessedAt?: string;
  notes?: string;
}

export interface CombatResourceChange {
  resource: string;
  amount: number;
}

export type CombatActionEffect =
  | {
    kind: 'resource';
    resource: string;
    amount: number;
    timing?: 'snapshot' | 'application';
  }
  | {
    /** Schedules fixed resource ticks after this action resolves. */
    kind: 'periodic-resource';
    resource: string;
    amount: number;
    firstDelayMs: number;
    intervalMs: number;
    repeatCount: number;
  }
  | {
    kind: 'buff';
    buffId: string;
    durationMs: number;
    stacks?: number;
    damageMultiplier?: number;
    hastePercent?: number;
  }
  | {
    kind: 'dot';
    dotId: string;
    durationMs: number;
    tickPotency: number;
  }
  | {
    kind: 'combo';
    comboId: string;
    nextStep: string;
    durationMs: number;
  }
  | {
    kind: 'expected-proc';
    procId: string;
    chance: number;
  }
  | {
    kind: 'schedule-action';
    actionId: string;
    delayMs: number;
    repeatEveryMs?: number;
    repeatCount?: number;
  }
  | {
    kind: 'mechanic';
    mechanicId: string;
    timing?: 'snapshot' | 'application';
  };

export interface CombatActionProfile {
  id: string;
  name: string;
  kind: CombatActionKind;
  /** Marks an action that is only available when the matching consumable assumption is enabled. */
  consumable?: 'potion';
  potency: number;
  recastMs: number;
  /** Independent action cooldown. GCD actions otherwise only use recastMs as the global recast. */
  cooldownMs?: number;
  castMs: number;
  /** Action occupancy from activation; this overlaps castMs rather than beginning after the cast. */
  animationLockMs: number;
  applicationDelayMs: number;
  charges: number;
  speedScaling: CombatActionSpeedScaling;
  resourceCosts?: CombatResourceChange[];
  expectedProcCosts?: CombatResourceChange[];
  criticalHitMode?: 'normal' | 'guaranteed' | 'disabled';
  directHitMode?: 'normal' | 'guaranteed' | 'disabled';
  effects?: CombatActionEffect[];
  referenceIds: string[];
}

export type CombatPriorityCondition =
  | { kind: 'always' }
  | { kind: 'cooldown-ready'; actionId: string; minimumCharges?: number }
  | { kind: 'resource-at-least'; resource: string; amount: number }
  | { kind: 'resource-at-most'; resource: string; amount: number }
  | { kind: 'resource-would-overcap'; resource: string; incoming: number; maximum: number }
  | { kind: 'buff-active'; buffId: string; active: boolean }
  | { kind: 'buff-remaining-at-most'; buffId: string; durationMs: number }
  | { kind: 'dot-remaining-at-most'; dotId: string; durationMs: number }
  | { kind: 'combo-step'; comboId: string; step: string }
  | { kind: 'proc-active'; procId: string; active: boolean }
  | { kind: 'mechanic'; mechanicId: string };

export interface CombatPriorityRule {
  id: string;
  actionId: string;
  conditions: CombatPriorityCondition[];
  /** Allows an oGCD rule to accept GCD clipping instead of waiting for a safe weave window. */
  allowClipping?: boolean;
  explanation: string;
  referenceIds: string[];
}

export interface CommunityOpenerProfile {
  id: string;
  name: string;
  gamePatch: string;
  actionIds: string[];
  confidence: RotationProfileConfidence;
  potion: 'none' | 'included';
  externalPartyBuffs: boolean;
  referenceIds: string[];
}

export interface CombatDummyAssumptions {
  targetCount: 1;
  uptimePercent: 100;
  movement: false;
  downtime: false;
  externalPartyBuffs: false;
  rngMode: RotationRngMode;
  latencyMs: number;
  weaveWindowMs: number;
  cutoffPolicy: RotationCutoffPolicy;
}

export interface CombatRotationValidation {
  /**
   * Output traces were checked against sources independent of the clean-room
   * evaluator. This does not promote generated priorities to community-owned
   * or community-validated logic.
   */
  status: 'independently-cross-checked';
  checkedAt: string;
  referenceIds: string[];
  checks: string[];
  limitations: string[];
}

/**
 * Safe signed data for an executable combat evaluator already present in the
 * application. The profile may select known mechanics but cannot deliver code.
 */
export interface CombatRotationProfile {
  id: string;
  schemaVersion: string;
  rulesetId: string;
  job: CombatJob;
  jobMode: JobModeId;
  version: string;
  gamePatch: string;
  engineId: string;
  supportedModes: RotationEvaluationMode[];
  confidence: RotationProfileConfidence;
  actions: CombatActionProfile[];
  priorityRules: CombatPriorityRule[];
  openers: CommunityOpenerProfile[];
  defaultOpenerId?: string;
  assumptions: CombatDummyAssumptions;
  references: CombatMethodReference[];
  /** Optional for signed profiles created before the M13B audit contract. */
  validation?: CombatRotationValidation;
  limitation: string;
}

export type ProvenanceKind =
  | 'official-client'
  | 'official-published'
  | 'community-curated'
  | 'acquisition-overlay'
  | 'calculated'
  | 'custom';

export interface Provenance {
  kind: ProvenanceKind;
  provider: string;
  providerRecordId?: string;
  sourceUrl?: string;
  sourcePatch?: string;
  sourceVersion?: string;
  schemaVersion: string;
  retrievedAt: string;
  verifiedAt?: string;
  status: 'current' | 'stale' | 'partial' | 'unverified' | 'custom';
}

export type ContentNodeKind =
  | 'expansion'
  | 'quest'
  | 'duty'
  | 'vendor'
  | 'recipe'
  | 'gathering-node'
  | 'currency'
  | 'job-unlock';

export interface ContentNode {
  id: string;
  kind: ContentNodeKind;
  name: string;
  expansionId: ExpansionId;
  level?: number;
  prerequisites: string[];
  provenance: Provenance[];
}

export interface ContentAccessGraph {
  schemaVersion: 'content-access@1';
  nodes: ContentNode[];
}

export type AcquisitionFrequency = 'one-time' | 'weekly' | 'repeatable' | 'variable';
export type AcquisitionRouteStatus = 'validated' | 'partial' | 'unknown';

export interface AcquisitionRequirement {
  kind: 'expansion' | 'level' | 'job' | 'content' | 'manual';
  expansionId?: ExpansionId;
  level?: number;
  job?: CombatJob;
  contentId?: string;
  description: string;
}

export interface AcquisitionCost {
  kind: 'gil' | 'currency' | 'item' | 'quest' | 'variable';
  name: string;
  amount?: number;
  currencyId?: string;
  itemId?: number | string;
  /** Costs with the same group are paid once when several bundled items are equipped. */
  sharedGroupId?: string;
  frequency: AcquisitionFrequency;
  valuation: 'fixed' | 'user-defined' | 'not-comparable';
}

export interface AcquisitionLocation {
  kind: 'duty' | 'vendor' | 'quest' | 'recipe' | 'gathering-node' | 'other';
  name: string;
  area?: string;
  x?: number;
  y?: number;
}

export interface AcquisitionRoute {
  id: string;
  name: string;
  sourceFamily: SourceFamily;
  expansionId: ExpansionId;
  minimumLevel: number;
  contentId?: string;
  requirements: AcquisitionRequirement[];
  costs: AcquisitionCost[];
  frequency: AcquisitionFrequency;
  status: AcquisitionRouteStatus;
  location?: AcquisitionLocation;
  note: string;
  provenance: Provenance[];
}

export interface AccessProfile {
  expansionId: ExpansionId;
  level: number;
  job?: CombatJob;
  /** Omit when completion is unknown. An explicit list means missing IDs are not completed. */
  completedContentIds?: string[];
}

export interface RouteAccessReport {
  status: 'available' | 'blocked' | 'unknown';
  route: AcquisitionRoute;
  unmetRequirements: AcquisitionRequirement[];
  unknownRequirements: AcquisitionRequirement[];
}

export interface ItemAccessReport {
  status: 'available' | 'blocked' | 'unknown';
  item: EquipmentItem;
  routes: RouteAccessReport[];
  reasons: string[];
}

export interface EquipmentItem {
  id: number | string;
  origin: 'official' | 'custom';
  name: string;
  jobs: CombatJob[];
  slot: ItemSlot;
  level: number;
  itemLevel: number;
  iconPath?: string;
  iconUrl?: string;
  stats: StatBlock;
  statCaps: StatBlock;
  weaponDamage: number;
  weaponDelayMs: number;
  materiaSlots: number;
  advancedMelding: boolean;
  unique: boolean;
  sourceFamily: SourceFamily;
  acquisitionNote: string;
  expansionId?: ExpansionId;
  quality?: 'hq' | 'not-applicable';
  acquisitionRoutes?: AcquisitionRoute[];
  provenance: Provenance[];
  customData?: CustomEquipmentData;
  relicStatModel?: RelicStatModel;
}

export interface RelicStatModel {
  schemaVersion: 'relic-stat-allocation@1';
  type: 'endwalker-discrete';
  largeValue: number;
  largeStatCount: number;
  smallValue: number;
  smallStatCount: number;
  allowedStats: StatKey[];
}

export const isAugmentedCraftedItem = (item: EquipmentItem): boolean =>
  item.sourceFamily === 'crafted' && Boolean(item.acquisitionRoutes?.some((route) =>
    route.id.startsWith('crafted-') && route.id.includes('-augmentation:')
  ));

export interface CustomEquipmentData {
  schemaVersion: 'custom-equipment@1';
  mode: 'final-stats' | 'meldable-base';
  role: JobRole;
  expansionId: ExpansionId;
  sourceDescription: string;
  fixedCost: string;
  notes: string;
  iconProvenance: 'generic' | 'user' | 'reused-official';
  clonedFromItemId?: number | string;
}

export interface Materia {
  id: number;
  name: string;
  stat: StatKey;
  value: number;
  tier: number;
  expansionId?: ExpansionId;
  requiredLevel?: number;
  advancedMeldingLimit?: 'forbidden' | 'first-slot-only' | 'unrestricted';
  iconPath?: string;
  iconUrl?: string;
}

export interface FoodBonus {
  stat: StatKey;
  percent: number;
  cap: number;
}

export interface Food {
  id: number;
  providerRecordId?: number;
  name: string;
  itemLevel: number;
  expansionId?: ExpansionId;
  requiredLevel?: number;
  iconPath?: string;
  iconUrl?: string;
  bonuses: FoodBonus[];
  provenance: Provenance[];
}

export interface EquippedItem {
  itemId: number | string;
  materiaIds: number[];
  relicStats?: Partial<Record<StatKey, number>>;
}

export interface SetMetrics {
  stats: StatBlock;
  weaponDamage: number;
  gcd: number;
  expectedAction100: number;
  averageItemLevel: number;
  materiaWaste: number;
}

export interface EvaluationMetadata {
  profileId: string;
  version: string;
  objective: string;
  confidence: 'reference-validated-proxy' | 'internal-unverified';
  limitation: string;
}

export interface RotationEvaluationSummary {
  mode: RotationEvaluationMode;
  label: string;
  durationMs: number;
  totalDamage: number;
  dps: number;
  profileId: string;
  profileVersion: string;
  rulesetId: string;
  gamePatch: string;
  engineId: string;
  method: {
    kind: 'community-opener' | 'generated-priority';
    confidence: RotationProfileConfidence;
    openerId?: string;
    warning?: string;
  };
  actionCount: number;
  gcdCount: number;
  ogcdCount: number;
  clippedMs: number;
  sustainability?: {
    finalMp: number;
    overcappedMp: number;
  };
  cadence?: {
    cooldownDriftMs: number;
    dotEarlyRefreshMs: number;
    dotLateRefreshMs: number;
    missedDotTicks: number;
    pendingApplicationCount: number;
    pendingApplicationPotency: number;
  };
  stability?: {
    durationMs: number;
    selectedSetDps: number;
    bestSetId: string;
    bestSetGcd: number;
    bestDps: number;
    winnerChanged: boolean;
    gapToBestPercent: number;
  };
  references: CombatMethodReference[];
  validation?: CombatRotationValidation;
  limitation: string;
  rerankedCandidateCount: number;
  rerankDurationMs: number;
  proxyBestSetId: string;
  winnerChanged: boolean;
  timelineCacheHits: number;
}

export interface CalculationContext {
  snapshotId: string;
  rulesetId: string;
  evaluatorProfileId: string;
  evaluatorVersion: string;
  calculationSchema: string;
  /** Optional only for results created before M13A. */
  jobMode?: JobModeId;
  /** Optional only for results created before M13A. */
  evaluationMode?: EvaluationMode;
}

export interface LegacyCalculationContext {
  status: 'unknown';
  reason: 'saved-before-calculation-context';
  message: string;
}

export type RecommendationConfidence =
  | 'community-validated'
  | 'official-validated'
  | 'official-preliminary'
  | 'incomplete-acquisition'
  | 'evaluator-outdated';

export interface RecommendationConfidenceReport {
  status: RecommendationConfidence;
  reasons: string[];
}

export interface CatalogueReadinessIssue {
  code:
    | 'incompatible-evaluator'
    | 'missing-slot'
    | 'invalid-item'
    | 'nq-crafted-item'
    | 'incomplete-acquisition'
    | 'missing-icon'
    | 'suspicious-item-count'
    | 'suspicious-stat-jump'
    | 'missing-curation';
  severity: 'blocking' | 'warning';
  message: string;
  itemIds?: Array<number | string>;
}

export interface CatalogueReadinessReport {
  status: 'ready' | 'preliminary' | 'blocked';
  confidence: RecommendationConfidence;
  issues: CatalogueReadinessIssue[];
  checkedItemCount: number;
  coveredSlots: GearSlot[];
}

export interface GearSet {
  id: string;
  origin: 'generated' | 'curated' | 'saved' | 'custom';
  name: string;
  job: CombatJob;
  level: number;
  patch: string;
  items: Partial<Record<GearSlot, EquippedItem>>;
  foodId?: number;
  metrics: SetMetrics;
  evaluation?: EvaluationMetadata;
  rotationEvaluation?: RotationEvaluationSummary;
  calculationContext?: CalculationContext;
  legacyCalculationContext?: LegacyCalculationContext;
  recommendationConfidence?: RecommendationConfidenceReport;
  assumptions: string[];
  provenance: Provenance[];
  calculatedAt?: string;
  hypotheticalAccess?: {
    itemIds: Array<number | string>;
    reason: string;
  };
}

export interface SnapshotManifest {
  id: string;
  schemaVersion: string;
  registrySchemaVersion: string;
  rulesetSchemaVersion: string;
  minimumAppVersion: string;
  generatedAt: string;
  gamePatch: string;
  gearTierPatch: string;
  xivapiVersion: string;
  xivapiSchema: string;
  calculationVersion: string;
  status: 'online-current' | 'cached-current' | 'cached-stale' | 'partial';
  providerFreshness?: SnapshotProviderFreshness[];
}

export interface SnapshotProviderFreshness {
  id: string;
  status: 'current' | 'stale' | 'partial' | 'failed';
  retrievedAt?: string;
  message?: string;
}

export interface GearSnapshot {
  manifest: SnapshotManifest;
  registry: GameRegistry;
  rulesets: CalculationRuleset[];
  evaluatorProfiles: CombatEvaluatorProfile[];
  /** Optional until M12-capable snapshots begin shipping rotation data. */
  rotationProfiles?: CombatRotationProfile[];
  items: EquipmentItem[];
  materia: Materia[];
  foods: Food[];
  curatedSets: GearSet[];
  contentGraph?: ContentAccessGraph;
}

/** @deprecated Use GearSnapshot. Retained for compatibility with early prototype integrations. */
export type WhmSnapshot = GearSnapshot;

export interface OptimizerConstraints {
  minResource: number;
  minGcd: number;
  maxGcd: number;
  allowedSources: SourceFamily[];
  /** Optional on legacy persisted workspaces; defaults to true when tomestone gear is enabled. */
  includeUpgradedTomestoneGear?: boolean;
  /** Optional on legacy persisted workspaces; defaults to true when crafted gear is enabled. */
  includeAugmentedCraftedGear?: boolean;
  /** Optional on legacy persisted workspaces; defaults to no item-level filtering. */
  itemLevelMode?: 'any' | 'exact' | 'range';
  minItemLevel?: number;
  maxItemLevel?: number;
  requiredItemIds: Array<number | string>;
  excludedItemIds: Array<number | string>;
  /** The desktop UI defaults to thorough. Legacy callers without this field retain quick behaviour. */
  searchMode?: OptimizerSearchMode;
  frontierLimit: number;
  /** Optional on legacy persisted workspaces; consumers must apply safe defaults. */
  lockedItemIdsBySlot?: Partial<Record<GearSlot, number | string>>;
  lockedMateriaBySlot?: Partial<Record<GearSlot, number[]>>;
  gcdMode?: 'exact' | 'range';
  gcdTargetName?: string;
  foodMode?: 'allowed' | 'none' | 'locked';
  lockedFoodId?: number;
  allowedMateriaStats?: StatKey[];
  allowedMateriaTiers?: number[];
  /** Identifies which available materia tiers the persisted selection was created against. */
  materiaCatalogueVersion?: string;
  allowOvermelds?: boolean;
  allowCustomItems?: boolean;
  accessExpansion?: ExpansionId;
  accessLevel?: number;
  /** Optional on legacy callers and workspaces; defaults to standard. */
  jobMode?: JobModeId;
  allowExperimentalAccess?: boolean;
}

export interface ResolvedOptimizerConstraints extends OptimizerConstraints {
  searchMode: OptimizerSearchMode;
  lockedItemIdsBySlot: Partial<Record<GearSlot, number | string>>;
  lockedMateriaBySlot: Partial<Record<GearSlot, number[]>>;
  gcdMode: 'exact' | 'range';
  gcdTargetName: string;
  foodMode: 'allowed' | 'none' | 'locked';
  allowedMateriaStats: StatKey[];
  allowedMateriaTiers: number[];
  allowOvermelds: boolean;
  allowCustomItems: boolean;
  allowExperimentalAccess: boolean;
  includeUpgradedTomestoneGear: boolean;
  includeAugmentedCraftedGear: boolean;
  itemLevelMode: 'any' | 'exact' | 'range';
  minItemLevel: number;
  maxItemLevel: number;
  jobMode: JobModeId;
}

export const resolveOptimizerConstraints = (
  constraints: OptimizerConstraints,
  availableMateria: readonly Materia[] = []
): ResolvedOptimizerConstraints => ({
  ...constraints,
  searchMode: constraints.searchMode ?? 'quick',
  lockedItemIdsBySlot: constraints.lockedItemIdsBySlot ?? {},
  lockedMateriaBySlot: constraints.lockedMateriaBySlot ?? {},
  gcdMode: constraints.gcdMode ?? (constraints.minGcd === constraints.maxGcd ? 'exact' : 'range'),
  gcdTargetName: constraints.gcdTargetName?.trim() || 'Custom target',
  foodMode: constraints.foodMode ?? 'allowed',
  allowedMateriaStats: constraints.allowedMateriaStats ?? [...new Set(availableMateria.map((entry) => entry.stat))],
  allowedMateriaTiers: constraints.allowedMateriaTiers ?? [...new Set(availableMateria.map((entry) => entry.tier))],
  allowOvermelds: constraints.allowOvermelds ?? false,
  allowCustomItems: constraints.allowCustomItems ?? true,
  allowExperimentalAccess: constraints.allowExperimentalAccess ?? false,
  includeUpgradedTomestoneGear: constraints.includeUpgradedTomestoneGear ?? true,
  includeAugmentedCraftedGear: constraints.includeAugmentedCraftedGear ?? true,
  itemLevelMode: constraints.itemLevelMode ?? 'any',
  minItemLevel: constraints.minItemLevel ?? 1,
  maxItemLevel: constraints.maxItemLevel ?? constraints.minItemLevel ?? 9999,
  jobMode: constraints.jobMode ?? 'standard'
});

export const emptyStats = (): StatBlock => ({
  strength: 0,
  dexterity: 0,
  intelligence: 0,
  mind: 0,
  vitality: 0,
  piety: 0,
  tenacity: 0,
  criticalHit: 0,
  determination: 0,
  directHit: 0,
  skillSpeed: 0,
  spellSpeed: 0
});

export const addStats = (left: StatBlock, right: StatBlock): StatBlock => {
  const result = emptyStats();
  for (const key of STAT_KEYS) result[key] = left[key] + right[key];
  return result;
};

export const getExpansionDefinition = (registry: GameRegistry, expansion: ExpansionId): ExpansionDefinition => {
  const definition = registry.expansions.find((entry) => entry.id === expansion);
  if (!definition) throw new Error(`Unknown expansion: ${expansion}`);
  return definition;
};

export const getJobDefinition = (registry: GameRegistry, job: CombatJob): JobDefinition => {
  const definition = registry.jobs.find((entry) => entry.id === job);
  if (!definition) throw new Error(`Unknown combat job: ${job}`);
  return definition;
};

export const getJobMode = (
  registry: GameRegistry,
  job: CombatJob,
  mode: JobModeId = 'standard'
): JobModeDefinition | undefined =>
  registry.jobs.find((entry) => entry.id === job)?.modes.find((entry) => entry.id === mode);

export const getJobModeKind = (mode: Pick<JobModeDefinition, 'id' | 'kind'>): JobModeKind =>
  mode.kind ?? (mode.id === 'evolved' ? 'evolved' : 'standard');

export const getEvaluatorCapability = (
  registry: GameRegistry,
  job: CombatJob,
  mode: JobModeId,
  evaluator: EvaluationMode
): EvaluatorCapability | undefined => getJobMode(registry, job, mode)?.capabilities[evaluator];

/**
 * Resolves the declared capability against the exact ruleset payload. This is
 * intentionally stricter than getEvaluatorCapability: a registry flag alone
 * cannot make an evaluator selectable when its matching profile is absent.
 */
export const resolveEvaluatorCapability = (
  snapshot: Pick<GearSnapshot, 'registry' | 'evaluatorProfiles' | 'rotationProfiles'>,
  job: CombatJob,
  jobMode: JobModeId,
  evaluator: EvaluationMode,
  rulesetId: string
): EvaluatorCapability => {
  const declared = getEvaluatorCapability(snapshot.registry, job, jobMode, evaluator);
  if (!declared) {
    return { status: 'unsupported', reason: `No ${jobMode} capability declaration exists for ${job}.` };
  }
  if (declared.status !== 'available') return declared;

  if (evaluator === 'generic-hit') {
    const profile = snapshot.evaluatorProfiles.find((entry) =>
      entry.job === job &&
      entry.jobMode === jobMode &&
      entry.rulesetId === rulesetId
    );
    return profile
      ? { status: 'available', profileId: profile.id }
      : {
        status: 'pending',
        reason: `The ${jobMode} generic-hit profile is not installed for ruleset ${rulesetId}.`
      };
  }

  const profile = snapshot.rotationProfiles?.find((entry) =>
    entry.job === job &&
    entry.jobMode === jobMode &&
    entry.rulesetId === rulesetId &&
    entry.supportedModes.includes(evaluator)
  );
  return profile
    ? { status: 'available', profileId: profile.id }
    : {
      status: 'pending',
      reason: `The ${jobMode} ${evaluator} profile is not installed for ruleset ${rulesetId}.`
    };
};

export const effectiveLevel = (
  registry: GameRegistry,
  expansion: ExpansionId,
  selectedLevel: number
): number => {
  const definition = getExpansionDefinition(registry, expansion);
  return Math.max(1, Math.min(selectedLevel, definition.levelCap));
};

export const jobAvailableAtAccess = (
  registry: GameRegistry,
  job: CombatJob,
  expansion: ExpansionId,
  selectedLevel: number,
  mode: JobModeId = 'standard'
): boolean => {
  const definition = registry.jobs.find((entry) => entry.id === job);
  if (!definition) return false;
  const modeDefinition = definition.modes.find((entry) => entry.id === mode);
  if (!modeDefinition) return false;
  const selectedExpansion = registry.expansions.find((entry) => entry.id === expansion);
  const jobExpansion = registry.expansions.find((entry) => entry.id === definition.introducedIn);
  const modeExpansion = registry.expansions.find((entry) => entry.id === modeDefinition.introducedIn);
  if (!selectedExpansion || !jobExpansion || !modeExpansion) return false;
  return selectedExpansion.order >= Math.max(jobExpansion.order, modeExpansion.order) &&
    effectiveLevel(registry, expansion, selectedLevel) >= definition.minimumLevel;
};

const expansionAvailableAtAccess = (
  registry: GameRegistry,
  requiredExpansion: ExpansionId,
  selectedExpansion: ExpansionId
): boolean => {
  const required = registry.expansions.find((entry) => entry.id === requiredExpansion);
  const selected = registry.expansions.find((entry) => entry.id === selectedExpansion);
  return Boolean(required && selected && required.order <= selected.order);
};

export const assessAcquisitionRoute = (
  route: AcquisitionRoute,
  registry: GameRegistry,
  access: AccessProfile,
  graph?: ContentAccessGraph
): RouteAccessReport => {
  const implicitRequirements: AcquisitionRequirement[] = [
    {
      kind: 'expansion',
      expansionId: route.expansionId,
      description: `${route.name} belongs to ${route.expansionId}.`
    },
    {
      kind: 'level',
      level: route.minimumLevel,
      description: `${route.name} requires level ${route.minimumLevel}.`
    }
  ];
  const requirements = [...implicitRequirements, ...route.requirements];
  const unmetRequirements: AcquisitionRequirement[] = [];
  const unknownRequirements: AcquisitionRequirement[] = [];

  for (const requirement of requirements) {
    if (requirement.kind === 'expansion') {
      if (!requirement.expansionId || !expansionAvailableAtAccess(registry, requirement.expansionId, access.expansionId)) {
        unmetRequirements.push(requirement);
      }
      continue;
    }
    if (requirement.kind === 'level') {
      if (requirement.level === undefined || access.level < requirement.level) unmetRequirements.push(requirement);
      continue;
    }
    if (requirement.kind === 'job') {
      if (!access.job) unknownRequirements.push(requirement);
      else if (!requirement.job || requirement.job !== access.job) unmetRequirements.push(requirement);
      continue;
    }
    if (requirement.kind === 'manual') {
      unknownRequirements.push(requirement);
      continue;
    }

    if (!requirement.contentId) {
      unknownRequirements.push(requirement);
      continue;
    }
    const node = graph?.nodes.find((entry) => entry.id === requirement.contentId);
    if (!node) {
      unknownRequirements.push(requirement);
      continue;
    }
    if (!expansionAvailableAtAccess(registry, node.expansionId, access.expansionId) ||
      (node.level !== undefined && access.level < node.level)) {
      unmetRequirements.push(requirement);
      continue;
    }
    if (!access.completedContentIds) unknownRequirements.push(requirement);
    else if (!access.completedContentIds.includes(requirement.contentId)) unmetRequirements.push(requirement);
  }

  const status = unmetRequirements.length > 0
    ? 'blocked'
    : unknownRequirements.length > 0 || route.status !== 'validated'
      ? 'unknown'
      : 'available';
  return { status, route, unmetRequirements, unknownRequirements };
};

export const assessItemAccess = (
  item: EquipmentItem,
  registry: GameRegistry,
  access: AccessProfile,
  graph?: ContentAccessGraph
): ItemAccessReport => {
  const reasons: string[] = [];
  const expansionId = item.expansionId ?? item.customData?.expansionId;
  if (item.level > access.level) reasons.push(`${item.name} requires level ${item.level}.`);
  if (expansionId && !expansionAvailableAtAccess(registry, expansionId, access.expansionId)) {
    reasons.push(`${item.name} belongs to expansion ${expansionId}.`);
  }
  if (reasons.length > 0) return { status: 'blocked', item, routes: [], reasons };

  const routes = (item.acquisitionRoutes ?? []).map((route) => assessAcquisitionRoute(route, registry, access, graph));
  if (routes.some((route) => route.status === 'available')) return { status: 'available', item, routes, reasons };
  if (routes.some((route) => route.status === 'unknown')) {
    return { status: 'unknown', item, routes, reasons: ['Acquisition access is not fully known for this item.'] };
  }
  if (routes.length > 0) return { status: 'blocked', item, routes, reasons: ['No acquisition route is accessible.'] };
  if (item.origin === 'custom') return { status: 'available', item, routes, reasons };
  return { status: 'unknown', item, routes, reasons: ['No acquisition route is available in the active data.'] };
};

export interface RuntimeCompatibility {
  appVersion: string;
  snapshotSchemas: string[];
  registrySchemas: string[];
  rulesetSchemas: string[];
  calculationSchemas: string[];
  evaluatorProfileSchemas: string[];
  /** Older runtimes omit this and must reject snapshots that contain rotation profiles. */
  rotationProfileSchemas?: string[];
}

export interface SnapshotCompatibilityReport {
  compatible: boolean;
  errors: string[];
  warnings: string[];
}

const versionParts = (version: string): number[] => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? match.slice(1).map(Number) : [];
};

const versionAtLeast = (actual: string, minimum: string): boolean => {
  const actualParts = versionParts(actual);
  const minimumParts = versionParts(minimum);
  if (actualParts.length === 0 || minimumParts.length === 0) return actual === minimum;
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index]! > minimumParts[index]!) return true;
    if (actualParts[index]! < minimumParts[index]!) return false;
  }
  return true;
};

const duplicateValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

export const assessSnapshotCompatibility = (
  snapshot: GearSnapshot,
  runtime: RuntimeCompatibility
): SnapshotCompatibilityReport => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { manifest, registry } = snapshot;

  if (!runtime.snapshotSchemas.includes(manifest.schemaVersion)) {
    errors.push(`Unsupported snapshot schema ${manifest.schemaVersion}.`);
  }
  if (!runtime.registrySchemas.includes(manifest.registrySchemaVersion)) {
    errors.push(`Unsupported registry schema ${manifest.registrySchemaVersion}.`);
  }
  if (registry.schemaVersion !== manifest.registrySchemaVersion) {
    errors.push(`Registry schema ${registry.schemaVersion} does not match manifest ${manifest.registrySchemaVersion}.`);
  }
  if (!runtime.rulesetSchemas.includes(manifest.rulesetSchemaVersion)) {
    errors.push(`Unsupported ruleset schema ${manifest.rulesetSchemaVersion}.`);
  }
  if (!versionAtLeast(runtime.appVersion, manifest.minimumAppVersion)) {
    errors.push(`Snapshot requires app ${manifest.minimumAppVersion} or newer; this app is ${runtime.appVersion}.`);
  }

  const providerFreshness = (manifest as SnapshotManifest & { providerFreshness?: unknown }).providerFreshness;
  if (providerFreshness !== undefined) {
    if (!Array.isArray(providerFreshness)) {
      errors.push('Snapshot provider freshness must be an array.');
    } else {
      const providerIds: string[] = [];
      for (const [index, candidate] of providerFreshness.entries()) {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
          errors.push(`Snapshot provider freshness entry ${index} is malformed.`);
          continue;
        }
        const provider = candidate as unknown as Record<string, unknown>;
        if (typeof provider.id !== 'string' || provider.id.trim().length === 0) {
          errors.push(`Snapshot provider freshness entry ${index} has no ID.`);
        } else {
          providerIds.push(provider.id);
        }
        if (!['current', 'stale', 'partial', 'failed'].includes(String(provider.status))) {
          errors.push(`Snapshot provider freshness entry ${index} has unsupported status ${String(provider.status)}.`);
        }
        if (provider.retrievedAt !== undefined && typeof provider.retrievedAt !== 'string') {
          errors.push(`Snapshot provider freshness entry ${index} has an invalid retrieval timestamp.`);
        }
        if (provider.message !== undefined && typeof provider.message !== 'string') {
          errors.push(`Snapshot provider freshness entry ${index} has an invalid message.`);
        }
      }
      for (const duplicate of duplicateValues(providerIds)) {
        errors.push(`Duplicate provider freshness ID ${duplicate}.`);
      }
    }
  }

  for (const duplicate of duplicateValues(registry.expansions.map((entry) => entry.id))) {
    errors.push(`Duplicate expansion ID ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(registry.jobs.map((entry) => entry.id))) {
    errors.push(`Duplicate job ID ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(snapshot.rulesets.map((entry) => entry.id))) {
    errors.push(`Duplicate ruleset ID ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(snapshot.evaluatorProfiles.map((entry) => entry.id))) {
    errors.push(`Duplicate evaluator profile ID ${duplicate}.`);
  }
  for (const duplicate of duplicateValues((snapshot.rotationProfiles ?? []).map((entry) => entry.id))) {
    errors.push(`Duplicate rotation profile ID ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(snapshot.items.map((entry) => String(entry.id)))) {
    errors.push(`Duplicate item ID ${duplicate}.`);
  }

  const expansionIds = new Set(registry.expansions.map((entry) => entry.id));
  const jobsById = new Map(registry.jobs.map((entry) => [entry.id, entry]));
  const rulesetsById = new Map(snapshot.rulesets.map((entry) => [entry.id, entry]));
  const profilesById = new Map(snapshot.evaluatorProfiles.map((entry) => [entry.id, entry]));
  const rotationProfilesById = new Map((snapshot.rotationProfiles ?? []).map((entry) => [entry.id, entry]));
  const contentIds = new Set(snapshot.contentGraph?.nodes.map((entry) => entry.id) ?? []);

  if (snapshot.contentGraph) {
    if (snapshot.contentGraph.schemaVersion !== 'content-access@1') {
      errors.push(`Unsupported content graph schema ${snapshot.contentGraph.schemaVersion}.`);
    }
    for (const duplicate of duplicateValues(snapshot.contentGraph.nodes.map((entry) => entry.id))) {
      errors.push(`Duplicate content node ID ${duplicate}.`);
    }
    for (const node of snapshot.contentGraph.nodes) {
      if (!expansionIds.has(node.expansionId)) errors.push(`Content node ${node.id} references unknown expansion ${node.expansionId}.`);
      for (const prerequisite of node.prerequisites) {
        if (!contentIds.has(prerequisite)) errors.push(`Content node ${node.id} references missing prerequisite ${prerequisite}.`);
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const byId = new Map(snapshot.contentGraph.nodes.map((entry) => [entry.id, entry]));
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const cyclic = (byId.get(id)?.prerequisites ?? []).some(visit);
      visiting.delete(id);
      visited.add(id);
      return cyclic;
    };
    for (const node of snapshot.contentGraph.nodes) {
      if (visit(node.id)) errors.push(`Content graph contains a prerequisite cycle involving ${node.id}.`);
    }
  }

  for (const ruleset of snapshot.rulesets) {
    if (ruleset.schemaVersion !== manifest.rulesetSchemaVersion) {
      errors.push(`Ruleset ${ruleset.id} uses ${ruleset.schemaVersion}, not manifest schema ${manifest.rulesetSchemaVersion}.`);
    }
    if (!runtime.rulesetSchemas.includes(ruleset.schemaVersion)) {
      errors.push(`Ruleset ${ruleset.id} uses unsupported schema ${ruleset.schemaVersion}.`);
    }
    if (!runtime.calculationSchemas.includes(ruleset.calculationSchema)) {
      errors.push(`Ruleset ${ruleset.id} requires unsupported calculation schema ${ruleset.calculationSchema}.`);
    }
    if (!expansionIds.has(ruleset.expansionId)) {
      errors.push(`Ruleset ${ruleset.id} references unknown expansion ${ruleset.expansionId}.`);
    }
    if (ruleset.minimumLevel > ruleset.maximumLevel) {
      errors.push(`Ruleset ${ruleset.id} has an invalid level range.`);
    }
    if (ruleset.jobModeKind !== undefined && !['standard', 'evolved'].includes(ruleset.jobModeKind)) {
      errors.push(`Ruleset ${ruleset.id} has unsupported mode kind ${ruleset.jobModeKind}.`);
    }
  }

  for (const job of registry.jobs) {
    if (!expansionIds.has(job.introducedIn)) {
      errors.push(`Job ${job.id} references unknown introduction expansion ${job.introducedIn}.`);
    }
    if (!job.timingEffects.some((entry) => entry.id === job.targetTimingEffectId)) {
      errors.push(`Job ${job.id} references missing target timing effect ${job.targetTimingEffectId}.`);
    }
    for (const duplicate of duplicateValues(job.modes.map((entry) => entry.id))) {
      errors.push(`Job ${job.id} has duplicate mode ${duplicate}.`);
    }
    for (const mode of job.modes) {
      if (!expansionIds.has(mode.introducedIn)) {
        errors.push(`Job ${job.id} mode ${mode.id} references unknown expansion ${mode.introducedIn}.`);
      }
      if (mode.kind !== undefined && !['standard', 'evolved'].includes(mode.kind)) {
        errors.push(`Job ${job.id} mode ${mode.id} has unsupported kind ${mode.kind}.`);
      }
      for (const evaluator of ['generic-hit', 'opener-30', 'dummy-300'] as EvaluationMode[]) {
        const capability = mode.capabilities[evaluator];
        if (capability.status === 'available' && !capability.profileId) {
          errors.push(`Job ${job.id} mode ${mode.id} marks ${evaluator} available without a profile.`);
        }
        if (capability.status === 'pending') {
          warnings.push(`Job ${job.id} mode ${mode.id} has ${evaluator} data pending.`);
        }
      }
      const genericCapability = mode.capabilities['generic-hit'];
      if (genericCapability.status === 'available' && genericCapability.profileId) {
        const profile = profilesById.get(genericCapability.profileId);
        if (!profile) {
          errors.push(`Job ${job.id} mode ${mode.id} references missing profile ${genericCapability.profileId}.`);
        } else if (profile.job !== job.id || profile.jobMode !== mode.id) {
          errors.push(`Profile ${profile.id} does not belong to job ${job.id} mode ${mode.id}.`);
        }
      }
      for (const evaluator of ['opener-30', 'dummy-300'] as RotationEvaluationMode[]) {
        const capability = mode.capabilities[evaluator];
        if (capability.status !== 'available' || !capability.profileId) continue;
        const profile = rotationProfilesById.get(capability.profileId);
        if (!profile) {
          errors.push(`Job ${job.id} mode ${mode.id} references missing rotation profile ${capability.profileId}.`);
        } else if (profile.job !== job.id || profile.jobMode !== mode.id) {
          errors.push(`Rotation profile ${profile.id} does not belong to job ${job.id} mode ${mode.id}.`);
        } else if (!profile.supportedModes.includes(evaluator)) {
          errors.push(`Rotation profile ${profile.id} does not support ${evaluator}.`);
        }
      }
    }
  }

  for (const profile of snapshot.evaluatorProfiles) {
    const job = jobsById.get(profile.job);
    const ruleset = rulesetsById.get(profile.rulesetId);
    if (!runtime.evaluatorProfileSchemas.includes(profile.schemaVersion)) {
      errors.push(`Profile ${profile.id} uses unsupported evaluator schema ${profile.schemaVersion}.`);
    }
    if (!job) errors.push(`Profile ${profile.id} references unknown job ${profile.job}.`);
    if (!ruleset) errors.push(`Profile ${profile.id} references unknown ruleset ${profile.rulesetId}.`);
    if (job && profile.role !== job.role) {
      errors.push(`Profile ${profile.id} role ${profile.role} does not match job role ${job.role}.`);
    }
    if (job && !job.timingEffects.some((entry) => entry.id === profile.timingEffectId)) {
      errors.push(`Profile ${profile.id} references unknown timing effect ${profile.timingEffectId}.`);
    }
    if (ruleset && ruleset.jobMode !== profile.jobMode) {
      errors.push(`Profile ${profile.id} mode ${profile.jobMode} does not match ruleset mode ${ruleset.jobMode}.`);
    }
    if ((profile.references ?? []).length === 0) {
      warnings.push(`Profile ${profile.id} has no component-level method references.`);
    }
    for (const reference of profile.references ?? []) {
      if (!reference.id.trim() || !reference.title.trim() || !reference.provider.trim()) {
        errors.push(`Profile ${profile.id} contains an incomplete method reference.`);
      }
      if (reference.kind !== 'xiv-gear-lab' && !reference.url) {
        errors.push(`Profile ${profile.id} external reference ${reference.id} has no direct URL.`);
      }
      if ((reference.components ?? []).some((component) => !component.trim())) {
        errors.push(`Profile ${profile.id} reference ${reference.id} contains an empty component label.`);
      }
    }
  }

  for (const profile of snapshot.rotationProfiles ?? []) {
    const job = jobsById.get(profile.job);
    const ruleset = rulesetsById.get(profile.rulesetId);
    const supportedRotationModes: RotationEvaluationMode[] = ['opener-30', 'dummy-300'];
    const actionKinds: CombatActionKind[] = ['gcd', 'ogcd', 'auto-attack', 'dot', 'pet'];
    const speedScalingModes: CombatActionSpeedScaling[] = ['none', 'skill-speed', 'spell-speed'];
    const effectKinds: CombatActionEffect['kind'][] = ['resource', 'periodic-resource', 'buff', 'dot', 'combo', 'expected-proc', 'schedule-action', 'mechanic'];
    const conditionKinds: CombatPriorityCondition['kind'][] = [
      'always',
      'cooldown-ready',
      'resource-at-least',
      'resource-at-most',
      'resource-would-overcap',
      'buff-active',
      'buff-remaining-at-most',
      'dot-remaining-at-most',
      'combo-step',
      'proc-active',
      'mechanic'
    ];
    if (!(runtime.rotationProfileSchemas ?? []).includes(profile.schemaVersion)) {
      errors.push(`Rotation profile ${profile.id} uses unsupported schema ${profile.schemaVersion}.`);
    }
    if (!job) errors.push(`Rotation profile ${profile.id} references unknown job ${profile.job}.`);
    if (!ruleset) errors.push(`Rotation profile ${profile.id} references unknown ruleset ${profile.rulesetId}.`);
    if (ruleset && ruleset.jobMode !== profile.jobMode) {
      errors.push(`Rotation profile ${profile.id} mode ${profile.jobMode} does not match ruleset mode ${ruleset.jobMode}.`);
    }
    if (ruleset && ruleset.gamePatch !== profile.gamePatch) {
      errors.push(`Rotation profile ${profile.id} patch ${profile.gamePatch} does not match ruleset patch ${ruleset.gamePatch}.`);
    }
    if (!profile.engineId.trim()) errors.push(`Rotation profile ${profile.id} has no engine ID.`);
    if (!profile.version.trim()) errors.push(`Rotation profile ${profile.id} has no version.`);
    if (!profile.limitation.trim()) errors.push(`Rotation profile ${profile.id} has no limitation.`);
    if (!['generated-preliminary', 'community-validated'].includes(profile.confidence)) {
      errors.push(`Rotation profile ${profile.id} has unsupported confidence ${profile.confidence}.`);
    }
    if (profile.supportedModes.length === 0) errors.push(`Rotation profile ${profile.id} supports no evaluation modes.`);
    for (const mode of profile.supportedModes) {
      if (!supportedRotationModes.includes(mode)) {
        errors.push(`Rotation profile ${profile.id} has unsupported evaluation mode ${mode}.`);
      }
    }
    for (const duplicate of duplicateValues(profile.supportedModes)) {
      errors.push(`Rotation profile ${profile.id} repeats supported mode ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(profile.references.map((entry) => entry.id))) {
      errors.push(`Rotation profile ${profile.id} has duplicate reference ${duplicate}.`);
    }
    const referencesById = new Map(profile.references.map((entry) => [entry.id, entry]));
    for (const reference of profile.references) {
      if (!reference.title.trim() || !reference.provider.trim() || !reference.gamePatch.trim()) {
        errors.push(`Rotation profile ${profile.id} has incomplete reference ${reference.id}.`);
      }
      if (reference.kind !== 'xiv-gear-lab' && !reference.url?.trim()) {
        errors.push(`Rotation profile ${profile.id} external reference ${reference.id} has no direct URL.`);
      }
    }
    if (profile.validation) {
      if (
        profile.validation.status !== 'independently-cross-checked' ||
        !profile.validation.checkedAt.trim() ||
        Number.isNaN(Date.parse(profile.validation.checkedAt))
      ) {
        errors.push(`Rotation profile ${profile.id} has invalid independent-validation metadata.`);
      }
      if (profile.validation.referenceIds.length === 0 || profile.validation.checks.length === 0) {
        errors.push(`Rotation profile ${profile.id} has an empty independent-validation audit.`);
      }
      if (
        profile.validation.checks.some((entry) => !entry.trim()) ||
        profile.validation.limitations.some((entry) => !entry.trim())
      ) {
        errors.push(`Rotation profile ${profile.id} has a blank independent-validation statement.`);
      }
      for (const duplicate of duplicateValues(profile.validation.referenceIds)) {
        errors.push(`Rotation profile ${profile.id} repeats validation reference ${duplicate}.`);
      }
      for (const referenceId of profile.validation.referenceIds) {
        if (!referencesById.has(referenceId)) {
          errors.push(`Rotation profile ${profile.id} validation references missing methodology ${referenceId}.`);
        }
      }
    }
    for (const duplicate of duplicateValues(profile.actions.map((entry) => entry.id))) {
      errors.push(`Rotation profile ${profile.id} has duplicate action ${duplicate}.`);
    }
    const actionsById = new Map(profile.actions.map((entry) => [entry.id, entry]));
    const checkReferences = (owner: string, referenceIds: string[]): void => {
      for (const referenceId of referenceIds) {
        if (!referencesById.has(referenceId)) {
          errors.push(`Rotation profile ${profile.id} ${owner} references missing methodology ${referenceId}.`);
        }
      }
    };
    for (const action of profile.actions) {
      if (!action.id.trim() || !action.name.trim()) errors.push(`Rotation profile ${profile.id} has an unnamed action.`);
      if (!actionKinds.includes(action.kind) || !speedScalingModes.includes(action.speedScaling)) {
        errors.push(`Rotation profile ${profile.id} action ${action.id} has an unsupported kind or speed-scaling mode.`);
      }
      if (action.consumable !== undefined && action.consumable !== 'potion') {
        errors.push(`Rotation profile ${profile.id} action ${action.id} has an unsupported consumable.`);
      }
      if (action.consumable === 'potion' && action.kind !== 'ogcd') {
        errors.push(`Rotation profile ${profile.id} potion action ${action.id} is not an oGCD.`);
      }
      if (
        !Number.isFinite(action.potency) || action.potency < 0 ||
        !Number.isInteger(action.recastMs) || action.recastMs < 0 ||
        (action.cooldownMs !== undefined && (!Number.isInteger(action.cooldownMs) || action.cooldownMs <= 0)) ||
        !Number.isInteger(action.castMs) || action.castMs < 0 ||
        !Number.isInteger(action.animationLockMs) || action.animationLockMs < 0 ||
        !Number.isInteger(action.applicationDelayMs) || action.applicationDelayMs < 0 ||
        !Number.isInteger(action.charges) || action.charges < 1
      ) {
        errors.push(`Rotation profile ${profile.id} action ${action.id} has invalid timing, potency or charge data.`);
      }
      for (const cost of action.resourceCosts ?? []) {
        if (!cost.resource.trim() || !Number.isFinite(cost.amount) || cost.amount < 0) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid resource cost.`);
        }
      }
      for (const cost of action.expectedProcCosts ?? []) {
        if (!cost.resource.trim() || !Number.isFinite(cost.amount) || cost.amount <= 0) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid expected-proc cost.`);
        }
      }
      if (
        (action.criticalHitMode !== undefined && !['normal', 'guaranteed', 'disabled'].includes(action.criticalHitMode)) ||
        (action.directHitMode !== undefined && !['normal', 'guaranteed', 'disabled'].includes(action.directHitMode))
      ) {
        errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid hit mode.`);
      }
      for (const effect of action.effects ?? []) {
        if (!effectKinds.includes(effect.kind)) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an unsupported effect kind.`);
          continue;
        }
        if (effect.kind === 'resource' && (!effect.resource.trim() || !Number.isFinite(effect.amount))) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid resource effect.`);
        }
        if (
          effect.kind === 'periodic-resource' &&
          (
            !effect.resource.trim() ||
            !Number.isFinite(effect.amount) ||
            !Number.isInteger(effect.firstDelayMs) || effect.firstDelayMs < 0 ||
            !Number.isInteger(effect.intervalMs) || effect.intervalMs <= 0 ||
            !Number.isInteger(effect.repeatCount) || effect.repeatCount < 1
          )
        ) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid periodic resource effect.`);
        }
        if (
          (effect.kind === 'resource' || effect.kind === 'mechanic') &&
          effect.timing !== undefined &&
          !['snapshot', 'application'].includes(effect.timing)
        ) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid effect timing.`);
        }
        if (
          (effect.kind === 'buff' || effect.kind === 'dot' || effect.kind === 'combo') &&
          (!Number.isInteger(effect.durationMs) || effect.durationMs < 0)
        ) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid effect duration.`);
        }
        if (
          effect.kind === 'buff' &&
          (
            (effect.damageMultiplier !== undefined && (!Number.isFinite(effect.damageMultiplier) || effect.damageMultiplier <= 0)) ||
            (effect.hastePercent !== undefined && (!Number.isFinite(effect.hastePercent) || effect.hastePercent < 0 || effect.hastePercent >= 100))
          )
        ) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has invalid buff modifiers.`);
        }
        if (effect.kind === 'expected-proc' && (!Number.isFinite(effect.chance) || effect.chance < 0 || effect.chance > 1)) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid expected-proc chance.`);
        }
        if (
          effect.kind === 'schedule-action' &&
          (
            !actionsById.has(effect.actionId) ||
            !Number.isInteger(effect.delayMs) || effect.delayMs < 0 ||
            (effect.repeatEveryMs !== undefined && (!Number.isInteger(effect.repeatEveryMs) || effect.repeatEveryMs <= 0)) ||
            (effect.repeatCount !== undefined && (!Number.isInteger(effect.repeatCount) || effect.repeatCount < 1)) ||
            ((effect.repeatCount ?? 1) > 1 && effect.repeatEveryMs === undefined)
          )
        ) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an invalid scheduled action.`);
        }
        if (effect.kind === 'mechanic' && !effect.mechanicId.trim()) {
          errors.push(`Rotation profile ${profile.id} action ${action.id} has an empty mechanic ID.`);
        }
      }
      checkReferences(`action ${action.id}`, action.referenceIds);
    }
    for (const duplicate of duplicateValues(profile.priorityRules.map((entry) => entry.id))) {
      errors.push(`Rotation profile ${profile.id} has duplicate priority rule ${duplicate}.`);
    }
    for (const rule of profile.priorityRules) {
      const ruleAction = actionsById.get(rule.actionId);
      if (!rule.id.trim()) {
        errors.push(`Rotation profile ${profile.id} has a priority rule with no ID.`);
      }
      if (!ruleAction) {
        errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} references missing action ${rule.actionId}.`);
      }
      if (rule.allowClipping !== undefined && typeof rule.allowClipping !== 'boolean') {
        errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid clipping policy.`);
      }
      if (rule.allowClipping && ruleAction?.kind !== 'ogcd') {
        errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} allows clipping for a non-oGCD action.`);
      }
      if (!rule.explanation.trim()) {
        errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has no explanation.`);
      }
      if (rule.conditions.length === 0) {
        errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has no conditions.`);
      }
      for (const condition of rule.conditions) {
        if (!conditionKinds.includes(condition.kind)) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an unsupported condition kind.`);
          continue;
        }
        if (condition.kind === 'cooldown-ready') {
          if (!actionsById.has(condition.actionId)) {
            errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} checks missing action ${condition.actionId}.`);
          }
          if (
            condition.minimumCharges !== undefined &&
            (!Number.isInteger(condition.minimumCharges) || condition.minimumCharges < 1)
          ) {
            errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid minimum charge condition.`);
          }
        }
        if (
          (condition.kind === 'resource-at-least' || condition.kind === 'resource-at-most') &&
          (!condition.resource.trim() || !Number.isFinite(condition.amount))
        ) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid resource threshold.`);
        }
        if (
          condition.kind === 'resource-would-overcap' &&
          (
            !condition.resource.trim() ||
            !Number.isFinite(condition.incoming) ||
            !Number.isFinite(condition.maximum) ||
            condition.maximum < 0
          )
        ) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid overcap condition.`);
        }
        if (
          condition.kind === 'buff-active' &&
          (!condition.buffId.trim() || typeof condition.active !== 'boolean')
        ) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid buff-active condition.`);
        }
        if (
          (condition.kind === 'buff-remaining-at-most' || condition.kind === 'dot-remaining-at-most') &&
          (
            !(condition.kind === 'buff-remaining-at-most' ? condition.buffId : condition.dotId).trim() ||
            !Number.isInteger(condition.durationMs) ||
            condition.durationMs < 0
          )
        ) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid remaining-duration condition.`);
        }
        if (
          condition.kind === 'combo-step' &&
          (!condition.comboId.trim() || !condition.step.trim())
        ) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid combo condition.`);
        }
        if (
          condition.kind === 'proc-active' &&
          (!condition.procId.trim() || typeof condition.active !== 'boolean')
        ) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an invalid proc condition.`);
        }
        if (condition.kind === 'mechanic' && !condition.mechanicId.trim()) {
          errors.push(`Rotation profile ${profile.id} priority rule ${rule.id} has an empty mechanic condition.`);
        }
      }
      checkReferences(`priority rule ${rule.id}`, rule.referenceIds);
    }
    for (const duplicate of duplicateValues(profile.openers.map((entry) => entry.id))) {
      errors.push(`Rotation profile ${profile.id} has duplicate opener ${duplicate}.`);
    }
    const openersById = new Map(profile.openers.map((entry) => [entry.id, entry]));
    for (const opener of profile.openers) {
      if (!opener.name.trim() || opener.actionIds.length === 0) {
        errors.push(`Rotation profile ${profile.id} opener ${opener.id} is incomplete.`);
      }
      if (
        !opener.gamePatch.trim() ||
        !['none', 'included'].includes(opener.potion) ||
        typeof opener.externalPartyBuffs !== 'boolean'
      ) {
        errors.push(`Rotation profile ${profile.id} opener ${opener.id} has invalid assumptions.`);
      }
      if (!['generated-preliminary', 'community-validated'].includes(opener.confidence)) {
        errors.push(`Rotation profile ${profile.id} opener ${opener.id} has unsupported confidence ${opener.confidence}.`);
      }
      if (opener.confidence === 'community-validated' && opener.referenceIds.length === 0) {
        errors.push(`Rotation profile ${profile.id} community opener ${opener.id} has no methodology reference.`);
      }
      for (const actionId of opener.actionIds) {
        if (!actionsById.has(actionId)) {
          errors.push(`Rotation profile ${profile.id} opener ${opener.id} references missing action ${actionId}.`);
        }
      }
      const containsPotion = opener.actionIds.some((actionId) => actionsById.get(actionId)?.consumable === 'potion');
      if (opener.potion === 'included' && !containsPotion) {
        errors.push(`Rotation profile ${profile.id} opener ${opener.id} includes a potion assumption without a potion action.`);
      }
      if (opener.potion === 'none' && containsPotion) {
        errors.push(`Rotation profile ${profile.id} opener ${opener.id} contains a potion action despite disabling potions.`);
      }
      checkReferences(`opener ${opener.id}`, opener.referenceIds);
    }
    if (profile.defaultOpenerId) {
      const opener = openersById.get(profile.defaultOpenerId);
      if (!opener) {
        errors.push(`Rotation profile ${profile.id} references missing default opener ${profile.defaultOpenerId}.`);
      } else if (opener.gamePatch !== profile.gamePatch) {
        errors.push(`Rotation profile ${profile.id} default opener ${opener.id} is stale for patch ${profile.gamePatch}.`);
      }
    }
    const assumptions = profile.assumptions;
    if (
      assumptions.targetCount !== 1 ||
      assumptions.uptimePercent !== 100 ||
      assumptions.movement !== false ||
      assumptions.downtime !== false ||
      assumptions.externalPartyBuffs !== false ||
      assumptions.rngMode !== 'expected-value' ||
      assumptions.cutoffPolicy !== 'strict-application' ||
      !Number.isInteger(assumptions.latencyMs) || assumptions.latencyMs < 0 ||
      !Number.isInteger(assumptions.weaveWindowMs) || assumptions.weaveWindowMs < 0
    ) {
      errors.push(`Rotation profile ${profile.id} has unsupported dummy assumptions.`);
    }
  }

  for (const item of snapshot.items) {
    if (!SOURCE_FAMILIES.includes(item.sourceFamily)) errors.push(`Item ${item.id} uses unsupported source family ${item.sourceFamily}.`);
    if (item.expansionId && !expansionIds.has(item.expansionId)) errors.push(`Item ${item.id} references unknown expansion ${item.expansionId}.`);
    if (item.sourceFamily === 'crafted' && item.quality !== 'hq') errors.push(`Crafted item ${item.id} is not explicitly HQ.`);
    for (const duplicate of duplicateValues((item.acquisitionRoutes ?? []).map((entry) => entry.id))) {
      errors.push(`Item ${item.id} has duplicate acquisition route ${duplicate}.`);
    }
    for (const route of item.acquisitionRoutes ?? []) {
      if (!SOURCE_FAMILIES.includes(route.sourceFamily)) errors.push(`Item ${item.id} route ${route.id} uses unsupported source family ${route.sourceFamily}.`);
      if (!expansionIds.has(route.expansionId)) errors.push(`Item ${item.id} route ${route.id} references unknown expansion ${route.expansionId}.`);
      if (route.contentId && !contentIds.has(route.contentId)) errors.push(`Item ${item.id} route ${route.id} references missing content ${route.contentId}.`);
      if (route.location) {
        if (!route.location.name.trim()) errors.push(`Item ${item.id} route ${route.id} has an empty acquisition location name.`);
        if ((route.location.x === undefined) !== (route.location.y === undefined)) {
          errors.push(`Item ${item.id} route ${route.id} has incomplete acquisition coordinates.`);
        }
        if (route.location.x !== undefined && (
          !Number.isFinite(route.location.x) || !Number.isFinite(route.location.y) ||
          route.location.x < 0 || route.location.y! < 0
        )) {
          errors.push(`Item ${item.id} route ${route.id} has invalid acquisition coordinates.`);
        }
      }
      for (const requirement of route.requirements) {
        if (requirement.kind === 'content' && requirement.contentId && !contentIds.has(requirement.contentId)) {
          errors.push(`Item ${item.id} route ${route.id} requires missing content ${requirement.contentId}.`);
        }
      }
      for (const cost of route.costs) {
        if (cost.amount !== undefined && (!Number.isFinite(cost.amount) || cost.amount < 0)) {
          errors.push(`Item ${item.id} route ${route.id} has invalid cost ${cost.name}.`);
        }
        if (cost.valuation === 'fixed' && ['gil', 'currency', 'item'].includes(cost.kind) && cost.amount === undefined) {
          errors.push(`Item ${item.id} route ${route.id} has a fixed ${cost.name} cost without an amount.`);
        }
      }
    }
    for (const job of item.jobs) {
      if (!jobsById.has(job)) errors.push(`Item ${item.id} references unknown job ${job}.`);
    }
  }
  for (const set of snapshot.curatedSets) {
    if (!jobsById.has(set.job)) errors.push(`Curated set ${set.id} references unknown job ${set.job}.`);
    if (!set.calculationContext) {
      errors.push(`Curated set ${set.id} is missing pinned calculation context.`);
      continue;
    }
    if (set.calculationContext.snapshotId !== manifest.id) {
      errors.push(`Curated set ${set.id} pins snapshot ${set.calculationContext.snapshotId}, not ${manifest.id}.`);
    }
    const setRuleset = rulesetsById.get(set.calculationContext.rulesetId);
    const setProfile = profilesById.get(set.calculationContext.evaluatorProfileId);
    if (!setRuleset) errors.push(`Curated set ${set.id} pins unknown ruleset ${set.calculationContext.rulesetId}.`);
    if (!setProfile) errors.push(`Curated set ${set.id} pins unknown profile ${set.calculationContext.evaluatorProfileId}.`);
    if (setRuleset && set.calculationContext.calculationSchema !== setRuleset.calculationSchema) {
      errors.push(`Curated set ${set.id} calculation schema does not match ruleset ${setRuleset.id}.`);
    }
    if (setProfile && (
      setProfile.job !== set.job ||
      set.calculationContext.evaluatorVersion !== setProfile.version
    )) {
      errors.push(`Curated set ${set.id} evaluator context does not match profile ${setProfile.id}.`);
    }
    if (setProfile && set.calculationContext.jobMode && set.calculationContext.jobMode !== setProfile.jobMode) {
      errors.push(`Curated set ${set.id} mode ${set.calculationContext.jobMode} does not match profile mode ${setProfile.jobMode}.`);
    }
    if (set.calculationContext.evaluationMode && set.calculationContext.evaluationMode !== 'generic-hit') {
      errors.push(`Curated set ${set.id} pins unsupported base evaluation mode ${set.calculationContext.evaluationMode}.`);
    }
  }

  return { compatible: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
};

export const assertSnapshotCompatible = (snapshot: GearSnapshot, runtime: RuntimeCompatibility): void => {
  const report = assessSnapshotCompatibility(snapshot, runtime);
  if (!report.compatible) throw new Error(`Incompatible gear snapshot: ${report.errors.join(' ')}`);
};
