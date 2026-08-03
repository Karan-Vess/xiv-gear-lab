import { describe, expect, it } from 'vitest';
import {
  AST_ROTATION_PROFILE,
  BLM_ROTATION_PROFILE,
  BRD_ROTATION_PROFILE,
  CURRENT_ROTATION_PROFILES,
  DNC_ROTATION_PROFILE,
  DRG_ROTATION_PROFILE,
  DRK_ROTATION_PROFILE,
  GNB_ROTATION_PROFILE,
  MNK_ROTATION_PROFILE,
  MCH_ROTATION_PROFILE,
  NIN_ROTATION_PROFILE,
  PCT_ROTATION_PROFILE,
  PLD_ROTATION_PROFILE,
  RDM_ROTATION_PROFILE,
  RPR_ROTATION_PROFILE,
  SAM_ROTATION_PROFILE,
  SCH_ROTATION_PROFILE,
  SGE_ROTATION_PROFILE,
  SMN_ROTATION_PROFILE,
  WAR_ROTATION_PROFILE,
  WHM_ROTATION_PROFILE,
  VPR_ROTATION_PROFILE
} from '@xiv-gear-lab/data';
import { emptyStats, type CombatRotationProfile } from '@xiv-gear-lab/domain';
import {
  adjustedRecastMs,
  type CombatEvaluationRequest,
  type CombatEvaluationResult
} from './index';
import { createPilotCombatEvaluatorRegistry } from './pilot-evaluators';

const representativeStats = {
  ...emptyStats(),
  strength: 6500,
  dexterity: 6500,
  intelligence: 6500,
  mind: 6500,
  criticalHit: 3000,
  directHit: 2000,
  determination: 2000,
  tenacity: 1200,
  skillSpeed: 700,
  spellSpeed: 1400
};

const requestFor = (
  profile: CombatRotationProfile,
  mode: CombatEvaluationRequest['mode'],
  speedStatValue = ['BLM', 'SMN', 'RDM', 'PCT', 'WHM', 'SCH', 'AST', 'SGE'].includes(profile.job)
    ? representativeStats.spellSpeed
    : representativeStats.skillSpeed
): CombatEvaluationRequest => ({
  mode,
  profile,
  combatStats: {
    stats: representativeStats,
    weaponDamage: 140,
    weaponDelayMs: ['BLM', 'SMN', 'RDM', 'PCT', 'WHM', 'SCH', 'AST', 'SGE'].includes(profile.job) ? 3300 : 2600,
    speedStatValue,
    speedBaseSub: 420,
    speedLevelDiv: 2780,
    hastePercent: 0
  },
  openerPreference: 'auto',
  potion: 'included',
  includeTimeline: true
});

const simulate = (
  profile: CombatRotationProfile,
  mode: CombatEvaluationRequest['mode'],
  speedStatValue?: number
): CombatEvaluationResult => {
  const evaluator = createPilotCombatEvaluatorRegistry().requireFor(profile);
  return evaluator.simulate(requestFor(profile, mode, speedStatValue), {
    isCancelled: () => false
  });
};

const playerActions = (result: CombatEvaluationResult): string[] =>
  result.timeline
    ?.filter((record) => record.source === 'player')
    .map((record) => record.actionId) ?? [];

