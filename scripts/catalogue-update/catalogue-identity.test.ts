import { describe, expect, it } from 'vitest';
import { catalogueContentFingerprint } from './catalogue-identity.mjs';

describe('catalogue content identity', () => {
  it('ignores volatile timestamps and pinned snapshot IDs', () => {
    const left = { items: [{ id: 1, stats: { mind: 10 }, generatedAt: 'earlier' }], snapshotId: 'old' };
    const right = { snapshotId: 'new', items: [{ generatedAt: 'later', stats: { mind: 10 }, id: 1 }] };
    expect(catalogueContentFingerprint(left)).toBe(catalogueContentFingerprint(right));
  });

  it('changes when acquisition or stat content changes without changing record IDs', () => {
    const base = { items: [{ id: 1, stats: { mind: 10 } }], acquisitions: [{ itemId: 1, sourceFamily: 'other' }] };
    expect(catalogueContentFingerprint({ ...base, acquisitions: [{ itemId: 1, sourceFamily: 'trial' }] }))
      .not.toBe(catalogueContentFingerprint(base));
    expect(catalogueContentFingerprint({ ...base, items: [{ id: 1, stats: { mind: 11 } }] }))
      .not.toBe(catalogueContentFingerprint(base));
  });
});
