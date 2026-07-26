import type {
  CombatActionProfile,
  CombatPriorityCondition,
  CombatPriorityRule,
  CombatRotationProfile
} from '@xiv-gear-lab/domain';
import type { ResolvedRotationMethod } from './index';
import type { CombatTimelineStateView } from './timing-engine';

export type RotationDecisionSource = 'community-opener' | 'generated-priority';

export interface RotationDecisionTraceEntry {
  startedAtMs: number;
  actionId: string;
  source: RotationDecisionSource;
  ruleId?: string;
}

export type MechanicConditionEvaluator = (
  mechanicId: string,
  state: CombatTimelineStateView
) => boolean;

export interface HybridRotationPolicyOptions {
  profile: CombatRotationProfile;
  method: ResolvedRotationMethod;
  potion: 'none' | 'included';
  evaluateMechanicCondition?: MechanicConditionEvaluator;
}

export interface HybridRotationPolicy {
  readonly method: ResolvedRotationMethod;
  chooseAction(state: CombatTimelineStateView): string | undefined;
  onActionStarted(action: CombatActionProfile, startedAtMs: number): void;
  trace(): RotationDecisionTraceEntry[];
}

const remainingMs = (
  entries: readonly { id: string; expiresAtMs: number }[],
  id: string,
  nowMs: number
): number => Math.max(0, (entries.find((entry) => entry.id === id)?.expiresAtMs ?? nowMs) - nowMs);

export const evaluatePriorityCondition = (
  condition: CombatPriorityCondition,
  state: CombatTimelineStateView,
  evaluateMechanicCondition?: MechanicConditionEvaluator
): boolean => {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'cooldown-ready':
      return state.availableCharges(condition.actionId) >= (condition.minimumCharges ?? 1);
    case 'resource-at-least':
      return (state.resources[condition.resource] ?? 0) >= condition.amount;
    case 'resource-at-most':
      return (state.resources[condition.resource] ?? 0) <= condition.amount;
    case 'resource-would-overcap':
      return (state.resources[condition.resource] ?? 0) + condition.incoming > condition.maximum;
    case 'buff-active':
      return state.buffs.some((buff) => buff.id === condition.buffId) === condition.active;
    case 'buff-remaining-at-most':
      return remainingMs(state.buffs, condition.buffId, state.nowMs) <= condition.durationMs;
    case 'dot-remaining-at-most':
      return remainingMs(state.dots, condition.dotId, state.nowMs) <= condition.durationMs;
    case 'combo-step':
      return state.combos.some((combo) =>
        combo.id === condition.comboId && combo.step === condition.step
      );
    case 'proc-active':
      return ((state.expectedProcs[condition.procId] ?? 0) > 0) === condition.active;
    case 'mechanic':
      return evaluateMechanicCondition
        ? evaluateMechanicCondition(condition.mechanicId, state)
        : Boolean(state.mechanics[condition.mechanicId]);
  }
};

const isUnconditionalGcdRule = (
  rule: CombatPriorityRule,
  actions: ReadonlyMap<string, CombatActionProfile>
): boolean =>
  actions.get(rule.actionId)?.kind === 'gcd' &&
  rule.conditions.length === 1 &&
  rule.conditions[0]?.kind === 'always';

