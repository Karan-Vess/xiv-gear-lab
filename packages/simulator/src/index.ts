import type {
  CombatMethodReference,
  CombatRotationValidation,
  CombatRotationProfile,
  CommunityOpenerProfile,
  RotationEvaluationMode,
  RotationProfileConfidence,
  StatBlock
} from '@xiv-gear-lab/domain';
import {
  createHybridRotationPolicy,
  validateHybridRotationProfile,
  type MechanicConditionEvaluator,
  type RotationDecisionTraceEntry
} from './hybrid-policy';
import {
  runCombatTimeline,
  type CombatTimelineEngineOptions
} from './timing-engine';

export const LEGACY_ROTATION_PROFILE_SCHEMA_VERSION = 'combat-rotation-profile@1';
export const ROTATION_PROFILE_SCHEMA_VERSION = 'combat-rotation-profile@2';

export interface CombatEvaluationStats {
  stats: StatBlock;
  weaponDamage: number;
  weaponDelayMs: number;
  speedStatValue: number;
  speedBaseSub: number;
  speedLevelDiv: number;
  hastePercent: number;
}

export type OpenerPreference = 'auto' | 'generated' | string;

export interface CombatEvaluationRequest {
  mode: RotationEvaluationMode;
  /**
   * Internal audit windows may extend the normal 300-second dummy without
   * creating another user-facing evaluation mode. The selected mode remains
   * the semantic contract; this value only changes its measurement horizon.
   */
  durationOverrideMs?: number;
  profile: CombatRotationProfile;
  combatStats: CombatEvaluationStats;
  openerPreference: OpenerPreference;
  potion: 'none' | 'included';
  includeTimeline: boolean;
  /**
   * Job-owned values such as Crit-dependent expected gauge generation that can
   * change action choice even though they are usually damage-only stats.
   */
  rotationAffectingStats?: Record<string, number | string | boolean>;
}

export interface CombatActionRecord {
  actionId: string;
  actionName: string;
  startedAtMs: number;
  appliedAtMs: number;
  damage: number;
  potency: number;
  expectedWeight: number;
  snapshotBuffIds: string[];
  source: 'player' | 'pet' | 'dot' | 'auto-attack';
}

export interface CombatEvaluationSummary {
  actionCount: number;
  gcdCount: number;
  ogcdCount: number;
  clippedMs: number;
  overcappedResources: Record<string, number>;
  driftMsByAction: Record<string, number>;
  dotCadenceById: Record<string, {
    applications: number;
    refreshes: number;
    earlyRefreshMs: number;
    lateRefreshMs: number;
    missedTicks: number;
  }>;
  pendingApplicationsByAction: Record<string, number>;
  pendingApplicationPotency: number;
  finalResources: Record<string, number>;
}

export interface ResolvedRotationMethod {
  kind: 'community-opener' | 'generated-priority';
  confidence: RotationProfileConfidence;
  opener?: CommunityOpenerProfile;
  warning?: string;
}

export interface CombatEvaluationResult {
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
  method: ResolvedRotationMethod;
  decisionTrace: RotationDecisionTraceEntry[];
  timingCacheKey: string;
  summary: CombatEvaluationSummary;
  references: CombatMethodReference[];
  validation?: CombatRotationValidation;
  timeline?: CombatActionRecord[];
  limitation: string;
}

export interface CombatEvaluationControl {
  isCancelled(): boolean;
  reportProgress?(progress: number): void;
}

/**
 * Executable job mechanics stay in the application. Signed profiles can select
 * a known engine and provide data, but cannot deliver executable code.
 */
export interface CombatEvaluatorPlugin {
  readonly engineId: string;
  readonly supportedProfileSchemas: readonly string[];
  validateProfile(profile: CombatRotationProfile): string[];
  simulate(request: CombatEvaluationRequest, control: CombatEvaluationControl): CombatEvaluationResult;
}

