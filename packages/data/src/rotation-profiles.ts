import type {
  CombatActionProfile,
  CombatJob,
  CombatMethodReference,
  CombatPriorityRule,
  CombatRotationProfile
} from '@xiv-gear-lab/domain';
import { CURRENT_RULESET_ID } from './current-registry';

export const ROTATION_PROFILE_SCHEMA_VERSION = 'combat-rotation-profile@1';
export const CURRENT_ROTATION_PROFILE_VERSION = 'dt-7.51-pilot-rotation@1';

const XIVGEAR_REFERENCE_COMMIT = '11e227deca37750c6f3e5f0035f93f3516022ae5';
const OFFICIAL_PATCH_751 =
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/c46881a31a2c90d0965493c921b434eca09113f8';

const action = (
  id: string,
  name: string,
  kind: CombatActionProfile['kind'],
  potency: number,
  overrides: Partial<CombatActionProfile> = {}
): CombatActionProfile => ({
  id,
  name,
  kind,
  potency,
  recastMs: kind === 'gcd' ? 2500 : 0,
  castMs: 0,
  animationLockMs: kind === 'pet' || kind === 'auto-attack' ? 0 : 600,
  applicationDelayMs: 0,
  charges: 1,
  speedScaling: kind === 'gcd' ? 'skill-speed' : 'none',
  referenceIds: [],
  ...overrides
});

const gcd = (
  id: string,
  name: string,
  potency: number,
  referenceIds: string[],
  overrides: Partial<CombatActionProfile> = {}
): CombatActionProfile => action(id, name, 'gcd', potency, {
  referenceIds,
  ...overrides
});

const ogcd = (
  id: string,
  name: string,
  potency: number,
  cooldownMs: number,
  referenceIds: string[],
  overrides: Partial<CombatActionProfile> = {}
): CombatActionProfile => action(id, name, 'ogcd', potency, {
  recastMs: cooldownMs,
  referenceIds,
  ...overrides
});

const potion = (referenceIds: string[]): CombatActionProfile => ogcd(
  'pilot-potion',
  'Grade 2 Gemdraught',
  0,
  270_000,
  [...referenceIds, 'combat-potion-reference'],
  {
    consumable: 'potion',
    effects: [{
      kind: 'buff',
      buffId: 'pilot-potion',
      durationMs: 30_000,
      damageMultiplier: 1
    }]
  }
);

const autoAttack = (referenceIds: string[]): CombatActionProfile => action(
  'auto-attack',
  'Auto-attack',
  'auto-attack',
  90,
  {
    referenceIds
  }
);

const rule = (
  id: string,
  actionId: string,
  conditions: CombatPriorityRule['conditions'],
  explanation: string,
  referenceIds: string[],
  allowClipping = false
): CombatPriorityRule => ({
  id,
  actionId,
  conditions,
  explanation,
  referenceIds,
  ...(allowClipping ? { allowClipping: true } : {})
});

const referencesFor = (
  job: CombatJob,
  jobName: string,
  officialPath: string,
  xivgearPath: string,
  xivgearNotes: string
): CombatMethodReference[] => [{
  id: `${job.toLowerCase()}-official-actions`,
  kind: 'official',
  title: `${jobName} Job Guide`,
  provider: 'Square Enix',
  url: `https://na.finalfantasyxiv.com/jobguide/${officialPath}/`,
  gamePatch: '7.5',
  accessedAt: '2026-07-26',
  notes: 'Level-100 action descriptions and potencies. Patch 7.51 made no PvE job-action changes.'
}, {
  id: 'official-patch-751',
  kind: 'official',
  title: 'Patch 7.51 Notes',
  provider: 'Square Enix',
  url: OFFICIAL_PATCH_751,
  gamePatch: '7.51',
  publishedAt: '2026-06-02',
  accessedAt: '2026-07-26',
  notes: 'Confirms the active ruleset patch and contains no PvE job-action adjustments.'
}, {
  id: `${job.toLowerCase()}-xivgear-oracle`,
  kind: 'xivgear-reference',
  title: `XivGear ${jobName} simulator reference`,
  provider: 'XivGear contributors',
  url: `https://github.com/xiv-gear-planner/gear-planner/blob/${XIVGEAR_REFERENCE_COMMIT}/${xivgearPath}`,
  gamePatch: '7.5',
  accessedAt: '2026-07-26',
  notes: xivgearNotes
}, {
  id: 'combat-potion-reference',
  kind: 'community',
  title: 'Grade 2 Gemdraught stat bonus',
  provider: 'FFXIV Community Wiki',
  url: 'https://ffxiv.consolegameswiki.com/wiki/Grade_2_Gemdraught_of_Dexterity',
  gamePatch: '7.5',
  accessedAt: '2026-07-26',
  notes: 'HQ combat stat bonus used by the optional potion assumption: 10%, capped at 392.'
}, {
  id: `${job.toLowerCase()}-internal-priority`,
  kind: 'xiv-gear-lab',
  title: `${jobName} generated-priority pilot`,
  provider: 'XIV Gear Lab',
  gamePatch: '7.51',
  notes: 'Clean-room generated-priority implementation. Preliminary until independently trace-validated.'
}];

