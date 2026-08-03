import type {
  CombatActionProfile,
  CombatJob,
  CombatMethodReference,
  CombatPriorityRule,
  CombatRotationProfile
} from '@xiv-gear-lab/domain';
import { CURRENT_RULESET_ID } from './current-registry';

export const ROTATION_PROFILE_SCHEMA_VERSION = 'combat-rotation-profile@2';
export const CURRENT_ROTATION_PROFILE_VERSION = 'dt-7.51-pilot-rotation@8';

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

const spellGcd = (
  id: string,
  name: string,
  potency: number,
  referenceIds: string[],
  overrides: Partial<CombatActionProfile> = {}
): CombatActionProfile => gcd(id, name, potency, referenceIds, {
  speedScaling: 'spell-speed',
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

const lucidDreaming = (referenceIds: string[]): CombatActionProfile => ogcd(
  'healer-lucid-dreaming',
  'Lucid Dreaming',
  0,
  60_000,
  referenceIds,
  {
    effects: [{
      kind: 'periodic-resource',
      resource: 'mp',
      amount: 550,
      firstDelayMs: 3000,
      intervalMs: 3000,
      repeatCount: 7
    }]
  }
);

const lucidDreamingRule = (referenceIds: string[]): CombatPriorityRule => rule(
  'healer-lucid-dreaming',
  'healer-lucid-dreaming',
  [
    { kind: 'cooldown-ready', actionId: 'healer-lucid-dreaming' },
    { kind: 'resource-at-most', resource: 'mp', amount: 7000 }
  ],
  'Use Lucid Dreaming below 7,000 MP and restore MP over seven three-second ticks.',
  referenceIds
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
): CombatMethodReference[] => {
  const potionMainStat = ({
    MNK: 'Strength',
    DRG: 'Strength',
    NIN: 'Dexterity',
    RPR: 'Strength',
    VPR: 'Dexterity',
    SAM: 'Strength',
    BRD: 'Dexterity',
    MCH: 'Dexterity',
    DNC: 'Dexterity',
    BLM: 'Intelligence',
    SMN: 'Intelligence',
    RDM: 'Intelligence',
    PCT: 'Intelligence',
    DRK: 'Strength',
    WHM: 'Mind',
    SCH: 'Mind',
    AST: 'Mind',
    SGE: 'Mind',
    PLD: 'Strength',
    WAR: 'Strength',
    GNB: 'Strength'
  } as Partial<Record<CombatJob, string>>)[job] ?? 'Strength';
  return [{
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
  url: `https://ffxiv.consolegameswiki.com/wiki/Grade_2_Gemdraught_of_${potionMainStat}`,
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
};

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

const brdRefs = ['brd-official-actions', 'brd-internal-priority'];
const brdTimingRefs = [...brdRefs, 'brd-xivgear-oracle'];
const BRD_ACTIONS: CombatActionProfile[] = [
  potion(brdRefs),
  autoAttack(brdRefs),
  gcd('brd-caustic-bite', 'Caustic Bite', 150, brdRefs, {
    effects: [
      { kind: 'dot', dotId: 'brd-caustic-bite', durationMs: 45_000, tickPotency: 20 },
      { kind: 'expected-proc', procId: 'brd-hawks-eye', chance: 0.35 }
    ]
  }),
  gcd('brd-stormbite', 'Stormbite', 100, brdRefs, {
    effects: [
      { kind: 'dot', dotId: 'brd-stormbite', durationMs: 45_000, tickPotency: 25 },
      { kind: 'expected-proc', procId: 'brd-hawks-eye', chance: 0.35 }
    ]
  }),
  gcd('brd-iron-jaws', 'Iron Jaws', 100, brdRefs, {
    effects: [
      { kind: 'dot', dotId: 'brd-caustic-bite', durationMs: 45_000, tickPotency: 20 },
      { kind: 'dot', dotId: 'brd-stormbite', durationMs: 45_000, tickPotency: 25 },
      { kind: 'expected-proc', procId: 'brd-hawks-eye', chance: 0.35 }
    ]
  }),
  gcd('brd-burst-shot', 'Burst Shot', 220, brdRefs, {
    effects: [{ kind: 'expected-proc', procId: 'brd-hawks-eye', chance: 0.35 }]
  }),
  gcd('brd-refulgent-arrow', 'Refulgent Arrow', 280, brdRefs, {
    expectedProcCosts: [{ resource: 'brd-hawks-eye', amount: 1 }]
  }),
  gcd('brd-barrage-refulgent', 'Refulgent Arrow (Barrage)', 840, brdRefs, {
    resourceCosts: [{ resource: 'brd-barrage-ready', amount: 1 }]
  }),
  gcd('brd-resonant-arrow', 'Resonant Arrow', 640, brdRefs, {
    resourceCosts: [{ resource: 'brd-resonant-ready', amount: 1 }]
  }),
  gcd('brd-apex-arrow', 'Apex Arrow', 700, brdRefs, {
    resourceCosts: [{ resource: 'brd-soul-voice', amount: 80 }],
    effects: [{ kind: 'resource', resource: 'brd-blast-ready', amount: 1 }]
  }),
  gcd('brd-blast-arrow', 'Blast Arrow', 700, brdRefs, {
    resourceCosts: [{ resource: 'brd-blast-ready', amount: 1 }]
  }),
  gcd('brd-radiant-encore-one', 'Radiant Encore (1 Coda)', 700, brdRefs, {
    resourceCosts: [{ resource: 'brd-encore-one-ready', amount: 1 }]
  }),
  gcd('brd-radiant-encore-three', 'Radiant Encore (3 Coda)', 1100, brdRefs, {
    resourceCosts: [{ resource: 'brd-encore-three-ready', amount: 1 }]
  }),
  ogcd('brd-raging-strikes', 'Raging Strikes', 0, 120_000, brdRefs, {
    effects: [{ kind: 'buff', buffId: 'brd-raging-strikes', durationMs: 20_000, damageMultiplier: 1.15 }]
  }),
  ogcd('brd-battle-voice', 'Battle Voice', 0, 120_000, brdRefs, {
    effects: [{ kind: 'buff', buffId: 'brd-battle-voice', durationMs: 20_000 }]
  }),
  ogcd('brd-wanderers-minuet', "The Wanderer's Minuet", 0, 120_000, brdRefs, {
    effects: [
      { kind: 'buff', buffId: 'brd-wanderers-minuet', durationMs: 45_000 },
      { kind: 'resource', resource: 'brd-coda', amount: 1 },
      { kind: 'schedule-action', actionId: 'brd-pitch-perfect-expected', delayMs: 9000, repeatEveryMs: 10_000, repeatCount: 4 },
      { kind: 'mechanic', mechanicId: 'brd-wanderer-used' }
    ]
  }),
  ogcd('brd-mages-ballad', "Mage's Ballad", 0, 120_000, brdRefs, {
    effects: [
      { kind: 'buff', buffId: 'brd-mages-ballad', durationMs: 45_000, damageMultiplier: 1.01 },
      { kind: 'resource', resource: 'brd-coda', amount: 1 },
      { kind: 'schedule-action', actionId: 'brd-mage-heartbreak-expected', delayMs: 6000, repeatEveryMs: 7000, repeatCount: 6 },
      { kind: 'mechanic', mechanicId: 'brd-mage-used' }
    ]
  }),
  ogcd('brd-armys-paeon', "Army's Paeon", 0, 120_000, brdRefs, {
    effects: [
      {
        kind: 'buff',
        buffId: 'brd-armys-paeon',
        durationMs: 30_000,
        hastePercent: 12
      },
      { kind: 'resource', resource: 'brd-coda', amount: 1 },
      { kind: 'mechanic', mechanicId: 'brd-army-used' }
    ]
  }),
  action('brd-pitch-perfect-expected', 'Pitch Perfect (expected)', 'ogcd', 360, {
    animationLockMs: 0,
    referenceIds: brdTimingRefs
  }),
  action('brd-mage-heartbreak-expected', 'Heartbreak Shot (expected song reset)', 'ogcd', 180, {
    animationLockMs: 0,
    referenceIds: brdTimingRefs
  }),
  ogcd('brd-radiant-finale-one', 'Radiant Finale (1 Coda)', 0, 110_000, brdRefs, {
    resourceCosts: [{ resource: 'brd-coda', amount: 1 }],
    effects: [
      { kind: 'buff', buffId: 'brd-radiant-finale-one', durationMs: 20_000, damageMultiplier: 1.02 },
      { kind: 'resource', resource: 'brd-encore-one-ready', amount: 1 },
      { kind: 'mechanic', mechanicId: 'brd-first-finale-used' }
    ]
  }),
  ogcd('brd-radiant-finale-three', 'Radiant Finale (3 Coda)', 0, 110_000, brdRefs, {
    resourceCosts: [{ resource: 'brd-coda', amount: 3 }],
    effects: [
      { kind: 'buff', buffId: 'brd-radiant-finale-three', durationMs: 20_000, damageMultiplier: 1.06 },
      { kind: 'resource', resource: 'brd-encore-three-ready', amount: 1 }
    ]
  }),
  ogcd('brd-barrage', 'Barrage', 0, 120_000, brdRefs, {
    effects: [
      { kind: 'resource', resource: 'brd-barrage-ready', amount: 1 },
      { kind: 'resource', resource: 'brd-resonant-ready', amount: 1 }
    ]
  }),
  ogcd('brd-empyreal-arrow', 'Empyreal Arrow', 260, 15_000, brdRefs, {
    effects: [{ kind: 'resource', resource: 'brd-soul-voice', amount: 5 }]
  }),
  ogcd('brd-heartbreak-shot', 'Heartbreak Shot', 180, 15_000, brdRefs, {
    charges: 3
  }),
  ogcd('brd-sidewinder', 'Sidewinder', 400, 60_000, brdRefs)
];

const BRD_RULES: CombatPriorityRule[] = [
  rule('brd-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', brdRefs),
  rule('brd-wanderer', 'brd-wanderers-minuet', [
    { kind: 'mechanic', mechanicId: 'brd-wanderer-next' },
    { kind: 'buff-remaining-at-most', buffId: 'brd-armys-paeon', durationMs: 0 },
    { kind: 'cooldown-ready', actionId: 'brd-wanderers-minuet' }
  ], 'Begin the next deterministic 45/45/30-second song cycle.', brdTimingRefs),
  rule('brd-mage', 'brd-mages-ballad', [
    { kind: 'mechanic', mechanicId: 'brd-mage-next' },
    { kind: 'buff-remaining-at-most', buffId: 'brd-wanderers-minuet', durationMs: 0 },
    { kind: 'cooldown-ready', actionId: 'brd-mages-ballad' }
  ], 'Move from Wanderer to Mage after the full song window.', brdTimingRefs),
  rule('brd-army', 'brd-armys-paeon', [
    { kind: 'mechanic', mechanicId: 'brd-army-next' },
    { kind: 'buff-remaining-at-most', buffId: 'brd-mages-ballad', durationMs: 0 },
    { kind: 'cooldown-ready', actionId: 'brd-armys-paeon' }
  ], 'Use the final 30 seconds of the cycle for Army song effects.', brdTimingRefs),
  rule('brd-raging', 'brd-raging-strikes', [{ kind: 'cooldown-ready', actionId: 'brd-raging-strikes' }], 'Use the personal damage window on cooldown.', brdRefs),
  rule('brd-battle-voice', 'brd-battle-voice', [{ kind: 'cooldown-ready', actionId: 'brd-battle-voice' }], 'Use the personal direct-hit component on cooldown.', brdRefs),
  rule('brd-finale-one', 'brd-radiant-finale-one', [
    { kind: 'mechanic', mechanicId: 'brd-first-finale' },
    { kind: 'resource-at-least', resource: 'brd-coda', amount: 1 }
  ], 'Use the first one-Coda Finale in the opening burst.', brdRefs),
  rule('brd-finale-three', 'brd-radiant-finale-three', [
    { kind: 'mechanic', mechanicId: 'brd-later-finales' },
    { kind: 'resource-at-least', resource: 'brd-coda', amount: 3 },
    { kind: 'cooldown-ready', actionId: 'brd-radiant-finale-three' }
  ], 'Use later Finale windows with all three Coda.', brdRefs),
  rule('brd-barrage', 'brd-barrage', [{ kind: 'cooldown-ready', actionId: 'brd-barrage' }], 'Prepare the triple Refulgent and Resonant pair.', brdRefs),
  rule('brd-empyreal', 'brd-empyreal-arrow', [{ kind: 'cooldown-ready', actionId: 'brd-empyreal-arrow' }], 'Use Empyreal Arrow and its guaranteed song trigger on cooldown.', brdRefs),
  rule('brd-sidewinder', 'brd-sidewinder', [{ kind: 'cooldown-ready', actionId: 'brd-sidewinder' }], 'Use Sidewinder on cooldown.', brdRefs),
  rule('brd-heartbreak', 'brd-heartbreak-shot', [{ kind: 'cooldown-ready', actionId: 'brd-heartbreak-shot', minimumCharges: 1 }], 'Spend Heartbreak Shot charges.', brdRefs),
  rule('brd-barrage-refulgent', 'brd-barrage-refulgent', [{ kind: 'resource-at-least', resource: 'brd-barrage-ready', amount: 1 }], 'Consume Barrage on its triple Refulgent Arrow.', brdRefs),
  rule('brd-resonant', 'brd-resonant-arrow', [{ kind: 'resource-at-least', resource: 'brd-resonant-ready', amount: 1 }], 'Follow Barrage with Resonant Arrow.', brdRefs),
  rule('brd-encore-three', 'brd-radiant-encore-three', [{ kind: 'resource-at-least', resource: 'brd-encore-three-ready', amount: 1 }], 'Spend the three-Coda Encore readiness.', brdRefs),
  rule('brd-encore-one', 'brd-radiant-encore-one', [{ kind: 'resource-at-least', resource: 'brd-encore-one-ready', amount: 1 }], 'Spend the opening one-Coda Encore readiness.', brdRefs),
  rule('brd-blast', 'brd-blast-arrow', [{ kind: 'resource-at-least', resource: 'brd-blast-ready', amount: 1 }], 'Follow Apex Arrow with Blast Arrow.', brdRefs),
  rule('brd-apex', 'brd-apex-arrow', [{ kind: 'resource-at-least', resource: 'brd-soul-voice', amount: 80 }], 'Spend a high Soul Voice gauge on Apex Arrow.', brdRefs),
  rule('brd-caustic', 'brd-caustic-bite', [{ kind: 'dot-remaining-at-most', dotId: 'brd-caustic-bite', durationMs: 0 }], 'Apply Caustic Bite when absent.', brdRefs),
  rule('brd-storm', 'brd-stormbite', [{ kind: 'dot-remaining-at-most', dotId: 'brd-stormbite', durationMs: 0 }], 'Apply Stormbite when absent.', brdRefs),
  rule('brd-iron-jaws', 'brd-iron-jaws', [
    { kind: 'dot-remaining-at-most', dotId: 'brd-caustic-bite', durationMs: 5000 },
    { kind: 'dot-remaining-at-most', dotId: 'brd-stormbite', durationMs: 5000 }
  ], 'Refresh both damage-over-time effects with Iron Jaws.', brdRefs),
  rule('brd-refulgent', 'brd-refulgent-arrow', [{ kind: 'proc-active', procId: 'brd-hawks-eye', active: true }], 'Spend accumulated expected Hawk Eye probability.', brdRefs),
  rule('brd-filler', 'brd-burst-shot', [{ kind: 'always' }], 'Use Burst Shot as the stationary filler.', brdRefs)
];

export const BRD_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'brd-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'BRD',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'brd-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: BRD_ACTIONS,
  priorityRules: BRD_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'BRD',
    'Bard',
    'bard',
    'packages/sims/src/cycle_sim.ts',
    'Used only as a shared timeline and fixed-window cross-check. The pinned XivGear revision has no Bard-specific simulator, so Bard song and proc behaviour is sourced from the official job guide and remains explicitly preliminary.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['brd-official-actions', 'brd-xivgear-oracle'],
    checks: [
      'Patch-7.5 weaponskill, damage-over-time, song, Coda, Soul Voice and burst-action data.',
      'Strict 30-second and 300-second cutoff behaviour against the pinned shared XivGear cycle engine structure.'
    ],
    limitations: [
      'The pinned XivGear tree has no Bard-specific simulator, so it is not a job-rotation oracle for this profile.',
      'Song Repertoire is represented by deterministic expected damage and a fixed average Army haste window rather than individual three-second random rolls.'
    ]
  },
  limitation: 'Officially sourced preliminary stationary priority. It uses a deterministic 45/45/30 song cycle, expected song-proc damage and average Army haste; it excludes party buffs, random outcomes, encounter movement and community opener-specific song cuts.'
};

const mchRefs = ['mch-official-actions', 'mch-internal-priority'];
const mchAuditRefs = [...mchRefs, 'mch-xivgear-oracle'];
const MCH_ACTIONS: CombatActionProfile[] = [
  potion(mchRefs),
  autoAttack(mchRefs),
  gcd('mch-heated-split', 'Heated Split Shot', 220, mchRefs, {
    effects: [
      { kind: 'resource', resource: 'mch-heat', amount: 5 },
      { kind: 'combo', comboId: 'mch-combo', nextStep: 'slug', durationMs: 30_000 }
    ]
  }),
  gcd('mch-heated-slug', 'Heated Slug Shot', 320, mchRefs, {
    effects: [
      { kind: 'resource', resource: 'mch-heat', amount: 5 },
      { kind: 'combo', comboId: 'mch-combo', nextStep: 'clean', durationMs: 30_000 }
    ]
  }),
  gcd('mch-heated-clean', 'Heated Clean Shot', 420, mchRefs, {
    effects: [
      { kind: 'resource', resource: 'mch-heat', amount: 5 },
      { kind: 'resource', resource: 'mch-battery', amount: 10 },
      { kind: 'combo', comboId: 'mch-combo', nextStep: 'start', durationMs: 1 }
    ]
  }),
  gcd('mch-drill', 'Drill', 660, mchAuditRefs, {
    charges: 2,
    cooldownMs: 20_000
  }),
  gcd('mch-air-anchor', 'Air Anchor', 660, mchAuditRefs, {
    cooldownMs: 40_000,
    effects: [{ kind: 'resource', resource: 'mch-battery', amount: 20 }]
  }),
  gcd('mch-chain-saw', 'Chain Saw', 660, mchAuditRefs, {
    cooldownMs: 60_000,
    effects: [
      { kind: 'resource', resource: 'mch-battery', amount: 20 },
      { kind: 'resource', resource: 'mch-excavator-ready', amount: 1 }
    ]
  }),
  gcd('mch-excavator', 'Excavator', 660, mchAuditRefs, {
    resourceCosts: [{ resource: 'mch-excavator-ready', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'mch-battery', amount: 20 }]
  }),
  gcd('mch-full-metal-field', 'Full Metal Field', 900, mchAuditRefs, {
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    resourceCosts: [{ resource: 'mch-full-metal-ready', amount: 1 }]
  }),
  gcd('mch-blazing-shot', 'Blazing Shot', 240, mchAuditRefs, {
    recastMs: 1500,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'mch-overheat', amount: 1 }]
  }),
  ogcd('mch-barrel-stabilizer', 'Barrel Stabilizer', 0, 120_000, mchAuditRefs, {
    effects: [
      { kind: 'resource', resource: 'mch-overheat', amount: 3 },
      { kind: 'resource', resource: 'mch-full-metal-ready', amount: 1 },
      { kind: 'schedule-action', actionId: 'mch-hypercharge-weave-proxy', delayMs: 1500, repeatEveryMs: 1500, repeatCount: 3 }
    ]
  }),
  ogcd('mch-hypercharge', 'Hypercharge', 0, 10_000, mchAuditRefs, {
    resourceCosts: [{ resource: 'mch-heat', amount: 50 }],
    effects: [
      { kind: 'resource', resource: 'mch-overheat', amount: 3 },
      { kind: 'schedule-action', actionId: 'mch-hypercharge-weave-proxy', delayMs: 1500, repeatEveryMs: 1500, repeatCount: 3 }
    ]
  }),
  action('mch-hypercharge-weave-proxy', 'Double Check or Checkmate (Hypercharge reset)', 'ogcd', 180, {
    animationLockMs: 0,
    referenceIds: mchAuditRefs
  }),
  ogcd('mch-double-check', 'Double Check', 180, 30_000, mchAuditRefs, {
    charges: 3
  }),
  ogcd('mch-checkmate', 'Checkmate', 180, 30_000, mchAuditRefs, {
    charges: 3
  }),
  ogcd('mch-wildfire', 'Wildfire', 0, 120_000, mchAuditRefs, {
    effects: [{ kind: 'schedule-action', actionId: 'mch-wildfire-detonator', delayMs: 10_000 }]
  }),
  action('mch-wildfire-detonator', 'Wildfire Detonator', 'ogcd', 1440, {
    animationLockMs: 0,
    criticalHitMode: 'disabled',
    directHitMode: 'disabled',
    referenceIds: mchAuditRefs
  }),
  ogcd('mch-reassemble', 'Reassemble', 0, 55_000, mchAuditRefs, {
    charges: 2,
    effects: [{ kind: 'buff', buffId: 'mch-reassemble', durationMs: 3000 }]
  }),
  ogcd('mch-automaton-queen', 'Automaton Queen (100 Battery)', 0, 6000, mchAuditRefs, {
    resourceCosts: [{ resource: 'mch-battery', amount: 100 }],
    effects: [
      { kind: 'schedule-action', actionId: 'mch-queen-arm-punch', delayMs: 5600, repeatEveryMs: 1500, repeatCount: 5 },
      { kind: 'schedule-action', actionId: 'mch-queen-pile-bunker', delayMs: 13_600 },
      { kind: 'schedule-action', actionId: 'mch-queen-crowned-collider', delayMs: 16_100 }
    ]
  }),
  action('mch-queen-arm-punch', 'Automaton Queen Arm Punch', 'pet', 240, {
    referenceIds: mchAuditRefs
  }),
  action('mch-queen-pile-bunker', 'Automaton Queen Pile Bunker', 'pet', 680, {
    referenceIds: mchAuditRefs
  }),
  action('mch-queen-crowned-collider', 'Automaton Queen Crowned Collider', 'pet', 780, {
    referenceIds: mchAuditRefs
  })
];

