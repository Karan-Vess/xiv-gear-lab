import type {
  CombatActionEffect,
  CombatActionProfile,
  CombatRotationProfile
} from '@xiv-gear-lab/domain';
import type {
  CombatActionRecord,
  CombatEvaluationControl,
  CombatEvaluationStats
} from './index';

const DOT_TICK_INTERVAL_MS = 3_000;

export interface ActiveCombatBuff {
  id: string;
  expiresAtMs: number;
  stacks: number;
  damageMultiplier: number;
  hastePercent: number;
}

export interface ActiveCombatDot {
  id: string;
  actionId: string;
  expiresAtMs: number;
  generation: number;
}

export interface ActiveCombatCombo {
  id: string;
  step: string;
  expiresAtMs: number;
}

export interface CombatTimelineStateView {
  nowMs: number;
  gcdReadyAtMs: number;
  actorReadyAtMs: number;
  resources: Readonly<Record<string, number>>;
  resourceCaps: Readonly<Record<string, number>>;
  expectedProcs: Readonly<Record<string, number>>;
  mechanics: Readonly<Record<string, CombatMechanicValue>>;
  buffs: readonly ActiveCombatBuff[];
  dots: readonly ActiveCombatDot[];
  combos: readonly ActiveCombatCombo[];
  availableCharges(actionId: string): number;
  nextChargeAtMs(actionId: string): number | undefined;
  canUse(actionId: string): boolean;
  canWeave(actionId: string): boolean;
}

export interface CombatDamageSnapshot {
  atMs: number;
  buffs: readonly ActiveCombatBuff[];
  damageMultiplier: number;
}

export interface CombatTimelineFinalState {
  resources: Record<string, number>;
  expectedProcs: Record<string, number>;
  mechanics: Record<string, CombatMechanicValue>;
  buffs: ActiveCombatBuff[];
  dots: ActiveCombatDot[];
  combos: ActiveCombatCombo[];
}

export interface CombatTimelineSummary {
  actionCount: number;
  gcdCount: number;
  ogcdCount: number;
  clippedMs: number;
  overcappedResources: Record<string, number>;
  driftMsByAction: Record<string, number>;
  dotCadenceById: Record<string, DotCadenceSummary>;
    pendingApplicationsByAction: Record<string, number>;
    pendingApplicationPotency: number;
    finalResources: Record<string, number>;
}

export interface DotCadenceSummary {
  applications: number;
  refreshes: number;
  earlyRefreshMs: number;
  lateRefreshMs: number;
  missedTicks: number;
}

export interface CombatTimelineResult {
  durationMs: number;
  cancelled: boolean;
  totalPotency: number;
  totalDamage: number;
  records: CombatActionRecord[];
  summary: CombatTimelineSummary;
  finalState: CombatTimelineFinalState;
}

export interface CombatTimelineTemplateRecord extends Omit<CombatActionRecord, 'damage'> {}

export interface CombatTimelineTemplate {
  durationMs: number;
  records: CombatTimelineTemplateRecord[];
  summary: CombatTimelineSummary;
}

export interface CombatTimelineEngineOptions {
  profile: CombatRotationProfile;
  combatStats: CombatEvaluationStats;
  durationMs: number;
  chooseAction(state: CombatTimelineStateView): string | undefined;
  initialResources?: Record<string, number>;
  resourceCaps?: Record<string, number>;
  initialMechanics?: Record<string, CombatMechanicValue>;
  periodicResourceChanges?: PeriodicCombatResourceChange[];
  autoAttackActionId?: string;
  firstAutoAttackAtMs?: number;
  resolvePotency?: (
    action: CombatActionProfile,
    state: CombatTimelineStateView,
    source: CombatActionRecord['source']
  ) => number;
  resolveDamage?: (
    potency: number,
    snapshot: CombatDamageSnapshot,
    action: CombatActionProfile,
    source: CombatActionRecord['source'],
    expectedWeight: number
  ) => number;
  applyMechanic?: (
    mechanicId: string,
    state: CombatTimelineStateView,
    action: CombatActionProfile
  ) => Record<string, CombatMechanicValue | null> | void;
  onActionStarted?: (action: CombatActionProfile, startedAtMs: number) => void;
  control?: CombatEvaluationControl;
}

export type CombatMechanicValue = string | number | boolean;

export interface PeriodicCombatResourceChange {
  resource: string;
  amount: number;
  firstAtMs: number;
  intervalMs: number;
  repeatCount?: number;
}

interface CooldownState {
  completions: number[];
}