const assumptions = {
  targetCount: 1 as const,
  uptimePercent: 100 as const,
  movement: false as const,
  downtime: false as const,
  externalPartyBuffs: false as const,
  rngMode: 'expected-value' as const,
  latencyMs: 20,
  weaveWindowMs: 700,
  cutoffPolicy: 'strict-application' as const
};

const samRefs = ['sam-official-actions', 'sam-internal-priority'];
const SAM_ACTIONS: CombatActionProfile[] = [
  potion(samRefs),
  autoAttack(samRefs),
  gcd('sam-gyofu', 'Gyofu', 240, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 5 },
      { kind: 'combo', comboId: 'sam-combo', nextStep: 'choose', durationMs: 30_000 }
    ]
  }),
  gcd('sam-jinpu', 'Jinpu', 300, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 5 },
      { kind: 'buff', buffId: 'sam-fugetsu', durationMs: 40_000, damageMultiplier: 1.13 },
      { kind: 'combo', comboId: 'sam-combo', nextStep: 'gekko', durationMs: 30_000 }
    ]
  }),
  gcd('sam-gekko', 'Gekko', 420, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 10 },
      { kind: 'resource', resource: 'getsu', amount: 1 },
      { kind: 'combo', comboId: 'sam-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('sam-shifu', 'Shifu', 300, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 5 },
      { kind: 'buff', buffId: 'sam-fuka', durationMs: 40_000, hastePercent: 13 },
      { kind: 'combo', comboId: 'sam-combo', nextStep: 'kasha', durationMs: 30_000 }
    ]
  }),
  gcd('sam-kasha', 'Kasha', 420, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 10 },
      { kind: 'resource', resource: 'ka', amount: 1 },
      { kind: 'combo', comboId: 'sam-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('sam-yukikaze', 'Yukikaze', 340, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 15 },
      { kind: 'resource', resource: 'setsu', amount: 1 },
      { kind: 'combo', comboId: 'sam-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('sam-higanbana', 'Higanbana', 200, samRefs, {
    castMs: 1300,
    resourceCosts: [{ resource: 'setsu', amount: 1 }],
    effects: [
      { kind: 'dot', dotId: 'sam-higanbana', durationMs: 60_000, tickPotency: 50 },
      { kind: 'resource', resource: 'meditation', amount: 1 }
    ]
  }),
  gcd('sam-midare', 'Midare Setsugekka', 680, samRefs, {
    castMs: 1300,
    criticalHitMode: 'guaranteed',
    resourceCosts: [
      { resource: 'setsu', amount: 1 },
      { resource: 'getsu', amount: 1 },
      { resource: 'ka', amount: 1 }
    ],
    effects: [{ kind: 'resource', resource: 'meditation', amount: 1 }]
  }),
  gcd('sam-ogi', 'Ogi Namikiri', 1000, samRefs, {
    castMs: 1300,
    criticalHitMode: 'guaranteed',
    effects: [
      { kind: 'resource', resource: 'meditation', amount: 1 },
      { kind: 'mechanic', mechanicId: 'sam-ogi-used' }
    ]
  }),
  gcd('sam-kaeshi-namikiri', 'Kaeshi: Namikiri', 1000, samRefs, {
    criticalHitMode: 'guaranteed',
    effects: [
      { kind: 'resource', resource: 'meditation', amount: 1 },
      { kind: 'mechanic', mechanicId: 'sam-kaeshi-used' }
    ]
  }),
  ogcd('sam-ikishoten', 'Ikishoten', 0, 120_000, samRefs, {
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 50 },
      { kind: 'mechanic', mechanicId: 'sam-ikishoten-used' }
    ]
  }),
  ogcd('sam-senei', 'Hissatsu: Senei', 800, 60_000, samRefs, {
    resourceCosts: [{ resource: 'kenki', amount: 25 }]
  }),
  ogcd('sam-shinten', 'Hissatsu: Shinten', 250, 1000, samRefs, {
    resourceCosts: [{ resource: 'kenki', amount: 25 }]
  }),
  ogcd('sam-shoha', 'Shoha', 640, 1000, samRefs, {
    resourceCosts: [{ resource: 'meditation', amount: 3 }]
  })
];

