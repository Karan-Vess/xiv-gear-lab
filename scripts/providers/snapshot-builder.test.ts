import { describe, expect, it } from 'vitest';
import { captureOverlay, createProviderOverlay, publishOverlaySnapshot } from './snapshot-builder.mjs';

const generatedAt = '2026-07-15T00:00:00.000Z';
const item = (value = 10) => ({
  id: 1001,
  origin: 'official',
  name: 'Fixture Staff',
  jobs: ['WHM'],
  slot: 'weapon',
  level: 100,
  itemLevel: 790,
  stats: { mind: value },
  statCaps: {},
  weaponDamage: 150,
  weaponDelayMs: 3000,
  materiaSlots: 2,
  advancedMelding: false,
  unique: false,
  sourceFamily: 'savage',
  acquisitionNote: 'Previous route',
  provenance: [
    { kind: 'official-client', provider: 'XIVAPI v2', schemaVersion: 'fixture', retrievedAt: generatedAt, status: 'current' },
    { kind: 'acquisition-overlay', provider: 'XIV Gear Lab', schemaVersion: 'fixture', retrievedAt: generatedAt, status: 'current' }
  ]
});
const materia = { id: 6001, name: 'Fixture Materia', stat: 'criticalHit', value: 54, tier: 12 };
const food = { id: 45001, name: 'Fixture Food', itemLevel: 790, bonuses: [], provenance: [] };
const set = (itemId = 1001) => ({
  id: 'fixture-set', origin: 'curated', name: 'Fixture Set', job: 'WHM', level: 100, patch: '7.51',
  items: { weapon: { itemId, materiaIds: [6001] } }, foodId: 45001,
  metrics: { stats: {}, weaponDamage: 150, gcd: 2.5, expectedAction100: 100, averageItemLevel: 790, materiaWaste: 0 },
  assumptions: [], provenance: []
});
const previousSnapshot = {
  manifest: { id: 'previous', generatedAt, status: 'online-current' },
  items: [item()], materia: [materia], foods: [food], curatedSets: [set()]
};
const manifest = { id: 'candidate', generatedAt, status: 'online-current' };

const officialOverlay = (value = 20) => createProviderOverlay({
  kind: 'official', generatedAt, providers: [{ id: 'xivapi', status: 'current', retrievedAt: generatedAt }],
  payload: { items: [item(value)], materia: [materia], foods: [food] }
});
const acquisitionOverlay = createProviderOverlay({
  kind: 'acquisition', generatedAt, providers: [{ id: 'acquisition-data', status: 'current', retrievedAt: generatedAt }],
  payload: { items: [{
    itemId: 1001, sourceFamily: 'tomestone', acquisitionNote: 'Fresh route',
    provenance: [{ kind: 'acquisition-overlay', provider: 'XIV Gear Lab', schemaVersion: 'fixture', retrievedAt: generatedAt, status: 'current' }]
  }] }
});
const curatedOverlay = (candidateSet = set()) => createProviderOverlay({
  kind: 'curated', generatedAt, providers: [
    { id: 'etro', status: 'current', retrievedAt: generatedAt },
    { id: 'the-balance', status: 'current', retrievedAt: generatedAt },
    { id: 'xivgear', status: 'current', retrievedAt: generatedAt }
  ],
  payload: { sets: [candidateSet] }
});

describe('partial-freshness snapshot publication', () => {
  it('publishes fresh official and acquisition data while retaining stale curated data after an outage', () => {
    const result = publishOverlaySnapshot({
      previousSnapshot,
      manifest,
      attempts: {
        official: { ok: true, overlay: officialOverlay(30) },
        acquisition: { ok: true, overlay: acquisitionOverlay },
        curated: { ok: false, error: new Error('Etro timed out') }
      }
    });
    expect(result.snapshot.items[0].stats.mind).toBe(30);
    expect(result.snapshot.items[0].sourceFamily).toBe('tomestone');
    expect(result.snapshot.curatedSets).toEqual(previousSnapshot.curatedSets);
    expect(result.snapshot.manifest.status).toBe('partial');
    expect(result.providers.find((provider) => provider.id === 'curated-overlay')?.status).toBe('stale');
  });

  it('rejects a fresh curated overlay with missing references and safely reuses the previous overlay', () => {
    const result = publishOverlaySnapshot({
      previousSnapshot,
      manifest,
      attempts: {
        official: { ok: true, overlay: officialOverlay() },
        acquisition: { ok: true, overlay: acquisitionOverlay },
        curated: { ok: true, overlay: curatedOverlay(set(9999)) }
      }
    });
    expect(result.snapshot.curatedSets[0].items.weapon.itemId).toBe(1001);
    expect(result.providers.find((provider) => provider.id === 'curated-data')?.status).toBe('stale');
  });

  it('fails closed when essential official data has neither a candidate nor a fallback', () => {
    expect(() => publishOverlaySnapshot({
      manifest,
      attempts: {
        official: { ok: false, error: new Error('XIVAPI unavailable') },
        acquisition: { ok: false, error: new Error('unavailable') },
        curated: { ok: false, error: new Error('unavailable') }
      }
    })).toThrow('retained last-known-good overlay');
  });

  it('can publish without optional overlays on a first release and labels the result partial', () => {
    const result = publishOverlaySnapshot({
      manifest,
      attempts: {
        official: { ok: true, overlay: officialOverlay() },
        acquisition: { ok: false, error: new Error('acquisition unavailable') },
        curated: { ok: false, error: new Error('curated unavailable') }
      }
    });
    expect(result.snapshot.items[0].sourceFamily).toBe('other');
    expect(result.snapshot.curatedSets).toEqual([]);
    expect(result.snapshot.manifest.status).toBe('partial');
  });

  it('captures provider contract failures without rejecting sibling refresh work', async () => {
    const [good, bad] = await Promise.all([
      captureOverlay(async () => officialOverlay()),
      captureOverlay(async () => { throw new Error('provider drift'); })
    ]);
    expect(good.ok).toBe(true);
    expect(bad).toMatchObject({ ok: false });
  });

  it('refuses duplicate records inside an overlay', () => {
    expect(() => createProviderOverlay({
      kind: 'official', generatedAt, providers: [{ id: 'xivapi', status: 'current' }],
      payload: { items: [item(), item()], materia: [], foods: [] }
    })).toThrow('duplicate key');
  });
});
