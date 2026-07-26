import {
  LEVEL_100,
  criticalHitChance,
  criticalHitMultiplier,
  directHitChance,
  expectedActionDamage,
  mainStatMultiplier
} from '@xiv-gear-lab/calculations';
import {
  emptyStats,
  type CombatActionProfile,
  type CombatEvaluatorProfile,
  type CombatJob,
  type StatKey
} from '@xiv-gear-lab/domain';
import {
  CombatEvaluatorRegistry,
  ROTATION_PROFILE_SCHEMA_VERSION,
  runHybridCombatEvaluation,
  validateHybridRotationProfile,
  type CombatEvaluationRequest,
  type CombatEvaluationResult,
  type CombatEvaluatorPlugin
} from './index';
import type {
  ActiveCombatBuff,
  CombatDamageSnapshot,
  CombatMechanicValue,
  CombatTimelineEngineOptions,
  CombatTimelineTemplate,
  CombatTimelineStateView
} from './timing-engine';

interface PilotEvaluatorConfig {
  job: CombatJob;
  engineId: string;
  profileId: string;
  mainStat: 'strength' | 'dexterity' | 'intelligence';
  attackPowerModifier: number;
  mainStatModifier: number;
  damageTrait: number;
  appliesTenacity: boolean;
  initialResources: Record<string, number>;
  resourceCaps: Record<string, number>;
  initialMechanics?: Record<string, CombatMechanicValue>;
  periodicResourceChanges?: CombatTimelineEngineOptions['periodicResourceChanges'];
  autoAttackActionId?: string;
}

const configByEngine: PilotEvaluatorConfig[] = [{
  job: 'SAM',
  engineId: 'sam-pilot-engine@1',
  profileId: 'sam-dt-generated-rotation@1',
  mainStat: 'strength',
  attackPowerModifier: 237,
  mainStatModifier: 112,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    kenki: 0,
    meditation: 0,
    setsu: 0,
    getsu: 0,
    ka: 0
  },
  resourceCaps: {
    kenki: 100,
    meditation: 3,
    setsu: 1,
    getsu: 1,
    ka: 1
  },
  initialMechanics: {
    'sam-ogi-ready': false,
    'sam-kaeshi-ready': false
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'DNC',
  engineId: 'dnc-pilot-engine@1',
  profileId: 'dnc-dt-generated-rotation@1',
  mainStat: 'dexterity',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.2,
  appliesTenacity: false,
  initialResources: {
    esprit: 0,
    'tillana-ready': 0,
    'dawn-ready': 0,
    'last-dance-ready': 0,
    'starfall-ready': 0
  },
  resourceCaps: {
    esprit: 100,
    'tillana-ready': 1,
    'dawn-ready': 1,
    'last-dance-ready': 1,
    'starfall-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'BLM',
  engineId: 'blm-pilot-engine@1',
  profileId: 'blm-dt-generated-rotation@1',
  mainStat: 'intelligence',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    mp: 10_000,
    polyglot: 0,
    'astral-soul': 0
  },
  resourceCaps: {
    mp: 10_000,
    polyglot: 3,
    'astral-soul': 6
  },
  initialMechanics: {
    'blm-stance': 'neutral',
    'blm-in-fire': false,
    'blm-thunder-ready': true,
    'blm-blizzard-iv-ready': false,
    'blm-fire-iii-ready': true,
    'blm-can-despair': false,
    'blm-manafont-ready': false
  },
  periodicResourceChanges: [{
    resource: 'polyglot',
    amount: 1,
    firstAtMs: 30_000,
    intervalMs: 30_000
  }]
}, {
  job: 'DRK',
  engineId: 'drk-pilot-engine@1',
  profileId: 'drk-dt-generated-rotation@1',
  mainStat: 'strength',
  attackPowerModifier: 190,
  mainStatModifier: 105,
  damageTrait: 1,
  appliesTenacity: true,
  initialResources: {
    mp: 10_000,
    blood: 0,
    delirium: 0,
    'scorn-ready': 0,
    'salt-and-darkness-ready': 0
  },
  resourceCaps: {
    mp: 10_000,
    blood: 100,
    delirium: 3,
    'scorn-ready': 1,
    'salt-and-darkness-ready': 1
  },
  periodicResourceChanges: [{
    resource: 'mp',
    amount: 200,
    firstAtMs: 3000,
    intervalMs: 3000
  }],
  autoAttackActionId: 'auto-attack'
}];