const SAM_RULES: CombatPriorityRule[] = [
  rule('sam-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', samRefs),
  rule('sam-ikishoten', 'sam-ikishoten', [{ kind: 'cooldown-ready', actionId: 'sam-ikishoten' }], 'Generate Kenki and unlock Ogi Namikiri on cooldown.', samRefs),
  rule('sam-ogi', 'sam-ogi', [{ kind: 'mechanic', mechanicId: 'sam-ogi-ready' }], 'Use the Ogi Namikiri granted by Ikishoten.', samRefs),
  rule('sam-kaeshi', 'sam-kaeshi-namikiri', [{ kind: 'mechanic', mechanicId: 'sam-kaeshi-ready' }], 'Follow Ogi Namikiri with Kaeshi: Namikiri.', samRefs),
  rule('sam-shoha', 'sam-shoha', [{ kind: 'resource-at-least', resource: 'meditation', amount: 3 }], 'Spend three Meditation stacks.', samRefs),
  rule('sam-senei', 'sam-senei', [
    { kind: 'cooldown-ready', actionId: 'sam-senei' },
    { kind: 'resource-at-least', resource: 'kenki', amount: 25 }
  ], 'Spend Kenki on the stronger cooldown action.', samRefs),
  rule('sam-shinten-overcap', 'sam-shinten', [
    { kind: 'resource-would-overcap', resource: 'kenki', incoming: 15, maximum: 100 },
    { kind: 'resource-at-least', resource: 'kenki', amount: 25 }
  ], 'Prevent the next combo action from overcapping Kenki.', samRefs),
  rule('sam-higanbana', 'sam-higanbana', [
    { kind: 'dot-remaining-at-most', dotId: 'sam-higanbana', durationMs: 3000 },
    { kind: 'resource-at-least', resource: 'setsu', amount: 1 }
  ], 'Maintain Higanbana with one Sen.', samRefs),
  rule('sam-midare', 'sam-midare', [
    { kind: 'resource-at-least', resource: 'setsu', amount: 1 },
    { kind: 'resource-at-least', resource: 'getsu', amount: 1 },
    { kind: 'resource-at-least', resource: 'ka', amount: 1 }
  ], 'Spend all three Sen on Midare Setsugekka.', samRefs),
  rule('sam-gekko', 'sam-gekko', [{ kind: 'combo-step', comboId: 'sam-combo', step: 'gekko' }], 'Complete the Getsu combo.', samRefs),
  rule('sam-kasha', 'sam-kasha', [{ kind: 'combo-step', comboId: 'sam-combo', step: 'kasha' }], 'Complete the Ka combo.', samRefs),
  rule('sam-jinpu-buff', 'sam-jinpu', [
    { kind: 'combo-step', comboId: 'sam-combo', step: 'choose' },
    { kind: 'buff-active', buffId: 'sam-fugetsu', active: false }
  ], 'Establish Fugetsu first.', samRefs),
  rule('sam-shifu-buff', 'sam-shifu', [
    { kind: 'combo-step', comboId: 'sam-combo', step: 'choose' },
    { kind: 'buff-active', buffId: 'sam-fuka', active: false }
  ], 'Establish Fuka.', samRefs),
  rule('sam-yukikaze-sen', 'sam-yukikaze', [
    { kind: 'combo-step', comboId: 'sam-combo', step: 'choose' },
    { kind: 'resource-at-most', resource: 'setsu', amount: 0 }
  ], 'Generate missing Setsu.', samRefs),
  rule('sam-jinpu-sen', 'sam-jinpu', [
    { kind: 'combo-step', comboId: 'sam-combo', step: 'choose' },
    { kind: 'resource-at-most', resource: 'getsu', amount: 0 }
  ], 'Route toward missing Getsu.', samRefs),
  rule('sam-shifu-sen', 'sam-shifu', [
    { kind: 'combo-step', comboId: 'sam-combo', step: 'choose' },
    { kind: 'resource-at-most', resource: 'ka', amount: 0 }
  ], 'Route toward missing Ka.', samRefs),
  rule('sam-shinten', 'sam-shinten', [{ kind: 'resource-at-least', resource: 'kenki', amount: 75 }], 'Spend surplus Kenki without starving cooldown actions.', samRefs),
  rule('sam-filler', 'sam-gyofu', [{ kind: 'always' }], 'Begin the next deterministic combo.', samRefs)
];

export const SAM_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'sam-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'SAM',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'sam-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: SAM_ACTIONS,
  priorityRules: SAM_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'SAM',
    'Samurai',
    'samurai',
    'packages/sims/src/melee/sam/sam_actions.ts',
    'Used only as an independent action-data and trace-structure cross-check; its source is not copied or distributed.'
  ),
  limitation: 'Preliminary single-target generated-priority model. It omits encounter movement, Third Eye gains, party buffs and exact community opener alignment.'
};

