import {
  LEVEL_100,
  criticalHitChance,
  criticalHitMultiplier,
  directHitChance,
  expectedActionDamage,
  mainStatMultiplier,
  pietyMpPerTick
} from '@xiv-gear-lab/calculations';
import {
  emptyStats,
  type CombatActionProfile,
  type CombatEvaluatorProfile,
  type CombatJob,
  type JobRole,
  type StatKey
} from '@xiv-gear-lab/domain';
import {
  CombatEvaluatorRegistry,
  LEGACY_ROTATION_PROFILE_SCHEMA_VERSION,
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
  role: JobRole;
  mainStat: 'strength' | 'dexterity' | 'intelligence' | 'mind';
  speedStat: 'skillSpeed' | 'spellSpeed';
  attackPowerModifier: number;
  mainStatModifier: number;
  damageTrait: number;
  appliesTenacity: boolean;
  initialResources: Record<string, number>;
  resourceCaps: Record<string, number>;
  initialMechanics?: Record<string, CombatMechanicValue>;
  periodicResourceChanges?: CombatTimelineEngineOptions['periodicResourceChanges'];
  autoAttackActionId?: string;
  baseHastePercent?: number;
}

const configByEngine: PilotEvaluatorConfig[] = [{
  job: 'MNK',
  engineId: 'mnk-pilot-engine@1',
  profileId: 'mnk-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 110,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    chakra: 0,
    beast: 0,
    nadi: 0,
    'perfect-balance': 0,
    'fire-reply-ready': 0,
    'wind-reply-ready': 0
  },
  resourceCaps: {
    chakra: 10,
    beast: 3,
    nadi: 2,
    'perfect-balance': 3,
    'fire-reply-ready': 1,
    'wind-reply-ready': 1
  },
  autoAttackActionId: 'auto-attack',
  baseHastePercent: 20
}, {
  job: 'DRG',
  engineId: 'drg-pilot-engine@1',
  profileId: 'drg-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    focus: 0,
    'nastrond-ready': 0,
    'mirage-ready': 0,
    'rise-ready': 0,
    'starcross-ready': 0
  },
  resourceCaps: {
    focus: 2,
    'nastrond-ready': 3,
    'mirage-ready': 1,
    'rise-ready': 1,
    'starcross-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'NIN',
  engineId: 'nin-pilot-engine@1',
  profileId: 'nin-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'dexterity',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 110,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    ninki: 0,
    kazematoi: 0,
    'raiju-ready': 0,
    'kassatsu-ready': 0,
    'kunai-ready': 0,
    'higi-ready': 0,
    'phantom-ready': 0,
    'tenri-ready': 0
  },
  resourceCaps: {
    ninki: 100,
    kazematoi: 5,
    'raiju-ready': 3,
    'kassatsu-ready': 1,
    'kunai-ready': 1,
    'higi-ready': 1,
    'phantom-ready': 1,
    'tenri-ready': 1
  },
  autoAttackActionId: 'auto-attack',
  baseHastePercent: 15
}, {
  job: 'RPR',
  engineId: 'rpr-pilot-engine@1',
  profileId: 'rpr-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    soul: 0,
    shroud: 0,
    executioner: 0,
    lemure: 0,
    'void-shroud': 0,
    sacrifice: 0,
    'perfectio-ready': 0,
    'harvest-moon-ready': 1
  },
  resourceCaps: {
    soul: 100,
    shroud: 100,
    executioner: 2,
    lemure: 5,
    'void-shroud': 4,
    sacrifice: 1,
    'perfectio-ready': 1,
    'harvest-moon-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'VPR',
  engineId: 'vpr-pilot-engine@1',
  profileId: 'vpr-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'dexterity',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 110,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    coil: 0,
    offerings: 0,
    tribute: 0,
    'tail-ready': 0,
    'bite-ready': 0,
    'twin-ready': 0,
    'ire-ready': 0
  },
  resourceCaps: {
    coil: 3,
    offerings: 100,
    tribute: 5,
    'tail-ready': 1,
    'bite-ready': 2,
    'twin-ready': 2,
    'ire-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'SAM',
  engineId: 'sam-pilot-engine@1',
  profileId: 'sam-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 112,
  damageTrait: 1,
  appliesTenacity: false,
  initialResources: {
    kenki: 0,
    meditation: 0,
    setsu: 0,
    getsu: 0,
    ka: 0,
    'kaeshi-setsugekka-ready': 0,
    'zanshin-ready': 0,
    'meikyo-stacks': 0,
    'tendo-ready': 0,
    'tendo-kaeshi-ready': 0
  },
  resourceCaps: {
    kenki: 100,
    meditation: 3,
    setsu: 1,
    getsu: 1,
    ka: 1,
    'kaeshi-setsugekka-ready': 1,
    'zanshin-ready': 1,
    'meikyo-stacks': 3,
    'tendo-ready': 1,
    'tendo-kaeshi-ready': 1
  },
  initialMechanics: {
    'sam-ogi-ready': false,
    'sam-kaeshi-ready': false,
    'sam-last-meikyo-window': -1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'BRD',
  engineId: 'brd-pilot-engine@1',
  profileId: 'brd-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'dexterity',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.2,
  appliesTenacity: false,
  initialResources: {
    'brd-soul-voice': 0,
    'brd-coda': 0,
    'brd-blast-ready': 0,
    'brd-barrage-ready': 0,
    'brd-resonant-ready': 0,
    'brd-encore-one-ready': 0,
    'brd-encore-three-ready': 0
  },
  resourceCaps: {
    'brd-soul-voice': 100,
    'brd-coda': 3,
    'brd-blast-ready': 1,
    'brd-barrage-ready': 1,
    'brd-resonant-ready': 1,
    'brd-encore-one-ready': 1,
    'brd-encore-three-ready': 1
  },
  initialMechanics: {
    'brd-wanderer-next': true,
    'brd-mage-next': false,
    'brd-army-next': false,
    'brd-first-finale': true,
    'brd-later-finales': false
  },
  periodicResourceChanges: [{
    resource: 'brd-soul-voice',
    amount: 4,
    firstAtMs: 3000,
    intervalMs: 3000
  }],
  autoAttackActionId: 'auto-attack'
}, {
  job: 'MCH',
  engineId: 'mch-pilot-engine@1',
  profileId: 'mch-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'dexterity',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.2,
  appliesTenacity: false,
  initialResources: {
    'mch-heat': 0,
    'mch-battery': 0,
    'mch-overheat': 0,
    'mch-excavator-ready': 0,
    'mch-full-metal-ready': 0
  },
  resourceCaps: {
    'mch-heat': 100,
    'mch-battery': 100,
    'mch-overheat': 3,
    'mch-excavator-ready': 1,
    'mch-full-metal-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'DNC',
  engineId: 'dnc-pilot-engine@1',
  profileId: 'dnc-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'dexterity',
  speedStat: 'skillSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.2,
  appliesTenacity: false,
  initialResources: {
    esprit: 0,
    'tillana-ready': 0,
    'dawn-ready': 0,
    'last-dance-ready': 0,
    'starfall-ready': 0,
    'finishing-move-ready': 0
  },
  resourceCaps: {
    esprit: 100,
    'tillana-ready': 1,
    'dawn-ready': 1,
    'last-dance-ready': 1,
    'starfall-ready': 1,
    'finishing-move-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'BLM',
  engineId: 'blm-pilot-engine@1',
  profileId: 'blm-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'intelligence',
  speedStat: 'spellSpeed',
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
  job: 'SMN',
  engineId: 'smn-pilot-engine@1',
  profileId: 'smn-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'intelligence',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    'smn-solar-one-ready': 1,
    'smn-bahamut-ready': 0,
    'smn-solar-two-ready': 0,
    'smn-phoenix-ready': 0,
    'smn-umbral': 0,
    'smn-astral': 0,
    'smn-fountain': 0,
    'smn-sunflare-ready': 0,
    'smn-solar-enkindle-ready': 0,
    'smn-deathflare-ready': 0,
    'smn-bahamut-enkindle-ready': 0,
    'smn-phoenix-enkindle-ready': 0,
    'smn-arcanum': 0,
    'smn-ruby': 0,
    'smn-crimson-cyclone-ready': 0,
    'smn-crimson-strike-ready': 0,
    'smn-topaz': 0,
    'smn-mountain-buster-ready': 0,
    'smn-emerald': 0,
    'smn-slipstream-ready': 0,
    'smn-searing-flash-ready': 0,
    'smn-aetherflow': 0,
    'smn-further-ruin': 0
  },
  resourceCaps: {
    'smn-solar-one-ready': 1,
    'smn-bahamut-ready': 1,
    'smn-solar-two-ready': 1,
    'smn-phoenix-ready': 1,
    'smn-umbral': 6,
    'smn-astral': 6,
    'smn-fountain': 6,
    'smn-sunflare-ready': 1,
    'smn-solar-enkindle-ready': 1,
    'smn-deathflare-ready': 1,
    'smn-bahamut-enkindle-ready': 1,
    'smn-phoenix-enkindle-ready': 1,
    'smn-arcanum': 3,
    'smn-ruby': 2,
    'smn-crimson-cyclone-ready': 1,
    'smn-crimson-strike-ready': 1,
    'smn-topaz': 4,
    'smn-mountain-buster-ready': 1,
    'smn-emerald': 4,
    'smn-slipstream-ready': 1,
    'smn-searing-flash-ready': 1,
    'smn-aetherflow': 2,
    'smn-further-ruin': 1
  }
}, {
  job: 'RDM',
  engineId: 'rdm-pilot-engine@1',
  profileId: 'rdm-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'intelligence',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    'rdm-black-mana': 0,
    'rdm-white-mana': 0,
    'rdm-mana-stack': 0,
    'rdm-grand-impact-ready': 0,
    'rdm-vice-ready': 0,
    'rdm-prefulgence-ready': 0
  },
  resourceCaps: {
    'rdm-black-mana': 100,
    'rdm-white-mana': 100,
    'rdm-mana-stack': 3,
    'rdm-grand-impact-ready': 1,
    'rdm-vice-ready': 1,
    'rdm-prefulgence-ready': 1
  }
}, {
  job: 'PCT',
  engineId: 'pct-pilot-engine@1',
  profileId: 'pct-dt-generated-rotation@1',
  role: 'dps',
  mainStat: 'intelligence',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    'pct-palette': 0,
    'pct-white-paint': 0,
    'pct-black-paint': 0,
    'pct-subtractive': 0,
    'pct-subtractive-spectrum': 0,
    'pct-hammer-time': 0,
    'pct-hammer-canvas': 1,
    'pct-hammer-motif-needed': 0,
    'pct-landscape-canvas': 1,
    'pct-landscape-motif-needed': 0,
    'pct-star-prism-ready': 0,
    'pct-rainbow-ready': 0,
    'pct-pom-canvas': 1,
    'pct-wing-canvas': 0,
    'pct-claw-canvas': 0,
    'pct-maw-canvas': 0,
    'pct-pom-motif-needed': 0,
    'pct-wing-motif-needed': 0,
    'pct-claw-motif-needed': 0,
    'pct-maw-motif-needed': 0,
    'pct-mog-ready': 0,
    'pct-madeen-ready': 0
  },
  resourceCaps: {
    'pct-palette': 100,
    'pct-white-paint': 5,
    'pct-black-paint': 1,
    'pct-subtractive': 3,
    'pct-subtractive-spectrum': 1,
    'pct-hammer-time': 3,
    'pct-hammer-canvas': 1,
    'pct-hammer-motif-needed': 1,
    'pct-landscape-canvas': 1,
    'pct-landscape-motif-needed': 1,
    'pct-star-prism-ready': 1,
    'pct-rainbow-ready': 1,
    'pct-pom-canvas': 1,
    'pct-wing-canvas': 1,
    'pct-claw-canvas': 1,
    'pct-maw-canvas': 1,
    'pct-pom-motif-needed': 1,
    'pct-wing-motif-needed': 1,
    'pct-claw-motif-needed': 1,
    'pct-maw-motif-needed': 1,
    'pct-mog-ready': 1,
    'pct-madeen-ready': 1
  }
}, {
  job: 'DRK',
  engineId: 'drk-pilot-engine@1',
  profileId: 'drk-dt-generated-rotation@1',
  role: 'tank',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
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
}, {
  job: 'PLD',
  engineId: 'pld-pilot-engine@1',
  profileId: 'pld-dt-generated-rotation@1',
  role: 'tank',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 190,
  mainStatModifier: 100,
  damageTrait: 1,
  appliesTenacity: true,
  initialResources: {
    mp: 10_000,
    requiescat: 0,
    'confiteor-ready': 0,
    'goring-ready': 0,
    'honor-ready': 0,
    'atonement-ready': 0,
    'supplication-ready': 0,
    'sepulchre-ready': 0,
    'divine-might': 0
  },
  resourceCaps: {
    mp: 10_000,
    requiescat: 4,
    'confiteor-ready': 1,
    'goring-ready': 1,
    'honor-ready': 1,
    'atonement-ready': 1,
    'supplication-ready': 1,
    'sepulchre-ready': 1,
    'divine-might': 1
  },
  periodicResourceChanges: [{
    resource: 'mp',
    amount: 200,
    firstAtMs: 3000,
    intervalMs: 3000
  }],
  autoAttackActionId: 'auto-attack'
}, {
  job: 'WAR',
  engineId: 'war-pilot-engine@1',
  profileId: 'war-dt-generated-rotation@1',
  role: 'tank',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 190,
  mainStatModifier: 105,
  damageTrait: 1,
  appliesTenacity: true,
  initialResources: {
    beast: 0,
    'inner-release': 0,
    'burgeoning-fury': 0,
    'nascent-chaos': 0,
    'primal-rend-ready': 0,
    'primal-ruination-ready': 0
  },
  resourceCaps: {
    beast: 100,
    'inner-release': 3,
    'burgeoning-fury': 3,
    'nascent-chaos': 1,
    'primal-rend-ready': 1,
    'primal-ruination-ready': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'GNB',
  engineId: 'gnb-pilot-engine@1',
  profileId: 'gnb-dt-generated-rotation@1',
  role: 'tank',
  mainStat: 'strength',
  speedStat: 'skillSpeed',
  attackPowerModifier: 190,
  mainStatModifier: 100,
  damageTrait: 1,
  appliesTenacity: true,
  initialResources: {
    cartridge: 0,
    'ready-to-break': 0,
    'ready-to-reign': 0,
    'ready-to-rip': 0,
    'ready-to-tear': 0,
    'ready-to-gouge': 0,
    'ready-to-blast': 0,
    'gnashing-active': 0
  },
  resourceCaps: {
    cartridge: 6,
    'ready-to-break': 1,
    'ready-to-reign': 1,
    'ready-to-rip': 1,
    'ready-to-tear': 1,
    'ready-to-gouge': 1,
    'ready-to-blast': 1,
    'gnashing-active': 1
  },
  autoAttackActionId: 'auto-attack'
}, {
  job: 'WHM',
  engineId: 'whm-pilot-engine@1',
  profileId: 'whm-dt-generated-rotation@1',
  role: 'healer',
  mainStat: 'mind',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    mp: 10_000,
    'sacred-sight': 0
  },
  resourceCaps: {
    mp: 10_000,
    'sacred-sight': 3
  }
}, {
  job: 'SCH',
  engineId: 'sch-pilot-engine@1',
  profileId: 'sch-dt-generated-rotation@1',
  role: 'healer',
  mainStat: 'mind',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    mp: 10_000,
    aetherflow: 0,
    'impact-ready': 0
  },
  resourceCaps: {
    mp: 10_000,
    aetherflow: 3,
    'impact-ready': 1
  }
}, {
  job: 'AST',
  engineId: 'ast-pilot-engine@1',
  profileId: 'ast-dt-generated-rotation@1',
  role: 'healer',
  mainStat: 'mind',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: {
    mp: 10_000,
    'oracle-ready': 0
  },
  resourceCaps: {
    mp: 10_000,
    'oracle-ready': 1
  }
}, {
  job: 'SGE',
  engineId: 'sge-pilot-engine@1',
  profileId: 'sge-dt-generated-rotation@1',
  role: 'healer',
  mainStat: 'mind',
  speedStat: 'spellSpeed',
  attackPowerModifier: 237,
  mainStatModifier: 115,
  damageTrait: 1.3,
  appliesTenacity: false,
  initialResources: { mp: 10_000 },
  resourceCaps: { mp: 10_000 }
}];