export interface RotationTimingIdentity {
  job: string;
  jobMode: string;
  rulesetId: string;
  profileId: string;
  profileVersion: string;
  engineId: string;
  mode: RotationEvaluationMode;
  durationMs: number;
  speedStatValue: number;
  weaponDelayMs: number;
  hastePercent: number;
  latencyMs: number;
  weaveWindowMs: number;
  cutoffPolicy: string;
  openerId: string;
  potion: 'none' | 'included';
  rotationAffectingStats: Record<string, number | string | boolean>;
}

export const durationForMode = (mode: RotationEvaluationMode): number =>
  mode === 'opener-30' ? 30_000 : 300_000;

export const durationForRequest = (request: Pick<CombatEvaluationRequest, 'mode' | 'durationOverrideMs'>): number => {
  const durationMs = request.durationOverrideMs ?? durationForMode(request.mode);
  if (!Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error(`Combat evaluation duration must be a positive integer, received ${durationMs}.`);
  }
  if (request.mode === 'opener-30' && durationMs !== 30_000) {
    throw new Error('The fixed 30-second opener window cannot be overridden.');
  }
  return durationMs;
};

export const labelForMode = (mode: RotationEvaluationMode): string =>
  mode === 'opener-30' ? '30-second burst' : 'Five-minute dummy rotation';

export const resolveRotationMethod = (
  profile: CombatRotationProfile,
  preference: OpenerPreference = 'auto',
  potion?: 'none' | 'included'
): ResolvedRotationMethod => {
  if (preference === 'generated') {
    return {
      kind: 'generated-priority',
      confidence: 'generated-preliminary'
    };
  }

  const requestedId = preference === 'auto' ? profile.defaultOpenerId : preference;
  if (!requestedId) {
    return {
      kind: 'generated-priority',
      confidence: 'generated-preliminary',
      warning: 'No current community opener is installed; generated priority rules are being used.'
    };
  }

  const opener = profile.openers.find((entry) => entry.id === requestedId);
  if (!opener) {
    return {
      kind: 'generated-priority',
      confidence: 'generated-preliminary',
      warning: `Requested opener ${requestedId} is unavailable; generated priority rules are being used.`
    };
  }
  if (opener.gamePatch !== profile.gamePatch) {
    return {
      kind: 'generated-priority',
      confidence: 'generated-preliminary',
      warning: `${opener.name} targets patch ${opener.gamePatch}, not ${profile.gamePatch}; generated priority rules are being used.`
    };
  }
  if (potion !== undefined && opener.potion !== potion) {
    return {
      kind: 'generated-priority',
      confidence: 'generated-preliminary',
      warning: `${opener.name} assumes potion use is ${opener.potion}, but this run requested ${potion}; generated priority rules are being used.`
    };
  }
  if (opener.externalPartyBuffs !== profile.assumptions.externalPartyBuffs) {
    return {
      kind: 'generated-priority',
      confidence: 'generated-preliminary',
      warning: `${opener.name} has external-party-buff assumptions that do not match this dummy profile; generated priority rules are being used.`
    };
  }

  return {
    kind: 'community-opener',
    confidence: opener.confidence,
    opener
  };
};

export const buildRotationTimingIdentity = (
  request: CombatEvaluationRequest,
  method = resolveRotationMethod(request.profile, request.openerPreference, request.potion)
): RotationTimingIdentity => ({
  job: request.profile.job,
  jobMode: request.profile.jobMode,
  rulesetId: request.profile.rulesetId,
  profileId: request.profile.id,
  profileVersion: request.profile.version,
  engineId: request.profile.engineId,
  mode: request.mode,
  durationMs: durationForRequest(request),
  speedStatValue: request.combatStats.speedStatValue,
  weaponDelayMs: request.combatStats.weaponDelayMs,
  hastePercent: request.combatStats.hastePercent,
  latencyMs: request.profile.assumptions.latencyMs,
  weaveWindowMs: request.profile.assumptions.weaveWindowMs,
  cutoffPolicy: request.profile.assumptions.cutoffPolicy,
  openerId: method.opener?.id ?? 'generated',
  potion: request.potion,
  rotationAffectingStats: Object.fromEntries(
    Object.entries(request.rotationAffectingStats ?? {}).sort(([left], [right]) => left.localeCompare(right))
  )
});