const dncRefs = ['dnc-official-actions', 'dnc-internal-priority'];
const DNC_ACTIONS: CombatActionProfile[] = [
  potion(dncRefs),
  autoAttack(dncRefs),
  gcd('dnc-technical-finish', 'Technical Step sequence', 1300, dncRefs, {
    recastMs: 8500,
    cooldownMs: 120_000,
    castMs: 6400,
    speedScaling: 'none',
    effects: [
      { kind: 'buff', buffId: 'dnc-technical-finish', durationMs: 20_000, damageMultiplier: 1.05 },
      { kind: 'resource', resource: 'tillana-ready', amount: 1 },
      { kind: 'resource', resource: 'dawn-ready', amount: 1 }
    ]
  }),
  gcd('dnc-standard-finish', 'Standard Step sequence', 850, dncRefs, {
    recastMs: 6500,
    cooldownMs: 30_000,
    castMs: 4400,
    speedScaling: 'none',
    effects: [
      { kind: 'buff', buffId: 'dnc-standard-finish', durationMs: 60_000, damageMultiplier: 1.05 },
      { kind: 'resource', resource: 'last-dance-ready', amount: 1 }
    ]
  }),
  gcd('dnc-tillana', 'Tillana', 600, dncRefs, {
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tillana-ready', amount: 1 }]
  }),
  gcd('dnc-dance-of-the-dawn', 'Dance of the Dawn', 1000, dncRefs, {
    resourceCosts: [
      { resource: 'dawn-ready', amount: 1 },
      { resource: 'esprit', amount: 50 }
    ]
  }),
  gcd('dnc-last-dance', 'Last Dance', 540, dncRefs, {
    resourceCosts: [{ resource: 'last-dance-ready', amount: 1 }]
  }),
  gcd('dnc-starfall', 'Starfall Dance', 600, dncRefs, {
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    resourceCosts: [{ resource: 'starfall-ready', amount: 1 }]
  }),
  gcd('dnc-saber', 'Saber Dance', 540, dncRefs, {
    resourceCosts: [{ resource: 'esprit', amount: 50 }]
  }),
  gcd('dnc-cascade', 'Cascade', 220, dncRefs, {
    effects: [
      { kind: 'expected-proc', procId: 'silken-symmetry', chance: 0.5 },
      { kind: 'resource', resource: 'esprit', amount: 5 },
      { kind: 'combo', comboId: 'dnc-combo', nextStep: 'fountain', durationMs: 30_000 }
    ]
  }),
  gcd('dnc-fountain', 'Fountain', 280, dncRefs, {
    effects: [
      { kind: 'expected-proc', procId: 'silken-flow', chance: 0.5 },
      { kind: 'resource', resource: 'esprit', amount: 5 },
      { kind: 'combo', comboId: 'dnc-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('dnc-reverse-cascade', 'Reverse Cascade', 280, dncRefs, {
    expectedProcCosts: [{ resource: 'silken-symmetry', amount: 1 }],
    effects: [
      { kind: 'expected-proc', procId: 'fourfold-feather', chance: 0.5 },
      { kind: 'resource', resource: 'esprit', amount: 5 }
    ]
  }),
  gcd('dnc-fountainfall', 'Fountainfall', 340, dncRefs, {
    expectedProcCosts: [{ resource: 'silken-flow', amount: 1 }],
    effects: [
      { kind: 'expected-proc', procId: 'fourfold-feather', chance: 0.5 },
      { kind: 'resource', resource: 'esprit', amount: 5 }
    ]
  }),
  ogcd('dnc-devilment', 'Devilment', 0, 120_000, dncRefs, {
    effects: [
      { kind: 'buff', buffId: 'dnc-devilment', durationMs: 20_000, damageMultiplier: 1 },
      { kind: 'resource', resource: 'starfall-ready', amount: 1 }
    ]
  }),
  ogcd('dnc-flourish', 'Flourish', 0, 60_000, dncRefs, {
    effects: [
      { kind: 'expected-proc', procId: 'silken-symmetry', chance: 1 },
      { kind: 'expected-proc', procId: 'silken-flow', chance: 1 },
      { kind: 'expected-proc', procId: 'fan-dance-iii', chance: 1 },
      { kind: 'expected-proc', procId: 'fan-dance-iv', chance: 1 }
    ]
  }),
  ogcd('dnc-fan-dance', 'Fan Dance', 180, 1000, dncRefs, {
    expectedProcCosts: [{ resource: 'fourfold-feather', amount: 1 }],
    effects: [{ kind: 'expected-proc', procId: 'fan-dance-iii', chance: 0.5 }]
  }),
  ogcd('dnc-fan-dance-iii', 'Fan Dance III', 220, 1000, dncRefs, {
    expectedProcCosts: [{ resource: 'fan-dance-iii', amount: 1 }]
  }),
  ogcd('dnc-fan-dance-iv', 'Fan Dance IV', 460, 1000, dncRefs, {
    expectedProcCosts: [{ resource: 'fan-dance-iv', amount: 1 }]
  })
];

const DNC_RULES: CombatPriorityRule[] = [
  rule('dnc-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', dncRefs),
  rule('dnc-technical', 'dnc-technical-finish', [{ kind: 'cooldown-ready', actionId: 'dnc-technical-finish' }], 'Perform the aggregate Technical Step sequence on cooldown.', dncRefs),
  rule('dnc-devilment', 'dnc-devilment', [{ kind: 'cooldown-ready', actionId: 'dnc-devilment' }], 'Use Devilment in a safe weave after Technical Finish.', dncRefs),
  rule('dnc-flourish', 'dnc-flourish', [{ kind: 'cooldown-ready', actionId: 'dnc-flourish' }], 'Generate the Flourish proc package on cooldown.', dncRefs),
  rule('dnc-standard', 'dnc-standard-finish', [{ kind: 'cooldown-ready', actionId: 'dnc-standard-finish' }], 'Maintain Standard Finish with its aggregate step sequence.', dncRefs),
  rule('dnc-dawn', 'dnc-dance-of-the-dawn', [
    { kind: 'resource-at-least', resource: 'dawn-ready', amount: 1 },
    { kind: 'resource-at-least', resource: 'esprit', amount: 50 }
  ], 'Spend Technical Finish readiness and Esprit on Dance of the Dawn.', dncRefs),
  rule('dnc-starfall', 'dnc-starfall', [{ kind: 'resource-at-least', resource: 'starfall-ready', amount: 1 }], 'Consume Devilment readiness on Starfall Dance.', dncRefs),
  rule('dnc-tillana', 'dnc-tillana', [{ kind: 'resource-at-least', resource: 'tillana-ready', amount: 1 }], 'Use Tillana after Technical Finish.', dncRefs),
  rule('dnc-last-dance', 'dnc-last-dance', [{ kind: 'resource-at-least', resource: 'last-dance-ready', amount: 1 }], 'Use Last Dance after Standard Finish.', dncRefs),
  rule('dnc-saber-overcap', 'dnc-saber', [{ kind: 'resource-at-least', resource: 'esprit', amount: 80 }], 'Spend Esprit before overcap.', dncRefs),
  rule('dnc-fan-iv', 'dnc-fan-dance-iv', [{ kind: 'proc-active', procId: 'fan-dance-iv', active: true }], 'Consume Fourfold Fan Dance readiness.', dncRefs),
  rule('dnc-fan-iii', 'dnc-fan-dance-iii', [{ kind: 'proc-active', procId: 'fan-dance-iii', active: true }], 'Consume Fan Dance III readiness.', dncRefs),
  rule('dnc-fan', 'dnc-fan-dance', [{ kind: 'proc-active', procId: 'fourfold-feather', active: true }], 'Spend an expected Fourfold Feather.', dncRefs),
  rule('dnc-reverse', 'dnc-reverse-cascade', [{ kind: 'proc-active', procId: 'silken-symmetry', active: true }], 'Consume accumulated expected Silken Symmetry probability.', dncRefs),
  rule('dnc-fountainfall', 'dnc-fountainfall', [{ kind: 'proc-active', procId: 'silken-flow', active: true }], 'Consume accumulated expected Silken Flow probability.', dncRefs),
  rule('dnc-fountain', 'dnc-fountain', [{ kind: 'combo-step', comboId: 'dnc-combo', step: 'fountain' }], 'Complete the basic combo.', dncRefs),
  rule('dnc-filler', 'dnc-cascade', [{ kind: 'always' }], 'Begin the next expected-value combo.', dncRefs)
];

export const DNC_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'dnc-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'DNC',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'dnc-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: DNC_ACTIONS,
  priorityRules: DNC_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'DNC',
    'Dancer',
    'dancer',
    'packages/sims/src/ranged/dnc_sim.ts',
    'Used as an independent expected-count cross-check. XivGear also labels this Dancer implementation as an approximate count simulation.'
  ),
  limitation: 'Preliminary deterministic expected-value model. Dance sequences are aggregate GCD actions, Esprit generation excludes party members, and individual RNG outcomes are not rolled.'
};