const MCH_RULES: CombatPriorityRule[] = [
  rule('mch-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', mchRefs),
  rule('mch-barrel', 'mch-barrel-stabilizer', [{ kind: 'cooldown-ready', actionId: 'mch-barrel-stabilizer' }], 'Enter the free Hypercharge and Full Metal burst window.', mchAuditRefs),
  rule('mch-wildfire', 'mch-wildfire', [{ kind: 'cooldown-ready', actionId: 'mch-wildfire' }], 'Apply the deterministic six-weaponskill Wildfire window.', mchAuditRefs),
  rule('mch-queen', 'mch-automaton-queen', [{ kind: 'resource-at-least', resource: 'mch-battery', amount: 100 }], 'Deploy the fixed 100-Battery Queen sequence.', mchAuditRefs),
  rule('mch-hypercharge', 'mch-hypercharge', [
    { kind: 'resource-at-least', resource: 'mch-heat', amount: 50 },
    { kind: 'resource-at-most', resource: 'mch-overheat', amount: 0 },
    { kind: 'cooldown-ready', actionId: 'mch-hypercharge' }
  ], 'Spend 50 Heat on the next three-shot Hypercharge sequence.', mchAuditRefs),
  rule('mch-reassemble', 'mch-reassemble', [
    { kind: 'cooldown-ready', actionId: 'mch-reassemble' },
    { kind: 'cooldown-ready', actionId: 'mch-drill' },
    { kind: 'resource-at-most', resource: 'mch-overheat', amount: 0 },
    { kind: 'buff-active', buffId: 'mch-reassemble', active: false }
  ], 'Prepare an available tool for a guaranteed Critical Direct Hit.', mchAuditRefs),
  rule('mch-double-check', 'mch-double-check', [{ kind: 'cooldown-ready', actionId: 'mch-double-check', minimumCharges: 1 }], 'Spend Double Check charges and expected Hypercharge resets.', mchAuditRefs),
  rule('mch-checkmate', 'mch-checkmate', [{ kind: 'cooldown-ready', actionId: 'mch-checkmate', minimumCharges: 1 }], 'Spend Checkmate charges and expected Hypercharge resets.', mchAuditRefs),
  rule('mch-blazing', 'mch-blazing-shot', [{ kind: 'resource-at-least', resource: 'mch-overheat', amount: 1 }], 'Consume each fixed 1.5-second Overheat stack.', mchAuditRefs),
  rule('mch-reassembled-drill', 'mch-drill', [
    { kind: 'buff-active', buffId: 'mch-reassemble', active: true },
    { kind: 'cooldown-ready', actionId: 'mch-drill' }
  ], 'Consume Reassemble on the prepared Drill rather than a Blazing Shot.', mchAuditRefs),
  rule('mch-excavator', 'mch-excavator', [{ kind: 'resource-at-least', resource: 'mch-excavator-ready', amount: 1 }], 'Follow Chain Saw with Excavator.', mchAuditRefs),
  rule('mch-full-metal', 'mch-full-metal-field', [{ kind: 'resource-at-least', resource: 'mch-full-metal-ready', amount: 1 }], 'Spend Barrel Stabilizer readiness on Full Metal Field.', mchAuditRefs),
  rule('mch-air-anchor', 'mch-air-anchor', [{ kind: 'cooldown-ready', actionId: 'mch-air-anchor' }], 'Use Air Anchor and generate Battery on cooldown.', mchAuditRefs),
  rule('mch-chain-saw', 'mch-chain-saw', [{ kind: 'cooldown-ready', actionId: 'mch-chain-saw' }], 'Use Chain Saw and prepare Excavator.', mchAuditRefs),
  rule('mch-drill-cap', 'mch-drill', [{ kind: 'cooldown-ready', actionId: 'mch-drill', minimumCharges: 2 }], 'Spend Drill before the second charge overcaps.', mchAuditRefs),
  rule('mch-drill', 'mch-drill', [{ kind: 'cooldown-ready', actionId: 'mch-drill' }], 'Use Drill when a charge is available.', mchAuditRefs),
  rule('mch-slug', 'mch-heated-slug', [{ kind: 'combo-step', comboId: 'mch-combo', step: 'slug' }], 'Continue the heated combo.', mchRefs),
  rule('mch-clean', 'mch-heated-clean', [{ kind: 'combo-step', comboId: 'mch-combo', step: 'clean' }], 'Complete the heated combo for Battery.', mchRefs),
  rule('mch-split', 'mch-heated-split', [{ kind: 'always' }], 'Begin the next heated combo.', mchRefs)
];

export const MCH_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'mch-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'MCH',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'mch-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: MCH_ACTIONS,
  priorityRules: MCH_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'MCH',
    'Machinist',
    'machinist',
    'packages/sims/src/ranged/mch/mch_sheet_sim.ts',
    'Used as an independent action, gauge, fixed Hypercharge, Wildfire and Automaton Queen trace cross-check; its source is not copied or distributed.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['mch-official-actions', 'mch-xivgear-oracle'],
    checks: [
      'Patch-7.5 heated combo, tool, Hypercharge, Wildfire, Full Metal Field and Automaton Queen action data.',
      'Pinned XivGear three-Blazing-Shot Hypercharge, six-hit Wildfire and 5.6-to-16.1-second Queen action trace.'
    ],
    limitations: [
      'Tool-cooldown drift avoidance is a stable generated priority rather than XivGear’s look-ahead scheduler.',
      'Queen uses the full 100-Battery trace and player damage scaling; partial-Battery deployment and XivGear pet-specific scaling are omitted.'
    ]
  },
  limitation: 'Independently cross-checked preliminary stationary priority. It uses fixed three-shot Hypercharge, six-hit Wildfire and 100-Battery Queen traces, with simplified tool drift, Reassemble and cooldown-reset scheduling.'
};

const mnkRefs = ['mnk-official-actions', 'mnk-internal-priority'];
const mnkAuditRefs = [...mnkRefs, 'mnk-xivgear-oracle'];
const MNK_ACTIONS: CombatActionProfile[] = [
  potion(mnkRefs),
  autoAttack(mnkRefs),
  gcd('mnk-dragon-kick', 'Dragon Kick', 320, mnkRefs, {
    effects: [
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-form', nextStep: 'raptor-one', durationMs: 30_000 }
    ]
  }),
  gcd('mnk-twin-snakes', 'Twin Snakes', 420, mnkRefs, {
    effects: [
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-form', nextStep: 'coeurl-one', durationMs: 30_000 }
    ]
  }),
  gcd('mnk-demolish', 'Demolish', 420, mnkRefs, {
    effects: [
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-form', nextStep: 'opo-two', durationMs: 30_000 }
    ]
  }),
  gcd('mnk-leaping-opo', 'Leaping Opo', 260, mnkAuditRefs, {
    criticalHitMode: 'guaranteed',
    effects: [
      { kind: 'resource', resource: 'chakra', amount: 1 },
      { kind: 'combo', comboId: 'mnk-form', nextStep: 'raptor-two', durationMs: 30_000 }
    ]
  }),
  gcd('mnk-rising-raptor', 'Rising Raptor', 340, mnkAuditRefs, {
    effects: [
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-form', nextStep: 'coeurl-two', durationMs: 30_000 }
    ]
  }),
  gcd('mnk-pouncing-coeurl', 'Pouncing Coeurl', 370, mnkAuditRefs, {
    effects: [
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-form', nextStep: 'opo-one', durationMs: 30_000 }
    ]
  }),
  ogcd('mnk-perfect-balance', 'Perfect Balance', 0, 40_000, mnkRefs, {
    charges: 2,
    effects: [
      { kind: 'resource', resource: 'perfect-balance', amount: 3 },
      { kind: 'combo', comboId: 'mnk-blitz', nextStep: 'opo', durationMs: 20_000 }
    ]
  }),
  gcd('mnk-pb-opo', 'Leaping Opo (Perfect Balance)', 260, mnkAuditRefs, {
    criticalHitMode: 'guaranteed',
    resourceCosts: [{ resource: 'perfect-balance', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'beast', amount: 1 },
      { kind: 'resource', resource: 'chakra', amount: 1 },
      { kind: 'combo', comboId: 'mnk-blitz', nextStep: 'raptor', durationMs: 20_000 }
    ]
  }),
  gcd('mnk-pb-raptor', 'Rising Raptor (Perfect Balance)', 340, mnkAuditRefs, {
    resourceCosts: [{ resource: 'perfect-balance', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'beast', amount: 1 },
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-blitz', nextStep: 'coeurl', durationMs: 20_000 }
    ]
  }),
  gcd('mnk-pb-coeurl', 'Pouncing Coeurl (Perfect Balance)', 370, mnkAuditRefs, {
    resourceCosts: [{ resource: 'perfect-balance', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'beast', amount: 1 },
      { kind: 'resource', resource: 'chakra', amount: 0.8 },
      { kind: 'combo', comboId: 'mnk-blitz', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('mnk-rising-phoenix', 'Rising Phoenix', 900, mnkAuditRefs, {
    resourceCosts: [{ resource: 'beast', amount: 3 }],
    effects: [{ kind: 'resource', resource: 'nadi', amount: 1 }]
  }),
  gcd('mnk-phantom-rush', 'Phantom Rush', 1500, mnkAuditRefs, {
    resourceCosts: [
      { resource: 'beast', amount: 3 },
      { resource: 'nadi', amount: 2 }
    ]
  }),
  ogcd('mnk-riddle-of-fire', 'Riddle of Fire', 0, 60_000, mnkRefs, {
    effects: [
      { kind: 'buff', buffId: 'mnk-riddle-of-fire', durationMs: 20_000, damageMultiplier: 1.15 },
      { kind: 'resource', resource: 'fire-reply-ready', amount: 1 }
    ]
  }),
  ogcd('mnk-brotherhood', 'Brotherhood', 0, 120_000, mnkRefs, {
    effects: [{ kind: 'buff', buffId: 'mnk-brotherhood', durationMs: 20_000, damageMultiplier: 1.05 }]
  }),
  ogcd('mnk-riddle-of-wind', 'Riddle of Wind', 0, 90_000, mnkRefs, {
    effects: [{ kind: 'resource', resource: 'wind-reply-ready', amount: 1 }]
  }),
  gcd('mnk-fires-reply', "Fire's Reply", 1400, mnkAuditRefs, {
    resourceCosts: [{ resource: 'fire-reply-ready', amount: 1 }]
  }),
  gcd('mnk-winds-reply', "Wind's Reply", 1040, mnkAuditRefs, {
    resourceCosts: [{ resource: 'wind-reply-ready', amount: 1 }]
  }),
  ogcd('mnk-forbidden-chakra', 'The Forbidden Chakra', 400, 1000, mnkRefs, {
    resourceCosts: [{ resource: 'chakra', amount: 5 }]
  })
];

const MNK_RULES: CombatPriorityRule[] = [
  rule('mnk-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', mnkRefs),
  rule('mnk-brotherhood', 'mnk-brotherhood', [{ kind: 'cooldown-ready', actionId: 'mnk-brotherhood' }], 'Use the personal Brotherhood damage effect on cooldown.', mnkRefs),
  rule('mnk-riddle-fire', 'mnk-riddle-of-fire', [{ kind: 'cooldown-ready', actionId: 'mnk-riddle-of-fire' }], 'Enter the personal fire burst window on cooldown.', mnkRefs),
  rule('mnk-riddle-wind', 'mnk-riddle-of-wind', [{ kind: 'cooldown-ready', actionId: 'mnk-riddle-of-wind' }], 'Generate Wind Resonance on cooldown.', mnkRefs),
  rule('mnk-perfect-balance', 'mnk-perfect-balance', [
    { kind: 'cooldown-ready', actionId: 'mnk-perfect-balance' },
    { kind: 'resource-at-most', resource: 'perfect-balance', amount: 0 },
    { kind: 'resource-at-most', resource: 'beast', amount: 0 }
  ], 'Begin the next deterministic Beast Chakra sequence.', mnkAuditRefs),
  rule('mnk-fire-reply', 'mnk-fires-reply', [{ kind: 'resource-at-least', resource: 'fire-reply-ready', amount: 1 }], 'Spend Fire Resonance inside the burst window.', mnkAuditRefs),
  rule('mnk-wind-reply', 'mnk-winds-reply', [{ kind: 'resource-at-least', resource: 'wind-reply-ready', amount: 1 }], 'Spend Wind Resonance.', mnkAuditRefs),
  rule('mnk-phantom-rush', 'mnk-phantom-rush', [
    { kind: 'resource-at-least', resource: 'beast', amount: 3 },
    { kind: 'resource-at-least', resource: 'nadi', amount: 2 }
  ], 'Spend both nadi on Phantom Rush.', mnkAuditRefs),
  rule('mnk-rising-phoenix', 'mnk-rising-phoenix', [{ kind: 'resource-at-least', resource: 'beast', amount: 3 }], 'Open a nadi with Rising Phoenix.', mnkAuditRefs),
  rule('mnk-pb-opo', 'mnk-pb-opo', [{ kind: 'combo-step', comboId: 'mnk-blitz', step: 'opo' }], 'Open the Perfect Balance sequence.', mnkAuditRefs),
  rule('mnk-pb-raptor', 'mnk-pb-raptor', [{ kind: 'combo-step', comboId: 'mnk-blitz', step: 'raptor' }], 'Continue the Perfect Balance sequence.', mnkAuditRefs),
  rule('mnk-pb-coeurl', 'mnk-pb-coeurl', [{ kind: 'combo-step', comboId: 'mnk-blitz', step: 'coeurl' }], 'Complete the Perfect Balance sequence.', mnkAuditRefs),
  rule('mnk-chakra', 'mnk-forbidden-chakra', [{ kind: 'resource-at-least', resource: 'chakra', amount: 5 }], 'Spend expected-value Chakra without random rolls.', mnkRefs),
  rule('mnk-twin', 'mnk-twin-snakes', [{ kind: 'combo-step', comboId: 'mnk-form', step: 'raptor-one' }], 'Continue the deterministic fury cycle.', mnkRefs),
  rule('mnk-demolish', 'mnk-demolish', [{ kind: 'combo-step', comboId: 'mnk-form', step: 'coeurl-one' }], 'Continue the deterministic fury cycle.', mnkRefs),
  rule('mnk-leaping', 'mnk-leaping-opo', [{ kind: 'combo-step', comboId: 'mnk-form', step: 'opo-two' }], 'Spend Opo-opo Fury.', mnkAuditRefs),
  rule('mnk-rising', 'mnk-rising-raptor', [{ kind: 'combo-step', comboId: 'mnk-form', step: 'raptor-two' }], 'Spend Raptor Fury.', mnkAuditRefs),
  rule('mnk-pouncing', 'mnk-pouncing-coeurl', [{ kind: 'combo-step', comboId: 'mnk-form', step: 'coeurl-two' }], 'Spend Coeurl Fury.', mnkAuditRefs),
  rule('mnk-dragon', 'mnk-dragon-kick', [{ kind: 'always' }], 'Begin or restart the deterministic form cycle.', mnkRefs)
];

export const MNK_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'mnk-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'MNK',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'mnk-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: MNK_ACTIONS,
  priorityRules: MNK_RULES,
  openers: [],
  assumptions,
  references: referencesFor('MNK', 'Monk', 'monk', 'packages/sims/src/melee/mnk/mnk_sim.ts', 'Used as an independent action-data and trace-structure check for forms, Blitz, nadi and reply actions.'),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['mnk-official-actions', 'mnk-xivgear-oracle'],
    checks: ['Level-100 form and fury potencies, permanent 20% Greased Lightning haste, reply actions and Blitz/nadi cadence.'],
    limitations: ['Chakra generation is deterministic expected value and does not reproduce individual critical-hit openings.', 'Perfect Balance uses a stable three-form generated sequence rather than a community opener-specific Blitz route.']
  },
  limitation: 'Generated stationary-dummy priority with expected-value Chakra and a deterministic Perfect Balance sequence. It excludes encounter movement, party-generated Brotherhood Chakra and exact community opener alignment.'
};

const drgRefs = ['drg-official-actions', 'drg-internal-priority'];
const drgAuditRefs = [...drgRefs, 'drg-xivgear-oracle'];
const DRG_ACTIONS: CombatActionProfile[] = [
  potion(drgRefs),
  autoAttack(drgRefs),
  gcd('drg-raiden-thrust', 'Raiden Thrust', 320, drgRefs, {
    effects: [
      { kind: 'resource', resource: 'focus', amount: 1 },
      { kind: 'combo', comboId: 'drg-combo', nextStep: 'choose', durationMs: 30_000 }
    ]
  }),
  gcd('drg-spiral-blow', 'Spiral Blow', 300, drgRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'chaotic', durationMs: 30_000 }]
  }),
  gcd('drg-chaotic-spring', 'Chaotic Spring', 340, drgRefs, {
    effects: [
      { kind: 'dot', dotId: 'drg-chaotic-spring', durationMs: 24_000, tickPotency: 45 },
      { kind: 'combo', comboId: 'drg-combo', nextStep: 'wheeling-a', durationMs: 30_000 }
    ]
  }),
  gcd('drg-wheeling-a', 'Wheeling Thrust', 340, drgAuditRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'fang-a', durationMs: 30_000 }]
  }),
  gcd('drg-fang-a', 'Fang and Claw', 340, drgAuditRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'drake-a', durationMs: 30_000 }]
  }),
  gcd('drg-drakesbane-a', 'Drakesbane', 460, drgRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'start', durationMs: 1 }]
  }),
  gcd('drg-lance-barrage', 'Lance Barrage', 340, drgRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'heavens', durationMs: 30_000 }]
  }),
  gcd('drg-heavens-thrust', "Heavens' Thrust", 460, drgRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'fang-b', durationMs: 30_000 }]
  }),
  gcd('drg-fang-b', 'Fang and Claw', 340, drgAuditRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'wheeling-b', durationMs: 30_000 }]
  }),
  gcd('drg-wheeling-b', 'Wheeling Thrust', 340, drgAuditRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'drake-b', durationMs: 30_000 }]
  }),
  gcd('drg-drakesbane-b', 'Drakesbane', 460, drgRefs, {
    effects: [{ kind: 'combo', comboId: 'drg-combo', nextStep: 'start', durationMs: 1 }]
  }),
  ogcd('drg-lance-charge', 'Lance Charge', 0, 60_000, drgRefs, {
    effects: [{ kind: 'buff', buffId: 'drg-lance-charge', durationMs: 20_000, damageMultiplier: 1.1 }]
  }),
  ogcd('drg-battle-litany', 'Battle Litany', 0, 120_000, drgRefs, {
    effects: [{ kind: 'buff', buffId: 'drg-battle-litany', durationMs: 20_000 }]
  }),
  ogcd('drg-geirskogul', 'Geirskogul', 280, 60_000, drgRefs, {
    effects: [
      { kind: 'buff', buffId: 'drg-life-of-dragon', durationMs: 20_000, damageMultiplier: 1.15 },
      { kind: 'resource', resource: 'nastrond-ready', amount: 3 }
    ]
  }),
  ogcd('drg-nastrond', 'Nastrond', 720, 10_000, drgRefs, {
    resourceCosts: [{ resource: 'nastrond-ready', amount: 1 }]
  }),
  ogcd('drg-high-jump', 'High Jump', 400, 30_000, drgRefs, {
    effects: [{ kind: 'resource', resource: 'mirage-ready', amount: 1 }]
  }),
  ogcd('drg-mirage-dive', 'Mirage Dive', 380, 1000, drgRefs, {
    resourceCosts: [{ resource: 'mirage-ready', amount: 1 }]
  }),
  ogcd('drg-dragonfire-dive', 'Dragonfire Dive', 500, 120_000, drgRefs, {
    effects: [{ kind: 'resource', resource: 'rise-ready', amount: 1 }]
  }),
  ogcd('drg-rise-of-dragon', 'Rise of the Dragon', 550, 1000, drgAuditRefs, {
    resourceCosts: [{ resource: 'rise-ready', amount: 1 }]
  }),
  ogcd('drg-stardiver', 'Stardiver', 840, 30_000, drgRefs, {
    effects: [{ kind: 'resource', resource: 'starcross-ready', amount: 1 }]
  }),
  ogcd('drg-starcross', 'Starcross', 1000, 1000, drgAuditRefs, {
    resourceCosts: [{ resource: 'starcross-ready', amount: 1 }]
  }),
  ogcd('drg-wyrmwind-thrust', 'Wyrmwind Thrust', 440, 1000, drgRefs, {
    resourceCosts: [{ resource: 'focus', amount: 2 }]
  })
];

const DRG_RULES: CombatPriorityRule[] = [
  rule('drg-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', drgRefs),
  rule('drg-lance-charge', 'drg-lance-charge', [{ kind: 'cooldown-ready', actionId: 'drg-lance-charge' }], 'Use the personal damage buff on cooldown.', drgRefs),
  rule('drg-litany', 'drg-battle-litany', [{ kind: 'cooldown-ready', actionId: 'drg-battle-litany' }], 'Use the personal critical-rate component on cooldown.', drgRefs),
  rule('drg-geirskogul', 'drg-geirskogul', [{ kind: 'cooldown-ready', actionId: 'drg-geirskogul' }], 'Enter Life of the Dragon on cooldown.', drgRefs),
  rule('drg-nastrond', 'drg-nastrond', [
    { kind: 'resource-at-least', resource: 'nastrond-ready', amount: 1 },
    { kind: 'cooldown-ready', actionId: 'drg-nastrond' }
  ], 'Spend each Nastrond use during Life of the Dragon.', drgRefs),
  rule('drg-stardiver', 'drg-stardiver', [
    { kind: 'buff-active', buffId: 'drg-life-of-dragon', active: true },
    { kind: 'cooldown-ready', actionId: 'drg-stardiver' }
  ], 'Use Stardiver during Life of the Dragon.', drgRefs),
  rule('drg-starcross', 'drg-starcross', [{ kind: 'resource-at-least', resource: 'starcross-ready', amount: 1 }], 'Follow Stardiver with Starcross.', drgAuditRefs),
  rule('drg-dragonfire', 'drg-dragonfire-dive', [{ kind: 'cooldown-ready', actionId: 'drg-dragonfire-dive' }], 'Use Dragonfire Dive on cooldown.', drgRefs),
  rule('drg-rise', 'drg-rise-of-dragon', [{ kind: 'resource-at-least', resource: 'rise-ready', amount: 1 }], 'Spend Dragon Flight on Rise of the Dragon.', drgAuditRefs),
  rule('drg-jump', 'drg-high-jump', [{ kind: 'cooldown-ready', actionId: 'drg-high-jump' }], 'Use High Jump on cooldown.', drgRefs),
  rule('drg-mirage', 'drg-mirage-dive', [{ kind: 'resource-at-least', resource: 'mirage-ready', amount: 1 }], 'Follow High Jump with Mirage Dive.', drgRefs),
  rule('drg-wyrmwind', 'drg-wyrmwind-thrust', [{ kind: 'resource-at-least', resource: 'focus', amount: 2 }], 'Spend two Firstminds Focus.', drgRefs),
  rule('drg-chaotic', 'drg-chaotic-spring', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'chaotic' }], 'Apply Chaotic Spring.', drgRefs),
  rule('drg-wheeling-a', 'drg-wheeling-a', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'wheeling-a' }], 'Continue the Chaotic Spring branch.', drgAuditRefs),
  rule('drg-fang-a', 'drg-fang-a', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'fang-a' }], 'Continue the Chaotic Spring branch.', drgAuditRefs),
  rule('drg-drake-a', 'drg-drakesbane-a', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'drake-a' }], 'Finish the Chaotic Spring branch.', drgRefs),
  rule('drg-heavens', 'drg-heavens-thrust', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'heavens' }], 'Continue the Heavens Thrust branch.', drgRefs),
  rule('drg-fang-b', 'drg-fang-b', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'fang-b' }], 'Continue the Heavens Thrust branch.', drgAuditRefs),
  rule('drg-wheeling-b', 'drg-wheeling-b', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'wheeling-b' }], 'Continue the Heavens Thrust branch.', drgAuditRefs),
  rule('drg-drake-b', 'drg-drakesbane-b', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'drake-b' }], 'Finish the Heavens Thrust branch.', drgRefs),
  rule('drg-spiral-refresh', 'drg-spiral-blow', [
    { kind: 'combo-step', comboId: 'drg-combo', step: 'choose' },
    { kind: 'dot-remaining-at-most', dotId: 'drg-chaotic-spring', durationMs: 3000 }
  ], 'Route through Chaotic Spring before its DoT expires.', drgRefs),
  rule('drg-lance', 'drg-lance-barrage', [{ kind: 'combo-step', comboId: 'drg-combo', step: 'choose' }], 'Use the direct-damage branch while the DoT is healthy.', drgRefs),
  rule('drg-raiden', 'drg-raiden-thrust', [{ kind: 'always' }], 'Begin the next five-part combo.', drgRefs)
];

