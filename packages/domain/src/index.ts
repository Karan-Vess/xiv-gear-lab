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
export type SourceFamily = 'savage' | 'tomestone' | 'tomestone-upgrade' | 'custom' | 'unknown';
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
export type CapabilityStatus = 'available' | 'pending' | 'unsupported';
export type JobModeId = string;

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
  attackPowerModifier: number;
  mainStatModifier: number;
  appliesTenacity: boolean;
  damageTrait: number;
  baseGcdMs: number;
  hastePercent: number;
  timingEffectId: string;
  objective: string;
  confidence: 'reference-validated-proxy';
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
  provenance: Provenance[];
  customData?: CustomEquipmentData;
}

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
  iconPath?: string;
  iconUrl?: string;
  bonuses: FoodBonus[];
  provenance: Provenance[];
}

export interface EquippedItem {
  itemId: number | string;
  materiaIds: number[];
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
  confidence: 'reference-validated-proxy';
  limitation: string;
}

export interface CalculationContext {
  snapshotId: string;
  rulesetId: string;
  evaluatorProfileId: string;
  evaluatorVersion: string;
  calculationSchema: string;
}

export interface LegacyCalculationContext {
  status: 'unknown';
  reason: 'saved-before-calculation-context';
  message: string;
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
  calculationContext?: CalculationContext;
  legacyCalculationContext?: LegacyCalculationContext;
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
  items: EquipmentItem[];
  materia: Materia[];
  foods: Food[];
  curatedSets: GearSet[];
}

/** @deprecated Use GearSnapshot. Retained for compatibility with early prototype integrations. */
export type WhmSnapshot = GearSnapshot;

export interface OptimizerConstraints {
  minResource: number;
  minGcd: number;
  maxGcd: number;
  allowedSources: SourceFamily[];
  requiredItemIds: Array<number | string>;
  excludedItemIds: Array<number | string>;
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
  allowOvermelds?: boolean;
  allowCustomItems?: boolean;
  accessExpansion?: ExpansionId;
  accessLevel?: number;
  allowExperimentalAccess?: boolean;
}

export interface ResolvedOptimizerConstraints extends OptimizerConstraints {
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
}

export const resolveOptimizerConstraints = (
  constraints: OptimizerConstraints,
  availableMateria: readonly Materia[] = []
): ResolvedOptimizerConstraints => ({
  ...constraints,
  lockedItemIdsBySlot: constraints.lockedItemIdsBySlot ?? {},
  lockedMateriaBySlot: constraints.lockedMateriaBySlot ?? {},
  gcdMode: constraints.gcdMode ?? (constraints.minGcd === constraints.maxGcd ? 'exact' : 'range'),
  gcdTargetName: constraints.gcdTargetName?.trim() || 'Custom target',
  foodMode: constraints.foodMode ?? 'allowed',
  allowedMateriaStats: constraints.allowedMateriaStats ?? [...new Set(availableMateria.map((entry) => entry.stat))],
  allowedMateriaTiers: constraints.allowedMateriaTiers ?? [...new Set(availableMateria.map((entry) => entry.tier))],
  allowOvermelds: constraints.allowOvermelds ?? false,
  allowCustomItems: constraints.allowCustomItems ?? true,
  allowExperimentalAccess: constraints.allowExperimentalAccess ?? false
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

export const getEvaluatorCapability = (
  registry: GameRegistry,
  job: CombatJob,
  mode: JobModeId,
  evaluator: EvaluationMode
): EvaluatorCapability | undefined => getJobMode(registry, job, mode)?.capabilities[evaluator];

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

export interface RuntimeCompatibility {
  appVersion: string;
  snapshotSchemas: string[];
  registrySchemas: string[];
  rulesetSchemas: string[];
  calculationSchemas: string[];
  evaluatorProfileSchemas: string[];
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

  const expansionIds = new Set(registry.expansions.map((entry) => entry.id));
  const jobsById = new Map(registry.jobs.map((entry) => [entry.id, entry]));
  const rulesetsById = new Map(snapshot.rulesets.map((entry) => [entry.id, entry]));
  const profilesById = new Map(snapshot.evaluatorProfiles.map((entry) => [entry.id, entry]));

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
  }

  for (const item of snapshot.items) {
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
  }

  return { compatible: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
};

export const assertSnapshotCompatible = (snapshot: GearSnapshot, runtime: RuntimeCompatibility): void => {
  const report = assessSnapshotCompatibility(snapshot, runtime);
  if (!report.compatible) throw new Error(`Incompatible gear snapshot: ${report.errors.join(' ')}`);
};