const blmRefs = ['blm-official-actions', 'blm-internal-priority'];
const BLM_ACTIONS: CombatActionProfile[] = [
  potion(blmRefs),
  gcd('blm-fire-iii', 'Fire III', 290, blmRefs, {
    castMs: 1750,
    applicationDelayMs: 1290,
    speedScaling: 'spell-speed',
    resourceCosts: [{ resource: 'mp', amount: 2000 }],
    effects: [{ kind: 'mechanic', mechanicId: 'blm-fire-iii', timing: 'snapshot' }]
  }),
  gcd('blm-fire-iv', 'Fire IV', 300, blmRefs, {
    castMs: 2000,
    applicationDelayMs: 1160,
    speedScaling: 'spell-speed',
    resourceCosts: [{ resource: 'mp', amount: 1200 }],
    effects: [{ kind: 'resource', resource: 'astral-soul', amount: 1, timing: 'snapshot' }]
  }),
  gcd('blm-flare-star', 'Flare Star', 500, blmRefs, {
    castMs: 2000,
    applicationDelayMs: 620,
    speedScaling: 'spell-speed',
    resourceCosts: [{ resource: 'astral-soul', amount: 6 }]
  }),
  gcd('blm-despair', 'Despair', 350, blmRefs, {
    applicationDelayMs: 560,
    speedScaling: 'spell-speed',
    resourceCosts: [{ resource: 'mp', amount: 800 }],
    effects: [{ kind: 'mechanic', mechanicId: 'blm-despair', timing: 'snapshot' }]
  }),
  gcd('blm-blizzard-iii', 'Blizzard III', 290, blmRefs, {
    castMs: 1750,
    applicationDelayMs: 890,
    speedScaling: 'spell-speed',
    effects: [
      { kind: 'resource', resource: 'mp', amount: 10_000, timing: 'snapshot' },
      { kind: 'mechanic', mechanicId: 'blm-blizzard-iii', timing: 'snapshot' }
    ]
  }),
  gcd('blm-blizzard-iv', 'Blizzard IV', 300, blmRefs, {
    castMs: 2000,
    applicationDelayMs: 1160,
    speedScaling: 'spell-speed',
    effects: [{ kind: 'mechanic', mechanicId: 'blm-blizzard-iv', timing: 'snapshot' }]
  }),
  gcd('blm-high-thunder', 'High Thunder', 150, blmRefs, {
    applicationDelayMs: 760,
    speedScaling: 'spell-speed',
    effects: [
      { kind: 'dot', dotId: 'blm-high-thunder', durationMs: 30_000, tickPotency: 60 },
      { kind: 'mechanic', mechanicId: 'blm-high-thunder', timing: 'snapshot' }
    ]
  }),
  gcd('blm-xenoglossy', 'Xenoglossy', 890, blmRefs, {
    applicationDelayMs: 630,
    speedScaling: 'spell-speed',
    resourceCosts: [{ resource: 'polyglot', amount: 1 }]
  }),
  ogcd('blm-ley-lines', 'Ley Lines', 0, 120_000, blmRefs, {
    charges: 2,
    effects: [{
      kind: 'buff',
      buffId: 'blm-ley-lines',
      durationMs: 20_000,
      hastePercent: 15
    }]
  }),
  ogcd('blm-amplifier', 'Amplifier', 0, 120_000, blmRefs, {
    effects: [{ kind: 'resource', resource: 'polyglot', amount: 1 }]
  }),
  ogcd('blm-manafont', 'Manafont', 0, 100_000, blmRefs, {
    effects: [
      { kind: 'resource', resource: 'mp', amount: 10_000 },
      { kind: 'mechanic', mechanicId: 'blm-manafont' }
    ]
  })
];