export const DRG_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'drg-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'DRG',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'drg-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: DRG_ACTIONS,
  priorityRules: DRG_RULES,
  openers: [],
  assumptions,
  references: referencesFor('DRG', 'Dragoon', 'dragoon', 'packages/sims/src/melee/drg/drg_sim.ts', 'Used as an independent action-data and trace-structure check for the two combo branches and Life of the Dragon actions.'),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['drg-official-actions', 'drg-xivgear-oracle'],
    checks: ['Level-100 combo potencies, Chaotic Spring DoT upkeep, Battle Litany, Life of the Dragon and jump follow-ups.'],
    limitations: ['Life Surge guaranteed-critical routing is omitted.', 'Animation-lock-specific jump placement and exact community opener alignment are not reproduced.']
  },
  limitation: 'Generated stationary-dummy priority covering both combo branches and the complete Life of the Dragon damage chain. It omits Life Surge routing, encounter movement and exact community opener alignment.'
};

const ninRefs = ['nin-official-actions', 'nin-internal-priority'];
const ninAuditRefs = [...ninRefs, 'nin-xivgear-oracle'];
const NIN_ACTIONS: CombatActionProfile[] = [
  potion(ninRefs),
  autoAttack(ninRefs),
  action('nin-bunshin-hit', 'Bunshin attack', 'pet', 160, { referenceIds: ninAuditRefs }),
  gcd('nin-spinning-edge', 'Spinning Edge', 300, ninRefs, {
    effects: [{ kind: 'combo', comboId: 'nin-combo', nextStep: 'gust', durationMs: 30_000 }]
  }),
  gcd('nin-gust-slash', 'Gust Slash', 400, ninRefs, {
    effects: [{ kind: 'combo', comboId: 'nin-combo', nextStep: 'finish', durationMs: 30_000 }]
  }),
  gcd('nin-armor-crush', 'Armor Crush', 500, ninRefs, {
    effects: [
      { kind: 'resource', resource: 'ninki', amount: 15 },
      { kind: 'resource', resource: 'kazematoi', amount: 2 },
      { kind: 'combo', comboId: 'nin-combo', nextStep: 'start', durationMs: 1 }
    ]
  }),
  gcd('nin-aeolian-edge', 'Aeolian Edge', 460, ninRefs, {
    resourceCosts: [{ resource: 'kazematoi', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'ninki', amount: 15 },
      { kind: 'combo', comboId: 'nin-combo', nextStep: 'start', durationMs: 1 }
    ]
  }),
  gcd('nin-raiton', 'Raiton', 740, ninRefs, {
    recastMs: 1500,
    cooldownMs: 20_000,
    charges: 2,
    speedScaling: 'none',
    effects: [{ kind: 'resource', resource: 'raiju-ready', amount: 1 }]
  }),
  gcd('nin-fleeting-raiju', 'Fleeting Raiju', 700, ninRefs, {
    resourceCosts: [{ resource: 'raiju-ready', amount: 1 }]
  }),
  ogcd('nin-kassatsu', 'Kassatsu', 0, 60_000, ninRefs, {
    effects: [{ kind: 'resource', resource: 'kassatsu-ready', amount: 1 }]
  }),
  gcd('nin-hyosho-ranryu', 'Hyosho Ranryu', 1300, ninRefs, {
    recastMs: 1500,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'kassatsu-ready', amount: 1 }]
  }),
  gcd('nin-suiton', 'Suiton', 580, ninRefs, {
    recastMs: 1500,
    cooldownMs: 60_000,
    speedScaling: 'none',
    effects: [{ kind: 'resource', resource: 'kunai-ready', amount: 1 }]
  }),
  ogcd('nin-kunais-bane', "Kunai's Bane", 700, 60_000, ninAuditRefs, {
    resourceCosts: [{ resource: 'kunai-ready', amount: 1 }],
    effects: [{ kind: 'buff', buffId: 'nin-kunais-bane', durationMs: 15_000, damageMultiplier: 1.1 }]
  }),
  ogcd('nin-dokumori', 'Dokumori', 400, 120_000, ninRefs, {
    effects: [
      { kind: 'buff', buffId: 'nin-dokumori', durationMs: 20_000, damageMultiplier: 1.05 },
      { kind: 'resource', resource: 'ninki', amount: 40 },
      { kind: 'resource', resource: 'higi-ready', amount: 1 }
    ]
  }),
  ogcd('nin-meisui', 'Meisui', 0, 120_000, ninRefs, {
    effects: [{ kind: 'resource', resource: 'ninki', amount: 50 }]
  }),
  ogcd('nin-bunshin', 'Bunshin', 0, 90_000, ninRefs, {
    resourceCosts: [{ resource: 'ninki', amount: 50 }],
    effects: [
      { kind: 'schedule-action', actionId: 'nin-bunshin-hit', delayMs: 1000, repeatEveryMs: 2500, repeatCount: 5 },
      { kind: 'resource', resource: 'phantom-ready', amount: 1 }
    ]
  }),
  gcd('nin-phantom-kamaitachi', 'Phantom Kamaitachi', 700, ninRefs, {
    resourceCosts: [{ resource: 'phantom-ready', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'ninki', amount: 10 }]
  }),
  ogcd('nin-zesho-meppo', 'Zesho Meppo', 700, 1000, ninAuditRefs, {
    resourceCosts: [
      { resource: 'higi-ready', amount: 1 },
      { resource: 'ninki', amount: 50 }
    ]
  }),
  ogcd('nin-bhavacakra', 'Bhavacakra', 400, 1000, ninRefs, {
    resourceCosts: [{ resource: 'ninki', amount: 50 }]
  }),
  ogcd('nin-dream', 'Dream Within a Dream', 540, 60_000, ninRefs),
  gcd('nin-ten-chi-jin', 'Ten Chi Jin sequence', 1820, ninAuditRefs, {
    recastMs: 3000,
    cooldownMs: 120_000,
    speedScaling: 'none',
    effects: [{ kind: 'resource', resource: 'tenri-ready', amount: 1 }]
  }),
  gcd('nin-tenri-jindo', 'Tenri Jindo', 1100, ninAuditRefs, {
    recastMs: 1500,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tenri-ready', amount: 1 }]
  })
];

const NIN_RULES: CombatPriorityRule[] = [
  rule('nin-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', ninRefs),
  rule('nin-dokumori', 'nin-dokumori', [{ kind: 'cooldown-ready', actionId: 'nin-dokumori' }], 'Apply the personal Dokumori vulnerability window.', ninRefs),
  rule('nin-kassatsu', 'nin-kassatsu', [{ kind: 'cooldown-ready', actionId: 'nin-kassatsu' }], 'Prepare Hyosho Ranryu.', ninRefs),
  rule('nin-kunai', 'nin-kunais-bane', [{ kind: 'resource-at-least', resource: 'kunai-ready', amount: 1 }], 'Apply the Kunai Bane personal damage window.', ninAuditRefs),
  rule('nin-meisui', 'nin-meisui', [
    { kind: 'cooldown-ready', actionId: 'nin-meisui' },
    { kind: 'resource-at-most', resource: 'ninki', amount: 50 }
  ], 'Generate Ninki without overcap.', ninRefs),
  rule('nin-zesho', 'nin-zesho-meppo', [
    { kind: 'resource-at-least', resource: 'higi-ready', amount: 1 },
    { kind: 'resource-at-least', resource: 'ninki', amount: 50 }
  ], 'Spend Higi and Ninki on Zesho Meppo.', ninAuditRefs),
  rule('nin-bunshin', 'nin-bunshin', [
    { kind: 'cooldown-ready', actionId: 'nin-bunshin' },
    { kind: 'resource-at-least', resource: 'ninki', amount: 50 }
  ], 'Spend Ninki on Bunshin and unlock Phantom Kamaitachi.', ninRefs),
  rule('nin-dream', 'nin-dream', [{ kind: 'cooldown-ready', actionId: 'nin-dream' }], 'Use Dream Within a Dream on cooldown.', ninRefs),
  rule('nin-bhava', 'nin-bhavacakra', [{ kind: 'resource-at-least', resource: 'ninki', amount: 85 }], 'Prevent Ninki overcap.', ninRefs),
  rule('nin-tenri', 'nin-tenri-jindo', [{ kind: 'resource-at-least', resource: 'tenri-ready', amount: 1 }], 'Finish Ten Chi Jin with Tenri Jindo.', ninAuditRefs),
  rule('nin-hyosho', 'nin-hyosho-ranryu', [{ kind: 'resource-at-least', resource: 'kassatsu-ready', amount: 1 }], 'Spend Kassatsu on Hyosho Ranryu.', ninRefs),
  rule('nin-phantom', 'nin-phantom-kamaitachi', [{ kind: 'resource-at-least', resource: 'phantom-ready', amount: 1 }], 'Spend Phantom Kamaitachi readiness.', ninRefs),
  rule('nin-raiju', 'nin-fleeting-raiju', [{ kind: 'resource-at-least', resource: 'raiju-ready', amount: 1 }], 'Spend Raiju readiness before a melee weaponskill.', ninRefs),
  rule('nin-tcj', 'nin-ten-chi-jin', [{ kind: 'cooldown-ready', actionId: 'nin-ten-chi-jin' }], 'Execute the fixed Ten Chi Jin ninjutsu sequence.', ninAuditRefs),
  rule('nin-suiton', 'nin-suiton', [{ kind: 'cooldown-ready', actionId: 'nin-suiton' }], 'Prepare Kunai Bane with Suiton.', ninRefs),
  rule('nin-raiton', 'nin-raiton', [{ kind: 'cooldown-ready', actionId: 'nin-raiton', minimumCharges: 2 }], 'Avoid overcapping Mudra charges.', ninRefs),
  rule('nin-gust', 'nin-gust-slash', [{ kind: 'combo-step', comboId: 'nin-combo', step: 'gust' }], 'Continue the weaponskill combo.', ninRefs),
  rule('nin-armor', 'nin-armor-crush', [
    { kind: 'combo-step', comboId: 'nin-combo', step: 'finish' },
    { kind: 'resource-at-most', resource: 'kazematoi', amount: 0 }
  ], 'Restore Kazematoi.', ninRefs),
  rule('nin-aeolian', 'nin-aeolian-edge', [{ kind: 'combo-step', comboId: 'nin-combo', step: 'finish' }], 'Spend Kazematoi on Aeolian Edge.', ninRefs),
  rule('nin-spinning', 'nin-spinning-edge', [{ kind: 'always' }], 'Begin the next melee combo.', ninRefs)
];

export const NIN_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'nin-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'NIN',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'nin-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: NIN_ACTIONS,
  priorityRules: NIN_RULES,
  openers: [],
  assumptions,
  references: referencesFor('NIN', 'Ninja', 'ninja', 'packages/sims/src/melee/nin/nin_lv100_sim.ts', 'Used as an independent action-data and trace-structure check for Ninki, Mudra aggregates, Kunai Bane and Dokumori windows.'),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['nin-official-actions', 'nin-xivgear-oracle'],
    checks: ['Level-100 combo and Ninki potencies, permanent 15% speed trait, Raiton/Raiju, Kunai Bane, Dokumori and major two-minute actions.'],
    limitations: ['Mudra inputs and Ten Chi Jin are timing-safe aggregate actions rather than individual button presses.', 'Bunshin uses a fixed five-hit schedule and does not reproduce every action-specific shadow potency distinction.']
  },
  limitation: 'Generated stationary-dummy priority with aggregate Mudra sequences and fixed Bunshin scheduling. It excludes latency-sensitive Mudra execution, encounter movement and exact community opener alignment.'
};

const rprRefs = ['rpr-official-actions', 'rpr-internal-priority'];
const rprAuditRefs = [...rprRefs, 'rpr-xivgear-oracle'];
const RPR_ACTIONS: CombatActionProfile[] = [
  potion(rprRefs),
  autoAttack(rprRefs),
  gcd('rpr-shadow-of-death', 'Shadow of Death', 300, rprRefs, {
    effects: [{ kind: 'buff', buffId: 'rpr-deaths-design', durationMs: 30_000, damageMultiplier: 1.1 }]
  }),
  gcd('rpr-slice', 'Slice', 420, rprRefs, {
    effects: [
      { kind: 'resource', resource: 'soul', amount: 10 },
      { kind: 'combo', comboId: 'rpr-combo', nextStep: 'waxing', durationMs: 30_000 }
    ]
  }),
  gcd('rpr-waxing-slice', 'Waxing Slice', 500, rprRefs, {
    effects: [
      { kind: 'resource', resource: 'soul', amount: 10 },
      { kind: 'combo', comboId: 'rpr-combo', nextStep: 'infernal', durationMs: 30_000 }
    ]
  }),
  gcd('rpr-infernal-slice', 'Infernal Slice', 600, rprRefs, {
    effects: [
      { kind: 'resource', resource: 'soul', amount: 10 },
      { kind: 'combo', comboId: 'rpr-combo', nextStep: 'start', durationMs: 1 }
    ]
  }),
  gcd('rpr-soul-slice', 'Soul Slice', 520, rprRefs, {
    cooldownMs: 30_000,
    charges: 2,
    effects: [{ kind: 'resource', resource: 'soul', amount: 50 }]
  }),
  ogcd('rpr-arcane-circle', 'Arcane Circle', 0, 120_000, rprRefs, {
    effects: [
      { kind: 'buff', buffId: 'rpr-arcane-circle', durationMs: 20_000, damageMultiplier: 1.03 },
      { kind: 'resource', resource: 'sacrifice', amount: 1 }
    ]
  }),
  gcd('rpr-plentiful-harvest', 'Plentiful Harvest', 720, rprAuditRefs, {
    resourceCosts: [{ resource: 'sacrifice', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'shroud', amount: 50 }]
  }),
  ogcd('rpr-gluttony', 'Gluttony', 560, 60_000, rprRefs, {
    resourceCosts: [{ resource: 'soul', amount: 50 }],
    effects: [{ kind: 'resource', resource: 'executioner', amount: 2 }]
  }),
  gcd('rpr-executioners-gibbet', "Executioner's Gibbet", 820, rprAuditRefs, {
    resourceCosts: [{ resource: 'executioner', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'shroud', amount: 10 }]
  }),
  ogcd('rpr-unveiled-gibbet', 'Unveiled Gibbet', 440, 1000, rprRefs, {
    resourceCosts: [{ resource: 'soul', amount: 50 }],
    effects: [{ kind: 'resource', resource: 'shroud', amount: 10 }]
  }),
  ogcd('rpr-enshroud', 'Enshroud', 0, 1000, rprRefs, {
    resourceCosts: [{ resource: 'shroud', amount: 50 }],
    effects: [{ kind: 'resource', resource: 'lemure', amount: 5 }]
  }),
  gcd('rpr-void-reaping', 'Void Reaping', 640, rprRefs, {
    recastMs: 1500,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'lemure', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'void-shroud', amount: 1 }]
  }),
  ogcd('rpr-lemures-slice', "Lemure's Slice", 280, 1000, rprRefs, {
    resourceCosts: [{ resource: 'void-shroud', amount: 2 }]
  }),
  spellGcd('rpr-communio', 'Communio', 1100, rprRefs, {
    recastMs: 2500,
    castMs: 1300,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'lemure', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'perfectio-ready', amount: 1 }]
  }),
  gcd('rpr-perfectio', 'Perfectio', 1300, rprAuditRefs, {
    resourceCosts: [{ resource: 'perfectio-ready', amount: 1 }]
  }),
  gcd('rpr-harvest-moon', 'Harvest Moon', 800, rprRefs, {
    resourceCosts: [{ resource: 'harvest-moon-ready', amount: 1 }]
  })
];

const RPR_RULES: CombatPriorityRule[] = [
  rule('rpr-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', rprRefs),
  rule('rpr-arcane-circle', 'rpr-arcane-circle', [{ kind: 'cooldown-ready', actionId: 'rpr-arcane-circle' }], 'Use the personal Arcane Circle damage effect on cooldown.', rprRefs),
  rule('rpr-lemure-slice', 'rpr-lemures-slice', [{ kind: 'resource-at-least', resource: 'void-shroud', amount: 2 }], 'Spend two Void Shroud between Reaping GCDs.', rprRefs),
  rule('rpr-enshroud', 'rpr-enshroud', [
    { kind: 'resource-at-least', resource: 'shroud', amount: 50 },
    { kind: 'resource-at-most', resource: 'lemure', amount: 0 }
  ], 'Enter Enshroud when sufficient Shroud is available.', rprRefs),
  rule('rpr-gluttony', 'rpr-gluttony', [
    { kind: 'cooldown-ready', actionId: 'rpr-gluttony' },
    { kind: 'resource-at-least', resource: 'soul', amount: 50 }
  ], 'Spend Soul on Gluttony and its Executioner follow-ups.', rprRefs),
  rule('rpr-unveiled', 'rpr-unveiled-gibbet', [{ kind: 'resource-at-least', resource: 'soul', amount: 90 }], 'Prevent Soul overcap when Gluttony is unavailable.', rprRefs),
  rule('rpr-perfectio', 'rpr-perfectio', [{ kind: 'resource-at-least', resource: 'perfectio-ready', amount: 1 }], 'Follow Communio with Perfectio.', rprAuditRefs),
  rule('rpr-communio', 'rpr-communio', [
    { kind: 'resource-at-least', resource: 'lemure', amount: 1 },
    { kind: 'resource-at-most', resource: 'lemure', amount: 1 }
  ], 'Finish the Enshroud sequence with Communio.', rprRefs),
  rule('rpr-reaping', 'rpr-void-reaping', [{ kind: 'resource-at-least', resource: 'lemure', amount: 2 }], 'Spend Lemure Shroud on Reaping GCDs.', rprRefs),
  rule('rpr-plentiful', 'rpr-plentiful-harvest', [{ kind: 'resource-at-least', resource: 'sacrifice', amount: 1 }], 'Spend the self-generated Immortal Sacrifice stack.', rprAuditRefs),
  rule('rpr-executioner', 'rpr-executioners-gibbet', [{ kind: 'resource-at-least', resource: 'executioner', amount: 1 }], 'Spend Executioner stacks.', rprAuditRefs),
  rule('rpr-shadow', 'rpr-shadow-of-death', [{ kind: 'buff-remaining-at-most', buffId: 'rpr-deaths-design', durationMs: 3000 }], 'Maintain Death Design.', rprRefs),
  rule('rpr-harvest-moon', 'rpr-harvest-moon', [{ kind: 'resource-at-least', resource: 'harvest-moon-ready', amount: 1 }], 'Spend the pre-combat Soulsow charge.', rprRefs),
  rule('rpr-soul-slice', 'rpr-soul-slice', [{ kind: 'cooldown-ready', actionId: 'rpr-soul-slice', minimumCharges: 2 }], 'Avoid overcapping Soul Slice charges.', rprRefs),
  rule('rpr-waxing', 'rpr-waxing-slice', [{ kind: 'combo-step', comboId: 'rpr-combo', step: 'waxing' }], 'Continue the Soul combo.', rprRefs),
  rule('rpr-infernal', 'rpr-infernal-slice', [{ kind: 'combo-step', comboId: 'rpr-combo', step: 'infernal' }], 'Complete the Soul combo.', rprRefs),
  rule('rpr-slice', 'rpr-slice', [{ kind: 'always' }], 'Begin the next Soul combo.', rprRefs)
];

export const RPR_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'rpr-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'RPR',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'rpr-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: RPR_ACTIONS,
  priorityRules: RPR_RULES,
  openers: [],
  assumptions,
  references: referencesFor('RPR', 'Reaper', 'reaper', 'packages/sims/src/melee/rpr/rpr_sheet_sim.ts', 'Used as an independent action-data and trace-structure check for gauges, Executioner and Enshroud sequencing.'),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['rpr-official-actions', 'rpr-xivgear-oracle'],
    checks: ['Level-100 Soul/Shroud actions, Death Design, Arcane Circle, Executioner, Enshroud, Communio and Perfectio.'],
    limitations: ['Plentiful Harvest uses the self-generated one-stack potency because external party actions are disabled.', 'Alternating positional bonuses are represented by stable single-target expected potencies.']
  },
  limitation: 'Generated stationary-dummy priority with a one-stack personal Plentiful Harvest and deterministic Enshroud sequence. It excludes party-generated Immortal Sacrifice, movement and exact community opener alignment.'
};