const damageProfileFor = (config: PilotEvaluatorConfig): CombatEvaluatorProfile => ({
  id: `${config.job.toLowerCase()}-pilot-damage@1`,
  schemaVersion: 'generic-hit-profile@1',
  rulesetId: 'dt-7.51-level-100-standard@1',
  job: config.job,
  jobMode: 'standard',
  version: 'dt-7.51-pilot-damage@1',
  role: config.job === 'DRK' ? 'tank' : 'dps',
  mainStat: config.mainStat,
  mainStatLabel: config.mainStat,
  mainStatAbbreviation: config.mainStat.slice(0, 3).toUpperCase(),
  speedStat: config.job === 'BLM' ? 'spellSpeed' : 'skillSpeed',
  speedStatLabel: config.job === 'BLM' ? 'Spell Speed' : 'Skill Speed',
  speedStatAbbreviation: config.job === 'BLM' ? 'SPS' : 'SKS',
  meldStats: ['criticalHit', 'determination', 'directHit', config.job === 'BLM' ? 'spellSpeed' : 'skillSpeed'],
  baseStats: emptyStats(),
  attackPowerModifier: config.attackPowerModifier,
  mainStatModifier: config.mainStatModifier,
  appliesTenacity: config.appliesTenacity,
  damageTrait: config.damageTrait,
  baseGcdMs: 2500,
  hastePercent: 0,
  timingEffectId: 'base-gcd',
  objective: 'Pilot rotation damage.',
  confidence: 'internal-unverified',
  limitation: 'Used only by the bounded pilot evaluator.'
});

const criticalFactorWithChanceBonus = (
  stat: number,
  bonus: number
): number => {
  const chance = Math.min(1, criticalHitChance(stat, LEVEL_100) + bonus);
  return 1 + chance * (criticalHitMultiplier(stat, LEVEL_100) - 1);
};

const directFactorWithChanceBonus = (
  stat: number,
  bonus: number
): number => 1 + Math.min(1, directHitChance(stat, LEVEL_100) + bonus) * 0.25;

const buffMultiplierFor = (
  config: PilotEvaluatorConfig,
  action: CombatActionProfile,
  snapshot: CombatDamageSnapshot,
  source: 'player' | 'pet' | 'dot' | 'auto-attack',
  request: CombatEvaluationRequest
): { multiplier: number; stats: CombatEvaluationRequest['combatStats']['stats'] } => {
  let multiplier = 1;
  let stats = request.combatStats.stats;
  for (const buff of snapshot.buffs) {
    if (source === 'pet' && buff.id === 'drk-darkside') continue;
    multiplier *= buff.damageMultiplier;
    if (buff.id === 'pilot-potion') {
      const mainStat = config.mainStat as StatKey;
      const bonus = Math.min(Math.floor(stats[mainStat] * 0.1), 392);
      stats = { ...stats, [mainStat]: stats[mainStat] + bonus };
    }
    if (buff.id === 'dnc-devilment') {
      if ((action.criticalHitMode ?? 'normal') === 'normal') {
        const normal = 1 + criticalHitChance(stats.criticalHit, LEVEL_100) *
          (criticalHitMultiplier(stats.criticalHit, LEVEL_100) - 1);
        multiplier *= criticalFactorWithChanceBonus(stats.criticalHit, 0.2) / normal;
      }
      if ((action.directHitMode ?? 'normal') === 'normal') {
        const normal = 1 + directHitChance(stats.directHit, LEVEL_100) * 0.25;
        multiplier *= directFactorWithChanceBonus(stats.directHit, 0.2) / normal;
      }
    }
  }
  return { multiplier, stats };
};

const resolveBlmPotency = (
  action: CombatActionProfile,
  state: CombatTimelineStateView
): number => {
  const stance = state.mechanics['blm-stance'];
  const fire = ['blm-fire-iii', 'blm-fire-iv', 'blm-flare-star', 'blm-despair'].includes(action.id);
  const ice = ['blm-blizzard-iii', 'blm-blizzard-iv'].includes(action.id);
  if (fire && stance === 'fire') return action.potency * 1.8;
  if (fire && stance === 'ice') return action.potency * 0.7;
  if (ice && stance === 'fire') return action.potency * 0.7;
  return action.potency;
};

