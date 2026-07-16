import { describe, expect, it } from 'vitest';
import { trustedExternalUrl } from './external-links';

describe('trusted external source links', () => {
  it('allows exact HTTPS source hosts used by the active data and methodology', () => {
    expect(trustedExternalUrl('https://v2.xivapi.com/api/sheet/Item/49604')).toBe('https://v2.xivapi.com/api/sheet/Item/49604');
    expect(trustedExternalUrl('https://www.thebalanceffxiv.com/jobs/healers/')).toBe('https://www.thebalanceffxiv.com/jobs/healers/');
    expect(trustedExternalUrl('https://xivgear.app/math/')).toBe('https://xivgear.app/math/');
  });

  it('rejects lookalike hosts, non-HTTPS URLs and malformed input', () => {
    expect(trustedExternalUrl('https://xivgear.app.attacker.example/math/')).toBeUndefined();
    expect(trustedExternalUrl('http://xivgear.app/math/')).toBeUndefined();
    expect(trustedExternalUrl('javascript:alert(1)')).toBeUndefined();
  });
});