const BLM_RULES: CombatPriorityRule[] = [
  rule('blm-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', blmRefs),
  rule('blm-ley-lines', 'blm-ley-lines', [{ kind: 'cooldown-ready', actionId: 'blm-ley-lines' }], 'Use Ley Lines in a safe weave.', blmRefs),
  rule('blm-amplifier', 'blm-amplifier', [
    { kind: 'cooldown-ready', actionId: 'blm-amplifier' },
    { kind: 'resource-at-most', resource: 'polyglot', amount: 2 }
  ], 'Generate Polyglot without overcapping.', blmRefs),
  rule('blm-manafont', 'blm-manafont', [{ kind: 'mechanic', mechanicId: 'blm-manafont-ready' }], 'Restore MP after Despair while Manafont is ready.', blmRefs),
  rule('blm-thunder', 'blm-high-thunder', [
    { kind: 'mechanic', mechanicId: 'blm-thunder-ready' },
    { kind: 'dot-remaining-at-most', dotId: 'blm-high-thunder', durationMs: 3000 }
  ], 'Use Thunderhead to maintain High Thunder.', blmRefs),
  rule('blm-xenoglossy-overcap', 'blm-xenoglossy', [{ kind: 'resource-at-least', resource: 'polyglot', amount: 2 }], 'Spend Polyglot before the next timed gain overcaps.', blmRefs),
  rule('blm-flare-star', 'blm-flare-star', [{ kind: 'resource-at-least', resource: 'astral-soul', amount: 6 }], 'Spend six Astral Soul on Flare Star.', blmRefs),
  rule('blm-despair', 'blm-despair', [
    { kind: 'mechanic', mechanicId: 'blm-can-despair' },
    { kind: 'resource-at-least', resource: 'mp', amount: 800 },
    { kind: 'resource-at-most', resource: 'mp', amount: 2000 }
  ], 'End the fire phase with Despair.', blmRefs),
  rule('blm-blizzard-iv', 'blm-blizzard-iv', [{ kind: 'mechanic', mechanicId: 'blm-blizzard-iv-ready' }], 'Generate Umbral Hearts during the ice phase.', blmRefs),
  rule('blm-fire-iii', 'blm-fire-iii', [{ kind: 'mechanic', mechanicId: 'blm-fire-iii-ready' }], 'Return to Astral Fire after Blizzard IV.', blmRefs),
  rule('blm-fire-iv', 'blm-fire-iv', [
    { kind: 'mechanic', mechanicId: 'blm-in-fire' },
    { kind: 'resource-at-least', resource: 'mp', amount: 1200 }
  ], 'Cast Fire IV while sufficient MP remains.', blmRefs),
  rule('blm-filler', 'blm-blizzard-iii', [{ kind: 'always' }], 'Enter Umbral Ice when the fire phase is exhausted.', blmRefs)
];

export const BLM_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'blm-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'BLM',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'blm-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: BLM_ACTIONS,
  priorityRules: BLM_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'BLM',
    'Black Mage',
    'blackmage',
    'packages/sims/src/caster/blm/blm_actions.ts',
    'Used only as an independent potency, cast-time and gauge-behaviour cross-check; its source is not copied or distributed.'
  ),
  limitation: 'Preliminary stationary generated-priority model. It simplifies Umbral Heart MP costs and omits Paradox, Triplecast, Swiftcast, movement planning and fight-specific transpose lines.'
};