export const buildRotationTimingCacheKey = (
  request: CombatEvaluationRequest,
  method = resolveRotationMethod(request.profile, request.openerPreference, request.potion)
): string => JSON.stringify(buildRotationTimingIdentity(request, method));

export type HybridCombatEvaluationOptions = Omit<
  CombatTimelineEngineOptions,
  'profile' | 'combatStats' | 'durationMs' | 'chooseAction' | 'onActionStarted'
> & {
  evaluateMechanicCondition?: MechanicConditionEvaluator;
};

export const runHybridCombatEvaluation = (
  request: CombatEvaluationRequest,
  options: HybridCombatEvaluationOptions = {}
): CombatEvaluationResult => {
  if (!request.profile.supportedModes.includes(request.mode)) {
    throw new Error(`Rotation profile ${request.profile.id} does not support ${request.mode}.`);
  }
  const profileErrors = validateHybridRotationProfile(request.profile);
  if (profileErrors.length > 0) {
    throw new Error(`Combat evaluator profile ${request.profile.id} is invalid: ${profileErrors.join(' ')}`);
  }

  const method = resolveRotationMethod(
    request.profile,
    request.openerPreference,
    request.potion
  );
  const {
    evaluateMechanicCondition,
    ...timelineOptions
  } = options;
  const policy = createHybridRotationPolicy({
    profile: request.profile,
    method,
    potion: request.potion,
    evaluateMechanicCondition
  });
  const durationMs = durationForRequest(request);
  const timeline = runCombatTimeline({
    ...timelineOptions,
    profile: request.profile,
    combatStats: request.combatStats,
    durationMs,
    chooseAction: (state) => policy.chooseAction(state),
    onActionStarted: (action, startedAtMs) => policy.onActionStarted(action, startedAtMs)
  });

  return {
    mode: request.mode,
    label: labelForMode(request.mode),
    durationMs,
    totalDamage: timeline.totalDamage,
    dps: timeline.totalDamage / (durationMs / 1000),
    profileId: request.profile.id,
    profileVersion: request.profile.version,
    rulesetId: request.profile.rulesetId,
    gamePatch: request.profile.gamePatch,
    engineId: request.profile.engineId,
    method,
    decisionTrace: policy.trace(),
    timingCacheKey: buildRotationTimingCacheKey(request, method),
    summary: timeline.summary,
    references: request.profile.references.map((reference) => ({ ...reference })),
    ...(request.profile.validation ? {
      validation: structuredClone(request.profile.validation)
    } : {}),
    ...(request.includeTimeline ? { timeline: timeline.records } : {}),
    limitation: request.profile.limitation
  };
};

export class CombatEvaluatorRegistry {
  readonly #plugins = new Map<string, CombatEvaluatorPlugin>();

  constructor(plugins: readonly CombatEvaluatorPlugin[] = []) {
    for (const plugin of plugins) this.register(plugin);
  }

  register(plugin: CombatEvaluatorPlugin): void {
    if (!plugin.engineId.trim()) throw new Error('Combat evaluator engine ID cannot be empty.');
    if (this.#plugins.has(plugin.engineId)) {
      throw new Error(`Combat evaluator engine ${plugin.engineId} is already registered.`);
    }
    this.#plugins.set(plugin.engineId, plugin);
  }

  get(engineId: string): CombatEvaluatorPlugin | undefined {
    return this.#plugins.get(engineId);
  }

  requireFor(profile: CombatRotationProfile): CombatEvaluatorPlugin {
    const plugin = this.get(profile.engineId);
    if (!plugin) throw new Error(`Combat evaluator engine ${profile.engineId} is not installed.`);
    if (!plugin.supportedProfileSchemas.includes(profile.schemaVersion)) {
      throw new Error(`Combat evaluator engine ${profile.engineId} does not support ${profile.schemaVersion}.`);
    }
    const errors = plugin.validateProfile(profile);
    if (errors.length > 0) {
      throw new Error(`Combat evaluator profile ${profile.id} is invalid: ${errors.join(' ')}`);
    }
    return plugin;
  }
}

export * from './timing-engine';
export * from './hybrid-policy';