const damageProfileFor = (config: PilotEvaluatorConfig): CombatEvaluatorProfile => ({
  id: `${config.job.toLowerCase()}-pilot-damage@1`,
  schemaVersion: 'generic-hit-profile@1',
  rulesetId: 'dt-7.51-level-100-standard@1',
  job: config.job,
  jobMode: 'standard',
  version: 'dt-7.51-pilot-damage@1',
  role: config.role,
  mainStat: config.mainStat,
  mainStatLabel: ({
    strength: 'Strength',
    dexterity: 'Dexterity',
    intelligence: 'Intelligence',
    mind: 'Mind'
  } as const)[config.mainStat],
  mainStatAbbreviation: ({
    strength: 'STR',
    dexterity: 'DEX',
    intelligence: 'INT',
    mind: 'MND'
  } as const)[config.mainStat],
  speedStat: config.speedStat,
  speedStatLabel: config.speedStat === 'spellSpeed' ? 'Spell Speed' : 'Skill Speed',
  speedStatAbbreviation: config.speedStat === 'spellSpeed' ? 'SPS' : 'SKS',
  meldStats: ['criticalHit', 'determination', 'directHit', config.speedStat],
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
    if (
      buff.id === 'brd-wanderers-minuet' &&
      (action.criticalHitMode ?? 'normal') === 'normal'
    ) {
      const normal = 1 + criticalHitChance(stats.criticalHit, LEVEL_100) *
        (criticalHitMultiplier(stats.criticalHit, LEVEL_100) - 1);
      multiplier *= criticalFactorWithChanceBonus(stats.criticalHit, 0.02) / normal;
    }
    if (
      (buff.id === 'brd-battle-voice' || buff.id === 'brd-armys-paeon') &&
      (action.directHitMode ?? 'normal') === 'normal'
    ) {
      const normal = 1 + directHitChance(stats.directHit, LEVEL_100) * 0.25;
      const bonus = buff.id === 'brd-battle-voice' ? 0.2 : 0.03;
      multiplier *= directFactorWithChanceBonus(stats.directHit, bonus) / normal;
    }
    if (buff.id === 'mch-reassemble' && action.kind === 'gcd') {
      if ((action.criticalHitMode ?? 'normal') === 'normal') {
        const normal = 1 + criticalHitChance(stats.criticalHit, LEVEL_100) *
          (criticalHitMultiplier(stats.criticalHit, LEVEL_100) - 1);
        multiplier *= criticalHitMultiplier(stats.criticalHit, LEVEL_100) / normal;
      }
      if ((action.directHitMode ?? 'normal') === 'normal') {
        const normal = 1 + directHitChance(stats.directHit, LEVEL_100) * 0.25;
        multiplier *= 1.25 / normal;
      }
    }
    if (
      buff.id === 'sch-chain-stratagem' &&
      (action.criticalHitMode ?? 'normal') === 'normal'
    ) {
      const normal = 1 + criticalHitChance(stats.criticalHit, LEVEL_100) *
        (criticalHitMultiplier(stats.criticalHit, LEVEL_100) - 1);
      multiplier *= criticalFactorWithChanceBonus(stats.criticalHit, 0.1) / normal;
    }
    if (
      buff.id === 'drg-battle-litany' &&
      (action.criticalHitMode ?? 'normal') === 'normal'
    ) {
      const normal = 1 + criticalHitChance(stats.criticalHit, LEVEL_100) *
        (criticalHitMultiplier(stats.criticalHit, LEVEL_100) - 1);
      multiplier *= criticalFactorWithChanceBonus(stats.criticalHit, 0.1) / normal;
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
  mechanicId: string,
  state: CombatTimelineStateView
): Record<string, CombatMechanicValue | null> | void => {
  if (mechanicId === 'sam-meikyo-used') {
    return { 'sam-last-meikyo-window': Math.floor(state.nowMs / 60_000) };
  }
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

const applyBrdMechanic = (
  mechanicId: string
): Record<string, CombatMechanicValue | null> | void => {
  if (mechanicId === 'brd-wanderer-used') {
    return {
      'brd-wanderer-next': false,
      'brd-mage-next': true,
      'brd-army-next': false
    };
  }
  if (mechanicId === 'brd-mage-used') {
    return {
      'brd-wanderer-next': false,
      'brd-mage-next': false,
      'brd-army-next': true
    };
  }
  if (mechanicId === 'brd-army-used') {
    return {
      'brd-wanderer-next': true,
      'brd-mage-next': false,
      'brd-army-next': false
    };
  }
  if (mechanicId === 'brd-first-finale-used') {
    return {
      'brd-first-finale': false,
      'brd-later-finales': true
    };
  }
};

const mechanicsFor = (
  config: PilotEvaluatorConfig
): CombatTimelineEngineOptions['applyMechanic'] => {
  if (config.job === 'SAM') return (id, state) => applySamMechanic(id, state);
  if (config.job === 'BRD') return (id) => applyBrdMechanic(id);
  if (config.job === 'BLM') return (id) => applyBlmMechanic(id);
  return undefined;
};

const conditionEvaluatorFor = (
  config: PilotEvaluatorConfig
): ((mechanicId: string, state: CombatTimelineStateView) => boolean) | undefined => {
  if (config.job !== 'SAM') return undefined;
  return (mechanicId, state) => {
    if (mechanicId === 'sam-meikyo-alignment-window') {
      const window = Math.floor(state.nowMs / 60_000);
      return (
        state.nowMs % 60_000 <= 15_000 &&
        Number(state.mechanics['sam-last-meikyo-window'] ?? -1) !== window
      );
    }
    if (
      mechanicId === 'sam-higanbana-reserve-window' ||
      mechanicId === 'sam-higanbana-safe-to-spend-sen'
    ) {
      const higanbana = state.dots.find((dot) => dot.id === 'sam-higanbana');
      const reserve = !higanbana || higanbana.expiresAtMs - state.nowMs <= 12_000;
      return mechanicId === 'sam-higanbana-reserve-window' ? reserve : !reserve;
    }
    return Boolean(state.mechanics[mechanicId]);
  };
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
  readonly supportedProfileSchemas = [
    LEGACY_ROTATION_PROFILE_SCHEMA_VERSION,
    ROTATION_PROFILE_SCHEMA_VERSION
  ] as const;

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
    const effectiveRequest = this.config.baseHastePercent
      ? {
        ...request,
        combatStats: {
          ...request.combatStats,
          hastePercent: request.combatStats.hastePercent + this.config.baseHastePercent
        }
      }
      : request;
    const periodicResourceChanges = [
      ...(this.config.periodicResourceChanges ?? []),
      ...(this.config.role === 'healer' ? [{
        resource: 'mp',
        amount: pietyMpPerTick(request.combatStats.stats.piety, LEVEL_100),
        firstAtMs: 3000,
        intervalMs: 3000
      }] : [])
    ];
    return runHybridCombatEvaluation(effectiveRequest, {
      initialResources: this.config.initialResources,
      resourceCaps: this.config.resourceCaps,
      initialMechanics: this.config.initialMechanics,
      periodicResourceChanges,
      autoAttackActionId: this.config.autoAttackActionId,
      evaluateMechanicCondition: conditionEvaluatorFor(this.config),
      control,
      resolvePotency: (action, state) =>
        this.config.job === 'BLM' ? resolveBlmPotency(action, state) : action.potency,
      resolveDamage: (potency, snapshot, action, source, expectedWeight) => {
        const buffed = buffMultiplierFor(this.config, action, snapshot, source, effectiveRequest);
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
