import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderClient } from './http-client.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('provider HTTP client', () => {
  it('refuses origins outside the provider allowlist before fetching', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const client = createProviderClient({ provider: 'Fixture', allowedOrigins: ['https://trusted.example'] });
    await expect(client.getJson('https://attacker.example/data')).rejects.toThrow('non-allowlisted origin');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('retries a transient provider failure and parses the bounded JSON response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));
    vi.stubGlobal('fetch', fetcher);
    const client = createProviderClient({
      provider: 'Fixture',
      allowedOrigins: ['https://trusted.example'],
      retries: 1,
      timeoutMs: 1_000
    });
    await expect(client.getJson('https://trusted.example/data')).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects a response that exceeds its declared size limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '9999' }
    }));
    vi.stubGlobal('fetch', fetcher);
    const client = createProviderClient({
      provider: 'Fixture',
      allowedOrigins: ['https://trusted.example'],
      maximumBytes: 32
    });
    await expect(client.getJson('https://trusted.example/data')).rejects.toThrow('response exceeds');
  });
});