const applySamMechanic = (
  mechanicId: string
): Record<string, CombatMechanicValue | null> | void => {
  if (mechanicId === 'sam-ikishoten-used') return { 'sam-ogi-ready': true };
  if (mechanicId === 'sam-ogi-used') {
    return {
      'sam-ogi-ready': false,
      'sam-kaeshi-ready': true
    };
  }
  if (mechanicId === 'sam-kaeshi-used') return { 'sam-kaeshi-ready': false };
};

const applyBlmMechanic = (
  mechanicId: string
): Record<string, CombatMechanicValue | null> | void => {
  if (mechanicId === 'blm-fire-iii') {
    return {
      'blm-stance': 'fire',
      'blm-in-fire': true,
      'blm-fire-iii-ready': false,
      'blm-can-despair': true,
      'blm-thunder-ready': true
    };
  }
  if (mechanicId === 'blm-despair') {
    return {
      'blm-can-despair': false,
      'blm-manafont-ready': true
    };
  }
  if (mechanicId === 'blm-manafont') {
    return {
      'blm-stance': 'fire',
      'blm-can-despair': true,
      'blm-manafont-ready': false,
      'blm-thunder-ready': true
    };
  }
  if (mechanicId === 'blm-blizzard-iii') {
    return {
      'blm-stance': 'ice',
      'blm-in-fire': false,
      'blm-blizzard-iv-ready': true,
      'blm-fire-iii-ready': false,
      'blm-can-despair': false,
      'blm-manafont-ready': false,
      'blm-thunder-ready': true
    };
  }
  if (mechanicId === 'blm-blizzard-iv') {
    return {
      'blm-blizzard-iv-ready': false,
      'blm-fire-iii-ready': true
    };
  }
  if (mechanicId === 'blm-high-thunder') return { 'blm-thunder-ready': false };
};

const mechanicsFor = (
  config: PilotEvaluatorConfig
): CombatTimelineEngineOptions['applyMechanic'] => {
  if (config.job === 'SAM') return (id) => applySamMechanic(id);
  if (config.job === 'BLM') return (id) => applyBlmMechanic(id);
  return undefined;
};

/**
 * Recalculates damage for a timeline whose action choices and timestamps are
 * already known. Rotation timing identity deliberately excludes damage-only
 * stats, so finalists with the same speed, delay and job-owned timing state can
 * share the expensive timeline simulation while retaining their own damage.
 */
export const rescorePilotCombatTimeline = (
  request: CombatEvaluationRequest,
  timeline: CombatTimelineTemplate
): {
  totalDamage: number;
  dps: number;
  records: NonNullable<CombatEvaluationResult['timeline']>;
} => {
  const config = configByEngine.find((entry) => entry.engineId === request.profile.engineId);
  if (!config || config.profileId !== request.profile.id || config.job !== request.profile.job) {
    throw new Error(`No pilot damage rescorer is available for ${request.profile.id}.`);
  }

  const actions = new Map(request.profile.actions.map((action) => [action.id, action]));
  const buffs = new Map<string, ActiveCombatBuff>();
  for (const action of request.profile.actions) {
    for (const effect of action.effects ?? []) {
      if (effect.kind !== 'buff') continue;
      buffs.set(effect.buffId, {
        id: effect.buffId,
        expiresAtMs: Number.POSITIVE_INFINITY,
        stacks: effect.stacks ?? 1,
        damageMultiplier: effect.damageMultiplier ?? 1,
        hastePercent: effect.hastePercent ?? 0
      });
    }
  }

  const damageProfile = damageProfileFor(config);
  const records = timeline.records.map((record) => {
    const action = actions.get(record.actionId);
    if (!action) {
      throw new Error(`Cached timeline references missing action ${record.actionId}.`);
    }
    const snapshotBuffs = record.snapshotBuffIds.map((buffId) => {
      const buff = buffs.get(buffId);
      if (!buff) throw new Error(`Cached timeline references missing buff ${buffId}.`);
      return buff;
    });
    const snapshot: CombatDamageSnapshot = {
      atMs: record.appliedAtMs,
      buffs: snapshotBuffs,
      damageMultiplier: snapshotBuffs.reduce(
        (multiplier, buff) => multiplier * buff.damageMultiplier,
        1
      )
    };
    const buffed = buffMultiplierFor(config, action, snapshot, record.source, request);
    const damage = expectedActionDamage(
      record.potency,
      buffed.stats,
      request.combatStats.weaponDamage,
      damageProfile,
      action.criticalHitMode ?? 'normal',
      action.directHitMode ?? 'normal',
      buffed.multiplier
    ) * record.expectedWeight;
    return { ...record, damage };
  });
  const totalDamage = records.reduce((total, record) => total + record.damage, 0);
  return {
    totalDamage,
    dps: totalDamage / (timeline.durationMs / 1000),
    records
  };
};