interface InternalBuff extends ActiveCombatBuff {}
interface InternalDot extends ActiveCombatDot {
  tickPotency: number;
  snapshot: CombatDamageSnapshot;
  actionName: string;
}
interface InternalCombo extends ActiveCombatCombo {}

interface SnapshotActionEvent {
  type: 'snapshot-action';
  atMs: number;
  sequence: number;
  action: CombatActionProfile;
  startedAtMs: number;
  source: CombatActionRecord['source'];
  expectedWeight: number;
  potency?: number;
}

interface ApplyActionEvent {
  type: 'apply-action';
  atMs: number;
  sequence: number;
  action: CombatActionProfile;
  startedAtMs: number;
  source: CombatActionRecord['source'];
  expectedWeight: number;
  potency: number;
  snapshot: CombatDamageSnapshot;
}

interface DotTickEvent {
  type: 'dot-tick';
  atMs: number;
  sequence: number;
  dotId: string;
  generation: number;
}

interface ResourceTickEvent {
  type: 'resource-tick';
  atMs: number;
  sequence: number;
  resource: string;
  amount: number;
}

type ScheduledEvent = SnapshotActionEvent | ApplyActionEvent | DotTickEvent | ResourceTickEvent;
type WithoutSequence<T> = T extends unknown ? Omit<T, 'sequence'> : never;
type UnsequencedEvent = WithoutSequence<ScheduledEvent>;

const sourceFor = (action: CombatActionProfile): CombatActionRecord['source'] => {
  if (action.kind === 'pet') return 'pet';
  if (action.kind === 'dot') return 'dot';
  if (action.kind === 'auto-attack') return 'auto-attack';
  return 'player';
};

const cloneBuff = (buff: ActiveCombatBuff): ActiveCombatBuff => ({ ...buff });
const cloneDot = (dot: ActiveCombatDot): ActiveCombatDot => ({ ...dot });
const cloneCombo = (combo: ActiveCombatCombo): ActiveCombatCombo => ({ ...combo });

const objectFromMap = (values: ReadonlyMap<string, number>): Record<string, number> =>
  Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));

export const adjustedRecastMs = (
  baseRecastMs: number,
  speedStatValue: number,
  speedBaseSub: number,
  speedLevelDiv: number,
  hastePercent: number
): number => {
  if (!Number.isInteger(baseRecastMs) || baseRecastMs < 0) {
    throw new Error(`Base recast must be a non-negative integer, received ${baseRecastMs}.`);
  }
  if (!Number.isFinite(speedLevelDiv) || speedLevelDiv <= 0) {
    throw new Error(`Speed level divisor must be positive, received ${speedLevelDiv}.`);
  }
  if (!Number.isFinite(hastePercent) || hastePercent < 0 || hastePercent >= 100) {
    throw new Error(`Haste must be between 0 and 100, received ${hastePercent}.`);
  }
  const speedReduction = Math.floor((130 * (speedStatValue - speedBaseSub)) / speedLevelDiv);
  const speedAdjusted = Math.floor(((1000 - speedReduction) * baseRecastMs) / 1000);
  const hasteAdjusted = Math.floor((speedAdjusted * (100 - hastePercent)) / 100);
  return Math.max(0, Math.floor(hasteAdjusted / 10) * 10);
};

export const timelineTemplateFrom = (result: CombatTimelineResult): CombatTimelineTemplate => ({
  durationMs: result.durationMs,
  records: result.records.map(({ damage: _damage, ...record }) => structuredClone(record)),
  summary: structuredClone(result.summary)
});

export class CombatTimelineCache {
  readonly #entries = new Map<string, CombatTimelineTemplate>();

  constructor(readonly maximumEntries = 64) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
      throw new Error('Timeline cache size must be a positive integer.');
    }
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): CombatTimelineTemplate | undefined {
    const value = this.#entries.get(key);
    if (!value) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return structuredClone(value);
  }

  set(key: string, value: CombatTimelineTemplate): void {
    this.#entries.delete(key);
    this.#entries.set(key, structuredClone(value));
    while (this.#entries.size > this.maximumEntries) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
  }

  getOrCreate(key: string, create: () => CombatTimelineTemplate): CombatTimelineTemplate {
    const cached = this.get(key);
    if (cached) return cached;
    const value = create();
    this.set(key, value);
    return structuredClone(value);
  }

  clear(): void {
    this.#entries.clear();
  }
}