const vprRefs = ['vpr-official-actions', 'vpr-internal-priority'];
const vprAuditRefs = [...vprRefs, 'vpr-xivgear-oracle'];
const VPR_ACTIONS: CombatActionProfile[] = [
  potion(vprRefs),
  autoAttack(vprRefs),
  gcd('vpr-steel-fangs', 'Steel Fangs', 200, vprRefs, {
    effects: [{ kind: 'combo', comboId: 'vpr-combo', nextStep: 'hunter', durationMs: 30_000 }]
  }),
  gcd('vpr-hunters-sting', "Hunter's Sting", 300, vprRefs, {
    effects: [
      { kind: 'buff', buffId: 'vpr-hunters-instinct', durationMs: 40_000, damageMultiplier: 1.1 },
      { kind: 'combo', comboId: 'vpr-combo', nextStep: 'flank', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-flanksting', 'Flanksting Strike', 400, vprRefs, {
    effects: [
      { kind: 'resource', resource: 'offerings', amount: 10 },
      { kind: 'resource', resource: 'tail-ready', amount: 1 },
      { kind: 'combo', comboId: 'vpr-combo', nextStep: 'reaving', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-reaving-fangs', 'Reaving Fangs', 200, vprRefs, {
    effects: [{ kind: 'combo', comboId: 'vpr-combo', nextStep: 'swiftskin', durationMs: 30_000 }]
  }),
  gcd('vpr-swiftskins-sting', "Swiftskin's Sting", 300, vprRefs, {
    effects: [
      { kind: 'buff', buffId: 'vpr-swiftscaled', durationMs: 40_000, hastePercent: 15 },
      { kind: 'combo', comboId: 'vpr-combo', nextStep: 'hind', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-hindsting', 'Hindsting Strike', 400, vprRefs, {
    effects: [
      { kind: 'resource', resource: 'offerings', amount: 10 },
      { kind: 'resource', resource: 'tail-ready', amount: 1 },
      { kind: 'combo', comboId: 'vpr-combo', nextStep: 'start', durationMs: 1 }
    ]
  }),
  ogcd('vpr-death-rattle', 'Death Rattle', 280, 1000, vprRefs, {
    resourceCosts: [{ resource: 'tail-ready', amount: 1 }]
  }),
  gcd('vpr-vicewinder', 'Vicewinder', 540, vprRefs, {
    recastMs: 3000,
    cooldownMs: 40_000,
    charges: 2,
    speedScaling: 'none',
    effects: [
      { kind: 'resource', resource: 'coil', amount: 1 },
      { kind: 'combo', comboId: 'vpr-vice', nextStep: 'hunter', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-hunters-coil', "Hunter's Coil", 680, vprAuditRefs, {
    recastMs: 3000,
    speedScaling: 'none',
    effects: [
      { kind: 'buff', buffId: 'vpr-hunters-instinct', durationMs: 40_000, damageMultiplier: 1.1 },
      { kind: 'resource', resource: 'offerings', amount: 5 },
      { kind: 'resource', resource: 'bite-ready', amount: 2 },
      { kind: 'combo', comboId: 'vpr-vice', nextStep: 'swiftskin', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-swiftskins-coil', "Swiftskin's Coil", 680, vprAuditRefs, {
    recastMs: 3000,
    speedScaling: 'none',
    effects: [
      { kind: 'buff', buffId: 'vpr-swiftscaled', durationMs: 40_000, hastePercent: 15 },
      { kind: 'resource', resource: 'offerings', amount: 5 },
      { kind: 'resource', resource: 'bite-ready', amount: 2 },
      { kind: 'combo', comboId: 'vpr-vice', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  ogcd('vpr-twin-bite', 'Twinfang or Twinblood Bite', 120, 1000, vprAuditRefs, {
    resourceCosts: [{ resource: 'bite-ready', amount: 1 }]
  }),
  gcd('vpr-uncoiled-fury', 'Uncoiled Fury', 680, vprRefs, {
    recastMs: 3500,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'coil', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'twin-ready', amount: 2 }]
  }),
  ogcd('vpr-uncoiled-twin', 'Uncoiled Twinfang or Twinblood', 120, 1000, vprAuditRefs, {
    resourceCosts: [{ resource: 'twin-ready', amount: 1 }]
  }),
  ogcd('vpr-serpents-ire', "Serpent's Ire", 0, 120_000, vprRefs, {
    effects: [
      { kind: 'resource', resource: 'coil', amount: 1 },
      { kind: 'resource', resource: 'ire-ready', amount: 1 }
    ]
  }),
  gcd('vpr-reawaken-ire', 'Reawaken', 750, vprRefs, {
    recastMs: 2200,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'ire-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'tribute', amount: 5 },
      { kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'first', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-reawaken-gauge', 'Reawaken', 750, vprRefs, {
    recastMs: 2200,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'offerings', amount: 50 }],
    effects: [
      { kind: 'resource', resource: 'tribute', amount: 5 },
      { kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'first', durationMs: 30_000 }
    ]
  }),
  action('vpr-first-legacy', 'First Legacy', 'ogcd', 320, { referenceIds: vprAuditRefs }),
  action('vpr-second-legacy', 'Second Legacy', 'ogcd', 320, { referenceIds: vprAuditRefs }),
  action('vpr-third-legacy', 'Third Legacy', 'ogcd', 320, { referenceIds: vprAuditRefs }),
  action('vpr-fourth-legacy', 'Fourth Legacy', 'ogcd', 320, { referenceIds: vprAuditRefs }),
  gcd('vpr-first-generation', 'First Generation', 680, vprRefs, {
    recastMs: 2000,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tribute', amount: 1 }],
    effects: [
      { kind: 'schedule-action', actionId: 'vpr-first-legacy', delayMs: 600 },
      { kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'second', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-second-generation', 'Second Generation', 680, vprRefs, {
    recastMs: 2000,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tribute', amount: 1 }],
    effects: [
      { kind: 'schedule-action', actionId: 'vpr-second-legacy', delayMs: 600 },
      { kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'third', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-third-generation', 'Third Generation', 680, vprRefs, {
    recastMs: 2000,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tribute', amount: 1 }],
    effects: [
      { kind: 'schedule-action', actionId: 'vpr-third-legacy', delayMs: 600 },
      { kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'fourth', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-fourth-generation', 'Fourth Generation', 680, vprRefs, {
    recastMs: 2000,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tribute', amount: 1 }],
    effects: [
      { kind: 'schedule-action', actionId: 'vpr-fourth-legacy', delayMs: 600 },
      { kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'ouroboros', durationMs: 30_000 }
    ]
  }),
  gcd('vpr-ouroboros', 'Ouroboros', 1150, vprRefs, {
    recastMs: 3000,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'tribute', amount: 1 }],
    effects: [{ kind: 'combo', comboId: 'vpr-reawaken', nextStep: 'complete', durationMs: 1 }]
  })
];

const VPR_RULES: CombatPriorityRule[] = [
  rule('vpr-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', vprRefs),
  rule('vpr-ire', 'vpr-serpents-ire', [{ kind: 'cooldown-ready', actionId: 'vpr-serpents-ire' }], 'Generate a Rattling Coil and Ready to Reawaken.', vprRefs),
  rule('vpr-tail', 'vpr-death-rattle', [{ kind: 'resource-at-least', resource: 'tail-ready', amount: 1 }], 'Use Death Rattle after a combo finisher.', vprRefs),
  rule('vpr-bite', 'vpr-twin-bite', [{ kind: 'resource-at-least', resource: 'bite-ready', amount: 1 }], 'Use both Vicewinder continuation attacks.', vprAuditRefs),
  rule('vpr-twin', 'vpr-uncoiled-twin', [{ kind: 'resource-at-least', resource: 'twin-ready', amount: 1 }], 'Use both Uncoiled Fury continuation attacks.', vprAuditRefs),
  rule('vpr-first', 'vpr-first-generation', [{ kind: 'combo-step', comboId: 'vpr-reawaken', step: 'first' }], 'Begin the Reawaken generation sequence.', vprRefs),
  rule('vpr-second', 'vpr-second-generation', [{ kind: 'combo-step', comboId: 'vpr-reawaken', step: 'second' }], 'Continue the Reawaken generation sequence.', vprRefs),
  rule('vpr-third', 'vpr-third-generation', [{ kind: 'combo-step', comboId: 'vpr-reawaken', step: 'third' }], 'Continue the Reawaken generation sequence.', vprRefs),
  rule('vpr-fourth', 'vpr-fourth-generation', [{ kind: 'combo-step', comboId: 'vpr-reawaken', step: 'fourth' }], 'Continue the Reawaken generation sequence.', vprRefs),
  rule('vpr-ouroboros', 'vpr-ouroboros', [{ kind: 'combo-step', comboId: 'vpr-reawaken', step: 'ouroboros' }], 'Finish Reawaken with Ouroboros.', vprRefs),
  rule('vpr-reawaken-ire', 'vpr-reawaken-ire', [{ kind: 'resource-at-least', resource: 'ire-ready', amount: 1 }], 'Spend Ready to Reawaken.', vprRefs),
  rule('vpr-reawaken-gauge', 'vpr-reawaken-gauge', [{ kind: 'resource-at-least', resource: 'offerings', amount: 50 }], 'Spend 50 Serpent Offerings on Reawaken.', vprRefs),
  rule('vpr-hunter-coil', 'vpr-hunters-coil', [{ kind: 'combo-step', comboId: 'vpr-vice', step: 'hunter' }], 'Continue the Vicewinder branch and maintain Hunter Instinct.', vprAuditRefs),
  rule('vpr-swift-coil', 'vpr-swiftskins-coil', [{ kind: 'combo-step', comboId: 'vpr-vice', step: 'swiftskin' }], 'Finish the Vicewinder branch and maintain Swiftscaled.', vprAuditRefs),
  rule('vpr-vicewinder', 'vpr-vicewinder', [{ kind: 'cooldown-ready', actionId: 'vpr-vicewinder', minimumCharges: 2 }], 'Avoid overcapping Vicewinder charges.', vprRefs),
  rule('vpr-uncoiled', 'vpr-uncoiled-fury', [{ kind: 'resource-at-least', resource: 'coil', amount: 2 }], 'Spend surplus Rattling Coils.', vprRefs),
  rule('vpr-hunter', 'vpr-hunters-sting', [{ kind: 'combo-step', comboId: 'vpr-combo', step: 'hunter' }], 'Maintain Hunter Instinct.', vprRefs),
  rule('vpr-flank', 'vpr-flanksting', [{ kind: 'combo-step', comboId: 'vpr-combo', step: 'flank' }], 'Finish the first combo branch.', vprRefs),
  rule('vpr-reaving', 'vpr-reaving-fangs', [{ kind: 'combo-step', comboId: 'vpr-combo', step: 'reaving' }], 'Begin the second combo branch.', vprRefs),
  rule('vpr-swiftskin', 'vpr-swiftskins-sting', [{ kind: 'combo-step', comboId: 'vpr-combo', step: 'swiftskin' }], 'Maintain Swiftscaled.', vprRefs),
  rule('vpr-hind', 'vpr-hindsting', [{ kind: 'combo-step', comboId: 'vpr-combo', step: 'hind' }], 'Finish the second combo branch.', vprRefs),
  rule('vpr-steel', 'vpr-steel-fangs', [{ kind: 'always' }], 'Begin the deterministic Vipersight cycle.', vprRefs)
];

export const VPR_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'vpr-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'VPR',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'vpr-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: VPR_ACTIONS,
  priorityRules: VPR_RULES,
  openers: [],
  assumptions,
  references: referencesFor('VPR', 'Viper', 'viper', 'packages/sims/src/melee/vpr/vpr_sheet_sim.ts', 'Used as an independent action-data and trace-structure check for Vipersight, Vicewinder and Reawaken sequencing.'),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['vpr-official-actions', 'vpr-xivgear-oracle'],
    checks: ['Level-100 Vipersight branches, Hunter Instinct, Swiftscaled, Vicewinder, Rattling Coils and the five-tribute Reawaken sequence.'],
    limitations: ['Paired continuation choices use equal-potency aggregate actions.', 'Vipersight venom routing is deterministic and does not reproduce every community opener-specific branch.']
  },
  limitation: 'Generated stationary-dummy priority with deterministic Vipersight routing and equal-potency continuation aggregates. It excludes movement and exact community opener alignment.'
};

const samRefs = ['sam-official-actions', 'sam-internal-priority'];
const samAuditRefs = [...samRefs, 'sam-xivgear-oracle'];
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
    effects: [
      { kind: 'resource', resource: 'meditation', amount: 1 },
      { kind: 'resource', resource: 'kaeshi-setsugekka-ready', amount: 1 }
    ]
  }),
  gcd('sam-kaeshi-setsugekka', 'Kaeshi: Setsugekka', 680, samAuditRefs, {
    criticalHitMode: 'guaranteed',
    resourceCosts: [{ resource: 'kaeshi-setsugekka-ready', amount: 1 }]
  }),
  gcd('sam-tendo-setsugekka', 'Tendo Setsugekka', 1100, samRefs, {
    castMs: 1300,
    criticalHitMode: 'guaranteed',
    resourceCosts: [
      { resource: 'setsu', amount: 1 },
      { resource: 'getsu', amount: 1 },
      { resource: 'ka', amount: 1 },
      { resource: 'tendo-ready', amount: 1 }
    ],
    effects: [
      { kind: 'resource', resource: 'meditation', amount: 1 },
      { kind: 'resource', resource: 'tendo-kaeshi-ready', amount: 1 }
    ]
  }),
  gcd('sam-tendo-kaeshi-setsugekka', 'Tendo Kaeshi Setsugekka', 1100, samRefs, {
    criticalHitMode: 'guaranteed',
    resourceCosts: [{ resource: 'tendo-kaeshi-ready', amount: 1 }]
  }),
  gcd('sam-meikyo-gekko', 'Gekko (Meikyo Shisui)', 420, samRefs, {
    resourceCosts: [{ resource: 'meikyo-stacks', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 10 },
      { kind: 'resource', resource: 'getsu', amount: 1 },
      { kind: 'buff', buffId: 'sam-fugetsu', durationMs: 40_000, damageMultiplier: 1.13 }
    ]
  }),
  gcd('sam-meikyo-kasha', 'Kasha (Meikyo Shisui)', 420, samRefs, {
    resourceCosts: [{ resource: 'meikyo-stacks', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 10 },
      { kind: 'resource', resource: 'ka', amount: 1 },
      { kind: 'buff', buffId: 'sam-fuka', durationMs: 40_000, hastePercent: 13 }
    ]
  }),
  gcd('sam-meikyo-yukikaze', 'Yukikaze (Meikyo Shisui)', 340, samRefs, {
    resourceCosts: [{ resource: 'meikyo-stacks', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'kenki', amount: 15 },
      { kind: 'resource', resource: 'setsu', amount: 1 }
    ]
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
      { kind: 'resource', resource: 'zanshin-ready', amount: 1 },
      { kind: 'mechanic', mechanicId: 'sam-ikishoten-used' }
    ]
  }),
  ogcd('sam-meikyo-shisui', 'Meikyo Shisui', 0, 55_000, samRefs, {
    charges: 2,
    effects: [
      { kind: 'resource', resource: 'meikyo-stacks', amount: 3 },
      { kind: 'resource', resource: 'tendo-ready', amount: 1 },
      { kind: 'mechanic', mechanicId: 'sam-meikyo-used' }
    ]
  }),
  ogcd('sam-zanshin', 'Zanshin', 940, 1000, samAuditRefs, {
    resourceCosts: [
      { resource: 'zanshin-ready', amount: 1 },
      { resource: 'kenki', amount: 50 }
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
  rule('sam-meikyo-shisui', 'sam-meikyo-shisui', [
    { kind: 'cooldown-ready', actionId: 'sam-meikyo-shisui' },
    { kind: 'resource-at-most', resource: 'meikyo-stacks', amount: 0 },
    { kind: 'resource-at-most', resource: 'tendo-ready', amount: 0 },
    { kind: 'mechanic', mechanicId: 'sam-meikyo-alignment-window' }
  ], 'Begin a complete three-finisher Meikyo cycle in the one-minute job window and unlock Tendo.', samRefs),
  rule('sam-ikishoten', 'sam-ikishoten', [{ kind: 'cooldown-ready', actionId: 'sam-ikishoten' }], 'Generate Kenki and unlock Ogi Namikiri on cooldown.', samRefs),
  rule('sam-zanshin', 'sam-zanshin', [{ kind: 'resource-at-least', resource: 'zanshin-ready', amount: 1 }], 'Spend Ikishoten readiness and its generated Kenki on Zanshin.', samAuditRefs),
  rule('sam-ogi', 'sam-ogi', [{ kind: 'mechanic', mechanicId: 'sam-ogi-ready' }], 'Use the Ogi Namikiri granted by Ikishoten.', samRefs),
  rule('sam-kaeshi', 'sam-kaeshi-namikiri', [{ kind: 'mechanic', mechanicId: 'sam-kaeshi-ready' }], 'Follow Ogi Namikiri with Kaeshi: Namikiri.', samRefs),
  rule('sam-tendo-kaeshi', 'sam-tendo-kaeshi-setsugekka', [{ kind: 'resource-at-least', resource: 'tendo-kaeshi-ready', amount: 1 }], 'Follow Tendo Setsugekka with Tendo Kaeshi Setsugekka.', samRefs),
  rule('sam-tendo', 'sam-tendo-setsugekka', [
    { kind: 'resource-at-least', resource: 'tendo-ready', amount: 1 },
    { kind: 'resource-at-least', resource: 'setsu', amount: 1 },
    { kind: 'resource-at-least', resource: 'getsu', amount: 1 },
    { kind: 'resource-at-least', resource: 'ka', amount: 1 },
    { kind: 'mechanic', mechanicId: 'sam-higanbana-safe-to-spend-sen' }
  ], 'Spend the Sen generated under Meikyo on the Tendo Iaijutsu.', samRefs),
  rule('sam-kaeshi-setsugekka', 'sam-kaeshi-setsugekka', [{ kind: 'resource-at-least', resource: 'kaeshi-setsugekka-ready', amount: 1 }], 'Follow Midare Setsugekka with its available Kaeshi repeat.', samAuditRefs),
  rule('sam-shoha', 'sam-shoha', [{ kind: 'resource-at-least', resource: 'meditation', amount: 3 }], 'Spend three Meditation stacks.', samRefs),
  rule('sam-senei', 'sam-senei', [
    { kind: 'cooldown-ready', actionId: 'sam-senei' },
    { kind: 'resource-at-least', resource: 'kenki', amount: 25 }
  ], 'Spend Kenki on the stronger cooldown action.', samRefs),
  rule('sam-meikyo-gekko', 'sam-meikyo-gekko', [
    { kind: 'resource-at-least', resource: 'meikyo-stacks', amount: 1 },
    { kind: 'resource-at-most', resource: 'getsu', amount: 0 }
  ], 'Use Meikyo to generate missing Getsu and refresh Fugetsu.', samRefs),
  rule('sam-meikyo-kasha', 'sam-meikyo-kasha', [
    { kind: 'resource-at-least', resource: 'meikyo-stacks', amount: 1 },
    { kind: 'resource-at-most', resource: 'ka', amount: 0 }
  ], 'Use Meikyo to generate missing Ka and refresh Fuka.', samRefs),
  rule('sam-meikyo-yukikaze', 'sam-meikyo-yukikaze', [
    { kind: 'resource-at-least', resource: 'meikyo-stacks', amount: 1 },
    { kind: 'resource-at-most', resource: 'setsu', amount: 0 }
  ], 'Use Meikyo to generate missing Setsu without adding a filler combo step.', samRefs),
  rule('sam-meikyo-fallback', 'sam-meikyo-gekko', [
    { kind: 'resource-at-least', resource: 'meikyo-stacks', amount: 1 }
  ], 'Consume any remaining Meikyo stack on a full-potency finisher when all Sen are already present.', samRefs),
  rule('sam-shinten-overcap', 'sam-shinten', [
    { kind: 'resource-would-overcap', resource: 'kenki', incoming: 15, maximum: 100 },
    { kind: 'resource-at-least', resource: 'kenki', amount: 25 }
  ], 'Prevent the next combo action from overcapping Kenki.', samRefs),
  rule('sam-higanbana', 'sam-higanbana', [
    { kind: 'dot-remaining-at-most', dotId: 'sam-higanbana', durationMs: 3000 },
    { kind: 'resource-at-most', resource: 'meikyo-stacks', amount: 0 },
    { kind: 'resource-at-least', resource: 'setsu', amount: 1 }
  ], 'Maintain Higanbana with one Sen.', samRefs),
  rule('sam-midare', 'sam-midare', [
    { kind: 'resource-at-least', resource: 'setsu', amount: 1 },
    { kind: 'resource-at-least', resource: 'getsu', amount: 1 },
    { kind: 'resource-at-least', resource: 'ka', amount: 1 },
    { kind: 'mechanic', mechanicId: 'sam-higanbana-safe-to-spend-sen' }
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
  rule('sam-higanbana-hold-jinpu', 'sam-jinpu', [
    { kind: 'combo-step', comboId: 'sam-combo', step: 'choose' },
    { kind: 'mechanic', mechanicId: 'sam-higanbana-reserve-window' }
  ], 'Use a full-potency filler branch while reserving Sen for the approaching Higanbana refresh.', samRefs),
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
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-08-01',
    referenceIds: ['sam-official-actions', 'sam-xivgear-oracle'],
    checks: [
    'Core combo, Iaijutsu, Kaeshi, Ikishoten, Zanshin and Ogi action data.',
      'Meikyo Shisui charges, combo bypasses, Tendo readiness and Tendo Setsugekka replacements.',
      'Deterministic Sen spending, Higanbana refresh cadence and 300-versus-510-second speed-tier trace behaviour.'
    ],
    limitations: [
      'Third Eye gains and exact community burst alignment remain outside this generated pilot.'
    ]
  },
  limitation: 'Independently cross-checked preliminary single-target priority. It models Meikyo and Tendo cycles but omits Third Eye gains, encounter movement, party buffs and exact community opener alignment.'
};

const dncRefs = ['dnc-official-actions', 'dnc-internal-priority'];
const dncAuditRefs = [...dncRefs, 'dnc-xivgear-oracle'];
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
    cooldownMs: 60_000,
    castMs: 4400,
    speedScaling: 'none',
    effects: [
      { kind: 'buff', buffId: 'dnc-standard-finish', durationMs: 60_000, damageMultiplier: 1.05 },
      { kind: 'resource', resource: 'last-dance-ready', amount: 1 }
    ]
  }),
  gcd('dnc-finishing-move', 'Finishing Move', 850, dncAuditRefs, {
    cooldownMs: 60_000,
    resourceCosts: [{ resource: 'finishing-move-ready', amount: 1 }],
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
      { kind: 'expected-proc', procId: 'fan-dance-iv', chance: 1 },
      { kind: 'resource', resource: 'finishing-move-ready', amount: 1 }
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
  rule('dnc-finishing-move', 'dnc-finishing-move', [{ kind: 'resource-at-least', resource: 'finishing-move-ready', amount: 1 }], 'Use the Flourish-granted instant Finishing Move in place of another dance sequence.', dncAuditRefs),
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
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['dnc-official-actions', 'dnc-xivgear-oracle'],
    checks: [
      'Core weaponskill potencies, fixed dance timing and guaranteed Critical/Direct Hit actions.',
      'Two-minute expected-count structure including Standard Finish, Finishing Move and Last Dance.'
    ],
    limitations: [
      'The oracle is itself an approximate count simulation; party Esprit and individual random outcomes are intentionally excluded.'
    ]
  },
  limitation: 'Independently cross-checked preliminary expected-value model. Dance sequences are aggregate actions, Esprit generation excludes party members, and individual RNG outcomes are not rolled.'
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
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['blm-official-actions', 'blm-xivgear-oracle'],
    checks: [
      'Fire/Ice potency, cast/application timing, Astral Soul, Flare Star and timed Polyglot behaviour.',
      'Five-minute spell-speed tier changes and deterministic phase transitions.'
    ],
    limitations: [
      'Paradox, Umbral Heart cost detail, Triplecast, Swiftcast and transpose lines remain material approximations and keep this profile preliminary.'
    ]
  },
  limitation: 'Independently cross-checked preliminary stationary priority. It simplifies Umbral Heart MP costs and omits Paradox, Triplecast, Swiftcast, movement planning and fight-specific transpose lines.'
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
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['drk-official-actions', 'drk-xivgear-oracle'],
    checks: [
      'Level-100 combo, Delirium, MP tick and burst action data.',
      'Living Shadow 6.8-second delay, 2.18-second cadence, sequence and pet buff exclusion.'
    ],
    limitations: [
      'Defensive TBN timing, Dark Arts and encounter-specific resource pooling are intentionally outside the stationary dummy model.'
    ]
  },
  limitation: 'Independently cross-checked preliminary single-target priority. It omits defensive TBN timing, Dark Arts, raid buffs and encounter-specific MP or Blood pooling.'
};

const pldRefs = ['pld-official-actions', 'pld-internal-priority'];
const pldAuditRefs = [...pldRefs, 'pld-xivgear-oracle'];
const PLD_ACTIONS: CombatActionProfile[] = [
  potion(pldRefs),
  autoAttack(pldRefs),
  gcd('pld-fast-blade', 'Fast Blade', 220, pldRefs, {
    effects: [{ kind: 'combo', comboId: 'pld-combo', nextStep: 'riot', durationMs: 30_000 }]
  }),
  gcd('pld-riot-blade', 'Riot Blade', 330, pldRefs, {
    effects: [
      { kind: 'resource', resource: 'mp', amount: 1000 },
      { kind: 'combo', comboId: 'pld-combo', nextStep: 'royal', durationMs: 30_000 }
    ]
  }),
  gcd('pld-royal-authority', 'Royal Authority', 460, pldRefs, {
    effects: [
      { kind: 'resource', resource: 'atonement-ready', amount: 1 },
      { kind: 'resource', resource: 'divine-might', amount: 1 },
      { kind: 'combo', comboId: 'pld-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('pld-atonement', 'Atonement', 460, pldRefs, {
    resourceCosts: [{ resource: 'atonement-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'mp', amount: 500 },
      { kind: 'resource', resource: 'supplication-ready', amount: 1 }
    ]
  }),
  gcd('pld-supplication', 'Supplication', 500, pldRefs, {
    resourceCosts: [{ resource: 'supplication-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'mp', amount: 500 },
      { kind: 'resource', resource: 'sepulchre-ready', amount: 1 }
    ]
  }),
  gcd('pld-sepulchre', 'Sepulchre', 540, pldRefs, {
    resourceCosts: [{ resource: 'sepulchre-ready', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'mp', amount: 500 }]
  }),
  gcd('pld-holy-spirit-divine-might', 'Holy Spirit (Divine Might)', 500, pldAuditRefs, {
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'divine-might', amount: 1 },
      { resource: 'mp', amount: 1000 }
    ]
  }),
  gcd('pld-goring-blade', 'Goring Blade', 700, pldRefs, {
    resourceCosts: [{ resource: 'goring-ready', amount: 1 }]
  }),
  gcd('pld-confiteor', 'Confiteor', 1000, pldRefs, {
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'confiteor-ready', amount: 1 },
      { resource: 'requiescat', amount: 1 },
      { resource: 'mp', amount: 1000 }
    ],
    effects: [{ kind: 'combo', comboId: 'pld-confiteor', nextStep: 'faith', durationMs: 30_000 }]
  }),
  gcd('pld-blade-of-faith', 'Blade of Faith', 760, pldRefs, {
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'requiescat', amount: 1 },
      { resource: 'mp', amount: 1000 }
    ],
    effects: [{ kind: 'combo', comboId: 'pld-confiteor', nextStep: 'truth', durationMs: 30_000 }]
  }),
  gcd('pld-blade-of-truth', 'Blade of Truth', 880, pldRefs, {
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'requiescat', amount: 1 },
      { resource: 'mp', amount: 1000 }
    ],
    effects: [{ kind: 'combo', comboId: 'pld-confiteor', nextStep: 'valor', durationMs: 30_000 }]
  }),
  gcd('pld-blade-of-valor', 'Blade of Valor', 1000, pldRefs, {
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'requiescat', amount: 1 },
      { resource: 'mp', amount: 1000 }
    ],
    effects: [
      { kind: 'resource', resource: 'honor-ready', amount: 1 },
      { kind: 'combo', comboId: 'pld-confiteor', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  ogcd('pld-fight-or-flight', 'Fight or Flight', 0, 60_000, pldRefs, {
    effects: [
      { kind: 'buff', buffId: 'pld-fight-or-flight', durationMs: 20_000, damageMultiplier: 1.25 },
      { kind: 'resource', resource: 'goring-ready', amount: 1 }
    ]
  }),
  ogcd('pld-imperator', 'Imperator', 580, 60_000, pldRefs, {
    effects: [
      { kind: 'resource', resource: 'requiescat', amount: 4 },
      { kind: 'resource', resource: 'confiteor-ready', amount: 1 }
    ]
  }),
  ogcd('pld-blade-of-honor', 'Blade of Honor', 1000, 1000, pldRefs, {
    resourceCosts: [{ resource: 'honor-ready', amount: 1 }]
  }),
  ogcd('pld-circle-of-scorn', 'Circle of Scorn', 140, 30_000, pldRefs, {
    effects: [{ kind: 'dot', dotId: 'pld-circle-of-scorn', durationMs: 15_000, tickPotency: 30 }]
  }),
  ogcd('pld-expiacion', 'Expiacion', 450, 30_000, pldRefs, {
    effects: [{ kind: 'resource', resource: 'mp', amount: 500 }]
  }),
  ogcd('pld-intervene', 'Intervene', 150, 30_000, pldRefs, {
    charges: 2
  })
];

const PLD_RULES: CombatPriorityRule[] = [
  rule('pld-fight-or-flight', 'pld-fight-or-flight', [{ kind: 'cooldown-ready', actionId: 'pld-fight-or-flight' }], 'Open each one-minute damage window with Fight or Flight.', pldRefs),
  rule('pld-potion', 'pilot-potion', [
    { kind: 'cooldown-ready', actionId: 'pilot-potion' },
    { kind: 'buff-active', buffId: 'pld-fight-or-flight', active: true }
  ], 'Use the enabled potion inside Fight or Flight.', pldRefs),
  rule('pld-imperator', 'pld-imperator', [
    { kind: 'cooldown-ready', actionId: 'pld-imperator' },
    { kind: 'buff-active', buffId: 'pld-fight-or-flight', active: true }
  ], 'Start the Confiteor spell sequence inside Fight or Flight.', pldRefs),
  rule('pld-honor', 'pld-blade-of-honor', [{ kind: 'resource-at-least', resource: 'honor-ready', amount: 1 }], 'Spend Blade of Honor readiness.', pldRefs),
  rule('pld-circle', 'pld-circle-of-scorn', [{ kind: 'cooldown-ready', actionId: 'pld-circle-of-scorn' }], 'Maintain Circle of Scorn on cooldown.', pldRefs),
  rule('pld-expiacion', 'pld-expiacion', [{ kind: 'cooldown-ready', actionId: 'pld-expiacion' }], 'Use Expiacion on cooldown.', pldRefs),
  rule('pld-intervene-burst', 'pld-intervene', [
    { kind: 'cooldown-ready', actionId: 'pld-intervene', minimumCharges: 1 },
    { kind: 'buff-active', buffId: 'pld-fight-or-flight', active: true }
  ], 'Spend Intervene charges inside Fight or Flight.', pldAuditRefs),
  rule('pld-goring', 'pld-goring-blade', [{ kind: 'resource-at-least', resource: 'goring-ready', amount: 1 }], 'Use the Fight or Flight granted Goring Blade.', pldRefs),
  rule('pld-confiteor', 'pld-confiteor', [{ kind: 'resource-at-least', resource: 'confiteor-ready', amount: 1 }], 'Begin the Requiescat spell sequence.', pldRefs),
  rule('pld-faith', 'pld-blade-of-faith', [{ kind: 'combo-step', comboId: 'pld-confiteor', step: 'faith' }], 'Continue with Blade of Faith.', pldRefs),
  rule('pld-truth', 'pld-blade-of-truth', [{ kind: 'combo-step', comboId: 'pld-confiteor', step: 'truth' }], 'Continue with Blade of Truth.', pldRefs),
  rule('pld-valor', 'pld-blade-of-valor', [{ kind: 'combo-step', comboId: 'pld-confiteor', step: 'valor' }], 'Complete the spell sequence with Blade of Valor.', pldRefs),
  rule('pld-atonement', 'pld-atonement', [{ kind: 'resource-at-least', resource: 'atonement-ready', amount: 1 }], 'Begin the Atonement weaponskill chain.', pldRefs),
  rule('pld-supplication', 'pld-supplication', [{ kind: 'resource-at-least', resource: 'supplication-ready', amount: 1 }], 'Continue with Supplication.', pldRefs),
  rule('pld-sepulchre', 'pld-sepulchre', [{ kind: 'resource-at-least', resource: 'sepulchre-ready', amount: 1 }], 'Complete the Atonement chain with Sepulchre.', pldRefs),
  rule('pld-divine-might', 'pld-holy-spirit-divine-might', [
    { kind: 'resource-at-least', resource: 'divine-might', amount: 1 },
    { kind: 'resource-at-least', resource: 'mp', amount: 1000 }
  ], 'Spend Divine Might on an instant Holy Spirit.', pldAuditRefs),
  rule('pld-riot', 'pld-riot-blade', [{ kind: 'combo-step', comboId: 'pld-combo', step: 'riot' }], 'Continue the Royal Authority combo.', pldRefs),
  rule('pld-royal', 'pld-royal-authority', [{ kind: 'combo-step', comboId: 'pld-combo', step: 'royal' }], 'Complete the Royal Authority combo.', pldRefs),
  rule('pld-filler', 'pld-fast-blade', [{ kind: 'always' }], 'Begin the next Royal Authority combo.', pldRefs)
];

export const PLD_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'pld-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'PLD',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'pld-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: PLD_ACTIONS,
  priorityRules: PLD_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'PLD',
    'Paladin',
    'paladin',
    'packages/sims/src/tank/pld/pld_sheet_sim.ts',
    'Used as an independent cross-check for physical and spell GCD handling, Fight or Flight windows, Confiteor sequencing and Atonement priorities.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['pld-official-actions', 'pld-xivgear-oracle'],
    checks: [
      'Level-100 Royal Authority, Atonement, Confiteor, Fight or Flight and Imperator action data.',
      'Skill-speed weaponskill recasts, fixed 2.50-second spell recasts and one-minute burst sequencing.'
    ],
    limitations: [
      'The current tank optimiser does not expose Spell Speed, so Paladin spells use their level-100 base 2.50-second recast.',
      'The generated priority omits the hard-cast Holy Spirit opener and fine-grained eight-versus-nine-GCD Fight or Flight alignment.'
    ]
  },
  limitation: 'Independently cross-checked preliminary single-target priority. It omits the hard-cast Holy Spirit opener, defensive spell use, raid buffs and fine-grained Fight or Flight alignment.'
};

const warRefs = ['war-official-actions', 'war-internal-priority'];
const warAuditRefs = [...warRefs, 'war-xivgear-oracle'];
const WAR_ACTIONS: CombatActionProfile[] = [
  potion(warRefs),
  autoAttack(warRefs),
  gcd('war-heavy-swing', 'Heavy Swing', 240, warRefs, {
    effects: [{ kind: 'combo', comboId: 'war-combo', nextStep: 'maim', durationMs: 30_000 }]
  }),
  gcd('war-maim', 'Maim', 340, warRefs, {
    effects: [
      { kind: 'resource', resource: 'beast', amount: 10 },
      { kind: 'combo', comboId: 'war-combo', nextStep: 'finisher', durationMs: 30_000 }
    ]
  }),
  gcd('war-storms-eye', 'Storm\'s Eye', 500, warRefs, {
    effects: [
      { kind: 'resource', resource: 'beast', amount: 10 },
      { kind: 'buff', buffId: 'war-surging-tempest', durationMs: 30_000, damageMultiplier: 1.1 },
      { kind: 'combo', comboId: 'war-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('war-storms-path', 'Storm\'s Path', 500, warRefs, {
    effects: [
      { kind: 'resource', resource: 'beast', amount: 20 },
      { kind: 'combo', comboId: 'war-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('war-fell-cleave', 'Fell Cleave', 580, warRefs, {
    resourceCosts: [{ resource: 'beast', amount: 50 }]
  }),
  gcd('war-fell-cleave-ir', 'Fell Cleave (Inner Release)', 580, warRefs, {
    resourceCosts: [{ resource: 'inner-release', amount: 1 }],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    effects: [{ kind: 'resource', resource: 'burgeoning-fury', amount: 1 }]
  }),
  gcd('war-inner-chaos', 'Inner Chaos', 700, warRefs, {
    resourceCosts: [
      { resource: 'beast', amount: 50 },
      { resource: 'nascent-chaos', amount: 1 }
    ],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed'
  }),
  gcd('war-primal-rend', 'Primal Rend', 720, warRefs, {
    resourceCosts: [{ resource: 'primal-rend-ready', amount: 1 }],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    effects: [{ kind: 'resource', resource: 'primal-ruination-ready', amount: 1 }]
  }),
  gcd('war-primal-ruination', 'Primal Ruination', 800, warRefs, {
    resourceCosts: [{ resource: 'primal-ruination-ready', amount: 1 }],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed'
  }),
  ogcd('war-inner-release', 'Inner Release', 0, 60_000, warRefs, {
    effects: [
      { kind: 'resource', resource: 'inner-release', amount: 3 },
      { kind: 'resource', resource: 'primal-rend-ready', amount: 1 }
    ]
  }),
  ogcd('war-infuriate', 'Infuriate', 0, 50_000, warAuditRefs, {
    charges: 2,
    effects: [
      { kind: 'resource', resource: 'beast', amount: 50 },
      { kind: 'resource', resource: 'nascent-chaos', amount: 1 }
    ]
  }),
  ogcd('war-primal-wrath', 'Primal Wrath', 700, 1000, warRefs, {
    resourceCosts: [{ resource: 'burgeoning-fury', amount: 3 }]
  }),
  ogcd('war-upheaval', 'Upheaval', 420, 30_000, warRefs),
  ogcd('war-onslaught', 'Onslaught', 150, 30_000, warRefs, {
    charges: 3
  })
];

const WAR_RULES: CombatPriorityRule[] = [
  rule('war-inner-release', 'war-inner-release', [
    { kind: 'cooldown-ready', actionId: 'war-inner-release' },
    { kind: 'buff-active', buffId: 'war-surging-tempest', active: true }
  ], 'Start Inner Release once Surging Tempest is established.', warRefs),
  rule('war-potion', 'pilot-potion', [
    { kind: 'cooldown-ready', actionId: 'pilot-potion' },
    { kind: 'resource-at-least', resource: 'inner-release', amount: 1 }
  ], 'Use the enabled potion in the Inner Release window.', warRefs),
  rule('war-primal-wrath', 'war-primal-wrath', [{ kind: 'resource-at-least', resource: 'burgeoning-fury', amount: 3 }], 'Spend Wrathful on Primal Wrath.', warRefs),
  rule('war-upheaval', 'war-upheaval', [
    { kind: 'cooldown-ready', actionId: 'war-upheaval' },
    { kind: 'buff-active', buffId: 'war-surging-tempest', active: true }
  ], 'Use Upheaval on cooldown under Surging Tempest.', warRefs),
  rule('war-infuriate', 'war-infuriate', [
    { kind: 'cooldown-ready', actionId: 'war-infuriate', minimumCharges: 1 },
    { kind: 'resource-at-most', resource: 'beast', amount: 50 },
    { kind: 'buff-active', buffId: 'war-surging-tempest', active: true }
  ], 'Use Infuriate without overcapping Beast Gauge.', warAuditRefs),
  rule('war-onslaught', 'war-onslaught', [
    { kind: 'cooldown-ready', actionId: 'war-onslaught', minimumCharges: 1 },
    { kind: 'resource-at-least', resource: 'inner-release', amount: 1 }
  ], 'Spend Onslaught charges during Inner Release.', warRefs),
  rule('war-inner-chaos', 'war-inner-chaos', [
    { kind: 'resource-at-least', resource: 'nascent-chaos', amount: 1 },
    { kind: 'resource-at-least', resource: 'beast', amount: 50 }
  ], 'Spend Nascent Chaos on Inner Chaos.', warRefs),
  rule('war-primal-rend', 'war-primal-rend', [{ kind: 'resource-at-least', resource: 'primal-rend-ready', amount: 1 }], 'Use Primal Rend from Inner Release.', warRefs),
  rule('war-primal-ruination', 'war-primal-ruination', [{ kind: 'resource-at-least', resource: 'primal-ruination-ready', amount: 1 }], 'Follow Primal Rend with Primal Ruination.', warRefs),
  rule('war-ir-fell-cleave', 'war-fell-cleave-ir', [{ kind: 'resource-at-least', resource: 'inner-release', amount: 1 }], 'Consume Inner Release stacks on guaranteed Fell Cleaves.', warRefs),
  rule('war-beast-overcap', 'war-fell-cleave', [{ kind: 'resource-at-least', resource: 'beast', amount: 90 }], 'Spend Beast Gauge before the next combo finisher can overcap it.', warRefs),
  rule('war-eye', 'war-storms-eye', [
    { kind: 'combo-step', comboId: 'war-combo', step: 'finisher' },
    { kind: 'buff-remaining-at-most', buffId: 'war-surging-tempest', durationMs: 10_000 }
  ], 'Establish or refresh Surging Tempest.', warRefs),
  rule('war-path', 'war-storms-path', [{ kind: 'combo-step', comboId: 'war-combo', step: 'finisher' }], 'Use Storm\'s Path when Surging Tempest is healthy.', warRefs),
  rule('war-maim', 'war-maim', [{ kind: 'combo-step', comboId: 'war-combo', step: 'maim' }], 'Continue the Storm combo.', warRefs),
  rule('war-fell-cleave', 'war-fell-cleave', [{ kind: 'resource-at-least', resource: 'beast', amount: 50 }], 'Spend available Beast Gauge after higher priorities.', warRefs),
  rule('war-filler', 'war-heavy-swing', [{ kind: 'always' }], 'Begin the next Storm combo.', warRefs)
];

export const WAR_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'war-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'WAR',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'war-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: WAR_ACTIONS,
  priorityRules: WAR_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'WAR',
    'Warrior',
    'warrior',
    'packages/sims/src/tank/war/war_sheet_sim.ts',
    'Used as an independent cross-check for Surging Tempest upkeep, Beast Gauge spending, Inner Release chains and Infuriate timing.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['war-official-actions', 'war-xivgear-oracle'],
    checks: [
      'Level-100 Storm combo, Inner Release, Inner Chaos, Primal Rend, Primal Ruination and Primal Wrath action data.',
      'Guaranteed critical/direct-hit handling and deterministic Beast Gauge spending.'
    ],
    limitations: [
      'Infuriate uses a declared 50-second effective recharge approximation because the profile schema cannot yet reduce an active cooldown by five seconds per spender.'
    ]
  },
  limitation: 'Independently cross-checked preliminary single-target priority. Infuriate uses a declared effective-cooldown approximation; defensive retaliation, raid buffs and encounter-specific gauge pooling are omitted.'
};

const gnbRefs = ['gnb-official-actions', 'gnb-internal-priority'];
const gnbAuditRefs = [...gnbRefs, 'gnb-xivgear-oracle'];
const GNB_ACTIONS: CombatActionProfile[] = [
  potion(gnbRefs),
  autoAttack(gnbRefs),
  gcd('gnb-keen-edge', 'Keen Edge', 300, gnbRefs, {
    effects: [{ kind: 'combo', comboId: 'gnb-combo', nextStep: 'brutal', durationMs: 30_000 }]
  }),
  gcd('gnb-brutal-shell', 'Brutal Shell', 380, gnbRefs, {
    effects: [{ kind: 'combo', comboId: 'gnb-combo', nextStep: 'solid', durationMs: 30_000 }]
  }),
  gcd('gnb-solid-barrel', 'Solid Barrel', 460, gnbRefs, {
    effects: [
      { kind: 'resource', resource: 'cartridge', amount: 1 },
      { kind: 'combo', comboId: 'gnb-combo', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('gnb-sonic-break', 'Sonic Break', 340, gnbRefs, {
    resourceCosts: [{ resource: 'ready-to-break', amount: 1 }],
    effects: [{ kind: 'dot', dotId: 'gnb-sonic-break', durationMs: 15_000, tickPotency: 120 }]
  }),
  gcd('gnb-double-down', 'Double Down', 1000, gnbRefs, {
    cooldownMs: 60_000,
    resourceCosts: [{ resource: 'cartridge', amount: 2 }]
  }),
  gcd('gnb-reign-of-beasts', 'Reign of Beasts', 800, gnbRefs, {
    resourceCosts: [{ resource: 'ready-to-reign', amount: 1 }],
    effects: [{ kind: 'combo', comboId: 'gnb-reign', nextStep: 'noble', durationMs: 30_000 }]
  }),
  gcd('gnb-noble-blood', 'Noble Blood', 900, gnbRefs, {
    effects: [{ kind: 'combo', comboId: 'gnb-reign', nextStep: 'lion', durationMs: 30_000 }]
  }),
  gcd('gnb-lion-heart', 'Lion Heart', 1000, gnbRefs, {
    effects: [{ kind: 'combo', comboId: 'gnb-reign', nextStep: 'complete', durationMs: 1 }]
  }),
  gcd('gnb-gnashing-fang', 'Gnashing Fang', 440, gnbRefs, {
    cooldownMs: 30_000,
    charges: 2,
    resourceCosts: [{ resource: 'cartridge', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'gnashing-active', amount: 1 },
      { kind: 'resource', resource: 'ready-to-rip', amount: 1 },
      { kind: 'combo', comboId: 'gnb-gnashing', nextStep: 'savage', durationMs: 30_000 }
    ]
  }),
  gcd('gnb-savage-claw', 'Savage Claw', 500, gnbRefs, {
    effects: [
      { kind: 'resource', resource: 'ready-to-tear', amount: 1 },
      { kind: 'combo', comboId: 'gnb-gnashing', nextStep: 'wicked', durationMs: 30_000 }
    ]
  }),
  gcd('gnb-wicked-talon', 'Wicked Talon', 560, gnbRefs, {
    resourceCosts: [{ resource: 'gnashing-active', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'ready-to-gouge', amount: 1 },
      { kind: 'combo', comboId: 'gnb-gnashing', nextStep: 'complete', durationMs: 1 }
    ]
  }),
  gcd('gnb-burst-strike', 'Burst Strike', 420, gnbRefs, {
    resourceCosts: [{ resource: 'cartridge', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'ready-to-blast', amount: 1 }]
  }),
  ogcd('gnb-no-mercy', 'No Mercy', 0, 60_000, gnbRefs, {
    effects: [
      { kind: 'buff', buffId: 'gnb-no-mercy', durationMs: 20_000, damageMultiplier: 1.2 },
      { kind: 'resource', resource: 'ready-to-break', amount: 1 }
    ]
  }),
  ogcd('gnb-bloodfest', 'Bloodfest', 0, 60_000, gnbRefs, {
    effects: [
      { kind: 'resource', resource: 'cartridge', amount: 3 },
      { kind: 'resource', resource: 'ready-to-reign', amount: 1 }
    ]
  }),
  ogcd('gnb-bow-shock', 'Bow Shock', 150, 60_000, gnbRefs, {
    effects: [{ kind: 'dot', dotId: 'gnb-bow-shock', durationMs: 15_000, tickPotency: 60 }]
  }),
  ogcd('gnb-blasting-zone', 'Blasting Zone', 800, 30_000, gnbRefs),
  ogcd('gnb-jugular-rip', 'Jugular Rip', 220, 1000, gnbRefs, {
    resourceCosts: [{ resource: 'ready-to-rip', amount: 1 }]
  }),
  ogcd('gnb-abdomen-tear', 'Abdomen Tear', 260, 1000, gnbRefs, {
    resourceCosts: [{ resource: 'ready-to-tear', amount: 1 }]
  }),
  ogcd('gnb-eye-gouge', 'Eye Gouge', 300, 1000, gnbRefs, {
    resourceCosts: [{ resource: 'ready-to-gouge', amount: 1 }]
  }),
  ogcd('gnb-hypervelocity', 'Hypervelocity', 180, 1000, gnbRefs, {
    resourceCosts: [{ resource: 'ready-to-blast', amount: 1 }]
  })
];

const GNB_RULES: CombatPriorityRule[] = [
  rule('gnb-no-mercy', 'gnb-no-mercy', [{ kind: 'cooldown-ready', actionId: 'gnb-no-mercy' }], 'Open each one-minute damage window with No Mercy.', gnbRefs),
  rule('gnb-potion', 'pilot-potion', [
    { kind: 'cooldown-ready', actionId: 'pilot-potion' },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Use the enabled potion inside No Mercy.', gnbRefs),
  rule('gnb-bloodfest', 'gnb-bloodfest', [
    { kind: 'cooldown-ready', actionId: 'gnb-bloodfest' },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true },
    { kind: 'resource-at-most', resource: 'cartridge', amount: 3 }
  ], 'Use Bloodfest inside No Mercy without exceeding its temporary six-cartridge capacity.', gnbAuditRefs),
  rule('gnb-jugular', 'gnb-jugular-rip', [{ kind: 'resource-at-least', resource: 'ready-to-rip', amount: 1 }], 'Fire the Gnashing Fang continuation.', gnbRefs),
  rule('gnb-abdomen', 'gnb-abdomen-tear', [{ kind: 'resource-at-least', resource: 'ready-to-tear', amount: 1 }], 'Fire the Savage Claw continuation.', gnbRefs),
  rule('gnb-eye', 'gnb-eye-gouge', [{ kind: 'resource-at-least', resource: 'ready-to-gouge', amount: 1 }], 'Fire the Wicked Talon continuation.', gnbRefs),
  rule('gnb-hypervelocity', 'gnb-hypervelocity', [{ kind: 'resource-at-least', resource: 'ready-to-blast', amount: 1 }], 'Follow Burst Strike with Hypervelocity.', gnbRefs),
  rule('gnb-bow-shock', 'gnb-bow-shock', [
    { kind: 'cooldown-ready', actionId: 'gnb-bow-shock' },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Use Bow Shock inside No Mercy.', gnbRefs),
  rule('gnb-blasting-zone', 'gnb-blasting-zone', [
    { kind: 'cooldown-ready', actionId: 'gnb-blasting-zone' },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Use Blasting Zone inside No Mercy.', gnbRefs),
  rule('gnb-sonic-break', 'gnb-sonic-break', [
    { kind: 'resource-at-least', resource: 'ready-to-break', amount: 1 },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Use the No Mercy granted Sonic Break.', gnbRefs),
  rule('gnb-double-down', 'gnb-double-down', [
    { kind: 'cooldown-ready', actionId: 'gnb-double-down' },
    { kind: 'resource-at-least', resource: 'cartridge', amount: 2 },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Spend two cartridges on Double Down inside No Mercy.', gnbRefs),
  rule('gnb-reign', 'gnb-reign-of-beasts', [
    { kind: 'resource-at-least', resource: 'ready-to-reign', amount: 1 },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Begin the Bloodfest-granted Reign of Beasts combo.', gnbRefs),
  rule('gnb-noble', 'gnb-noble-blood', [{ kind: 'combo-step', comboId: 'gnb-reign', step: 'noble' }], 'Continue with Noble Blood.', gnbRefs),
  rule('gnb-lion', 'gnb-lion-heart', [{ kind: 'combo-step', comboId: 'gnb-reign', step: 'lion' }], 'Complete the Bloodfest combo with Lion Heart.', gnbRefs),
  rule('gnb-gnashing', 'gnb-gnashing-fang', [
    { kind: 'cooldown-ready', actionId: 'gnb-gnashing-fang', minimumCharges: 1 },
    { kind: 'resource-at-least', resource: 'cartridge', amount: 1 },
    { kind: 'resource-at-most', resource: 'gnashing-active', amount: 0 },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Begin Gnashing Fang inside No Mercy.', gnbAuditRefs),
  rule('gnb-savage', 'gnb-savage-claw', [{ kind: 'combo-step', comboId: 'gnb-gnashing', step: 'savage' }], 'Continue with Savage Claw.', gnbRefs),
  rule('gnb-wicked', 'gnb-wicked-talon', [{ kind: 'combo-step', comboId: 'gnb-gnashing', step: 'wicked' }], 'Complete the Gnashing Fang combo with Wicked Talon.', gnbRefs),
  rule('gnb-burst-window', 'gnb-burst-strike', [
    { kind: 'resource-at-least', resource: 'cartridge', amount: 1 },
    { kind: 'buff-active', buffId: 'gnb-no-mercy', active: true }
  ], 'Spend remaining burst-window cartridges on Burst Strike.', gnbRefs),
  rule('gnb-burst-overcap', 'gnb-burst-strike', [{ kind: 'resource-would-overcap', resource: 'cartridge', incoming: 1, maximum: 3 }], 'Prevent Solid Barrel from overcapping the normal cartridge capacity.', gnbRefs),
  rule('gnb-brutal', 'gnb-brutal-shell', [{ kind: 'combo-step', comboId: 'gnb-combo', step: 'brutal' }], 'Continue the Solid Barrel combo.', gnbRefs),
  rule('gnb-solid', 'gnb-solid-barrel', [{ kind: 'combo-step', comboId: 'gnb-combo', step: 'solid' }], 'Complete the combo and generate a cartridge.', gnbRefs),
  rule('gnb-filler', 'gnb-keen-edge', [{ kind: 'always' }], 'Begin the next Solid Barrel combo.', gnbRefs)
];

export const GNB_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'gnb-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'GNB',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'gnb-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: GNB_ACTIONS,
  priorityRules: GNB_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'GNB',
    'Gunbreaker',
    'gunbreaker',
    'packages/sims/src/tank/gnb/gnb_sheet_sim.ts',
    'Used as an independent cross-check for No Mercy sequencing, cartridge spending, continuation chains and Bloodfest combo handling.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['gnb-official-actions', 'gnb-xivgear-oracle'],
    checks: [
      'Level-100 Solid Barrel, Gnashing Fang, Double Down, Sonic Break, Bloodfest and Reign of Beasts action data.',
      'Continuation readiness, cartridge spending and one-minute No Mercy windows.'
    ],
    limitations: [
      'The generated priority does not reproduce XivGear\'s GCD-tier-specific eight-versus-nine-GCD No Mercy branches or intentional clipping variants.'
    ]
  },
  limitation: 'Independently cross-checked preliminary single-target priority. It omits deliberate clipping variants, defensive actions, raid buffs and exact GCD-tier-specific No Mercy alignment.'
};

const whmRefs = ['whm-official-actions', 'whm-internal-priority'];
const whmAuditRefs = [...whmRefs, 'whm-xivgear-oracle'];
const WHM_ACTIONS: CombatActionProfile[] = [
  potion(whmRefs),
  lucidDreaming(whmRefs),
  spellGcd('whm-glare-iii', 'Glare III', 350, whmRefs, {
    castMs: 1500,
    animationLockMs: 0,
    resourceCosts: [{ resource: 'mp', amount: 400 }]
  }),
  spellGcd('whm-dia', 'Dia', 85, whmRefs, {
    resourceCosts: [{ resource: 'mp', amount: 400 }],
    effects: [{ kind: 'dot', dotId: 'whm-dia', durationMs: 30_000, tickPotency: 85 }]
  }),
  spellGcd('whm-glare-iv', 'Glare IV', 640, whmAuditRefs, {
    resourceCosts: [{ resource: 'sacred-sight', amount: 1 }]
  }),
  ogcd('whm-presence-of-mind', 'Presence of Mind', 0, 120_000, whmAuditRefs, {
    effects: [
      { kind: 'buff', buffId: 'whm-presence-of-mind', durationMs: 15_000, hastePercent: 20 },
      { kind: 'resource', resource: 'sacred-sight', amount: 3 }
    ]
  }),
  ogcd('whm-assize', 'Assize', 400, 40_000, whmAuditRefs, {
    effects: [{ kind: 'resource', resource: 'mp', amount: 500 }]
  })
];

const WHM_RULES: CombatPriorityRule[] = [
  rule('whm-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', whmRefs),
  rule('whm-presence', 'whm-presence-of-mind', [{ kind: 'cooldown-ready', actionId: 'whm-presence-of-mind' }], 'Use Presence of Mind on cooldown and gain three Sacred Sight stacks.', whmAuditRefs),
  rule('whm-assize', 'whm-assize', [{ kind: 'cooldown-ready', actionId: 'whm-assize' }], 'Use Assize on cooldown.', whmAuditRefs),
  lucidDreamingRule(whmRefs),
  rule('whm-glare-iv', 'whm-glare-iv', [{ kind: 'resource-at-least', resource: 'sacred-sight', amount: 1 }], 'Spend Sacred Sight on Glare IV.', whmAuditRefs),
  rule('whm-dia', 'whm-dia', [{ kind: 'dot-remaining-at-most', dotId: 'whm-dia', durationMs: 3000 }], 'Maintain Dia on the stationary target.', whmRefs),
  rule('whm-filler', 'whm-glare-iii', [{ kind: 'always' }], 'Cast Glare III when no higher-priority damage action is due.', whmRefs)
];

export const WHM_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'whm-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'WHM',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'whm-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: WHM_ACTIONS,
  priorityRules: WHM_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'WHM',
    'White Mage',
    'whitemage',
    'packages/sims/src/healer/whm_new_sheet_sim.ts',
    'Used as an independent action-data and priority-trace cross-check for Dia, Presence of Mind, Sacred Sight, Glare IV and Assize.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-08-01',
    referenceIds: ['whm-official-actions', 'whm-xivgear-oracle'],
    checks: [
      'Glare III, Dia, Assize, Presence of Mind and Glare IV action data.',
      'Sacred Sight spending, 20% haste windows, DoT maintenance, 400-MP spell costs, Piety regeneration, Lucid Dreaming and Assize MP restoration.'
    ],
    limitations: [
      'Afflatus healing GCDs and Afflatus Misery are excluded from the uninterrupted damage-only dummy because their use depends on healing and movement needs.'
    ]
  },
  limitation: 'Independently cross-checked preliminary stationary-dummy priority. It excludes healing-driven Lily spending, Afflatus Misery, movement, party buffs and exact community opener alignment.'
};

const schRefs = ['sch-official-actions', 'sch-internal-priority'];
const schAuditRefs = [...schRefs, 'sch-xivgear-oracle'];
const SCH_ACTIONS: CombatActionProfile[] = [
  potion(schRefs),
  lucidDreaming(schRefs),
  spellGcd('sch-broil-iv', 'Broil IV', 320, schRefs, {
    castMs: 1500,
    animationLockMs: 0,
    resourceCosts: [{ resource: 'mp', amount: 400 }]
  }),
  spellGcd('sch-biolysis', 'Biolysis', 0, schRefs, {
    resourceCosts: [{ resource: 'mp', amount: 400 }],
    effects: [{ kind: 'dot', dotId: 'sch-biolysis', durationMs: 30_000, tickPotency: 85 }]
  }),
  ogcd('sch-chain-stratagem', 'Chain Stratagem', 0, 120_000, schAuditRefs, {
    effects: [
      { kind: 'buff', buffId: 'sch-chain-stratagem', durationMs: 20_000, damageMultiplier: 1 },
      { kind: 'resource', resource: 'impact-ready', amount: 1 }
    ]
  }),
  ogcd('sch-baneful-impaction', 'Baneful Impaction', 0, 1000, schAuditRefs, {
    resourceCosts: [{ resource: 'impact-ready', amount: 1 }],
    effects: [{ kind: 'dot', dotId: 'sch-baneful-impaction', durationMs: 15_000, tickPotency: 140 }]
  }),
  ogcd('sch-aetherflow', 'Aetherflow', 0, 60_000, schAuditRefs, {
    effects: [
      { kind: 'resource', resource: 'mp', amount: 2000 },
      { kind: 'resource', resource: 'aetherflow', amount: 3 }
    ]
  }),
  ogcd('sch-energy-drain', 'Energy Drain', 100, 1000, schAuditRefs, {
    resourceCosts: [{ resource: 'aetherflow', amount: 1 }]
  })
];

const SCH_RULES: CombatPriorityRule[] = [
  rule('sch-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', schRefs),
  rule('sch-chain', 'sch-chain-stratagem', [{ kind: 'cooldown-ready', actionId: 'sch-chain-stratagem' }], 'Apply Chain Stratagem on cooldown and unlock Baneful Impaction.', schAuditRefs),
  rule('sch-baneful', 'sch-baneful-impaction', [{ kind: 'resource-at-least', resource: 'impact-ready', amount: 1 }], 'Consume Impact Imminent on Baneful Impaction.', schAuditRefs),
  rule('sch-aetherflow', 'sch-aetherflow', [
    { kind: 'cooldown-ready', actionId: 'sch-aetherflow' },
    { kind: 'resource-at-most', resource: 'aetherflow', amount: 0 }
  ], 'Refresh three Aetherflow stacks after the prior stack is spent.', schAuditRefs),
  lucidDreamingRule(schRefs),
  rule('sch-energy-drain', 'sch-energy-drain', [{ kind: 'resource-at-least', resource: 'aetherflow', amount: 1 }], 'Spend damage-only Aetherflow on Energy Drain.', schAuditRefs),
  rule('sch-biolysis', 'sch-biolysis', [{ kind: 'dot-remaining-at-most', dotId: 'sch-biolysis', durationMs: 3000 }], 'Maintain Biolysis on the stationary target.', schRefs),
  rule('sch-filler', 'sch-broil-iv', [{ kind: 'always' }], 'Cast Broil IV when no higher-priority damage action is due.', schRefs)
];

export const SCH_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'sch-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'SCH',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'sch-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: SCH_ACTIONS,
  priorityRules: SCH_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'SCH',
    'Scholar',
    'scholar',
    'packages/sims/src/healer/sch_sheet_sim.ts',
    'Used as an independent action-data and trace cross-check for Broil IV, Biolysis, Chain Stratagem, Baneful Impaction, Aetherflow and Energy Drain.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-08-01',
    referenceIds: ['sch-official-actions', 'sch-xivgear-oracle'],
    checks: [
      'Broil IV, Biolysis, Chain Stratagem, Baneful Impaction, Aetherflow and Energy Drain action data.',
      'Expected 10% critical-hit-rate window, Impact Imminent consumption, 400-MP spell costs, Piety regeneration, Lucid Dreaming and Aetherflow MP restoration.'
    ],
    limitations: [
      'Dissipation and healing-driven Aetherflow spending are excluded because their damage value depends on healing and pet trade-offs.'
    ]
  },
  limitation: 'Independently cross-checked preliminary stationary-dummy priority. It excludes Dissipation, healing-driven Aetherflow choices, movement, party contribution and exact community opener alignment.'
};

const astRefs = ['ast-official-actions', 'ast-internal-priority'];
const astAuditRefs = [...astRefs, 'ast-xivgear-oracle'];
const AST_ACTIONS: CombatActionProfile[] = [
  potion(astRefs),
  lucidDreaming(astRefs),
  spellGcd('ast-fall-malefic', 'Fall Malefic', 270, astRefs, {
    castMs: 1500,
    animationLockMs: 0,
    resourceCosts: [{ resource: 'mp', amount: 400 }]
  }),
  spellGcd('ast-combust-iii', 'Combust III', 0, astRefs, {
    resourceCosts: [{ resource: 'mp', amount: 400 }],
    effects: [{ kind: 'dot', dotId: 'ast-combust-iii', durationMs: 30_000, tickPotency: 70 }]
  }),
  ogcd('ast-draw', 'Astral or Umbral Draw', 0, 55_000, astAuditRefs, {
    effects: [{ kind: 'resource', resource: 'mp', amount: 2000 }]
  }),
  ogcd('ast-divination', 'Divination', 0, 120_000, astAuditRefs, {
    effects: [
      { kind: 'buff', buffId: 'ast-divination', durationMs: 20_000, damageMultiplier: 1.06 },
      { kind: 'resource', resource: 'oracle-ready', amount: 1 }
    ]
  }),
  ogcd('ast-oracle', 'Oracle', 860, 1000, astAuditRefs, {
    resourceCosts: [{ resource: 'oracle-ready', amount: 1 }]
  }),
  ogcd('ast-lord-of-crowns', 'Lord of Crowns', 400, 110_000, astAuditRefs),
  ogcd('ast-earthly-star', 'Earthly Star', 0, 60_000, astAuditRefs, {
    effects: [{ kind: 'schedule-action', actionId: 'ast-stellar-explosion', delayMs: 10_000 }]
  }),
  action('ast-stellar-explosion', 'Earthly Star: Stellar Explosion', 'pet', 310, {
    referenceIds: astAuditRefs
  })
];

const AST_RULES: CombatPriorityRule[] = [
  rule('ast-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', astRefs),
  rule('ast-divination', 'ast-divination', [{ kind: 'cooldown-ready', actionId: 'ast-divination' }], 'Use Divination on cooldown and unlock Oracle.', astAuditRefs),
  rule('ast-oracle', 'ast-oracle', [{ kind: 'resource-at-least', resource: 'oracle-ready', amount: 1 }], 'Consume Divining on Oracle.', astAuditRefs),
  rule('ast-draw', 'ast-draw', [{ kind: 'cooldown-ready', actionId: 'ast-draw' }], 'Alternate Astral and Umbral Draw every 55 seconds and restore 20% maximum MP.', astAuditRefs),
  rule('ast-lord', 'ast-lord-of-crowns', [{ kind: 'cooldown-ready', actionId: 'ast-lord-of-crowns' }], 'Use the damaging Lord from the alternating draw cycle.', astAuditRefs),
  lucidDreamingRule(astRefs),
  rule('ast-star', 'ast-earthly-star', [{ kind: 'cooldown-ready', actionId: 'ast-earthly-star' }], 'Place Earthly Star and allow it to mature for ten seconds.', astAuditRefs),
  rule('ast-combust', 'ast-combust-iii', [{ kind: 'dot-remaining-at-most', dotId: 'ast-combust-iii', durationMs: 3000 }], 'Maintain Combust III on the stationary target.', astRefs),
  rule('ast-filler', 'ast-fall-malefic', [{ kind: 'always' }], 'Cast Fall Malefic when no higher-priority damage action is due.', astRefs)
];

export const AST_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'ast-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'AST',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'ast-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: AST_ACTIONS,
  priorityRules: AST_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'AST',
    'Astrologian',
    'astrologian',
    'packages/sims/src/healer/ast_sheet_sim.ts',
    'Used as an independent action-data and trace cross-check for Fall Malefic, Combust III, Divination, Oracle, Lord of Crowns and Earthly Star.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-08-01',
    referenceIds: ['ast-official-actions', 'ast-xivgear-oracle'],
    checks: [
      'Fall Malefic, Combust III, Divination, Oracle, Lord of Crowns and mature Earthly Star action data.',
      'Divining consumption, 20-second self-buff window, 400-MP spell costs, Piety regeneration, Lucid Dreaming and 20% MP restoration from each Draw.'
    ],
    limitations: [
      'The 55-second alternating draw cycle is aggregated to one damaging Lord every 110 seconds.',
      'Cards are assumed assigned to party members, so their raid contribution is not added to this personal-damage result.'
    ]
  },
  limitation: 'Independently cross-checked preliminary personal-damage priority. It aggregates the draw cycle, excludes card raid contribution, movement and exact community opener alignment.'
};

const sgeRefs = ['sge-official-actions', 'sge-internal-priority'];
const sgeAuditRefs = [...sgeRefs, 'sge-xivgear-oracle'];
const SGE_ACTIONS: CombatActionProfile[] = [
  potion(sgeRefs),
  lucidDreaming(sgeRefs),
  spellGcd('sge-dosis-iii', 'Dosis III', 380, sgeRefs, {
    castMs: 1500,
    animationLockMs: 0,
    resourceCosts: [{ resource: 'mp', amount: 400 }]
  }),
  spellGcd('sge-eukrasian-dosis-iii', 'Eukrasia + Eukrasian Dosis III', 0, sgeAuditRefs, {
    recastMs: 2500,
    castMs: 1000,
    speedScaling: 'none',
    resourceCosts: [{ resource: 'mp', amount: 400 }],
    effects: [{ kind: 'dot', dotId: 'sge-eukrasian-dosis-iii', durationMs: 30_000, tickPotency: 90 }]
  }),
  spellGcd('sge-phlegma-iii', 'Phlegma III', 690, sgeAuditRefs, {
    cooldownMs: 40_000,
    charges: 2,
    resourceCosts: [{ resource: 'mp', amount: 400 }]
  }),
  ogcd('sge-psyche', 'Psyche', 690, 60_000, sgeAuditRefs)
];

const SGE_RULES: CombatPriorityRule[] = [
  rule('sge-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the first safe weave.', sgeRefs),
  rule('sge-psyche', 'sge-psyche', [{ kind: 'cooldown-ready', actionId: 'sge-psyche' }], 'Use Psyche on cooldown.', sgeAuditRefs),
  rule('sge-phlegma', 'sge-phlegma-iii', [{ kind: 'cooldown-ready', actionId: 'sge-phlegma-iii', minimumCharges: 1 }], 'Spend Phlegma charges without overcapping.', sgeAuditRefs),
  lucidDreamingRule(sgeRefs),
  rule('sge-dot', 'sge-eukrasian-dosis-iii', [{ kind: 'dot-remaining-at-most', dotId: 'sge-eukrasian-dosis-iii', durationMs: 3000 }], 'Maintain Eukrasian Dosis III using its aggregate fixed 2.5-second sequence.', sgeAuditRefs),
  rule('sge-filler', 'sge-dosis-iii', [{ kind: 'always' }], 'Cast Dosis III when no higher-priority damage action is due.', sgeRefs)
];

export const SGE_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'sge-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'SGE',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'sge-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: SGE_ACTIONS,
  priorityRules: SGE_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'SGE',
    'Sage',
    'sage',
    'packages/sims/src/healer/sge_sheet_sim_mk2.ts',
    'Used as an independent action-data and trace cross-check for Dosis III, Eukrasian Dosis III, Phlegma III and Psyche.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-08-01',
    referenceIds: ['sge-official-actions', 'sge-xivgear-oracle'],
    checks: [
      'Patch-7.5 Dosis III, Eukrasian Dosis III, Phlegma III and Psyche action data.',
      'Two-charge Phlegma spending, 60-second Psyche cadence, 400-MP spell costs, Piety regeneration, Lucid Dreaming and the fixed Eukrasia plus Eukrasian Dosis sequence.'
    ],
    limitations: [
      'Eukrasia and Eukrasian Dosis III are represented as one fixed 2.5-second aggregate action.',
      'Pneuma is omitted because it is damage-equivalent to Dosis III and its use is driven by healing needs.'
    ]
  },
  limitation: 'Independently cross-checked preliminary stationary-dummy priority. It aggregates Eukrasian Dosis setup and excludes healing-driven Pneuma use, movement, party buffs and exact community opener alignment.'
};

const smnRefs = ['smn-official-actions', 'smn-internal-priority'];
const smnTimingRefs = [...smnRefs, 'smn-xivgear-oracle'];
const SMN_ACTIONS: CombatActionProfile[] = [
  potion(smnRefs),
  spellGcd('smn-solar-one', 'Summon Solar Bahamut (opening cycle)', 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-solar-one-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-umbral', amount: 6 },
      { kind: 'resource', resource: 'smn-sunflare-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-solar-enkindle-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-arcanum', amount: 3 },
      { kind: 'resource', resource: 'smn-bahamut-ready', amount: 1 },
      { kind: 'buff', buffId: 'smn-demi-lock', durationMs: 60_000 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'ifrit', durationMs: 60_000 },
      { kind: 'schedule-action', actionId: 'smn-luxwave', delayMs: 1500, repeatEveryMs: 1500, repeatCount: 8 }
    ]
  }),
  spellGcd('smn-bahamut', 'Summon Bahamut', 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-bahamut-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-astral', amount: 6 },
      { kind: 'resource', resource: 'smn-deathflare-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-bahamut-enkindle-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-arcanum', amount: 3 },
      { kind: 'resource', resource: 'smn-solar-two-ready', amount: 1 },
      { kind: 'buff', buffId: 'smn-demi-lock', durationMs: 60_000 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'ifrit', durationMs: 60_000 },
      { kind: 'schedule-action', actionId: 'smn-wyrmwave', delayMs: 1500, repeatEveryMs: 1500, repeatCount: 8 }
    ]
  }),
  spellGcd('smn-solar-two', 'Summon Solar Bahamut (second cycle)', 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-solar-two-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-umbral', amount: 6 },
      { kind: 'resource', resource: 'smn-sunflare-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-solar-enkindle-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-arcanum', amount: 3 },
      { kind: 'resource', resource: 'smn-phoenix-ready', amount: 1 },
      { kind: 'buff', buffId: 'smn-demi-lock', durationMs: 60_000 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'ifrit', durationMs: 60_000 },
      { kind: 'schedule-action', actionId: 'smn-luxwave', delayMs: 1500, repeatEveryMs: 1500, repeatCount: 8 }
    ]
  }),
  spellGcd('smn-phoenix', 'Summon Phoenix', 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-phoenix-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-fountain', amount: 6 },
      { kind: 'resource', resource: 'smn-phoenix-enkindle-ready', amount: 1 },
      { kind: 'resource', resource: 'smn-arcanum', amount: 3 },
      { kind: 'resource', resource: 'smn-solar-one-ready', amount: 1 },
      { kind: 'buff', buffId: 'smn-demi-lock', durationMs: 60_000 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'ifrit', durationMs: 60_000 },
      { kind: 'schedule-action', actionId: 'smn-scarlet-flame', delayMs: 1500, repeatEveryMs: 1500, repeatCount: 8 }
    ]
  }),
  spellGcd('smn-umbral-impulse', 'Umbral Impulse', 640, smnRefs, {
    resourceCosts: [{ resource: 'smn-umbral', amount: 1 }]
  }),
  spellGcd('smn-astral-impulse', 'Astral Impulse', 500, smnRefs, {
    resourceCosts: [{ resource: 'smn-astral', amount: 1 }]
  }),
  spellGcd('smn-fountain-of-fire', 'Fountain of Fire', 580, smnRefs, {
    resourceCosts: [{ resource: 'smn-fountain', amount: 1 }]
  }),
  action('smn-luxwave', 'Luxwave', 'pet', 160, { referenceIds: smnTimingRefs }),
  action('smn-wyrmwave', 'Wyrmwave', 'pet', 150, { referenceIds: smnTimingRefs }),
  action('smn-scarlet-flame', 'Scarlet Flame', 'pet', 150, { referenceIds: smnTimingRefs }),
  ogcd('smn-sunflare', 'Sunflare', 1000, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-sunflare-ready', amount: 1 }]
  }),
  ogcd('smn-enkindle-solar', 'Enkindle Solar Bahamut', 1500, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-solar-enkindle-ready', amount: 1 }]
  }),
  ogcd('smn-deathflare', 'Deathflare', 500, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-deathflare-ready', amount: 1 }]
  }),
  ogcd('smn-enkindle-bahamut', 'Enkindle Bahamut', 1300, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-bahamut-enkindle-ready', amount: 1 }]
  }),
  ogcd('smn-enkindle-phoenix', 'Enkindle Phoenix', 1300, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-phoenix-enkindle-ready', amount: 1 }]
  }),
  spellGcd('smn-summon-ifrit', 'Summon Ifrit II', 800, smnRefs, {
    resourceCosts: [{ resource: 'smn-arcanum', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-ruby', amount: 2 },
      { kind: 'resource', resource: 'smn-crimson-cyclone-ready', amount: 1 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'titan', durationMs: 60_000 }
    ]
  }),
  spellGcd('smn-ruby-rite', 'Ruby Rite', 620, smnRefs, {
    recastMs: 3000,
    castMs: 2800,
    resourceCosts: [{ resource: 'smn-ruby', amount: 1 }]
  }),
  spellGcd('smn-crimson-cyclone', 'Crimson Cyclone', 560, smnRefs, {
    resourceCosts: [{ resource: 'smn-crimson-cyclone-ready', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'smn-crimson-strike-ready', amount: 1 }]
  }),
  spellGcd('smn-crimson-strike', 'Crimson Strike', 560, smnRefs, {
    resourceCosts: [{ resource: 'smn-crimson-strike-ready', amount: 1 }]
  }),
  spellGcd('smn-summon-titan', 'Summon Titan II', 800, smnRefs, {
    resourceCosts: [{ resource: 'smn-arcanum', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-topaz', amount: 4 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'garuda', durationMs: 60_000 }
    ]
  }),
  spellGcd('smn-topaz-rite', 'Topaz Rite', 340, smnRefs, {
    resourceCosts: [{ resource: 'smn-topaz', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'smn-mountain-buster-ready', amount: 1 }]
  }),
  ogcd('smn-mountain-buster', 'Mountain Buster', 160, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-mountain-buster-ready', amount: 1 }]
  }),
  spellGcd('smn-summon-garuda', 'Summon Garuda II', 800, smnRefs, {
    resourceCosts: [{ resource: 'smn-arcanum', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'smn-emerald', amount: 4 },
      { kind: 'resource', resource: 'smn-slipstream-ready', amount: 1 },
      { kind: 'combo', comboId: 'smn-primal-cycle', nextStep: 'complete', durationMs: 60_000 }
    ]
  }),
  spellGcd('smn-emerald-rite', 'Emerald Rite', 280, smnRefs, {
    recastMs: 1500,
    resourceCosts: [{ resource: 'smn-emerald', amount: 1 }]
  }),
  spellGcd('smn-slipstream', 'Slipstream', 520, smnRefs, {
    castMs: 3000,
    resourceCosts: [{ resource: 'smn-slipstream-ready', amount: 1 }],
    effects: [{ kind: 'dot', dotId: 'smn-slipstream', durationMs: 15_000, tickPotency: 30 }]
  }),
  ogcd('smn-searing-light', 'Searing Light', 0, 120_000, smnRefs, {
    effects: [
      { kind: 'buff', buffId: 'smn-searing-light', durationMs: 20_000, damageMultiplier: 1.05 },
      { kind: 'resource', resource: 'smn-searing-flash-ready', amount: 1 }
    ]
  }),
  ogcd('smn-searing-flash', 'Searing Flash', 700, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-searing-flash-ready', amount: 1 }]
  }),
  ogcd('smn-energy-drain', 'Energy Drain', 200, 60_000, smnRefs, {
    effects: [
      { kind: 'resource', resource: 'smn-aetherflow', amount: 2 },
      { kind: 'resource', resource: 'smn-further-ruin', amount: 1 }
    ]
  }),
  ogcd('smn-necrotize', 'Necrotize', 500, 0, smnRefs, {
    resourceCosts: [{ resource: 'smn-aetherflow', amount: 1 }]
  }),
  spellGcd('smn-ruin-four', 'Ruin IV', 520, smnRefs, {
    resourceCosts: [{ resource: 'smn-further-ruin', amount: 1 }]
  }),
  spellGcd('smn-ruin-three', 'Ruin III', 400, smnRefs, { castMs: 1500 })
];

const smnDemiClear = [
  { kind: 'resource-at-most', resource: 'smn-umbral', amount: 0 },
  { kind: 'resource-at-most', resource: 'smn-astral', amount: 0 },
  { kind: 'resource-at-most', resource: 'smn-fountain', amount: 0 }
] as const;
const SMN_RULES: CombatPriorityRule[] = [
  rule('smn-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the opening weave.', smnRefs),
  rule('smn-searing-light', 'smn-searing-light', [{ kind: 'cooldown-ready', actionId: 'smn-searing-light' }], 'Use Searing Light on cooldown.', smnRefs),
  rule('smn-searing-flash', 'smn-searing-flash', [{ kind: 'resource-at-least', resource: 'smn-searing-flash-ready', amount: 1 }], 'Spend Ruby Glimmer on Searing Flash.', smnRefs),
  rule('smn-energy-drain', 'smn-energy-drain', [{ kind: 'cooldown-ready', actionId: 'smn-energy-drain' }], 'Generate Aetherflow and Further Ruin on cooldown.', smnRefs),
  rule('smn-necrotize', 'smn-necrotize', [{ kind: 'resource-at-least', resource: 'smn-aetherflow', amount: 1 }], 'Spend Aetherflow on Necrotize.', smnRefs),
  rule('smn-sunflare', 'smn-sunflare', [{ kind: 'resource-at-least', resource: 'smn-sunflare-ready', amount: 1 }], 'Use Sunflare in Lightwyrm Trance.', smnRefs),
  rule('smn-enkindle-solar', 'smn-enkindle-solar', [{ kind: 'resource-at-least', resource: 'smn-solar-enkindle-ready', amount: 1 }], 'Use Solar Bahamut enkindle.', smnRefs),
  rule('smn-deathflare', 'smn-deathflare', [{ kind: 'resource-at-least', resource: 'smn-deathflare-ready', amount: 1 }], 'Use Deathflare in Dreadwyrm Trance.', smnRefs),
  rule('smn-enkindle-bahamut', 'smn-enkindle-bahamut', [{ kind: 'resource-at-least', resource: 'smn-bahamut-enkindle-ready', amount: 1 }], 'Use Bahamut enkindle.', smnRefs),
  rule('smn-enkindle-phoenix', 'smn-enkindle-phoenix', [{ kind: 'resource-at-least', resource: 'smn-phoenix-enkindle-ready', amount: 1 }], 'Use Phoenix enkindle.', smnRefs),
  rule('smn-solar-one', 'smn-solar-one', [{ kind: 'resource-at-least', resource: 'smn-solar-one-ready', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'smn-demi-lock', durationMs: 0 }], 'Begin the four-minute Solar, Bahamut, Solar, Phoenix cycle.', smnTimingRefs),
  rule('smn-bahamut', 'smn-bahamut', [{ kind: 'resource-at-least', resource: 'smn-bahamut-ready', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'smn-demi-lock', durationMs: 0 }], 'Use Bahamut in the second one-minute phase.', smnTimingRefs),
  rule('smn-solar-two', 'smn-solar-two', [{ kind: 'resource-at-least', resource: 'smn-solar-two-ready', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'smn-demi-lock', durationMs: 0 }], 'Return to Solar Bahamut in the third phase.', smnTimingRefs),
  rule('smn-phoenix', 'smn-phoenix', [{ kind: 'resource-at-least', resource: 'smn-phoenix-ready', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'smn-demi-lock', durationMs: 0 }], 'Use Phoenix in the fourth phase.', smnTimingRefs),
  rule('smn-umbral', 'smn-umbral-impulse', [{ kind: 'resource-at-least', resource: 'smn-umbral', amount: 1 }], 'Fill the Solar Bahamut phase with Umbral Impulse.', smnRefs),
  rule('smn-astral', 'smn-astral-impulse', [{ kind: 'resource-at-least', resource: 'smn-astral', amount: 1 }], 'Fill the Bahamut phase with Astral Impulse.', smnRefs),
  rule('smn-fountain', 'smn-fountain-of-fire', [{ kind: 'resource-at-least', resource: 'smn-fountain', amount: 1 }], 'Fill the Phoenix phase with Fountain of Fire.', smnRefs),
  rule('smn-ifrit', 'smn-summon-ifrit', [{ kind: 'combo-step', comboId: 'smn-primal-cycle', step: 'ifrit' }, { kind: 'resource-at-least', resource: 'smn-arcanum', amount: 1 }, ...smnDemiClear], 'Begin the elemental cycle with Ifrit.', smnRefs),
  rule('smn-ruby', 'smn-ruby-rite', [{ kind: 'resource-at-least', resource: 'smn-ruby', amount: 1 }], 'Spend both Fire Attunement stacks.', smnRefs),
  rule('smn-crimson-cyclone', 'smn-crimson-cyclone', [{ kind: 'resource-at-least', resource: 'smn-crimson-cyclone-ready', amount: 1 }], 'Spend Ifrit Favor on Crimson Cyclone.', smnRefs),
  rule('smn-crimson-strike', 'smn-crimson-strike', [{ kind: 'resource-at-least', resource: 'smn-crimson-strike-ready', amount: 1 }], 'Complete the Ifrit Favor pair.', smnRefs),
  rule('smn-titan', 'smn-summon-titan', [{ kind: 'combo-step', comboId: 'smn-primal-cycle', step: 'titan' }, { kind: 'resource-at-least', resource: 'smn-arcanum', amount: 1 }, { kind: 'resource-at-most', resource: 'smn-ruby', amount: 0 }, { kind: 'resource-at-most', resource: 'smn-crimson-cyclone-ready', amount: 0 }, { kind: 'resource-at-most', resource: 'smn-crimson-strike-ready', amount: 0 }], 'Continue with Titan after Ifrit resources are spent.', smnRefs),
  rule('smn-mountain-buster', 'smn-mountain-buster', [{ kind: 'resource-at-least', resource: 'smn-mountain-buster-ready', amount: 1 }], 'Weave Mountain Buster after Topaz Rite.', smnRefs),
  rule('smn-topaz', 'smn-topaz-rite', [{ kind: 'resource-at-least', resource: 'smn-topaz', amount: 1 }], 'Spend Earth Attunement on Topaz Rite.', smnRefs),
  rule('smn-garuda', 'smn-summon-garuda', [{ kind: 'combo-step', comboId: 'smn-primal-cycle', step: 'garuda' }, { kind: 'resource-at-least', resource: 'smn-arcanum', amount: 1 }, { kind: 'resource-at-most', resource: 'smn-topaz', amount: 0 }, { kind: 'resource-at-most', resource: 'smn-mountain-buster-ready', amount: 0 }], 'Finish the elemental cycle with Garuda.', smnRefs),
  rule('smn-slipstream', 'smn-slipstream', [{ kind: 'resource-at-least', resource: 'smn-slipstream-ready', amount: 1 }], 'Place Slipstream during Garuda Favor.', smnRefs),
  rule('smn-emerald', 'smn-emerald-rite', [{ kind: 'resource-at-least', resource: 'smn-emerald', amount: 1 }], 'Spend Wind Attunement on Emerald Rite.', smnRefs),
  rule('smn-ruin-four', 'smn-ruin-four', [{ kind: 'resource-at-least', resource: 'smn-further-ruin', amount: 1 }], 'Spend Further Ruin before the next Energy Drain.', smnRefs),
  rule('smn-filler', 'smn-ruin-three', [{ kind: 'always' }], 'Use Ruin III only when every phase resource is exhausted.', smnRefs)
];

export const SMN_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'smn-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'SMN',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'smn-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: SMN_ACTIONS,
  priorityRules: SMN_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'SMN',
    'Summoner',
    'summoner',
    'packages/sims/src/cycle_sim.ts',
    'No job-specific Summoner simulator exists at the pinned commit. Shared cycle timing and cutoff behaviour are used only as an independent engine-level cross-check.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['smn-official-actions', 'smn-xivgear-oracle'],
    checks: [
      'Patch-7.5 Demi-Summon, elemental attunement, Aetherflow and Searing Light action data.',
      'Deterministic Solar Bahamut, Bahamut, Solar Bahamut, Phoenix cadence with strict 30-second and 300-second cutoffs.'
    ],
    limitations: [
      'No job-specific XivGear Summoner simulator exists at the pinned reference commit.',
      'The elemental order is a fixed Ifrit, Titan, Garuda stationary-dummy priority and pet response timing is represented as eight deterministic 1.5-second attacks.',
      'Rekindle and Lux Solaris are omitted because their value is healing rather than personal damage.'
    ]
  },
  limitation: 'Preliminary stationary-dummy priority. It models the four-minute Demi cycle, elemental attunements, pet attacks and burst resources, but not movement-driven primal ordering or community opener alignment.'
};

