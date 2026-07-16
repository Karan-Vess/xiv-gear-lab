import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { GearSet, Provenance } from '@xiv-gear-lab/domain';
import { communitySourcesForResult, resultMethodologyDescription } from './provenance-display';

const generatedSet = () => ({
  ...structuredClone(gearSnapshot.curatedSets[0]),
  origin: 'generated',
  provenance: []
}) as GearSet;

const communitySource = (overrides: Partial<Provenance> = {}): Provenance => ({
  kind: 'community-curated',
  provider: 'Test community',
  schemaVersion: 'test@1',
  retrievedAt: '2026-07-16T00:00:00.000Z',
  status: 'current',
  ...overrides
});

describe('result provenance presentation', () => {
  it('distinguishes independent generation from a community warm start', () => {
    const independent = generatedSet();
    const warmStarted = { ...generatedSet(), provenance: [communitySource({ sourceUrl: 'https://xivgear.app/' })] };

    expect(resultMethodologyDescription(independent)).toContain('Independently generated');
    expect(resultMethodologyDescription(warmStarted)).toContain('community set entered');
  });

  it('keeps curated provenance with missing optional record and URL metadata honest and visible', () => {
    const set = {
      ...generatedSet(),
      origin: 'curated',
      provenance: [communitySource()]
    } as GearSet;
    const sources = communitySourcesForResult(set);
    const source = sources[0]!;

    expect(sources).toHaveLength(1);
    expect(source.provider).toBe('Test community');
    expect(source.sourceUrl).toBeUndefined();
    expect(source.providerRecordId).toBeUndefined();
    expect(resultMethodologyDescription(set, sources)).toContain('Community-curated set');
  });

  it('deduplicates identical provider references without merging distinct records', () => {
    const first = communitySource({ providerRecordId: 'set-a' });
    const set = {
      ...generatedSet(),
      provenance: [first, { ...first }, communitySource({ providerRecordId: 'set-b' })]
    } as GearSet;

    expect(communitySourcesForResult(set).map((source) => source.providerRecordId)).toEqual(['set-a', 'set-b']);
  });
});
