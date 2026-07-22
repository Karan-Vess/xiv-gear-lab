import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessSnapshotCompatibility, type GearSnapshot, type RuntimeCompatibility } from '@xiv-gear-lab/domain';
import { gearSnapshot } from './index';
import {
  canonicalUpdateManifestPayload,
  downloadSnapshotCandidate,
  sha256Hex,
  SnapshotRepository,
  type DataUpdateManifest,
  type DownloadedSnapshotCandidate,
  type SnapshotCounts,
  type SnapshotUpdatePolicy
} from './runtime-updates';

const runtime: RuntimeCompatibility = {
  appVersion: '0.5.0',
  snapshotSchemas: ['gear-snapshot@1'],
  registrySchemas: ['game-registry@1'],
  rulesetSchemas: ['combat-ruleset@1'],
  calculationSchemas: [
    'ffxiv-combat-level-100@1',
    'ffxiv-combat-level-90@1',
    'ffxiv-combat-level-80@1',
    'ffxiv-combat-level-70@1',
    'ffxiv-combat-level-60@1',
    'ffxiv-combat-level-50@1'
  ],
  evaluatorProfileSchemas: ['generic-hit-profile@1']
};

const databaseNames: string[] = [];

const bytes = (value: string): ArrayBuffer => {
  const encoded = new TextEncoder().encode(value);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
};

const base64 = (value: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(value)));

const gzip = async (value: ArrayBuffer): Promise<ArrayBuffer> =>
  new Response(new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

const countsFor = (snapshot: GearSnapshot): SnapshotCounts => ({
  expansions: snapshot.registry.expansions.length,
  jobs: snapshot.registry.jobs.length,
  rulesets: snapshot.rulesets.length,
  evaluatorProfiles: snapshot.evaluatorProfiles.length,
  items: snapshot.items.length,
  materia: snapshot.materia.length,
  foods: snapshot.foods.length,
  curatedSets: snapshot.curatedSets.length
});

const signedFixture = async (
  snapshot: GearSnapshot,
  checksumOverride?: string,
  countOverrides: Partial<SnapshotCounts> = {},
  compressed = false
) => {
  const snapshotText = JSON.stringify(snapshot);
  const expandedSnapshotBytes = bytes(snapshotText);
  const snapshotBytes = compressed ? await gzip(expandedSnapshotBytes) : expandedSnapshotBytes;
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const manifest: DataUpdateManifest = {
    schemaVersion: 'data-update-manifest@1',
    channel: 'test',
    publishedAt: '2026-07-15T00:00:00.000Z',
    keyId: 'test-key',
    snapshot: {
      id: snapshot.manifest.id,
      url: `https://updates.example.test/snapshot.json${compressed ? '.gz' : ''}`,
      sha256: checksumOverride ?? await sha256Hex(snapshotBytes),
      byteLength: snapshotBytes.byteLength,
      counts: { ...countsFor(snapshot), ...countOverrides }
    },
    providers: [
      { id: 'official-data', status: 'current', retrievedAt: '2026-07-15T00:00:00.000Z' },
      { id: 'curated-data', status: 'partial', message: 'One optional source was unavailable.' }
    ],
    signature: ''
  };
  manifest.signature = base64(await crypto.subtle.sign(
    { name: 'Ed25519' },
    keyPair.privateKey,
    new TextEncoder().encode(canonicalUpdateManifestPayload(manifest))
  ));
  const manifestText = JSON.stringify(manifest);
  const policy: SnapshotUpdatePolicy = {
    manifestUrl: 'https://updates.example.test/manifest.json',
    allowedOrigins: ['https://updates.example.test'],
    trustedEd25519Keys: { 'test-key': base64(publicKey) }
  };
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/manifest.json')) {
      return new Response(manifestText, { status: 200, headers: { 'content-length': String(bytes(manifestText).byteLength) } });
    }
    if (url.endsWith(`/snapshot.json${compressed ? '.gz' : ''}`)) {
      return new Response(snapshotBytes, { status: 200, headers: { 'content-length': String(snapshotBytes.byteLength) } });
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
  return { manifest, policy, fetcher };
};

const candidateFor = (id: string, generatedAt = gearSnapshot.manifest.generatedAt): DownloadedSnapshotCandidate => {
  const snapshot = structuredClone(gearSnapshot);
  snapshot.manifest.id = id;
  snapshot.manifest.generatedAt = generatedAt;
  snapshot.curatedSets = snapshot.curatedSets.map((set) => ({
    ...set,
    calculationContext: set.calculationContext ? { ...set.calculationContext, snapshotId: id } : undefined
  }));
  const updateManifest: DataUpdateManifest = {
    schemaVersion: 'data-update-manifest@1',
    channel: 'test',
    publishedAt: '2026-07-15T00:00:00.000Z',
    keyId: 'test',
    snapshot: {
      id,
      url: 'https://updates.example.test/snapshot.json',
      sha256: 'a'.repeat(64),
      byteLength: 1,
      counts: countsFor(snapshot)
    },
    providers: [],
    signature: 'test'
  };
  return {
    snapshot,
    sha256: 'a'.repeat(64),
    downloadedAt: '2026-07-15T00:00:00.000Z',
    updateManifest,
    compatibility: assessSnapshotCompatibility(snapshot, runtime)
  };
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  })));
});