const rdmRefs = ['rdm-official-actions', 'rdm-internal-priority'];
const rdmTimingRefs = [...rdmRefs, 'rdm-xivgear-oracle'];
const RDM_ACTIONS: CombatActionProfile[] = [
  potion(rdmRefs),
  spellGcd('rdm-dualcast-pair', 'Dualcast pair (expected)', 810, rdmTimingRefs, {
    recastMs: 5000,
    castMs: 2000,
    effects: [
      { kind: 'resource', resource: 'rdm-black-mana', amount: 5.25 },
      { kind: 'resource', resource: 'rdm-white-mana', amount: 5.25 }
    ]
  }),
  spellGcd('rdm-enchanted-riposte', 'Enchanted Riposte', 340, rdmRefs, {
    recastMs: 1500,
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'rdm-black-mana', amount: 20 },
      { resource: 'rdm-white-mana', amount: 20 }
    ],
    effects: [{ kind: 'combo', comboId: 'rdm-melee', nextStep: 'zwerchhau', durationMs: 30_000 }]
  }),
  spellGcd('rdm-enchanted-zwerchhau', 'Enchanted Zwerchhau', 380, rdmRefs, {
    recastMs: 1500,
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'rdm-black-mana', amount: 15 },
      { resource: 'rdm-white-mana', amount: 15 }
    ],
    effects: [{ kind: 'combo', comboId: 'rdm-melee', nextStep: 'redoublement', durationMs: 30_000 }]
  }),
  spellGcd('rdm-enchanted-redoublement', 'Enchanted Redoublement', 560, rdmRefs, {
    recastMs: 2200,
    speedScaling: 'none',
    resourceCosts: [
      { resource: 'rdm-black-mana', amount: 15 },
      { resource: 'rdm-white-mana', amount: 15 }
    ],
    effects: [
      { kind: 'resource', resource: 'rdm-mana-stack', amount: 3 },
      { kind: 'combo', comboId: 'rdm-melee', nextStep: 'finisher', durationMs: 30_000 }
    ]
  }),
  spellGcd('rdm-balanced-finisher', 'Verflare / Verholy (balanced)', 650, rdmTimingRefs, {
    resourceCosts: [{ resource: 'rdm-mana-stack', amount: 3 }],
    effects: [
      { kind: 'resource', resource: 'rdm-black-mana', amount: 5.5 },
      { kind: 'resource', resource: 'rdm-white-mana', amount: 5.5 },
      { kind: 'combo', comboId: 'rdm-melee', nextStep: 'scorch', durationMs: 30_000 }
    ]
  }),
  spellGcd('rdm-scorch', 'Scorch', 750, rdmRefs, {
    effects: [
      { kind: 'resource', resource: 'rdm-black-mana', amount: 4 },
      { kind: 'resource', resource: 'rdm-white-mana', amount: 4 },
      { kind: 'combo', comboId: 'rdm-melee', nextStep: 'resolution', durationMs: 30_000 }
    ]
  }),
  spellGcd('rdm-resolution', 'Resolution', 850, rdmRefs, {
    effects: [
      { kind: 'resource', resource: 'rdm-black-mana', amount: 4 },
      { kind: 'resource', resource: 'rdm-white-mana', amount: 4 },
      { kind: 'combo', comboId: 'rdm-melee', nextStep: 'complete', durationMs: 1000 }
    ]
  }),
  spellGcd('rdm-grand-impact', 'Grand Impact', 600, rdmRefs, {
    resourceCosts: [{ resource: 'rdm-grand-impact-ready', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'rdm-black-mana', amount: 3 },
      { kind: 'resource', resource: 'rdm-white-mana', amount: 3 }
    ]
  }),
  ogcd('rdm-acceleration', 'Acceleration', 0, 55_000, rdmRefs, {
    charges: 2,
    effects: [{ kind: 'resource', resource: 'rdm-grand-impact-ready', amount: 1 }]
  }),
  ogcd('rdm-embolden', 'Embolden', 0, 120_000, rdmRefs, {
    effects: [
      { kind: 'buff', buffId: 'rdm-embolden', durationMs: 20_000, damageMultiplier: 1.05 },
      { kind: 'resource', resource: 'rdm-vice-ready', amount: 1 }
    ]
  }),
  ogcd('rdm-vice-of-thorns', 'Vice of Thorns', 950, 0, rdmRefs, {
    resourceCosts: [{ resource: 'rdm-vice-ready', amount: 1 }]
  }),
  ogcd('rdm-manafication', 'Manafication', 0, 110_000, rdmRefs, {
    effects: [
      { kind: 'resource', resource: 'rdm-black-mana', amount: 50 },
      { kind: 'resource', resource: 'rdm-white-mana', amount: 50 },
      { kind: 'resource', resource: 'rdm-prefulgence-ready', amount: 1 },
      { kind: 'buff', buffId: 'rdm-manafication', durationMs: 15_000, damageMultiplier: 1.05 }
    ]
  }),
  ogcd('rdm-prefulgence', 'Prefulgence', 1200, 0, rdmRefs, {
    resourceCosts: [{ resource: 'rdm-prefulgence-ready', amount: 1 }]
  }),
  ogcd('rdm-fleche', 'Fleche', 480, 25_000, rdmRefs),
  ogcd('rdm-contre-sixte', 'Contre Sixte', 420, 35_000, rdmRefs),
  ogcd('rdm-corps-a-corps', 'Corps-a-corps', 130, 35_000, rdmRefs, { charges: 2 }),
  ogcd('rdm-engagement', 'Engagement', 180, 35_000, rdmRefs, { charges: 2 })
];