export const runCombatTimeline = (options: CombatTimelineEngineOptions): CombatTimelineResult => {
  if (!Number.isInteger(options.durationMs) || options.durationMs < 1) {
    throw new Error('Combat timeline duration must be a positive integer.');
  }

  const actions = new Map(options.profile.actions.map((action) => [action.id, action]));
  const resources = new Map(Object.entries(options.initialResources ?? {}));
  const resourceCaps = new Map(Object.entries(options.resourceCaps ?? {}));
  const expectedProcs = new Map<string, number>();
  const mechanics = new Map<string, CombatMechanicValue>(Object.entries(options.initialMechanics ?? {}));
  const buffs = new Map<string, InternalBuff>();
  const dots = new Map<string, InternalDot>();
  const combos = new Map<string, InternalCombo>();
  const cooldowns = new Map<string, CooldownState>();
  const previousUseAt = new Map<string, number>();
  const overcappedResources = new Map<string, number>();
  const driftMsByAction = new Map<string, number>();
  const dotCadenceById = new Map<string, DotCadenceSummary>();
  const lastDotExpiryById = new Map<string, number>();
  const dotGenerationById = new Map<string, number>();
  const records: CombatActionRecord[] = [];
  const events: ScheduledEvent[] = [];
  let eventSequence = 0;
  let nowMs = 0;
  let gcdReadyAtMs = 0;
  let actorReadyAtMs = 0;
  let hasUsedGcd = false;
  let clippedMs = 0;
  let cancelled = false;

  const enqueue = (event: UnsequencedEvent): void => {
    events.push({ ...event, sequence: eventSequence++ } as ScheduledEvent);
    events.sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence);
  };

  const cleanStateAt = (atMs: number): void => {
    for (const [id, buff] of buffs) if (buff.expiresAtMs <= atMs) buffs.delete(id);
    for (const [id, combo] of combos) if (combo.expiresAtMs <= atMs) combos.delete(id);
    for (const [id, dot] of dots) if (dot.expiresAtMs < atMs) dots.delete(id);
    for (const cooldown of cooldowns.values()) {
      while (cooldown.completions[0] !== undefined && cooldown.completions[0] <= atMs) {
        cooldown.completions.shift();
      }
    }
  };

  const activeBuffsAt = (atMs: number): ActiveCombatBuff[] => {
    cleanStateAt(atMs);
    return [...buffs.values()]
      .filter((buff) => buff.expiresAtMs > atMs)
      .map(cloneBuff)
      .sort((left, right) => left.id.localeCompare(right.id));
  };

  const cooldownFor = (action: CombatActionProfile): CooldownState => {
    let state = cooldowns.get(action.id);
    if (!state) {
      state = { completions: [] };
      cooldowns.set(action.id, state);
    }
    return state;
  };

  const activeHasteAt = (atMs: number): number =>
    options.combatStats.hastePercent +
    activeBuffsAt(atMs).reduce((total, buff) => total + buff.hastePercent, 0);

  const recastFor = (action: CombatActionProfile, atMs: number): number =>
    action.speedScaling === 'none'
      ? action.recastMs
      : adjustedRecastMs(
        action.recastMs,
        options.combatStats.speedStatValue,
        options.combatStats.speedBaseSub,
        options.combatStats.speedLevelDiv,
        activeHasteAt(atMs)
      );

  const castFor = (action: CombatActionProfile, atMs: number): number =>
    action.castMs === 0 || action.speedScaling === 'none'
      ? action.castMs
      : adjustedRecastMs(
        action.castMs,
        options.combatStats.speedStatValue,
        options.combatStats.speedBaseSub,
        options.combatStats.speedLevelDiv,
        activeHasteAt(atMs)
      );

  const cooldownDurationFor = (action: CombatActionProfile): number =>
    action.cooldownMs ?? (action.kind === 'ogcd' ? action.recastMs : 0);

  const actorOccupiedDurationFor = (action: CombatActionProfile, atMs: number): number =>
    Math.max(castFor(action, atMs), action.animationLockMs) + options.profile.assumptions.latencyMs;

  const availableCharges = (action: CombatActionProfile, atMs: number): number => {
    if (cooldownDurationFor(action) === 0) return action.charges;
    cleanStateAt(atMs);
    return Math.max(0, action.charges - cooldownFor(action).completions.length);
  };

  const nextChargeAt = (action: CombatActionProfile, atMs: number): number | undefined => {
    if (availableCharges(action, atMs) > 0) return undefined;
    return cooldownFor(action).completions[0];
  };

  const hasResourceCosts = (action: CombatActionProfile): boolean =>
    (action.resourceCosts ?? []).every((cost) => (resources.get(cost.resource) ?? 0) >= cost.amount) &&
    (action.expectedProcCosts ?? []).every((cost) => (expectedProcs.get(cost.resource) ?? 0) >= cost.amount);

  const earliestUseAt = (action: CombatActionProfile, atMs: number): number => {
    if (!hasResourceCosts(action)) return Number.POSITIVE_INFINITY;
    let earliest = Math.max(atMs, actorReadyAtMs);
    if (action.kind === 'gcd') earliest = Math.max(earliest, gcdReadyAtMs);
    const chargeAt = nextChargeAt(action, atMs);
    if (chargeAt !== undefined) earliest = Math.max(earliest, chargeAt);
    return earliest;
  };

  const stateViewAt = (atMs: number): CombatTimelineStateView => {
    cleanStateAt(atMs);
    const view: CombatTimelineStateView = {
      nowMs: atMs,
      gcdReadyAtMs,
      actorReadyAtMs,
      resources: objectFromMap(resources),
      resourceCaps: objectFromMap(resourceCaps),
      expectedProcs: objectFromMap(expectedProcs),
      mechanics: Object.fromEntries([...mechanics.entries()].sort(([left], [right]) => left.localeCompare(right))),
      buffs: activeBuffsAt(atMs),
      dots: [...dots.values()].map(cloneDot).sort((left, right) => left.id.localeCompare(right.id)),
      combos: [...combos.values()].map(cloneCombo).sort((left, right) => left.id.localeCompare(right.id)),
      availableCharges: (actionId) => {
        const action = actions.get(actionId);
        return action ? availableCharges(action, atMs) : 0;
      },
      nextChargeAtMs: (actionId) => {
        const action = actions.get(actionId);
        return action ? nextChargeAt(action, atMs) : undefined;
      },
      canUse: (actionId) => {
        const action = actions.get(actionId);
        return Boolean(action && earliestUseAt(action, atMs) === atMs);
      },
      canWeave: (actionId) => {
        const action = actions.get(actionId);
        if (!action || action.kind !== 'ogcd') return false;
        const earliest = earliestUseAt(action, atMs);
        if (!Number.isFinite(earliest) || earliest >= gcdReadyAtMs) return false;
        const lockDuration = actorOccupiedDurationFor(action, earliest);
        return (
          lockDuration <= options.profile.assumptions.weaveWindowMs &&
          earliest + lockDuration <= gcdReadyAtMs
        );
      }
    };
    return view;
  };

  const damageSnapshotAt = (atMs: number): CombatDamageSnapshot => {
    const active = activeBuffsAt(atMs);
    return {
      atMs,
      buffs: active,
      damageMultiplier: active.reduce((total, buff) => total * buff.damageMultiplier, 1)
    };
  };

  const scheduleSnapshot = (
    action: CombatActionProfile,
    startedAtMs: number,
    snapshotAtMs: number,
    source: CombatActionRecord['source'],
    expectedWeight = 1,
    potency?: number
  ): void => enqueue({
    type: 'snapshot-action',
    atMs: snapshotAtMs,
    action,
    startedAtMs,
    source,
    expectedWeight,
    potency
  });

  const scheduleDotTicks = (
    effect: Extract<CombatActionEffect, { kind: 'dot' }>,
    action: CombatActionProfile,
    appliedAtMs: number,
    snapshot: CombatDamageSnapshot
  ): void => {
    const previousExpiry = lastDotExpiryById.get(effect.dotId);
    const cadence = dotCadenceById.get(effect.dotId) ?? {
      applications: 0,
      refreshes: 0,
      earlyRefreshMs: 0,
      lateRefreshMs: 0,
      missedTicks: 0
    };
    cadence.applications += 1;
    if (previousExpiry !== undefined) {
      cadence.refreshes += 1;
      if (appliedAtMs < previousExpiry) {
        cadence.earlyRefreshMs += previousExpiry - appliedAtMs;
      } else if (appliedAtMs > previousExpiry) {
        cadence.lateRefreshMs += appliedAtMs - previousExpiry;
        const firstInactiveTick = Math.floor(previousExpiry / DOT_TICK_INTERVAL_MS) * DOT_TICK_INTERVAL_MS + DOT_TICK_INTERVAL_MS;
        for (let tickAtMs = firstInactiveTick; tickAtMs <= appliedAtMs; tickAtMs += DOT_TICK_INTERVAL_MS) {
          cadence.missedTicks += 1;
        }
      }
    }
    dotCadenceById.set(effect.dotId, cadence);

    const previousGeneration = dotGenerationById.get(effect.dotId) ?? 0;
    const generation = previousGeneration + 1;
    const expiresAtMs = appliedAtMs + effect.durationMs;
    dotGenerationById.set(effect.dotId, generation);
    lastDotExpiryById.set(effect.dotId, expiresAtMs);
    dots.set(effect.dotId, {
      id: effect.dotId,
      actionId: action.id,
      actionName: action.name,
      expiresAtMs,
      generation,
      tickPotency: effect.tickPotency,
      snapshot
    });
    let tickAtMs = Math.floor(appliedAtMs / DOT_TICK_INTERVAL_MS) * DOT_TICK_INTERVAL_MS + DOT_TICK_INTERVAL_MS;
    while (tickAtMs <= expiresAtMs && tickAtMs <= options.durationMs) {
      enqueue({ type: 'dot-tick', atMs: tickAtMs, dotId: effect.dotId, generation });
      tickAtMs += DOT_TICK_INTERVAL_MS;
    }
  };

  const applyResourceChange = (resource: string, amount: number): void => {
    const current = resources.get(resource) ?? 0;
    const cap = resourceCaps.get(resource);
    const uncapped = current + amount;
    const next = cap === undefined ? uncapped : Math.min(cap, uncapped);
    if (cap !== undefined && uncapped > cap) {
      overcappedResources.set(resource, (overcappedResources.get(resource) ?? 0) + uncapped - cap);
    }
    resources.set(resource, next);
  };

  const applyEffects = (
    action: CombatActionProfile,
    event: ApplyActionEvent
  ): void => {
    for (const effect of action.effects ?? []) {
      if (effect.kind === 'resource') {
        if (effect.timing === 'snapshot') continue;
        applyResourceChange(effect.resource, effect.amount);
      } else if (effect.kind === 'buff') {
        buffs.set(effect.buffId, {
          id: effect.buffId,
          expiresAtMs: event.atMs + effect.durationMs,
          stacks: effect.stacks ?? 1,
          damageMultiplier: effect.damageMultiplier ?? 1,
          hastePercent: effect.hastePercent ?? 0
        });
      } else if (effect.kind === 'dot') {
        scheduleDotTicks(effect, action, event.atMs, event.snapshot);
      } else if (effect.kind === 'combo') {
        combos.set(effect.comboId, {
          id: effect.comboId,
          step: effect.nextStep,
          expiresAtMs: event.atMs + effect.durationMs
        });
      } else if (effect.kind === 'expected-proc') {
        expectedProcs.set(effect.procId, Math.min(1, (expectedProcs.get(effect.procId) ?? 0) + effect.chance));
      } else if (effect.kind === 'periodic-resource') {
        for (let index = 0; index < effect.repeatCount; index += 1) {
          const atMs = event.atMs + effect.firstDelayMs + index * effect.intervalMs;
          if (atMs > options.durationMs) break;
          enqueue({
            type: 'resource-tick',
            atMs,
            resource: effect.resource,
            amount: effect.amount
          });
        }
      } else if (effect.kind === 'schedule-action') {
        const scheduled = actions.get(effect.actionId);
        if (!scheduled) continue;
        const count = effect.repeatCount ?? 1;
        for (let index = 0; index < count; index += 1) {
          const scheduledAtMs = event.atMs + effect.delayMs + index * (effect.repeatEveryMs ?? 0);
          if (scheduledAtMs <= options.durationMs) {
            scheduleSnapshot(scheduled, scheduledAtMs, scheduledAtMs, sourceFor(scheduled));
          }
        }
      } else if (effect.kind === 'mechanic') {
        if (effect.timing === 'snapshot') continue;
        const changes = options.applyMechanic?.(effect.mechanicId, stateViewAt(event.atMs), action);
        for (const [key, value] of Object.entries(changes ?? {})) {
          if (value === null) mechanics.delete(key);
          else mechanics.set(key, value);
        }
      }
    }
  };

  const applySnapshotEffects = (
    action: CombatActionProfile,
    atMs: number
  ): void => {
    for (const effect of action.effects ?? []) {
      if (effect.kind === 'resource' && effect.timing === 'snapshot') {
        applyResourceChange(effect.resource, effect.amount);
      } else if (effect.kind === 'mechanic' && effect.timing === 'snapshot') {
        const changes = options.applyMechanic?.(effect.mechanicId, stateViewAt(atMs), action);
        for (const [key, value] of Object.entries(changes ?? {})) {
          if (value === null) mechanics.delete(key);
          else mechanics.set(key, value);
        }
      }
    }
  };

  const recordDamage = (
    action: CombatActionProfile,
    startedAtMs: number,
    appliedAtMs: number,
    source: CombatActionRecord['source'],
    expectedWeight: number,
    potency: number,
    snapshot: CombatDamageSnapshot,
    actionName = action.name
  ): void => {
    if (appliedAtMs > options.durationMs) return;
    const damage = options.resolveDamage
      ? options.resolveDamage(potency, snapshot, action, source, expectedWeight)
      : potency * snapshot.damageMultiplier * expectedWeight;
    records.push({
      actionId: action.id,
      actionName,
      startedAtMs,
      appliedAtMs,
      damage,
      potency,
      expectedWeight,
      snapshotBuffIds: snapshot.buffs.map((buff) => buff.id),
      source
    });
  };

  const processEvent = (event: ScheduledEvent): void => {
    nowMs = event.atMs;
    cleanStateAt(nowMs);
    if (event.type === 'resource-tick') {
      applyResourceChange(event.resource, event.amount);
      return;
    }
    if (event.type === 'snapshot-action') {
      const state = stateViewAt(event.atMs);
      const potency = event.potency ?? (options.resolvePotency
        ? options.resolvePotency(event.action, state, event.source)
        : event.action.potency);
      // Job state changes at cast completion/snapshot time. Damage, DoTs and
      // delayed autonomous actions still resolve at their application time.
      applySnapshotEffects(event.action, event.atMs);
      enqueue({
        type: 'apply-action',
        atMs: event.atMs + event.action.applicationDelayMs,
        action: event.action,
        startedAtMs: event.startedAtMs,
        source: event.source,
        expectedWeight: event.expectedWeight,
        potency,
        snapshot: damageSnapshotAt(event.atMs)
      });
      return;
    }
    if (event.type === 'apply-action') {
      recordDamage(
        event.action,
        event.startedAtMs,
        event.atMs,
        event.source,
        event.expectedWeight,
        event.potency,
        event.snapshot
      );
      applyEffects(event.action, event);
      return;
    }
    const dot = dots.get(event.dotId);
    if (!dot || dot.generation !== event.generation || event.atMs > dot.expiresAtMs) return;
    const action = actions.get(dot.actionId);
    if (!action) return;
    recordDamage(
      action,
      event.atMs,
      event.atMs,
      'dot',
      1,
      dot.tickPotency,
      dot.snapshot,
      `${dot.actionName} (DoT)`
    );
  };

  const processEventsThrough = (throughMs: number): void => {
    while (events[0] && events[0].atMs <= throughMs && events[0].atMs <= options.durationMs) {
      if (options.control?.isCancelled()) {
        cancelled = true;
        break;
      }
      const event = events.shift()!;
      processEvent(event);
    }
    nowMs = Math.min(throughMs, options.durationMs);
    cleanStateAt(nowMs);
  };

  const consumeAction = (action: CombatActionProfile, startedAtMs: number): void => {
    const source = sourceFor(action);
    const potency = options.resolvePotency
      ? options.resolvePotency(action, stateViewAt(startedAtMs), source)
      : action.potency;
    for (const cost of action.resourceCosts ?? []) {
      resources.set(cost.resource, (resources.get(cost.resource) ?? 0) - cost.amount);
    }
    for (const cost of action.expectedProcCosts ?? []) {
      expectedProcs.set(cost.resource, Math.max(0, (expectedProcs.get(cost.resource) ?? 0) - cost.amount));
    }

    const actionRecastMs = recastFor(action, startedAtMs);
    if (action.kind === 'gcd') {
      if (hasUsedGcd && startedAtMs > gcdReadyAtMs) clippedMs += startedAtMs - gcdReadyAtMs;
      gcdReadyAtMs = startedAtMs + actionRecastMs;
      hasUsedGcd = true;
    }
    const cooldownDurationMs = cooldownDurationFor(action);
    if (cooldownDurationMs > 0) {
      const cooldown = cooldownFor(action);
      cleanStateAt(startedAtMs);
      const previousCompletion = cooldown.completions.at(-1) ?? startedAtMs;
      cooldown.completions.push(Math.max(startedAtMs, previousCompletion) + cooldownDurationMs);
      const previous = previousUseAt.get(action.id);
      if (previous !== undefined) {
        const drift = Math.max(0, startedAtMs - previous - cooldownDurationMs);
        driftMsByAction.set(action.id, (driftMsByAction.get(action.id) ?? 0) + drift);
      }
      previousUseAt.set(action.id, startedAtMs);
    }

    const snapshotAtMs = startedAtMs + castFor(action, startedAtMs);
    // The action lock starts with the action and overlaps its cast. Adding the
    // full lock after cast completion creates artificial clipping on hardcasts.
    actorReadyAtMs = startedAtMs + actorOccupiedDurationFor(action, startedAtMs);
    scheduleSnapshot(action, startedAtMs, snapshotAtMs, source, 1, potency);
    options.onActionStarted?.(action, startedAtMs);
  };

  const nextStateChangeAt = (afterMs: number): number | undefined => {
    const candidates: number[] = [];
    if (actorReadyAtMs > afterMs) candidates.push(actorReadyAtMs);
    if (gcdReadyAtMs > afterMs) candidates.push(gcdReadyAtMs);
    for (const cooldown of cooldowns.values()) {
      for (const completion of cooldown.completions) {
        if (completion > afterMs) candidates.push(completion);
      }
    }
    for (const buff of buffs.values()) if (buff.expiresAtMs > afterMs) candidates.push(buff.expiresAtMs);
    for (const combo of combos.values()) if (combo.expiresAtMs > afterMs) candidates.push(combo.expiresAtMs);
    for (const dot of dots.values()) if (dot.expiresAtMs > afterMs) candidates.push(dot.expiresAtMs + 1);
    return candidates.length > 0 ? Math.min(...candidates) : undefined;
  };

  if (options.autoAttackActionId) {
    const autoAttack = actions.get(options.autoAttackActionId);
    if (!autoAttack) throw new Error(`Auto-attack action ${options.autoAttackActionId} is missing.`);
    if (autoAttack.kind !== 'auto-attack') throw new Error(`${autoAttack.id} is not an auto-attack action.`);
    if (!Number.isInteger(options.combatStats.weaponDelayMs) || options.combatStats.weaponDelayMs <= 0) {
      throw new Error('Weapon delay must be a positive integer when auto-attacks are enabled.');
    }
    const firstAtMs = options.firstAutoAttackAtMs ?? options.combatStats.weaponDelayMs;
    for (let atMs = firstAtMs; atMs <= options.durationMs; atMs += options.combatStats.weaponDelayMs) {
      scheduleSnapshot(autoAttack, atMs, atMs, 'auto-attack');
    }
  }

  for (const periodic of options.periodicResourceChanges ?? []) {
    if (
      !periodic.resource.trim() ||
      !Number.isFinite(periodic.amount) ||
      !Number.isInteger(periodic.firstAtMs) ||
      periodic.firstAtMs < 0 ||
      !Number.isInteger(periodic.intervalMs) ||
      periodic.intervalMs <= 0 ||
      (
        periodic.repeatCount !== undefined &&
        (!Number.isInteger(periodic.repeatCount) || periodic.repeatCount < 1)
      )
    ) {
      throw new Error('Periodic resource changes require a resource, finite amount, non-negative first tick and positive interval.');
    }
    const maximumTicks = periodic.repeatCount ?? Math.floor(
      (options.durationMs - periodic.firstAtMs) / periodic.intervalMs
    ) + 1;
    for (let index = 0; index < maximumTicks; index += 1) {
      const atMs = periodic.firstAtMs + index * periodic.intervalMs;
      if (atMs > options.durationMs) break;
      enqueue({
        type: 'resource-tick',
        atMs,
        resource: periodic.resource,
        amount: periodic.amount
      });
    }
  }

  let iterations = 0;
  while (nowMs <= options.durationMs) {
    iterations += 1;
    if (iterations > 1_000_000) throw new Error('Combat timeline exceeded its safety iteration limit.');
    if (options.control?.isCancelled()) {
      cancelled = true;
      break;
    }
    processEventsThrough(nowMs);
    if (cancelled) break;
    options.control?.reportProgress?.(Math.min(1, nowMs / options.durationMs));

    const state = stateViewAt(nowMs);
    const selectedActionId = options.chooseAction(state);
    if (!selectedActionId) {
      const nextEventAtMs = events[0]?.atMs;
      const nextStateAtMs = nextStateChangeAt(nowMs);
      const nextWakeAtMs = [nextEventAtMs, nextStateAtMs]
        .filter((value): value is number => value !== undefined && value > nowMs)
        .reduce<number | undefined>((earliestWake, value) =>
          earliestWake === undefined ? value : Math.min(earliestWake, value), undefined);
      if (nextWakeAtMs !== undefined && nextWakeAtMs <= options.durationMs) {
        processEventsThrough(nextWakeAtMs);
        continue;
      }
      processEventsThrough(options.durationMs);
      break;
    }
    const action = actions.get(selectedActionId);
    if (!action) throw new Error(`Rotation selected missing action ${selectedActionId}.`);
    if (action.kind !== 'gcd' && action.kind !== 'ogcd') {
      throw new Error(`Rotation cannot directly select autonomous ${action.kind} action ${action.id}.`);
    }
    const earliest = earliestUseAt(action, nowMs);
    if (!Number.isFinite(earliest)) {
      throw new Error(`Action ${action.id} cannot be used at ${nowMs}ms because its resource costs are not met.`);
    }
    const nextEventAtMs = events[0]?.atMs;
    const nextStateAtMs = nextStateChangeAt(nowMs);
    const nextWakeAtMs = [nextEventAtMs, nextStateAtMs]
      .filter((value): value is number => value !== undefined && value > nowMs)
      .reduce<number | undefined>((earliestWake, value) =>
        earliestWake === undefined ? value : Math.min(earliestWake, value), undefined);
    if (
      nextWakeAtMs !== undefined &&
      nextWakeAtMs <= earliest &&
      nextWakeAtMs <= options.durationMs
    ) {
      processEventsThrough(nextWakeAtMs);
      continue;
    }
    if (earliest > options.durationMs) {
      processEventsThrough(options.durationMs);
      break;
    }
    if (earliest > nowMs) {
      processEventsThrough(earliest);
      continue;
    }
    consumeAction(action, nowMs);
  }

  records.sort((left, right) =>
    left.appliedAtMs - right.appliedAtMs ||
    left.startedAtMs - right.startedAtMs ||
    left.actionId.localeCompare(right.actionId)
  );
  const pendingApplicationsByAction = new Map<string, number>();
  const pendingApplicationKeys = new Set<string>();
  let pendingApplicationPotency = 0;
  for (const event of events) {
    if (
      (event.type !== 'snapshot-action' && event.type !== 'apply-action') ||
      event.startedAtMs > options.durationMs ||
      event.atMs <= options.durationMs
    ) continue;
    const key = `${event.source}:${event.action.id}:${event.startedAtMs}`;
    if (pendingApplicationKeys.has(key)) continue;
    pendingApplicationKeys.add(key);
    pendingApplicationsByAction.set(
      event.action.id,
      (pendingApplicationsByAction.get(event.action.id) ?? 0) + 1
    );
    pendingApplicationPotency += (event.type === 'apply-action' ? event.potency : event.potency ?? event.action.potency) * event.expectedWeight;
  }
  cleanStateAt(Math.min(nowMs, options.durationMs));
  const summary: CombatTimelineSummary = {
    actionCount: records.filter((record) => record.source === 'player').length,
    gcdCount: records.filter((record) => actions.get(record.actionId)?.kind === 'gcd' && record.source === 'player').length,
    ogcdCount: records.filter((record) => actions.get(record.actionId)?.kind === 'ogcd' && record.source === 'player').length,
    clippedMs,
    overcappedResources: objectFromMap(overcappedResources),
    driftMsByAction: objectFromMap(driftMsByAction),
    dotCadenceById: Object.fromEntries(
      [...dotCadenceById.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, cadence]) => [id, { ...cadence }])
    ),
    pendingApplicationsByAction: objectFromMap(pendingApplicationsByAction),
    pendingApplicationPotency,
    finalResources: objectFromMap(resources)
  };
  options.control?.reportProgress?.(cancelled ? Math.min(1, nowMs / options.durationMs) : 1);

  return {
    durationMs: options.durationMs,
    cancelled,
    totalPotency: records.reduce((total, record) => total + record.potency * record.expectedWeight, 0),
    totalDamage: records.reduce((total, record) => total + record.damage, 0),
    records,
    summary,
    finalState: {
      resources: objectFromMap(resources),
      expectedProcs: objectFromMap(expectedProcs),
      mechanics: Object.fromEntries([...mechanics.entries()].sort(([left], [right]) => left.localeCompare(right))),
      buffs: activeBuffsAt(Math.min(nowMs, options.durationMs)),
      dots: [...dots.values()].map(cloneDot).sort((left, right) => left.id.localeCompare(right.id)),
      combos: [...combos.values()].map(cloneCombo).sort((left, right) => left.id.localeCompare(right.id))
    }
  };
};