describe('signed runtime update download', () => {
  it('accepts an allowlisted, signed, checksummed, compatible snapshot', async () => {
    const fixture = await signedFixture(gearSnapshot);
    const candidate = await downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher);
    expect(candidate.snapshot.manifest.id).toBe(gearSnapshot.manifest.id);
    expect(candidate.updateManifest.providers.map((provider) => provider.status)).toEqual(['current', 'partial']);
    expect(candidate.compatibility.compatible).toBe(true);
  });

  it('accepts a signed gzip-compressed snapshot while enforcing an expanded-size ceiling', async () => {
    const fixture = await signedFixture(gearSnapshot, undefined, {}, true);
    const candidate = await downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher);
    expect(candidate.snapshot.manifest.id).toBe(gearSnapshot.manifest.id);

    await expect(downloadSnapshotCandidate({
      ...fixture.policy,
      maximumExpandedSnapshotBytes: 100
    }, runtime, fixture.fetcher)).rejects.toThrow('Expanded snapshot exceeds');
  });

  it('rejects a manifest changed after signing', async () => {
    const fixture = await signedFixture(gearSnapshot);
    fixture.manifest.snapshot.url = 'https://updates.example.test/changed.json';
    const tamperedText = JSON.stringify(fixture.manifest);
    const fetcher = vi.fn(async () => new Response(tamperedText, { status: 200 })) as unknown as typeof fetch;
    await expect(downloadSnapshotCandidate(fixture.policy, runtime, fetcher)).rejects.toThrow('signature is invalid');
  });

  it('rejects a checksum mismatch even when the bad checksum was signed', async () => {
    const fixture = await signedFixture(gearSnapshot, '0'.repeat(64));
    await expect(downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher)).rejects.toThrow('checksum');
  });

  it('rejects a correctly signed snapshot that needs an unknown formula', async () => {
    const snapshot = structuredClone(gearSnapshot);
    snapshot.manifest.id = 'future-formula';
    snapshot.rulesets[0]!.calculationSchema = 'future-formula@9';
    const fixture = await signedFixture(snapshot);
    await expect(downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher))
      .rejects.toThrow('unsupported calculation schema future-formula@9');
  });

  it('accepts a signed catalogue that activates a dormant level-70 formula schema', async () => {
    const snapshot = structuredClone(gearSnapshot);
    snapshot.rulesets.push({
      ...snapshot.rulesets[0]!,
      id: 'sb-data-channel-test@1',
      expansionId: 'sb',
      patch: '4.58',
      minimumLevel: 70,
      maximumLevel: 70,
      calculationSchema: 'ffxiv-combat-level-70@1'
    });
    const fixture = await signedFixture(snapshot);
    const candidate = await downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher);
    expect(candidate.compatibility.compatible).toBe(true);
    expect(candidate.snapshot.rulesets.at(-1)!.calculationSchema).toBe('ffxiv-combat-level-70@1');
  });

  it('rejects a signed manifest whose record counts do not match the snapshot', async () => {
    const fixture = await signedFixture(gearSnapshot, undefined, { items: gearSnapshot.items.length + 1 });
    await expect(downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher)).rejects.toThrow('items count mismatch');
  });

  it('rejects non-allowlisted update origins before making a request', async () => {
    const fixture = await signedFixture(gearSnapshot);
    fixture.policy.manifestUrl = 'https://attacker.example/manifest.json';
    await expect(downloadSnapshotCandidate(fixture.policy, runtime, fixture.fetcher)).rejects.toThrow('origin is not allowed');
    expect(fixture.fetcher).not.toHaveBeenCalled();
  });
});