const RDM_RULES: CombatPriorityRule[] = [
  rule('rdm-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the opening weave.', rdmRefs),
  rule('rdm-embolden', 'rdm-embolden', [{ kind: 'cooldown-ready', actionId: 'rdm-embolden' }], 'Use Embolden on cooldown.', rdmRefs),
  rule('rdm-manafication', 'rdm-manafication', [{ kind: 'cooldown-ready', actionId: 'rdm-manafication' }], 'Use Manafication for a deterministic free melee-cycle credit.', rdmTimingRefs),
  rule('rdm-vice', 'rdm-vice-of-thorns', [{ kind: 'resource-at-least', resource: 'rdm-vice-ready', amount: 1 }], 'Spend Thorned Flourish.', rdmRefs),
  rule('rdm-prefulgence', 'rdm-prefulgence', [{ kind: 'resource-at-least', resource: 'rdm-prefulgence-ready', amount: 1 }], 'Spend Prefulgence Ready.', rdmRefs),
  rule('rdm-acceleration', 'rdm-acceleration', [{ kind: 'cooldown-ready', actionId: 'rdm-acceleration', minimumCharges: 1 }], 'Use Acceleration charges for Grand Impact.', rdmRefs),
  rule('rdm-fleche', 'rdm-fleche', [{ kind: 'cooldown-ready', actionId: 'rdm-fleche' }], 'Use Fleche on cooldown.', rdmRefs),
  rule('rdm-contre', 'rdm-contre-sixte', [{ kind: 'cooldown-ready', actionId: 'rdm-contre-sixte' }], 'Use Contre Sixte on cooldown.', rdmRefs),
  rule('rdm-corps', 'rdm-corps-a-corps', [{ kind: 'cooldown-ready', actionId: 'rdm-corps-a-corps', minimumCharges: 1 }], 'Spend Corps-a-corps charges without overcapping.', rdmRefs),
  rule('rdm-engagement', 'rdm-engagement', [{ kind: 'cooldown-ready', actionId: 'rdm-engagement', minimumCharges: 1 }], 'Spend Engagement charges without overcapping.', rdmRefs),
  rule('rdm-zwerchhau', 'rdm-enchanted-zwerchhau', [{ kind: 'combo-step', comboId: 'rdm-melee', step: 'zwerchhau' }], 'Continue the enchanted melee combo.', rdmRefs),
  rule('rdm-redoublement', 'rdm-enchanted-redoublement', [{ kind: 'combo-step', comboId: 'rdm-melee', step: 'redoublement' }], 'Complete the enchanted melee combo.', rdmRefs),
  rule('rdm-finisher', 'rdm-balanced-finisher', [{ kind: 'combo-step', comboId: 'rdm-melee', step: 'finisher' }, { kind: 'resource-at-least', resource: 'rdm-mana-stack', amount: 3 }], 'Use the deterministic balanced Verflare or Verholy expectation.', rdmTimingRefs),
  rule('rdm-scorch', 'rdm-scorch', [{ kind: 'combo-step', comboId: 'rdm-melee', step: 'scorch' }], 'Continue the finisher chain with Scorch.', rdmRefs),
  rule('rdm-resolution', 'rdm-resolution', [{ kind: 'combo-step', comboId: 'rdm-melee', step: 'resolution' }], 'Complete the finisher chain with Resolution.', rdmRefs),
  rule('rdm-riposte', 'rdm-enchanted-riposte', [{ kind: 'resource-at-least', resource: 'rdm-black-mana', amount: 50 }, { kind: 'resource-at-least', resource: 'rdm-white-mana', amount: 50 }], 'Begin the melee combo at balanced 50/50 mana.', rdmTimingRefs),
  rule('rdm-grand-impact', 'rdm-grand-impact', [{ kind: 'resource-at-least', resource: 'rdm-grand-impact-ready', amount: 1 }], 'Spend Grand Impact Ready.', rdmRefs),
  rule('rdm-filler', 'rdm-dualcast-pair', [{ kind: 'always' }], 'Use a two-GCD expected-value Dualcast pair as the stationary filler.', rdmTimingRefs)
];