export const validateHybridRotationProfile = (profile: CombatRotationProfile): string[] => {
  const errors: string[] = [];
  const actions = new Map(profile.actions.map((action) => [action.id, action]));

  if (profile.priorityRules.length === 0) {
    errors.push('At least one generated priority rule is required.');
  }
  for (const rule of profile.priorityRules) {
    const action = actions.get(rule.actionId);
    if (!action) {
      errors.push(`Priority rule ${rule.id} references missing action ${rule.actionId}.`);
      continue;
    }
    if (action.kind !== 'gcd' && action.kind !== 'ogcd') {
      errors.push(`Priority rule ${rule.id} directly selects autonomous ${action.kind} action ${action.id}.`);
    }
    if (rule.conditions.length === 0) {
      errors.push(`Priority rule ${rule.id} has no conditions.`);
    }
    if (rule.allowClipping && action.kind !== 'ogcd') {
      errors.push(`Priority rule ${rule.id} allows clipping for non-oGCD action ${action.id}.`);
    }
  }
  if (!profile.priorityRules.some((rule) => isUnconditionalGcdRule(rule, actions))) {
    errors.push('Generated priority rules require an unconditional GCD fallback.');
  }

  for (const opener of profile.openers) {
    for (const actionId of opener.actionIds) {
      const action = actions.get(actionId);
      if (action && action.kind !== 'gcd' && action.kind !== 'ogcd') {
        errors.push(`Community opener ${opener.id} directly selects autonomous ${action.kind} action ${action.id}.`);
      }
    }
    const containsPotion = opener.actionIds.some((actionId) => actions.get(actionId)?.consumable === 'potion');
    if (opener.potion === 'included' && !containsPotion) {
      errors.push(`Community opener ${opener.id} declares potion use without a potion action.`);
    }
    if (opener.potion === 'none' && containsPotion) {
      errors.push(`Community opener ${opener.id} contains a potion action while declaring no potion.`);
    }
  }
  return errors;
};

const hasResourcesFor = (
  action: CombatActionProfile,
  state: CombatTimelineStateView
): boolean =>
  (action.resourceCosts ?? []).every((cost) =>
    (state.resources[cost.resource] ?? 0) >= cost.amount
  ) &&
  (action.expectedProcCosts ?? []).every((cost) =>
    (state.expectedProcs[cost.resource] ?? 0) >= cost.amount
  );

interface PendingDecision {
  actionId: string;
  source: RotationDecisionSource;
  ruleId?: string;
}

export const createHybridRotationPolicy = (
  options: HybridRotationPolicyOptions
): HybridRotationPolicy => {
  const actions = new Map(options.profile.actions.map((action) => [action.id, action]));
  const trace: RotationDecisionTraceEntry[] = [];
  let openerIndex = 0;
  let pending: PendingDecision | undefined;

  const choosePriorityAction = (state: CombatTimelineStateView): string | undefined => {
    for (const rule of options.profile.priorityRules) {
      const action = actions.get(rule.actionId);
      if (!action) continue;
      if (action.consumable === 'potion' && options.potion !== 'included') continue;
      if (!hasResourcesFor(action, state)) continue;
      if (!rule.conditions.every((condition) =>
        evaluatePriorityCondition(condition, state, options.evaluateMechanicCondition)
      )) continue;
      if (state.availableCharges(action.id) < 1) continue;
      if (action.kind === 'ogcd') {
        if (!rule.allowClipping && !state.canWeave(action.id)) continue;
      }
      pending = {
        actionId: action.id,
        source: 'generated-priority',
        ruleId: rule.id
      };
      return action.id;
    }
    pending = undefined;
    return undefined;
  };

  return {
    method: options.method,
    chooseAction(state) {
      const opener = options.method.opener;
      if (options.method.kind === 'community-opener' && opener && openerIndex < opener.actionIds.length) {
        const actionId = opener.actionIds[openerIndex];
        if (!actionId || !actions.has(actionId)) {
          throw new Error(`Community opener ${opener.id} references missing action ${actionId ?? '(empty)'}.`);
        }
        pending = { actionId, source: 'community-opener' };
        return actionId;
      }
      return choosePriorityAction(state);
    },
    onActionStarted(action, startedAtMs) {
      if (!pending || pending.actionId !== action.id) {
        throw new Error(`Rotation decision trace lost synchronization at ${startedAtMs}ms for ${action.id}.`);
      }
      trace.push({
        startedAtMs,
        actionId: action.id,
        source: pending.source,
        ...(pending.ruleId ? { ruleId: pending.ruleId } : {})
      });
      if (pending.source === 'community-opener') openerIndex += 1;
      pending = undefined;
    },
    trace: () => trace.map((entry) => ({ ...entry }))
  };
};