class PilotCombatEvaluator implements CombatEvaluatorPlugin {
  readonly supportedProfileSchemas = [ROTATION_PROFILE_SCHEMA_VERSION] as const;

  constructor(
    readonly config: PilotEvaluatorConfig
  ) {}

  get engineId(): string {
    return this.config.engineId;
  }

  validateProfile(profile: CombatEvaluationRequest['profile']): string[] {
    const errors = validateHybridRotationProfile(profile);
    if (profile.id !== this.config.profileId) {
      errors.push(`Engine ${this.engineId} requires profile ${this.config.profileId}.`);
    }
    if (profile.job !== this.config.job) {
      errors.push(`Engine ${this.engineId} cannot evaluate ${profile.job}.`);
    }
    if (profile.rulesetId !== 'dt-7.51-level-100-standard@1') {
      errors.push(`Engine ${this.engineId} requires the Dawntrail 7.51 level-100 ruleset.`);
    }
    if (!profile.references.some((reference) => reference.kind === 'official')) {
      errors.push(`Profile ${profile.id} has no official action reference.`);
    }
    if (!profile.references.some((reference) => reference.kind === 'xivgear-reference')) {
      errors.push(`Profile ${profile.id} has no independent XivGear trace reference.`);
    }
    return errors;
  }

  simulate(
    request: CombatEvaluationRequest,
    control: Parameters<CombatEvaluatorPlugin['simulate']>[1]
  ): CombatEvaluationResult {
    const validation = this.validateProfile(request.profile);
    if (validation.length > 0) {
      throw new Error(`Combat evaluator profile ${request.profile.id} is invalid: ${validation.join(' ')}`);
    }
    const damageProfile = damageProfileFor(this.config);
    return runHybridCombatEvaluation(request, {
      initialResources: this.config.initialResources,
      resourceCaps: this.config.resourceCaps,
      initialMechanics: this.config.initialMechanics,
      periodicResourceChanges: this.config.periodicResourceChanges,
      autoAttackActionId: this.config.autoAttackActionId,
      control,
      resolvePotency: (action, state) =>
        this.config.job === 'BLM' ? resolveBlmPotency(action, state) : action.potency,
      resolveDamage: (potency, snapshot, action, source, expectedWeight) => {
        const buffed = buffMultiplierFor(this.config, action, snapshot, source, request);
        return expectedActionDamage(
          potency,
          buffed.stats,
          request.combatStats.weaponDamage,
          damageProfile,
          action.criticalHitMode ?? 'normal',
          action.directHitMode ?? 'normal',
          buffed.multiplier
        ) * expectedWeight;
      },
      applyMechanic: mechanicsFor(this.config)
    });
  }
}

export const PILOT_COMBAT_EVALUATOR_PLUGINS: CombatEvaluatorPlugin[] =
  configByEngine.map((config) => new PilotCombatEvaluator(config));

export const createPilotCombatEvaluatorRegistry = (): CombatEvaluatorRegistry =>
  new CombatEvaluatorRegistry(PILOT_COMBAT_EVALUATOR_PLUGINS);

export const pilotDamageMainStatMultiplier = (
  job: CombatJob,
  mainStatValue: number
): number => {
  const config = configByEngine.find((entry) => entry.job === job);
  if (!config) throw new Error(`No pilot evaluator is available for ${job}.`);
  return mainStatMultiplier(mainStatValue, damageProfileFor(config));
};
