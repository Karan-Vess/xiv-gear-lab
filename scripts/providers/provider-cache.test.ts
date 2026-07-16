import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderResponseCache } from './provider-cache.mjs';

const directories: string[] = [];
const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xiv-gear-provider-cache-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('validated provider response cache', () => {
  it('stores a response only after validation and reuses it when the provider is offline', async () => {
    const directory = await temporaryDirectory();
    const cache = createProviderResponseCache({ directory, now: () => '2026-07-15T00:00:00.000Z' });
    const validate = (value: any) => {
      if (value?.shape !== 'valid') throw new Error('schema drift');
      return value;
    };
    await expect(cache.validatedJson({
      provider: 'fixture', key: 'page-1', load: async () => ({ shape: 'valid', value: 42 }), validate
    })).resolves.toMatchObject({ value: 42 });
    await expect(cache.validatedJson({
      provider: 'fixture', key: 'page-1', load: async () => { throw new Error('offline'); }, validate
    })).resolves.toMatchObject({ value: 42 });
    expect(cache.freshness('fixture')).toMatchObject({ status: 'stale', retrievedAt: '2026-07-15T00:00:00.000Z' });
  });

  it('uses the last validated response when a live provider drifts schema', async () => {
    const directory = await temporaryDirectory();
    const cache = createProviderResponseCache({ directory });
    const validate = (value: any) => {
      if (typeof value?.required !== 'string') throw new Error('required field was renamed');
      return value;
    };
    await cache.validatedJson({ provider: 'fixture', key: 'schema', load: async () => ({ required: 'yes' }), validate });
    const result = await cache.validatedJson({ provider: 'fixture', key: 'schema', load: async () => ({ renamed: 'no' }), validate });
    expect(result).toEqual({ required: 'yes' });
    expect(cache.freshness('fixture').message).toContain('required field was renamed');
  });

  it('does not overwrite a good cache with an invalid live response', async () => {
    const directory = await temporaryDirectory();
    const cache = createProviderResponseCache({ directory });
    const validate = (value: any) => {
      if (value?.ok !== true) throw new Error('invalid');
      return value;
    };
    await cache.validatedJson({ provider: 'fixture', key: 'stable', load: async () => ({ ok: true, revision: 1 }), validate });
    await cache.validatedJson({ provider: 'fixture', key: 'stable', load: async () => ({ ok: false, revision: 2 }), validate });
    await expect(cache.validatedJson({
      provider: 'fixture', key: 'stable', load: async () => { throw new Error('offline'); }, validate
    })).resolves.toMatchObject({ revision: 1 });
  });

  it('fails closed when neither the provider nor a validated cache is available', async () => {
    const directory = await temporaryDirectory();
    const cache = createProviderResponseCache({ directory });
    await expect(cache.validatedJson({
      provider: 'fixture', key: 'missing', load: async () => { throw new Error('offline'); }, validate: (value) => value
    })).rejects.toThrow('no validated response is available');
    expect(cache.freshness('fixture').status).toBe('failed');
  });

  it('refuses a corrupt cached response instead of treating it as last-known-good', async () => {
    const directory = await temporaryDirectory();
    const cache = createProviderResponseCache({ directory });
    const validate = vi.fn((value) => value);
    await cache.validatedJson({ provider: 'fixture', key: 'corrupt', load: async () => ({ ok: true }), validate });
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(directory));
    const path = join(directory, files[0]);
    const entry = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...entry, schemaVersion: 'attacker-schema' }));
    await expect(cache.validatedJson({
      provider: 'fixture', key: 'corrupt', load: async () => { throw new Error('offline'); }, validate
    })).rejects.toThrow('cache error');
  });
});