const drkRefs = ['drk-official-actions', 'drk-internal-priority'];
const drkPetRefs = ['drk-official-actions', 'drk-xivgear-oracle', 'drk-internal-priority'];
const DRK_ACTIONS: CombatActionProfile[] = [
  potion(drkRefs),
  autoAttack(drkRefs),
  gcd('drk-hard-slash', 'Hard Slash', 300, drkRefs, {
    applicationDelayMs: 580,
    effects: [{ kind: 'combo', comboId: 'drk-combo', nextStep: 'syphon', durationMs: 30_000 }]
  }),
  gcd('drk-syphon-strike', 'Syphon Strike', 380, drkRefs, {
    applicationDelayMs: 620,
    effects: [
      { kind: 'resource', resource: 'mp', amount: 600 },
      { kind: 'combo', comboId: 'drk-combo', nextStep: 'souleater', durationMs: 30_000 }
    ]
  }),
  gcd('drk-souleater', 'Souleater', 480, drkRefs, {
    applicationDelayMs: 620,
    effects: [
      { kind: 'resource', resource: 'blood', amount: 20 },
      { kind: 'combo', comboId: 'drk-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('drk-bloodspiller', 'Bloodspiller', 600, drkRefs, {
    applicationDelayMs: 800,
    resourceCosts: [{ resource: 'blood', amount: 50 }]
  }),
  gcd('drk-scarlet-delirium', 'Scarlet Delirium', 620, drkRefs, {
    applicationDelayMs: 620,
    resourceCosts: [{ resource: 'delirium', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'blood', amount: 10 },
      { kind: 'resource', resource: 'mp', amount: 600 },
      { kind: 'combo', comboId: 'drk-delirium', nextStep: 'comeuppance', durationMs: 15_000 }
    ]
  }),
  gcd('drk-comeuppance', 'Comeuppance', 720, drkRefs, {
    applicationDelayMs: 670,
    resourceCosts: [{ resource: 'delirium', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'blood', amount: 10 },
      { kind: 'resource', resource: 'mp', amount: 600 },
      { kind: 'combo', comboId: 'drk-delirium', nextStep: 'torcleaver', durationMs: 15_000 }
    ]
  }),
  gcd('drk-torcleaver', 'Torcleaver', 820, drkRefs, {
    applicationDelayMs: 620,
    resourceCosts: [{ resource: 'delirium', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'blood', amount: 10 },
      { kind: 'resource', resource: 'mp', amount: 600 },
      { kind: 'combo', comboId: 'drk-delirium', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('drk-disesteem', 'Disesteem', 1000, drkRefs, {
    applicationDelayMs: 1650,
    resourceCosts: [{ resource: 'scorn-ready', amount: 1 }]
  }),
  ogcd('drk-delirium', 'Delirium', 0, 60_000, drkRefs, {
    effects: [
      { kind: 'resource', resource: 'delirium', amount: 3 },
      { kind: 'resource', resource: 'scorn-ready', amount: 1 },
      { kind: 'combo', comboId: 'drk-delirium', nextStep: 'scarlet', durationMs: 15_000 }
    ]
  }),
  ogcd('drk-edge', 'Edge of Shadow', 460, 1000, drkRefs, {
    applicationDelayMs: 620,
    resourceCosts: [{ resource: 'mp', amount: 3000 }],
    effects: [{
      kind: 'buff',
      buffId: 'drk-darkside',
      durationMs: 30_000,
      damageMultiplier: 1.1
    }]
  }),
  ogcd('drk-carve', 'Carve and Spit', 540, 60_000, drkRefs, {
    applicationDelayMs: 1470,
    effects: [{ kind: 'resource', resource: 'mp', amount: 600 }]
  }),
  ogcd('drk-salted-earth', 'Salted Earth', 50, 90_000, drkRefs, {
    applicationDelayMs: 760,
    effects: [
      { kind: 'dot', dotId: 'drk-salted-earth', durationMs: 15_000, tickPotency: 50 },
      { kind: 'resource', resource: 'salt-and-darkness-ready', amount: 1 }
    ]
  }),
  ogcd('drk-salt-and-darkness', 'Salt and Darkness', 500, 1000, drkRefs, {
    applicationDelayMs: 760,
    resourceCosts: [{ resource: 'salt-and-darkness-ready', amount: 1 }]
  }),
  ogcd('drk-shadowbringer', 'Shadowbringer', 600, 60_000, drkRefs, {
    charges: 2,
    applicationDelayMs: 620
  }),
  ogcd('drk-living-shadow', 'Living Shadow', 0, 120_000, drkPetRefs, {
    effects: [
      { kind: 'schedule-action', actionId: 'drk-shadow-abyssal', delayMs: 6800 },
      { kind: 'schedule-action', actionId: 'drk-shadow-stride', delayMs: 8980 },
      { kind: 'schedule-action', actionId: 'drk-shadow-shadowbringer', delayMs: 11_160 },
      { kind: 'schedule-action', actionId: 'drk-shadow-edge', delayMs: 13_340 },
      { kind: 'schedule-action', actionId: 'drk-shadow-bloodspiller', delayMs: 15_520 },
      { kind: 'schedule-action', actionId: 'drk-shadow-disesteem', delayMs: 17_700 }
    ]
  }),
  action('drk-shadow-abyssal', 'Living Shadow: Abyssal Drain', 'pet', 420, { referenceIds: drkPetRefs }),
  action('drk-shadow-stride', 'Living Shadow: Shadowstride', 'pet', 0, { referenceIds: drkPetRefs }),
  action('drk-shadow-shadowbringer', 'Living Shadow: Shadowbringer', 'pet', 570, { referenceIds: drkPetRefs }),
  action('drk-shadow-edge', 'Living Shadow: Edge of Shadow', 'pet', 420, { referenceIds: drkPetRefs }),
  action('drk-shadow-bloodspiller', 'Living Shadow: Bloodspiller', 'pet', 420, { referenceIds: drkPetRefs }),
  action('drk-shadow-disesteem', 'Living Shadow: Disesteem', 'pet', 620, { referenceIds: drkPetRefs })
];

const DRK_RULES: CombatPriorityRule[] = [
  rule('drk-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', drkRefs),
  rule('drk-living-shadow', 'drk-living-shadow', [{ kind: 'cooldown-ready', actionId: 'drk-living-shadow' }], 'Summon Living Shadow on cooldown.', drkPetRefs),
  rule('drk-delirium', 'drk-delirium', [{ kind: 'cooldown-ready', actionId: 'drk-delirium' }], 'Start the Delirium combo on cooldown.', drkRefs),
  rule('drk-disesteem', 'drk-disesteem', [{ kind: 'resource-at-least', resource: 'scorn-ready', amount: 1 }], 'Consume Scorn readiness on Disesteem.', drkRefs),
  rule('drk-salted-earth', 'drk-salted-earth', [{ kind: 'cooldown-ready', actionId: 'drk-salted-earth' }], 'Place Salted Earth on cooldown.', drkRefs),
  rule('drk-salt-darkness', 'drk-salt-and-darkness', [{ kind: 'resource-at-least', resource: 'salt-and-darkness-ready', amount: 1 }], 'Detonate Salt and Darkness.', drkRefs),
  rule('drk-carve', 'drk-carve', [{ kind: 'cooldown-ready', actionId: 'drk-carve' }], 'Use Carve and Spit on cooldown.', drkRefs),
  rule('drk-shadowbringer', 'drk-shadowbringer', [{ kind: 'cooldown-ready', actionId: 'drk-shadowbringer', minimumCharges: 1 }], 'Spend Shadowbringer charges without overcap.', drkRefs),
  rule('drk-edge-darkside', 'drk-edge', [
    { kind: 'buff-remaining-at-most', buffId: 'drk-darkside', durationMs: 10_000 },
    { kind: 'resource-at-least', resource: 'mp', amount: 3000 }
  ], 'Maintain Darkside.', drkRefs),
  rule('drk-edge-mp', 'drk-edge', [{ kind: 'resource-at-least', resource: 'mp', amount: 9000 }], 'Spend MP before overcap.', drkRefs),
  rule('drk-scarlet', 'drk-scarlet-delirium', [{ kind: 'combo-step', comboId: 'drk-delirium', step: 'scarlet' }], 'Begin the Delirium weaponskill combo.', drkRefs),
  rule('drk-comeuppance', 'drk-comeuppance', [{ kind: 'combo-step', comboId: 'drk-delirium', step: 'comeuppance' }], 'Continue the Delirium weaponskill combo.', drkRefs),
  rule('drk-torcleaver', 'drk-torcleaver', [{ kind: 'combo-step', comboId: 'drk-delirium', step: 'torcleaver' }], 'Complete the Delirium weaponskill combo.', drkRefs),
  rule('drk-blood-overcap', 'drk-bloodspiller', [{ kind: 'resource-at-least', resource: 'blood', amount: 90 }], 'Spend Blood before the combo can overcap it.', drkRefs),
  rule('drk-syphon', 'drk-syphon-strike', [{ kind: 'combo-step', comboId: 'drk-combo', step: 'syphon' }], 'Continue the MP combo.', drkRefs),
  rule('drk-souleater', 'drk-souleater', [{ kind: 'combo-step', comboId: 'drk-combo', step: 'souleater' }], 'Complete the Blood-generating combo.', drkRefs),
  rule('drk-blood', 'drk-bloodspiller', [{ kind: 'resource-at-least', resource: 'blood', amount: 50 }], 'Spend available Blood after higher priorities.', drkRefs),
  rule('drk-filler', 'drk-hard-slash', [{ kind: 'always' }], 'Begin the next Souleater combo.', drkRefs)
];

export const DRK_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'drk-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'DRK',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'drk-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: DRK_ACTIONS,
  priorityRules: DRK_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'DRK',
    'Dark Knight',
    'darkknight',
    'packages/sims/src/tank/drk/drk_sheet_sim.ts',
    'Used as an independent cross-check for the 6.8-second Living Shadow delay, 2.18-second action spacing and pet buff exclusions.'
  ),
  limitation: 'Preliminary single-target generated-priority model. It omits defensive TBN timing, Dark Arts, raid buffs and encounter-specific MP or Blood pooling.'
};

export const CURRENT_ROTATION_PROFILES: CombatRotationProfile[] = [
  SAM_ROTATION_PROFILE,
  DNC_ROTATION_PROFILE,
  BLM_ROTATION_PROFILE,
  DRK_ROTATION_PROFILE
];