describe('atomic snapshot repository', () => {
  it('prefers newer bundled data without discarding a deliberately rolled-back cache', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new SnapshotRepository(runtime, databaseName);
    const older = candidateFor('older-download', '2026-07-15T00:00:00.000Z');
    const newerDownload = candidateFor('newer-download', '2026-07-19T00:00:00.000Z');
    const newerBundle = structuredClone(gearSnapshot);
    newerBundle.manifest.id = 'newer-bundle';
    newerBundle.manifest.generatedAt = '2026-07-18T00:00:00.000Z';
    newerBundle.curatedSets = newerBundle.curatedSets.map((set) => ({
      ...set,
      calculationContext: set.calculationContext
        ? { ...set.calculationContext, snapshotId: newerBundle.manifest.id }
        : undefined
    }));

    await repository.stageAndActivate(older);
    const upgraded = await repository.load(newerBundle);
    expect(upgraded.source).toBe('bundled');
    expect(upgraded.snapshot.manifest.id).toBe('newer-bundle');
    expect(await repository.resolvePinnedSnapshot('older-download', newerBundle)).toBeDefined();

    await repository.stageAndActivate(newerDownload);
    expect((await repository.load(newerBundle)).snapshot.manifest.id).toBe('newer-download');
    const rolledBack = await repository.rollback();
    expect(rolledBack.snapshot.manifest.id).toBe('older-download');
    expect((await repository.load(newerBundle)).snapshot.manifest.id).toBe('older-download');
    await repository.close();
  });

  it('keeps staging inert, activates atomically, and rolls back to the previous snapshot', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new SnapshotRepository(runtime, databaseName);
    const first = candidateFor('downloaded-one');
    const second = candidateFor('downloaded-two');

    await repository.stage(first);
    expect((await repository.load(gearSnapshot)).source).toBe('bundled');

    await repository.activateStaged(first.snapshot.manifest.id);
    expect((await repository.load(gearSnapshot)).snapshot.manifest.id).toBe('downloaded-one');

    await repository.stageAndActivate(second);
    const active = await repository.load(gearSnapshot);
    expect(active.snapshot.manifest.id).toBe('downloaded-two');
    expect(active.previousSnapshotId).toBe('downloaded-one');
    expect((await repository.resolvePinnedSnapshot('downloaded-one', gearSnapshot))?.manifest.id).toBe('downloaded-one');
    expect((await repository.resolvePinnedSnapshot(gearSnapshot.manifest.id, gearSnapshot))?.manifest.id).toBe(gearSnapshot.manifest.id);

    const rolledBack = await repository.rollback();
    expect(rolledBack.snapshot.manifest.id).toBe('downloaded-one');
    expect(rolledBack.previousSnapshotId).toBe('downloaded-two');
    await repository.close();
  });

  it('leaves the active snapshot untouched when a staged candidate is incompatible', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new SnapshotRepository(runtime, databaseName);
    await repository.stageAndActivate(candidateFor('known-good'));
    const incompatible = candidateFor('bad-candidate');
    incompatible.snapshot.rulesets[0]!.calculationSchema = 'unknown@1';

    await expect(repository.stage(incompatible)).rejects.toThrow('incompatible');
    expect((await repository.load(gearSnapshot)).snapshot.manifest.id).toBe('known-good');
    await repository.close();
  });

  it('migrates version-one snapshot and icon records without discarding the active cache', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const legacy = candidateFor('legacy-cache');
    legacy.snapshot.items[0] = { ...legacy.snapshot.items[0]!, iconUrl: 'https://legacy-icons.example/item.png' };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('candidates', { keyPath: 'id' });
        request.result.createObjectStore('snapshots', { keyPath: 'id' });
        request.result.createObjectStore('state', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['snapshots', 'state'], 'readwrite');
    transaction.objectStore('snapshots').put({
      id: legacy.snapshot.manifest.id,
      snapshot: legacy.snapshot,
      sha256: legacy.sha256,
      activatedAt: legacy.downloadedAt,
      updateManifest: legacy.updateManifest
    });
    transaction.objectStore('state').put({ key: 'activation', activeId: legacy.snapshot.manifest.id });
    await transactionDoneForTest(transaction);
    database.close();

    const repository = new SnapshotRepository(runtime, databaseName);
    expect((await repository.load(gearSnapshot)).snapshot.manifest.id).toBe('legacy-cache');
    await repository.close();

    const migrated = await new Promise<{ version: number; snapshot: Record<string, unknown>; metadata: Record<string, unknown> }>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = async () => {
        const upgraded = request.result;
        const read = upgraded.transaction(['snapshots', 'metadata'], 'readonly');
        const snapshotRequest = read.objectStore('snapshots').get('legacy-cache');
        const metadataRequest = read.objectStore('metadata').get('schema');
        await transactionDoneForTest(read);
        const result = {
          version: upgraded.version,
          snapshot: snapshotRequest.result as Record<string, unknown>,
          metadata: metadataRequest.result as Record<string, unknown>
        };
        upgraded.close();
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
    expect(migrated.version).toBe(2);
    expect(migrated.snapshot.storageSchemaVersion).toBe('stored-snapshot@2');
    expect(migrated.snapshot.iconSchemaVersion).toBe('legacy-external-url@1');
    expect(Number(migrated.snapshot.estimatedBytes)).toBeGreaterThan(0);
    expect(migrated.metadata.snapshotRecordSchema).toBe('stored-snapshot@2');
  });

  it('retains active, rollback, and saved-set snapshots while pruning older unreferenced versions', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    let clock = Date.parse('2026-07-15T00:00:00.000Z');
    const repository = new SnapshotRepository(runtime, databaseName, {
      retention: { maximumRetainedSnapshots: 3 },
      now: () => new Date(clock)
    });
    await repository.stageAndActivate(candidateFor('retained-one'));
    await repository.setPinnedSnapshotIds(['retained-one']);
    for (const id of ['retained-two', 'retained-three', 'retained-four', 'retained-five']) {
      clock += 60_000;
      await repository.stageAndActivate(candidateFor(id));
    }

    expect((await repository.load(gearSnapshot)).snapshot.manifest.id).toBe('retained-five');
    expect((await repository.resolvePinnedSnapshot('retained-one', gearSnapshot))?.manifest.id).toBe('retained-one');
    expect(await repository.resolvePinnedSnapshot('retained-two', gearSnapshot)).toBeUndefined();
    const cleanup = await repository.cleanup();
    expect(cleanup.protectedSnapshotIds).toEqual(['retained-five', 'retained-four', 'retained-one']);
    expect(cleanup.remainingSnapshots).toBe(3);
    const rollback = await repository.rollback();
    expect(rollback.snapshot.manifest.id).toBe('retained-four');
    await repository.close();
  });

  it('recovers from one quota failure and leaves the active snapshot untouched if the retry also fails', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    let attempts = 0;
    const recovering = new SnapshotRepository(runtime, databaseName, {
      beforeWrite: () => {
        attempts += 1;
        if (attempts === 1) throw new DOMException('Storage full', 'QuotaExceededError');
      }
    });
    await recovering.stageAndActivate(candidateFor('quota-good'));
    expect(attempts).toBe(2);
    await recovering.close();

    const failing = new SnapshotRepository(runtime, databaseName, {
      beforeWrite: () => { throw new DOMException('Storage full', 'QuotaExceededError'); }
    });
    await expect(failing.stage(candidateFor('quota-failed'))).rejects.toThrow('local storage is full');
    expect((await failing.load(gearSnapshot)).snapshot.manifest.id).toBe('quota-good');
    await failing.close();
  });

  it('restores the active cache after a simulated six-month offline gap', async () => {
    const databaseName = `xiv-gear-lab-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const online = new SnapshotRepository(runtime, databaseName, {
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });
    await online.stageAndActivate(candidateFor('long-offline-cache'));
    await online.close();

    const sixMonthsLater = new SnapshotRepository(runtime, databaseName, {
      now: () => new Date('2026-07-01T00:00:00.000Z')
    });
    const restored = await sixMonthsLater.load(gearSnapshot);
    expect(restored.source).toBe('downloaded');
    expect(restored.snapshot.manifest.id).toBe('long-offline-cache');
    await sixMonthsLater.close();
  });
});

const transactionDoneForTest = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});