export const RDM_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'rdm-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'RDM',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'rdm-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: RDM_ACTIONS,
  priorityRules: RDM_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'RDM',
    'Red Mage',
    'redmage',
    'packages/sims/src/cycle_sim.ts',
    'No job-specific Red Mage simulator exists at the pinned commit. Shared cycle timing and cutoff behaviour are used only as an independent engine-level cross-check.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['rdm-official-actions', 'rdm-xivgear-oracle'],
    checks: [
      'Patch-7.5 melee combo, finisher chain, Grand Impact, Vice of Thorns and Prefulgence action data.',
      'Spell-speed-sensitive filler cadence and fixed-speed enchanted melee sequence under strict evaluation cutoffs.'
    ],
    limitations: [
      'No job-specific XivGear Red Mage simulator exists at the pinned reference commit.',
      'Dualcast, proc spells and alternating Verthunder III or Veraero III are folded into a deterministic two-GCD expected-value filler.',
      'Manafication free swordplay is represented as a virtual 50/50 mana credit, and the Verflare or Verholy choice is balanced rather than imbalance-aware.'
    ]
  },
  limitation: 'Preliminary stationary-dummy priority. It preserves spell-speed filler scaling and fixed melee timing, but aggregates Dualcast and proc routing and does not reproduce a community opener.'
};