describe('Dawntrail pilot combat evaluators', () => {
  it.each(CURRENT_ROTATION_PROFILES.map((profile) => [profile.job, profile] as const))(
    '%s evaluates both bounded modes deterministically with explicit provenance',
    (_job, profile) => {
      for (const mode of ['opener-30', 'dummy-300'] as const) {
        const first = simulate(profile, mode);
        const second = simulate(profile, mode);

        expect(second).toEqual(first);
        expect(first.durationMs).toBe(mode === 'opener-30' ? 30_000 : 300_000);
        expect(first.totalDamage).toBeGreaterThan(0);
        expect(first.summary.actionCount).toBeGreaterThan(0);
        expect(first.method.kind).toBe('generated-priority');
        expect(first.method.warning).toContain('No current community opener');
        expect(first.decisionTrace.every((entry) => entry.source === 'generated-priority')).toBe(true);
        expect(first.references.some((reference) => reference.kind === 'official')).toBe(true);
        expect(first.references.some((reference) => reference.kind === 'xivgear-reference')).toBe(true);
        expect(first.references.some((reference) => reference.id === 'combat-potion-reference')).toBe(true);
        expect(first.validation).toMatchObject({
          status: 'independently-cross-checked'
        });
        expect(Number.isNaN(Date.parse(first.validation!.checkedAt))).toBe(false);
        expect(first.validation?.referenceIds.every((referenceId) =>
          first.references.some((reference) => reference.id === referenceId)
        )).toBe(true);
      }
    }
  );

  it('runs the Samurai deterministic Sen, Meikyo, Tendo, Kaeshi, Ikishoten, Zanshin and Ogi chains', () => {
    const result = simulate(SAM_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('sam-higanbana');
    expect(actions).toContain('sam-midare');
    expect(actions).toContain('sam-kaeshi-setsugekka');
    expect(actions).toContain('sam-meikyo-shisui');
    expect(actions).toContain('sam-meikyo-yukikaze');
    expect(actions).toContain('sam-meikyo-gekko');
    expect(actions).toContain('sam-meikyo-kasha');
    expect(actions).toContain('sam-tendo-setsugekka');
    expect(actions).toContain('sam-tendo-kaeshi-setsugekka');
    expect(actions).toContain('sam-ikishoten');
    expect(actions).toContain('sam-zanshin');
    expect(actions).toContain('sam-ogi');
    expect(actions).toContain('sam-kaeshi-namikiri');
    expect(actions.indexOf('sam-midare')).toBeLessThan(actions.indexOf('sam-kaeshi-setsugekka'));
    expect(actions.indexOf('sam-ikishoten')).toBeLessThan(actions.indexOf('sam-zanshin'));
    expect(actions.indexOf('sam-ogi')).toBeLessThan(actions.indexOf('sam-kaeshi-namikiri'));
    expect(actions.indexOf('sam-tendo-setsugekka')).toBeLessThan(actions.indexOf('sam-tendo-kaeshi-setsugekka'));
    expect(result.summary.dotCadenceById['sam-higanbana']?.applications).toBeGreaterThanOrEqual(4);
  });

  it('uses deterministic expected-value Dancer procs instead of random rolls', () => {
    const result = simulate(DNC_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('dnc-technical-finish');
    expect(actions).toContain('dnc-standard-finish');
    expect(actions).toContain('dnc-finishing-move');
    expect(actions).toContain('dnc-reverse-cascade');
    expect(actions).toContain('dnc-fountainfall');
    expect(actions).toContain('dnc-fan-dance');
    expect(result.method.confidence).toBe('generated-preliminary');
    expect(DNC_ROTATION_PROFILE.assumptions.rngMode).toBe('expected-value');
  });

  it('runs Bard through the deterministic song, Coda, Soul Voice and proc-proxy cycle', () => {
    const result = simulate(BRD_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('brd-wanderers-minuet');
    expect(actions).toContain('brd-mages-ballad');
    expect(actions).toContain('brd-armys-paeon');
    expect(actions).toContain('brd-radiant-finale-one');
    expect(actions).toContain('brd-radiant-finale-three');
    expect(actions).toContain('brd-radiant-encore-one');
    expect(actions).toContain('brd-radiant-encore-three');
    expect(actions).toContain('brd-apex-arrow');
    expect(actions).toContain('brd-blast-arrow');
    expect(actions).toContain('brd-pitch-perfect-expected');
    expect(actions.indexOf('brd-wanderers-minuet')).toBeLessThan(actions.indexOf('brd-mages-ballad'));
    expect(actions.indexOf('brd-mages-ballad')).toBeLessThan(actions.indexOf('brd-armys-paeon'));
  });

  it('runs Machinist through fixed Hypercharge, Wildfire, tools and the Queen trace', () => {
    const result = simulate(MCH_ROTATION_PROFILE, 'dummy-300');
    const actions = result.timeline?.map((record) => record.actionId) ?? [];

    expect(actions).toContain('mch-barrel-stabilizer');
    expect(actions).toContain('mch-hypercharge');
    expect(actions).toContain('mch-blazing-shot');
    expect(actions).toContain('mch-wildfire-detonator');
    expect(actions).toContain('mch-full-metal-field');
    expect(actions).toContain('mch-excavator');
    expect(actions).toContain('mch-queen-arm-punch');
    expect(actions).toContain('mch-queen-pile-bunker');
    expect(actions).toContain('mch-queen-crowned-collider');
    expect(actions.indexOf('mch-barrel-stabilizer')).toBeLessThan(actions.indexOf('mch-full-metal-field'));
    expect(result.timeline?.some((record) =>
      record.actionId === 'mch-drill' && record.snapshotBuffIds.includes('mch-reassemble')
    )).toBe(true);
    expect(result.timeline?.some((record) =>
      record.actionId === 'mch-blazing-shot' && record.snapshotBuffIds.includes('mch-reassemble')
    )).toBe(false);
  });

  it('runs Summoner through the four-minute Demi cycle and all three elemental attunements', () => {
    const result = simulate(SMN_ROTATION_PROFILE, 'dummy-300');
    const actions = result.timeline?.map((record) => record.actionId) ?? [];

    expect(actions).toContain('smn-solar-one');
    expect(actions).toContain('smn-bahamut');
    expect(actions).toContain('smn-solar-two');
    expect(actions).toContain('smn-phoenix');
    expect(actions).toContain('smn-umbral-impulse');
    expect(actions).toContain('smn-astral-impulse');
    expect(actions).toContain('smn-fountain-of-fire');
    expect(actions).toContain('smn-summon-ifrit');
    expect(actions).toContain('smn-summon-titan');
    expect(actions).toContain('smn-summon-garuda');
    expect(actions).toContain('smn-luxwave');
    expect(actions.indexOf('smn-solar-one')).toBeLessThan(actions.indexOf('smn-bahamut'));
    expect(actions.indexOf('smn-bahamut')).toBeLessThan(actions.indexOf('smn-solar-two'));
    expect(actions.indexOf('smn-solar-two')).toBeLessThan(actions.indexOf('smn-phoenix'));
  });

  it('runs Red Mage expected Dualcast, mana, melee and finisher chains', () => {
    const result = simulate(RDM_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('rdm-dualcast-pair');
    expect(actions).toContain('rdm-enchanted-riposte');
    expect(actions).toContain('rdm-enchanted-zwerchhau');
    expect(actions).toContain('rdm-enchanted-redoublement');
    expect(actions).toContain('rdm-balanced-finisher');
    expect(actions).toContain('rdm-scorch');
    expect(actions).toContain('rdm-resolution');
    expect(actions).toContain('rdm-grand-impact');
    expect(actions).toContain('rdm-vice-of-thorns');
    expect(actions).toContain('rdm-prefulgence');
  });

  it('runs Pictomancer palettes, canvases, portraits, Hammer and Starry Muse', () => {
    const result = simulate(PCT_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('pct-fire');
    expect(actions).toContain('pct-water');
    expect(actions).toContain('pct-subtractive-palette');
    expect(actions).toContain('pct-blizzard');
    expect(actions).toContain('pct-thunder');
    expect(actions).toContain('pct-hammer-stamp');
    expect(actions).toContain('pct-polishing-hammer');
    expect(actions).toContain('pct-starry-muse');
    expect(actions).toContain('pct-star-prism');
    expect(actions).toContain('pct-rainbow-drip');
    expect(actions).toContain('pct-mog');
    expect(actions).toContain('pct-madeen');
  });

  it('pins audited pilot action data to the independent reference fixtures', () => {
    const action = (profile: CombatRotationProfile, id: string) => {
      const found = profile.actions.find((entry) => entry.id === id);
      expect(found, `${profile.job} action ${id}`).toBeDefined();
      return found!;
    };

    expect(action(SAM_ROTATION_PROFILE, 'sam-zanshin')).toMatchObject({
      potency: 940,
      kind: 'ogcd'
    });
    expect(action(MNK_ROTATION_PROFILE, 'mnk-phantom-rush')).toMatchObject({
      potency: 1500,
      kind: 'gcd'
    });
    expect(action(DRG_ROTATION_PROFILE, 'drg-starcross')).toMatchObject({
      potency: 1000,
      kind: 'ogcd'
    });
    expect(action(NIN_ROTATION_PROFILE, 'nin-hyosho-ranryu')).toMatchObject({
      potency: 1300,
      recastMs: 1500,
      speedScaling: 'none'
    });
    expect(action(RPR_ROTATION_PROFILE, 'rpr-perfectio')).toMatchObject({
      potency: 1300,
      kind: 'gcd'
    });
    expect(action(VPR_ROTATION_PROFILE, 'vpr-ouroboros')).toMatchObject({
      potency: 1150,
      recastMs: 3000,
      speedScaling: 'none'
    });
    expect(action(SAM_ROTATION_PROFILE, 'sam-kaeshi-setsugekka')).toMatchObject({
      potency: 680,
      criticalHitMode: 'guaranteed',
      castMs: 0
    });
    expect(action(DNC_ROTATION_PROFILE, 'dnc-finishing-move')).toMatchObject({
      potency: 850,
      recastMs: 2500,
      cooldownMs: 60_000
    });
    expect(action(DNC_ROTATION_PROFILE, 'dnc-technical-finish')).toMatchObject({
      potency: 1300,
      recastMs: 8500,
      speedScaling: 'none'
    });
    expect(action(BRD_ROTATION_PROFILE, 'brd-radiant-encore-three')).toMatchObject({
      potency: 1100,
      kind: 'gcd'
    });
    expect(action(BRD_ROTATION_PROFILE, 'brd-armys-paeon')).toMatchObject({
      potency: 0,
      kind: 'ogcd'
    });
    expect(action(MCH_ROTATION_PROFILE, 'mch-full-metal-field')).toMatchObject({
      potency: 900,
      criticalHitMode: 'guaranteed',
      directHitMode: 'guaranteed'
    });
    expect(action(MCH_ROTATION_PROFILE, 'mch-blazing-shot')).toMatchObject({
      potency: 240,
      recastMs: 1500,
      speedScaling: 'none'
    });
    expect(action(MCH_ROTATION_PROFILE, 'mch-wildfire-detonator')).toMatchObject({
      potency: 1440,
      criticalHitMode: 'disabled',
      directHitMode: 'disabled'
    });
    expect(action(BLM_ROTATION_PROFILE, 'blm-flare-star')).toMatchObject({
      potency: 500,
      castMs: 2000,
      applicationDelayMs: 620
    });
    expect(action(BLM_ROTATION_PROFILE, 'blm-xenoglossy')).toMatchObject({
      potency: 890,
      applicationDelayMs: 630
    });
    expect(action(DRK_ROTATION_PROFILE, 'drk-disesteem')).toMatchObject({
      potency: 1000,
      applicationDelayMs: 1650
    });
    expect(action(DRK_ROTATION_PROFILE, 'drk-shadow-disesteem')).toMatchObject({
      potency: 620,
      kind: 'pet'
    });
    expect(action(PLD_ROTATION_PROFILE, 'pld-imperator')).toMatchObject({
      potency: 580,
      recastMs: 60_000
    });
    expect(action(PLD_ROTATION_PROFILE, 'pld-blade-of-honor')).toMatchObject({
      potency: 1000,
      kind: 'ogcd'
    });
    expect(action(WAR_ROTATION_PROFILE, 'war-inner-chaos')).toMatchObject({
      potency: 700,
      criticalHitMode: 'guaranteed',
      directHitMode: 'guaranteed'
    });
    expect(action(WAR_ROTATION_PROFILE, 'war-primal-ruination')).toMatchObject({
      potency: 800,
      criticalHitMode: 'guaranteed',
      directHitMode: 'guaranteed'
    });
    expect(action(GNB_ROTATION_PROFILE, 'gnb-double-down')).toMatchObject({
      potency: 1000,
      cooldownMs: 60_000
    });
    expect(action(GNB_ROTATION_PROFILE, 'gnb-gnashing-fang')).toMatchObject({
      potency: 440,
      charges: 2,
      cooldownMs: 30_000
    });
    expect(action(WHM_ROTATION_PROFILE, 'whm-glare-iv')).toMatchObject({
      potency: 640,
      speedScaling: 'spell-speed'
    });
    expect(action(SCH_ROTATION_PROFILE, 'sch-baneful-impaction')).toMatchObject({
      potency: 0,
      recastMs: 1000
    });
    expect(action(AST_ROTATION_PROFILE, 'ast-oracle')).toMatchObject({
      potency: 860,
      kind: 'ogcd'
    });
    expect(action(SGE_ROTATION_PROFILE, 'sge-phlegma-iii')).toMatchObject({
      potency: 690,
      charges: 2,
      cooldownMs: 40_000
    });
    expect(action(SMN_ROTATION_PROFILE, 'smn-umbral-impulse')).toMatchObject({
      potency: 640,
      speedScaling: 'spell-speed'
    });
    expect(action(SMN_ROTATION_PROFILE, 'smn-enkindle-solar')).toMatchObject({
      potency: 1500,
      kind: 'ogcd'
    });
    expect(action(RDM_ROTATION_PROFILE, 'rdm-enchanted-redoublement')).toMatchObject({
      potency: 560,
      recastMs: 2200,
      speedScaling: 'none'
    });
    expect(action(RDM_ROTATION_PROFILE, 'rdm-prefulgence')).toMatchObject({
      potency: 1200,
      kind: 'ogcd'
    });
    expect(action(PCT_ROTATION_PROFILE, 'pct-polishing-hammer')).toMatchObject({
      potency: 600,
      criticalHitMode: 'guaranteed',
      directHitMode: 'guaranteed'
    });
    expect(action(PCT_ROTATION_PROFILE, 'pct-rainbow-drip')).toMatchObject({
      potency: 1000,
      speedScaling: 'none'
    });
  });

  it('cycles Black Mage through fire, Flare Star, ice and timed Polyglot spending', () => {
    const result = simulate(BLM_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('blm-fire-iv');
    expect(actions).toContain('blm-flare-star');
    expect(actions).toContain('blm-despair');
    expect(actions).toContain('blm-blizzard-iii');
    expect(actions).toContain('blm-blizzard-iv');
    expect(actions).toContain('blm-xenoglossy');
    expect(actions.indexOf('blm-fire-iii')).toBeLessThan(actions.indexOf('blm-fire-iv'));
    expect(actions.indexOf('blm-fire-iv')).toBeLessThan(actions.indexOf('blm-blizzard-iii'));
  });

  it('replays Living Shadow after the referenced 6.8-second delay and 2.18-second cadence', () => {
    const result = simulate(DRK_ROTATION_PROFILE, 'opener-30');
    const trigger = result.timeline?.find((record) =>
      record.actionId === 'drk-living-shadow' && record.source === 'player'
    );
    const pet = result.timeline?.filter((record) => record.source === 'pet') ?? [];

    expect(trigger).toBeDefined();
    expect(pet.map((record) => record.actionId)).toEqual([
      'drk-shadow-abyssal',
      'drk-shadow-stride',
      'drk-shadow-shadowbringer',
      'drk-shadow-edge',
      'drk-shadow-bloodspiller',
      'drk-shadow-disesteem'
    ]);
    expect(pet.map((record) => record.startedAtMs - trigger!.appliedAtMs)).toEqual([
      6800,
      8980,
      11_160,
      13_340,
      15_520,
      17_700
    ]);

    const exaggeratedDarkside = structuredClone(DRK_ROTATION_PROFILE);
    const edge = exaggeratedDarkside.actions.find((action) => action.id === 'drk-edge')!;
    const darkside = edge.effects?.find((effect) =>
      effect.kind === 'buff' && effect.buffId === 'drk-darkside'
    );
    if (darkside?.kind !== 'buff') throw new Error('DRK fixture is missing Darkside.');
    darkside.damageMultiplier = 9;
    const exaggeratedPetDamage = simulate(exaggeratedDarkside, 'opener-30').timeline
      ?.filter((record) => record.source === 'pet')
      .map((record) => record.damage);
    expect(exaggeratedPetDamage).toEqual(pet.map((record) => record.damage));
  });

  it('runs Paladin Fight or Flight, Confiteor and Atonement chains without scaling spells from Skill Speed', () => {
    const result = simulate(PLD_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('pld-fight-or-flight');
    expect(actions).toContain('pld-goring-blade');
    expect(actions).toContain('pld-confiteor');
    expect(actions).toContain('pld-blade-of-faith');
    expect(actions).toContain('pld-blade-of-truth');
    expect(actions).toContain('pld-blade-of-valor');
    expect(actions).toContain('pld-blade-of-honor');
    expect(actions).toContain('pld-atonement');
    expect(actions).toContain('pld-supplication');
    expect(actions).toContain('pld-sepulchre');
    expect(PLD_ROTATION_PROFILE.actions.find((action) =>
      action.id === 'pld-confiteor'
    )?.speedScaling).toBe('none');
  });

  it('runs Warrior Surging Tempest, Inner Release and guaranteed critical/direct-hit finishers', () => {
    const result = simulate(WAR_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions.indexOf('war-storms-eye')).toBeLessThan(actions.indexOf('war-inner-release'));
    expect(actions.filter((id) => id === 'war-fell-cleave-ir').length).toBeGreaterThanOrEqual(15);
    expect(actions.filter((id) => id === 'war-primal-wrath').length).toBeGreaterThanOrEqual(5);
    expect(actions).toContain('war-inner-chaos');
    expect(actions).toContain('war-primal-rend');
    expect(actions).toContain('war-primal-ruination');
  });

  it('runs complete Gunbreaker No Mercy, Bloodfest and Continuation chains', () => {
    const result = simulate(GNB_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);
    const count = (id: string) => actions.filter((entry) => entry === id).length;

    expect(actions).toContain('gnb-no-mercy');
    expect(actions).toContain('gnb-sonic-break');
    expect(actions).toContain('gnb-double-down');
    expect(actions).toContain('gnb-reign-of-beasts');
    expect(count('gnb-reign-of-beasts')).toBe(count('gnb-lion-heart'));
    expect(count('gnb-gnashing-fang')).toBe(count('gnb-savage-claw'));
    expect(count('gnb-gnashing-fang')).toBe(count('gnb-wicked-talon'));
    expect(count('gnb-gnashing-fang')).toBe(count('gnb-jugular-rip'));
    expect(count('gnb-savage-claw')).toBe(count('gnb-abdomen-tear'));
    expect(count('gnb-wicked-talon')).toBe(count('gnb-eye-gouge'));
    expect(result.summary.clippedMs).toBe(0);
  });

  it('runs Monk forms, expected Chakra, Perfect Balance, replies and nadi spenders', () => {
    const result = simulate(MNK_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('mnk-dragon-kick');
    expect(actions).toContain('mnk-leaping-opo');
    expect(actions).toContain('mnk-forbidden-chakra');
    expect(actions).toContain('mnk-perfect-balance');
    expect(actions).toContain('mnk-rising-phoenix');
    expect(actions).toContain('mnk-phantom-rush');
    expect(actions).toContain('mnk-fires-reply');
    expect(actions).toContain('mnk-winds-reply');
  });

  it('runs both Dragoon combo branches and the complete Life of the Dragon chain', () => {
    const result = simulate(DRG_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('drg-chaotic-spring');
    expect(actions).toContain('drg-heavens-thrust');
    expect(actions).toContain('drg-battle-litany');
    expect(actions).toContain('drg-geirskogul');
    expect(actions.filter((id) => id === 'drg-nastrond').length).toBeGreaterThanOrEqual(12);
    expect(actions).toContain('drg-stardiver');
    expect(actions).toContain('drg-starcross');
    expect(actions).toContain('drg-wyrmwind-thrust');
  });

  it('runs Ninja mudra aggregates, vulnerability windows, Ninki and Bunshin follow-ups', () => {
    const result = simulate(NIN_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);
    const timeline = result.timeline?.map((record) => record.actionId) ?? [];

    expect(actions).toContain('nin-armor-crush');
    expect(actions).toContain('nin-aeolian-edge');
    expect(actions).toContain('nin-raiton');
    expect(actions).toContain('nin-fleeting-raiju');
    expect(actions).toContain('nin-hyosho-ranryu');
    expect(actions).toContain('nin-kunais-bane');
    expect(actions).toContain('nin-dokumori');
    expect(actions).toContain('nin-bunshin');
    expect(actions).toContain('nin-ten-chi-jin');
    expect(actions).toContain('nin-tenri-jindo');
    expect(timeline).toContain('nin-bunshin-hit');
  });

  it('runs Reaper Death Design, Soul and Shroud spenders, Enshroud and Perfectio', () => {
    const result = simulate(RPR_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('rpr-shadow-of-death');
    expect(actions).toContain('rpr-plentiful-harvest');
    expect(actions).toContain('rpr-gluttony');
    expect(actions).toContain('rpr-executioners-gibbet');
    expect(actions).toContain('rpr-enshroud');
    expect(actions).toContain('rpr-void-reaping');
    expect(actions).toContain('rpr-lemures-slice');
    expect(actions).toContain('rpr-communio');
    expect(actions).toContain('rpr-perfectio');
  });

  it('runs Viper Vipersight, Vicewinder, Rattling Coil and Reawaken chains', () => {
    const result = simulate(VPR_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);
    const timeline = result.timeline?.map((record) => record.actionId) ?? [];

    expect(actions).toContain('vpr-hunters-sting');
    expect(actions).toContain('vpr-swiftskins-sting');
    expect(actions).toContain('vpr-vicewinder');
    expect(actions).toContain('vpr-hunters-coil');
    expect(actions).toContain('vpr-swiftskins-coil');
    expect(actions).toContain('vpr-uncoiled-fury');
    expect(actions).toContain('vpr-reawaken-ire');
    expect(actions).toContain('vpr-reawaken-gauge');
    expect(actions).toContain('vpr-ouroboros');
    expect(timeline).toContain('vpr-first-legacy');
    expect(timeline).toContain('vpr-fourth-legacy');
  });

  it('changes cast timing and output when a speed tier changes', () => {
    const slower = simulate(BLM_ROTATION_PROFILE, 'dummy-300', 420);
    const faster = simulate(BLM_ROTATION_PROFILE, 'dummy-300', 1800);

    expect(faster.timingCacheKey).not.toBe(slower.timingCacheKey);
    expect(faster.totalDamage).toBeGreaterThan(slower.totalDamage);
    expect(slower.summary.clippedMs).toBe(0);
    expect(faster.summary.clippedMs).toBe(0);
    expect(faster.decisionTrace.map((entry) => entry.startedAtMs))
      .not.toEqual(slower.decisionTrace.map((entry) => entry.startedAtMs));
  });

  it.each([420, 1400, 1800, 3447])(
    'does not invent Black Mage cast clipping at %i Spell Speed',
    (speed) => {
      expect(simulate(BLM_ROTATION_PROFILE, 'dummy-300', speed).summary.clippedMs).toBe(0);
    }
  );

  it.each([420, 1400, 1800, 3447])(
    'attributes Summoner clipping at %i Spell Speed only to Slipstream overrun',
    (speed) => {
      const result = simulate(SMN_ROTATION_PROFILE, 'dummy-300', speed);
      const slipstreamUses = result.timeline?.filter((record) =>
        record.source === 'player' && record.actionId === 'smn-slipstream'
      ).length ?? 0;
      const castMs = adjustedRecastMs(3000, speed, 420, 2780, 0);
      const recastMs = adjustedRecastMs(2500, speed, 420, 2780, 0);
      const expectedClipPerUse = Math.max(
        0,
        castMs + SMN_ROTATION_PROFILE.assumptions.latencyMs - recastMs
      );

      expect(slipstreamUses).toBeGreaterThan(0);
      expect(result.summary.clippedMs).toBe(slipstreamUses * expectedClipPerUse);
    }
  );

  it.each([
    ['RDM', RDM_ROTATION_PROFILE],
    ['PCT', PCT_ROTATION_PROFILE]
  ] as const)('%s aggregate casts remain clip-free across representative speed tiers', (_job, profile) => {
    for (const speed of [420, 1400, 1800, 3447]) {
      expect(simulate(profile, 'dummy-300', speed).summary.clippedMs).toBe(0);
    }
  });

  it('runs White Mage Presence of Mind, Sacred Sight, Dia and Assize', () => {
    const result = simulate(WHM_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('whm-presence-of-mind');
    expect(actions.filter((id) => id === 'whm-glare-iv').length).toBeGreaterThanOrEqual(6);
    expect(actions).toContain('whm-dia');
    expect(actions).toContain('whm-assize');
    expect(actions).toContain('healer-lucid-dreaming');
    expect(result.summary.finalResources.mp).toBeGreaterThanOrEqual(0);
  });

  it('runs Scholar Chain, Baneful Impaction and three-stack Aetherflow spending', () => {
    const result = simulate(SCH_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('sch-chain-stratagem');
    expect(actions).toContain('sch-baneful-impaction');
    expect(actions).toContain('sch-biolysis');
    expect(actions.filter((id) => id === 'sch-energy-drain').length).toBeGreaterThanOrEqual(15);
    expect(actions).toContain('healer-lucid-dreaming');
  });

  it('runs Astrologian personal damage actions without adding card raid contribution', () => {
    const result = simulate(AST_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);
    const scheduled = result.timeline?.map((record) => record.actionId) ?? [];

    expect(actions).toContain('ast-divination');
    expect(actions).toContain('ast-oracle');
    expect(actions).toContain('ast-lord-of-crowns');
    expect(actions).toContain('ast-earthly-star');
    expect(actions).toContain('ast-draw');
    expect(actions).toContain('healer-lucid-dreaming');
    expect(scheduled).toContain('ast-stellar-explosion');
    expect(actions.some((id) => id.includes('balance') || id.includes('spear'))).toBe(false);
  });

  it('runs Sage fixed Eukrasian DoT upkeep with Phlegma charges and Psyche', () => {
    const result = simulate(SGE_ROTATION_PROFILE, 'dummy-300');
    const actions = playerActions(result);

    expect(actions).toContain('sge-eukrasian-dosis-iii');
    expect(actions.filter((id) => id === 'sge-phlegma-iii').length).toBeGreaterThanOrEqual(7);
    expect(actions.filter((id) => id === 'sge-psyche').length).toBeGreaterThanOrEqual(5);
    expect(actions).toContain('healer-lucid-dreaming');
  });

  it('lets Piety improve long-window Sage MP sustainability without changing damage formulas directly', () => {
    const evaluator = createPilotCombatEvaluatorRegistry().requireFor(SGE_ROTATION_PROFILE);
    const evaluateAtPiety = (piety: number) => {
      const request = requestFor(SGE_ROTATION_PROFILE, 'dummy-300', 1800);
      request.durationOverrideMs = 510_000;
      request.combatStats.stats = { ...request.combatStats.stats, piety };
      request.rotationAffectingStats = { piety };
      return evaluator.simulate(request, { isCancelled: () => false });
    };
    const base = evaluateAtPiety(440);
    const high = evaluateAtPiety(1800);

    expect(high.timingCacheKey).not.toBe(base.timingCacheKey);
    expect(high.summary.gcdCount).toBeGreaterThanOrEqual(base.summary.gcdCount);
    expect(high.totalDamage).toBeGreaterThanOrEqual(base.totalDamage);
    expect(high.summary.finalResources.mp).toBeGreaterThanOrEqual(0);
    expect(base.summary.finalResources.mp).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['WHM', WHM_ROTATION_PROFILE],
    ['SCH', SCH_ROTATION_PROFILE],
    ['AST', AST_ROTATION_PROFILE],
    ['SGE', SGE_ROTATION_PROFILE]
  ] as const)('%s responds to healer spell-speed tiers', (_job, profile) => {
    const slower = simulate(profile, 'dummy-300', 420);
    const faster = simulate(profile, 'dummy-300', 1800);

    expect(faster.timingCacheKey).not.toBe(slower.timingCacheKey);
    expect(faster.totalDamage).not.toBe(slower.totalDamage);
  });

  it.each([
    ['SMN', SMN_ROTATION_PROFILE],
    ['RDM', RDM_ROTATION_PROFILE],
    ['PCT', PCT_ROTATION_PROFILE]
  ] as const)('%s responds to magical-ranged spell-speed tiers', (_job, profile) => {
    const slower = simulate(profile, 'dummy-300', 420);
    const faster = simulate(profile, 'dummy-300', 1800);

    expect(faster.timingCacheKey).not.toBe(slower.timingCacheKey);
    expect(faster.totalDamage).not.toBe(slower.totalDamage);
  });
});
