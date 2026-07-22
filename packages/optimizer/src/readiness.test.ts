import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { assessCatalogueReadiness } from './index';

const assess = (snapshot = structuredClone(gearSnapshot), previousSnapshot?: typeof gearSnapshot) =>
  assessCatalogueReadiness(snapshot, 'WHM', { accessExpansion: 'dt', accessLevel: 100, previousSnapshot });

describe('M11 catalogue readiness', () => {
  it('accepts the current official catalogue without a blocking readiness issue', () => {
    const report = assess();
    expect(report.status).not.toBe('blocked');
    expect(report.coveredSlots).toHaveLength(11);
  });

  it('accepts the Endwalker cap for historical jobs and refuses Dawntrail-only jobs', () => {
    const endwalkerWhm = assessCatalogueReadiness(gearSnapshot, 'WHM', { accessExpansion: 'ew', accessLevel: 90 });
    expect(endwalkerWhm.status).toBe('preliminary');
    expect(endwalkerWhm.confidence).toBe('official-preliminary');
    expect(endwalkerWhm.issues.some((issue) => issue.code === 'missing-curation')).toBe(true);
    expect(endwalkerWhm.coveredSlots).toHaveLength(11);

    const endwalkerViper = assessCatalogueReadiness(gearSnapshot, 'VPR', { accessExpansion: 'ew', accessLevel: 90 });
    expect(endwalkerViper.status).toBe('blocked');
    expect(endwalkerViper.issues.some((issue) => issue.code === 'missing-slot')).toBe(true);
  });

  it('accepts the preliminary Shadowbringers backfill only for jobs available at level 80', () => {
    const shadowbringersWhm = assessCatalogueReadiness(gearSnapshot, 'WHM', { accessExpansion: 'shb', accessLevel: 80 });
    expect(shadowbringersWhm.status).toBe('preliminary');
    expect(shadowbringersWhm.confidence).toBe('incomplete-acquisition');
    expect(shadowbringersWhm.coveredSlots).toHaveLength(11);
    expect(shadowbringersWhm.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'incomplete-acquisition', 'missing-curation'
    ]));

    const shadowbringersReaper = assessCatalogueReadiness(gearSnapshot, 'RPR', { accessExpansion: 'shb', accessLevel: 80 });
    expect(shadowbringersReaper.status).toBe('blocked');
    expect(shadowbringersReaper.issues.some((issue) => issue.code === 'missing-slot')).toBe(true);
  });

  it('accepts the preliminary Stormblood backfill only for jobs available at level 70', () => {
    const stormbloodWhm = assessCatalogueReadiness(gearSnapshot, 'WHM', { accessExpansion: 'sb', accessLevel: 70 });
    expect(stormbloodWhm.status).toBe('preliminary');
    expect(stormbloodWhm.confidence).toBe('incomplete-acquisition');
    expect(stormbloodWhm.coveredSlots).toHaveLength(11);
    expect(stormbloodWhm.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'incomplete-acquisition', 'missing-curation'
    ]));

    const stormbloodGunbreaker = assessCatalogueReadiness(gearSnapshot, 'GNB', { accessExpansion: 'sb', accessLevel: 70 });
    expect(stormbloodGunbreaker.status).toBe('blocked');
    expect(stormbloodGunbreaker.issues.some((issue) => issue.code === 'missing-slot')).toBe(true);
  });

  it('keeps official-data recommendations preliminary when curation is absent', () => {
    const snapshot = structuredClone(gearSnapshot);
    snapshot.curatedSets = [];
    const report = assess(snapshot);
    expect(report.status).toBe('preliminary');
    expect(report.issues.some((issue) => issue.code === 'missing-curation')).toBe(true);
  });

  it('blocks incomplete slot coverage and NQ crafted equipment', () => {
    const missingWeapon = structuredClone(gearSnapshot);
    missingWeapon.items = missingWeapon.items.filter((item) => !item.jobs.includes('WHM') || item.slot !== 'weapon');
    expect(assess(missingWeapon).issues.some((issue) => issue.code === 'missing-slot')).toBe(true);

    const nqCrafted = structuredClone(gearSnapshot);
    const item = nqCrafted.items.find((entry) => entry.jobs.includes('WHM'))!;
    item.sourceFamily = 'crafted';
    item.quality = 'not-applicable';
    expect(assess(nqCrafted).issues.some((issue) => issue.code === 'nq-crafted-item')).toBe(true);
  });

  it('blocks unknown evaluator schemas and suspicious stat jumps', () => {
    const incompatible = structuredClone(gearSnapshot);
    incompatible.rulesets[0]!.calculationSchema = 'unknown-formula@1';
    expect(assess(incompatible).issues.some((issue) => issue.code === 'incompatible-evaluator')).toBe(true);

    const suspicious = structuredClone(gearSnapshot);
    const item = suspicious.items.find((entry) => entry.jobs.includes('WHM'))!;
    item.stats.mind *= 2;
    item.statCaps.mind *= 2;
    const report = assess(suspicious, gearSnapshot);
    expect(report.issues.some((issue) => issue.code === 'suspicious-stat-jump')).toBe(true);
  });
});