const pctRefs = ['pct-official-actions', 'pct-internal-priority'];
const pctTimingRefs = [...pctRefs, 'pct-xivgear-oracle'];
const fixedPctSpell = (
  id: string,
  name: string,
  potency: number,
  recastMs: number,
  castMs: number,
  overrides: Partial<CombatActionProfile> = {}
) => spellGcd(id, name, potency, pctTimingRefs, {
  recastMs,
  castMs,
  speedScaling: 'none',
  ...overrides
});
const PCT_ACTIONS: CombatActionProfile[] = [
  potion(pctRefs),
  spellGcd('pct-fire', 'Fire in Red', 490, pctRefs, {
    castMs: 1500,
    effects: [{ kind: 'combo', comboId: 'pct-aetherhues', nextStep: 'aero', durationMs: 30_000 }]
  }),
  spellGcd('pct-aero', 'Aero in Green', 530, pctRefs, {
    castMs: 1500,
    effects: [{ kind: 'combo', comboId: 'pct-aetherhues', nextStep: 'water', durationMs: 30_000 }]
  }),
  spellGcd('pct-water', 'Water in Blue', 570, pctRefs, {
    castMs: 1500,
    effects: [
      { kind: 'resource', resource: 'pct-palette', amount: 25 },
      { kind: 'resource', resource: 'pct-white-paint', amount: 1 },
      { kind: 'combo', comboId: 'pct-aetherhues', nextStep: 'fire', durationMs: 30_000 }
    ]
  }),
  fixedPctSpell('pct-blizzard', 'Blizzard in Cyan', 860, 3300, 2300, {
    resourceCosts: [{ resource: 'pct-subtractive', amount: 1 }],
    effects: [{ kind: 'combo', comboId: 'pct-subtractive-combo', nextStep: 'stone', durationMs: 30_000 }]
  }),
  fixedPctSpell('pct-stone', 'Stone in Yellow', 900, 3300, 2300, {
    resourceCosts: [{ resource: 'pct-subtractive', amount: 1 }],
    effects: [{ kind: 'combo', comboId: 'pct-subtractive-combo', nextStep: 'thunder', durationMs: 30_000 }]
  }),
  fixedPctSpell('pct-thunder', 'Thunder in Magenta', 940, 3300, 2300, {
    resourceCosts: [{ resource: 'pct-subtractive', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'pct-white-paint', amount: 1 },
      { kind: 'combo', comboId: 'pct-subtractive-combo', nextStep: 'complete', durationMs: 1000 }
    ]
  }),
  ogcd('pct-subtractive-palette', 'Subtractive Palette', 0, 0, pctRefs, {
    resourceCosts: [{ resource: 'pct-palette', amount: 50 }],
    effects: [
      { kind: 'resource', resource: 'pct-subtractive', amount: 3 },
      { kind: 'resource', resource: 'pct-black-paint', amount: 1 },
      { kind: 'combo', comboId: 'pct-subtractive-combo', nextStep: 'blizzard', durationMs: 30_000 }
    ]
  }),
  ogcd('pct-subtractive-palette-free', 'Subtractive Palette (Spectrum)', 0, 0, pctRefs, {
    resourceCosts: [{ resource: 'pct-subtractive-spectrum', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'pct-subtractive', amount: 3 },
      { kind: 'resource', resource: 'pct-black-paint', amount: 1 },
      { kind: 'combo', comboId: 'pct-subtractive-combo', nextStep: 'blizzard', durationMs: 30_000 }
    ]
  }),
  fixedPctSpell('pct-comet', 'Comet in Black', 940, 3300, 0, {
    resourceCosts: [{ resource: 'pct-black-paint', amount: 1 }]
  }),
  spellGcd('pct-holy', 'Holy in White', 570, pctRefs, {
    resourceCosts: [{ resource: 'pct-white-paint', amount: 1 }]
  }),
  fixedPctSpell('pct-hammer-stamp', 'Hammer Stamp', 560, 2500, 0, {
    resourceCosts: [{ resource: 'pct-hammer-time', amount: 1 }],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    effects: [{ kind: 'combo', comboId: 'pct-hammer', nextStep: 'brush', durationMs: 30_000 }]
  }),
  fixedPctSpell('pct-hammer-brush', 'Hammer Brush', 580, 2500, 0, {
    resourceCosts: [{ resource: 'pct-hammer-time', amount: 1 }],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    effects: [{ kind: 'combo', comboId: 'pct-hammer', nextStep: 'polish', durationMs: 30_000 }]
  }),
  fixedPctSpell('pct-polishing-hammer', 'Polishing Hammer', 600, 2500, 0, {
    resourceCosts: [{ resource: 'pct-hammer-time', amount: 1 }],
    criticalHitMode: 'guaranteed',
    directHitMode: 'guaranteed',
    effects: [
      { kind: 'resource', resource: 'pct-hammer-motif-needed', amount: 1 },
      { kind: 'combo', comboId: 'pct-hammer', nextStep: 'complete', durationMs: 1000 }
    ]
  }),
  ogcd('pct-striking-muse', 'Striking Muse', 0, 60_000, pctRefs, {
    charges: 2,
    resourceCosts: [{ resource: 'pct-hammer-canvas', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-hammer-time', amount: 3 }]
  }),
  fixedPctSpell('pct-hammer-motif', 'Hammer Motif', 0, 4000, 3000, {
    resourceCosts: [{ resource: 'pct-hammer-motif-needed', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-hammer-canvas', amount: 1 }]
  }),
  ogcd('pct-starry-muse', 'Starry Muse', 0, 120_000, pctRefs, {
    resourceCosts: [{ resource: 'pct-landscape-canvas', amount: 1 }],
    effects: [
      { kind: 'buff', buffId: 'pct-starry-muse', durationMs: 20_000, damageMultiplier: 1.05 },
      { kind: 'buff', buffId: 'pct-inspiration', durationMs: 12_500, hastePercent: 25 },
      { kind: 'resource', resource: 'pct-subtractive-spectrum', amount: 1 },
      { kind: 'resource', resource: 'pct-star-prism-ready', amount: 1 },
      { kind: 'resource', resource: 'pct-rainbow-ready', amount: 1 },
      { kind: 'resource', resource: 'pct-landscape-motif-needed', amount: 1 }
    ]
  }),
  fixedPctSpell('pct-starry-sky-motif', 'Starry Sky Motif', 0, 4000, 3000, {
    resourceCosts: [{ resource: 'pct-landscape-motif-needed', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-landscape-canvas', amount: 1 }]
  }),
  spellGcd('pct-star-prism', 'Star Prism', 1100, pctRefs, {
    resourceCosts: [{ resource: 'pct-star-prism-ready', amount: 1 }]
  }),
  fixedPctSpell('pct-rainbow-drip', 'Rainbow Drip', 1000, 2500, 0, {
    resourceCosts: [{ resource: 'pct-rainbow-ready', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-white-paint', amount: 1 }]
  }),
  fixedPctSpell('pct-pom-motif', 'Pom Motif', 0, 4000, 3000, {
    resourceCosts: [{ resource: 'pct-pom-motif-needed', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-pom-canvas', amount: 1 }]
  }),
  fixedPctSpell('pct-wing-motif', 'Wing Motif', 0, 4000, 3000, {
    resourceCosts: [{ resource: 'pct-wing-motif-needed', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-wing-canvas', amount: 1 }]
  }),
  fixedPctSpell('pct-claw-motif', 'Claw Motif', 0, 4000, 3000, {
    resourceCosts: [{ resource: 'pct-claw-motif-needed', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-claw-canvas', amount: 1 }]
  }),
  fixedPctSpell('pct-maw-motif', 'Maw Motif', 0, 4000, 3000, {
    resourceCosts: [{ resource: 'pct-maw-motif-needed', amount: 1 }],
    effects: [{ kind: 'resource', resource: 'pct-maw-canvas', amount: 1 }]
  }),
  ogcd('pct-pom-muse', 'Pom Muse', 800, 160_000, pctRefs, {
    resourceCosts: [{ resource: 'pct-pom-canvas', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'pct-wing-motif-needed', amount: 1 },
      { kind: 'buff', buffId: 'pct-living-muse-lock', durationMs: 40_000 }
    ]
  }),
  ogcd('pct-winged-muse', 'Winged Muse', 800, 160_000, pctRefs, {
    resourceCosts: [{ resource: 'pct-wing-canvas', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'pct-claw-motif-needed', amount: 1 },
      { kind: 'resource', resource: 'pct-mog-ready', amount: 1 },
      { kind: 'buff', buffId: 'pct-living-muse-lock', durationMs: 40_000 }
    ]
  }),
  ogcd('pct-clawed-muse', 'Clawed Muse', 800, 160_000, pctRefs, {
    resourceCosts: [{ resource: 'pct-claw-canvas', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'pct-maw-motif-needed', amount: 1 },
      { kind: 'buff', buffId: 'pct-living-muse-lock', durationMs: 40_000 }
    ]
  }),
  ogcd('pct-fanged-muse', 'Fanged Muse', 800, 160_000, pctRefs, {
    resourceCosts: [{ resource: 'pct-maw-canvas', amount: 1 }],
    effects: [
      { kind: 'resource', resource: 'pct-pom-motif-needed', amount: 1 },
      { kind: 'resource', resource: 'pct-madeen-ready', amount: 1 },
      { kind: 'buff', buffId: 'pct-living-muse-lock', durationMs: 40_000 }
    ]
  }),
  ogcd('pct-mog', 'Mog of the Ages', 1000, 0, pctRefs, {
    resourceCosts: [{ resource: 'pct-mog-ready', amount: 1 }]
  }),
  ogcd('pct-madeen', 'Retribution of the Madeen', 1100, 0, pctRefs, {
    resourceCosts: [{ resource: 'pct-madeen-ready', amount: 1 }]
  })
];

const PCT_RULES: CombatPriorityRule[] = [
  rule('pct-potion', 'pilot-potion', [{ kind: 'cooldown-ready', actionId: 'pilot-potion' }], 'Use the enabled potion in the opening weave.', pctRefs),
  rule('pct-starry-muse', 'pct-starry-muse', [{ kind: 'resource-at-least', resource: 'pct-landscape-canvas', amount: 1 }, { kind: 'cooldown-ready', actionId: 'pct-starry-muse' }], 'Render the prepainted landscape on cooldown.', pctRefs),
  rule('pct-striking-muse', 'pct-striking-muse', [{ kind: 'resource-at-least', resource: 'pct-hammer-canvas', amount: 1 }, { kind: 'cooldown-ready', actionId: 'pct-striking-muse', minimumCharges: 1 }], 'Render the prepainted hammer without overcapping charges.', pctRefs),
  rule('pct-pom-muse', 'pct-pom-muse', [{ kind: 'resource-at-least', resource: 'pct-pom-canvas', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'pct-living-muse-lock', durationMs: 0 }], 'Render Pom as the first creature depiction.', pctTimingRefs),
  rule('pct-wing-muse', 'pct-winged-muse', [{ kind: 'resource-at-least', resource: 'pct-wing-canvas', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'pct-living-muse-lock', durationMs: 0 }], 'Render Wings as the second creature depiction.', pctTimingRefs),
  rule('pct-claw-muse', 'pct-clawed-muse', [{ kind: 'resource-at-least', resource: 'pct-claw-canvas', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'pct-living-muse-lock', durationMs: 0 }], 'Render Claw as the third creature depiction.', pctTimingRefs),
  rule('pct-fanged-muse', 'pct-fanged-muse', [{ kind: 'resource-at-least', resource: 'pct-maw-canvas', amount: 1 }, { kind: 'buff-remaining-at-most', buffId: 'pct-living-muse-lock', durationMs: 0 }], 'Render Fangs and complete the Madeen portrait.', pctTimingRefs),
  rule('pct-mog', 'pct-mog', [{ kind: 'resource-at-least', resource: 'pct-mog-ready', amount: 1 }], 'Spend the completed Moogle portrait.', pctRefs),
  rule('pct-madeen', 'pct-madeen', [{ kind: 'resource-at-least', resource: 'pct-madeen-ready', amount: 1 }], 'Spend the completed Madeen portrait.', pctRefs),
  rule('pct-hammer-brush', 'pct-hammer-brush', [{ kind: 'combo-step', comboId: 'pct-hammer', step: 'brush' }], 'Continue the guaranteed critical direct-hit hammer chain.', pctRefs),
  rule('pct-polishing-hammer', 'pct-polishing-hammer', [{ kind: 'combo-step', comboId: 'pct-hammer', step: 'polish' }], 'Complete the hammer chain.', pctRefs),
  rule('pct-hammer-stamp', 'pct-hammer-stamp', [{ kind: 'resource-at-least', resource: 'pct-hammer-time', amount: 3 }], 'Begin the three-hit hammer chain.', pctRefs),
  rule('pct-star-prism', 'pct-star-prism', [{ kind: 'resource-at-least', resource: 'pct-star-prism-ready', amount: 1 }], 'Spend Starstruck inside Starry Muse.', pctRefs),
  rule('pct-subtractive-spectrum', 'pct-subtractive-palette-free', [{ kind: 'resource-at-least', resource: 'pct-subtractive-spectrum', amount: 1 }, { kind: 'resource-at-most', resource: 'pct-subtractive', amount: 0 }], 'Use the free Subtractive Spectrum palette.', pctRefs),
  rule('pct-subtractive', 'pct-subtractive-palette', [{ kind: 'resource-at-least', resource: 'pct-palette', amount: 50 }, { kind: 'resource-at-most', resource: 'pct-subtractive', amount: 0 }], 'Spend 50 Palette Gauge on the subtractive cycle.', pctRefs),
  rule('pct-blizzard', 'pct-blizzard', [{ kind: 'combo-step', comboId: 'pct-subtractive-combo', step: 'blizzard' }], 'Begin the subtractive aetherhue cycle.', pctRefs),
  rule('pct-stone', 'pct-stone', [{ kind: 'combo-step', comboId: 'pct-subtractive-combo', step: 'stone' }], 'Continue the subtractive aetherhue cycle.', pctRefs),
  rule('pct-thunder', 'pct-thunder', [{ kind: 'combo-step', comboId: 'pct-subtractive-combo', step: 'thunder' }], 'Complete the subtractive aetherhue cycle.', pctRefs),
  rule('pct-comet', 'pct-comet', [{ kind: 'resource-at-least', resource: 'pct-black-paint', amount: 1 }], 'Spend converted Black Paint on Comet in Black.', pctRefs),
  rule('pct-rainbow', 'pct-rainbow-drip', [{ kind: 'resource-at-least', resource: 'pct-rainbow-ready', amount: 1 }], 'Spend Rainbow Bright after the Starry burst sequence.', pctTimingRefs),
  rule('pct-holy', 'pct-holy', [{ kind: 'resource-at-least', resource: 'pct-white-paint', amount: 5 }], 'Spend White Paint only near its five-stack cap.', pctRefs),
  rule('pct-landscape-motif', 'pct-starry-sky-motif', [{ kind: 'resource-at-least', resource: 'pct-landscape-motif-needed', amount: 1 }], 'Repaint the landscape canvas after Starry Muse.', pctRefs),
  rule('pct-hammer-motif', 'pct-hammer-motif', [{ kind: 'resource-at-least', resource: 'pct-hammer-motif-needed', amount: 1 }], 'Repaint the hammer canvas after its three-hit chain.', pctRefs),
  rule('pct-pom-motif', 'pct-pom-motif', [{ kind: 'resource-at-least', resource: 'pct-pom-motif-needed', amount: 1 }], 'Paint the next Pom motif.', pctRefs),
  rule('pct-wing-motif', 'pct-wing-motif', [{ kind: 'resource-at-least', resource: 'pct-wing-motif-needed', amount: 1 }], 'Paint the next Wing motif.', pctRefs),
  rule('pct-claw-motif', 'pct-claw-motif', [{ kind: 'resource-at-least', resource: 'pct-claw-motif-needed', amount: 1 }], 'Paint the next Claw motif.', pctRefs),
  rule('pct-maw-motif', 'pct-maw-motif', [{ kind: 'resource-at-least', resource: 'pct-maw-motif-needed', amount: 1 }], 'Paint the next Maw motif.', pctRefs),
  rule('pct-aero', 'pct-aero', [{ kind: 'combo-step', comboId: 'pct-aetherhues', step: 'aero' }], 'Continue the additive aetherhue cycle.', pctRefs),
  rule('pct-water', 'pct-water', [{ kind: 'combo-step', comboId: 'pct-aetherhues', step: 'water' }], 'Complete the additive aetherhue cycle and build Palette Gauge.', pctRefs),
  rule('pct-fire-cycle', 'pct-fire', [{ kind: 'combo-step', comboId: 'pct-aetherhues', step: 'fire' }], 'Restart the additive aetherhue cycle.', pctRefs),
  rule('pct-fire-opener', 'pct-fire', [{ kind: 'always' }], 'Start with Fire in Red when no aetherhue combo exists.', pctRefs)
];

export const PCT_ROTATION_PROFILE: CombatRotationProfile = {
  id: 'pct-dt-generated-rotation@1',
  schemaVersion: ROTATION_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: 'PCT',
  jobMode: 'standard',
  version: CURRENT_ROTATION_PROFILE_VERSION,
  gamePatch: '7.51',
  engineId: 'pct-pilot-engine@1',
  supportedModes: ['opener-30', 'dummy-300'],
  confidence: 'generated-preliminary',
  actions: PCT_ACTIONS,
  priorityRules: PCT_RULES,
  openers: [],
  assumptions,
  references: referencesFor(
    'PCT',
    'Pictomancer',
    'pictomancer',
    'packages/sims/src/caster/pct/pct_actions.ts',
    'Used as an independent action-data and gauge-behaviour cross-check. The pinned source contains Pictomancer data helpers, not a complete rotation simulator.'
  ),
  validation: {
    status: 'independently-cross-checked',
    checkedAt: '2026-07-29',
    referenceIds: ['pct-official-actions', 'pct-xivgear-oracle'],
    checks: [
      'Patch-7.5 additive and subtractive aetherhues, Hammer, creature portraits and Starry Muse action data.',
      'Fixed motif recasts, guaranteed Hammer critical direct hits and Starry Muse haste under strict evaluation cutoffs.'
    ],
    limitations: [
      'The pinned XivGear source provides Pictomancer action and gauge helpers but no full-rotation oracle.',
      'Hyperphantasia is represented by a bounded 12.5-second Inspiration window rather than removing haste after exactly five qualifying casts.',
      'Motifs are repainted as soon as the canvas is empty and the deterministic priority does not reproduce a community opener.'
    ]
  },
  limitation: 'Preliminary stationary-dummy priority. It covers canvases, portraits, Hammer, Palette and Starry Muse, with a bounded Hyperphantasia approximation and no movement or encounter planning.'
};

export const CURRENT_ROTATION_PROFILES: CombatRotationProfile[] = [
  MNK_ROTATION_PROFILE,
  DRG_ROTATION_PROFILE,
  NIN_ROTATION_PROFILE,
  RPR_ROTATION_PROFILE,
  VPR_ROTATION_PROFILE,
  SAM_ROTATION_PROFILE,
  BRD_ROTATION_PROFILE,
  MCH_ROTATION_PROFILE,
  DNC_ROTATION_PROFILE,
  BLM_ROTATION_PROFILE,
  DRK_ROTATION_PROFILE,
  PLD_ROTATION_PROFILE,
  WAR_ROTATION_PROFILE,
  GNB_ROTATION_PROFILE,
  WHM_ROTATION_PROFILE,
  SCH_ROTATION_PROFILE,
  AST_ROTATION_PROFILE,
  SGE_ROTATION_PROFILE,
  SMN_ROTATION_PROFILE,
  RDM_ROTATION_PROFILE,
  PCT_ROTATION_PROFILE
];
