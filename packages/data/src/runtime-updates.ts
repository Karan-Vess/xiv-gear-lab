import {
  assessSnapshotCompatibility,
  type GearSnapshot,
  type RuntimeCompatibility,
  type SnapshotCompatibilityReport
} from '@xiv-gear-lab/domain';

export const UPDATE_MANIFEST_SCHEMA_VERSION = 'data-update-manifest@1';

export interface DataProviderFreshness {
  id: string;
  status: 'current' | 'stale' | 'partial' | 'failed';
  retrievedAt?: string;
  message?: string;
}

export interface DataUpdateManifest {
  schemaVersion: typeof UPDATE_MANIFEST_SCHEMA_VERSION;
  channel: string;
  publishedAt: string;
  keyId: string;
  snapshot: {
    id: string;
    url: string;
    sha256: string;
    byteLength: number;
    counts: SnapshotCounts;
  };
  providers: DataProviderFreshness[];
  signature: string;
}

export interface SnapshotUpdatePolicy {
  manifestUrl: string;
  allowedOrigins: string[];
  trustedEd25519Keys: Record<string, string>;
  maximumManifestBytes?: number;
  maximumSnapshotBytes?: number;
  minimumSnapshotCounts?: Partial<SnapshotCounts>;
  allowInsecureLocalhost?: boolean;
}

export interface SnapshotCounts {
  expansions: number;
  jobs: number;
  rulesets: number;
  evaluatorProfiles: number;
  items: number;
  materia: number;
  foods: number;
  curatedSets: number;
}

export interface DownloadedSnapshotCandidate {
  snapshot: GearSnapshot;
  sha256: string;
  downloadedAt: string;
  updateManifest: DataUpdateManifest;
  compatibility: SnapshotCompatibilityReport;
}

export interface ActiveSnapshot {
  snapshot: GearSnapshot;
  source: 'bundled' | 'downloaded';
  activatedAt?: string;
  sha256?: string;
  fallbackReason?: string;
  previousSnapshotId?: string;
  providers?: DataProviderFreshness[];
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const SNAPSHOT_DATABASE_VERSION = 2;
export const SNAPSHOT_RECORD_SCHEMA_VERSION = 'stored-snapshot@2';
export type SnapshotIconSchemaVersion = 'embedded-data-url@1' | 'legacy-external-url@1' | 'no-icons@1';

type SnapshotStorageMetadata = {
  storageSchemaVersion: typeof SNAPSHOT_RECORD_SCHEMA_VERSION;
  iconSchemaVersion: SnapshotIconSchemaVersion;
  estimatedBytes: number;
  lastAccessedAt: string;
};
type StoredCandidate = DownloadedSnapshotCandidate & SnapshotStorageMetadata & {
  id: string;
  stagedAt: string;
};
type StoredSnapshot = {
  id: string;
  snapshot: GearSnapshot;
  sha256: string;
  activatedAt: string;
  updateManifest: DataUpdateManifest;
} & SnapshotStorageMetadata;
type ActivationState = { key: 'activation'; activeId: string; previousId?: string };
type PinState = { key: 'pins'; snapshotIds: string[]; updatedAt: string };

export interface SnapshotRetentionPolicy {
  maximumRetainedSnapshots: number;
  maximumRetainedBytes: number;
  maximumCandidateAgeMs: number;
}

export interface SnapshotCleanupReport {
  removedSnapshotIds: string[];
  removedCandidateIds: string[];
  protectedSnapshotIds: string[];
  remainingSnapshots: number;
  remainingEstimatedBytes: number;
}

export interface SnapshotRepositoryOptions {
  retention?: Partial<SnapshotRetentionPolicy>;
  now?: () => Date;
  beforeWrite?: (operation: 'stage', attempt: number) => void | Promise<void>;
}

const DEFAULT_RETENTION_POLICY: SnapshotRetentionPolicy = {
  maximumRetainedSnapshots: 8,
  maximumRetainedBytes: 64 * 1024 * 1024,
  maximumCandidateAgeMs: 24 * 60 * 60 * 1000
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const estimatedSnapshotBytes = (snapshot: GearSnapshot): number =>
  new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;

const snapshotIconSchemaVersion = (snapshot: GearSnapshot): SnapshotIconSchemaVersion => {
  const iconUrls = [...snapshot.items, ...snapshot.materia, ...snapshot.foods]
    .map((entry) => entry.iconUrl)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
  if (iconUrls.length === 0) return 'no-icons@1';
  return iconUrls.every((url) => url.startsWith('data:')) ? 'embedded-data-url@1' : 'legacy-external-url@1';
};

const storageMetadataFor = (snapshot: GearSnapshot, lastAccessedAt: string): SnapshotStorageMetadata => ({
  storageSchemaVersion: SNAPSHOT_RECORD_SCHEMA_VERSION,
  iconSchemaVersion: snapshotIconSchemaVersion(snapshot),
  estimatedBytes: estimatedSnapshotBytes(snapshot),
  lastAccessedAt
});

const isQuotaExceededError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === 'QuotaExceededError'
    : error instanceof Error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message));

export const canonicalizeJson = (value: JsonValue): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Signed JSON cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key]!)}`).join(',')}}`;
};

const manifestSigningPayload = (manifest: DataUpdateManifest): JsonValue => ({
  schemaVersion: manifest.schemaVersion,
  channel: manifest.channel,
  publishedAt: manifest.publishedAt,
  keyId: manifest.keyId,
  snapshot: manifest.snapshot,
  providers: manifest.providers.map((provider) => ({
    id: provider.id,
    status: provider.status,
    ...(provider.retrievedAt === undefined ? {} : { retrievedAt: provider.retrievedAt }),
    ...(provider.message === undefined ? {} : { message: provider.message })
  }))
}) as unknown as JsonValue;

export const canonicalUpdateManifestPayload = (manifest: DataUpdateManifest): string =>
  canonicalizeJson(manifestSigningPayload(manifest));

const decodeBase64 = (value: string): Uint8Array => {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Update signature or key is not valid base64.');
  }
};

const decodeBase64Buffer = (value: string): ArrayBuffer => {
  const bytes = decodeBase64(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const bytesToHex = (value: ArrayBuffer): string =>
  [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const sha256Hex = async (value: ArrayBuffer): Promise<string> =>
  bytesToHex(await crypto.subtle.digest('SHA-256', value));

export const verifyUpdateManifestSignature = async (
  manifest: DataUpdateManifest,
  trustedKeys: Record<string, string>
): Promise<void> => {
  const encodedKey = trustedKeys[manifest.keyId];
  if (!encodedKey) throw new Error(`Update manifest uses untrusted signing key ${manifest.keyId}.`);
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase64Buffer(encodedKey),
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    decodeBase64Buffer(manifest.signature),
    new TextEncoder().encode(canonicalUpdateManifestPayload(manifest))
  );
  if (!valid) throw new Error('Update manifest signature is invalid.');
};

const parseUpdateManifest = (value: unknown): DataUpdateManifest => {
  if (!isRecord(value) || value.schemaVersion !== UPDATE_MANIFEST_SCHEMA_VERSION) {
    throw new Error('Update manifest schema is missing or unsupported.');
  }
  if (
    typeof value.channel !== 'string' ||
    typeof value.publishedAt !== 'string' ||
    typeof value.keyId !== 'string' ||
    typeof value.signature !== 'string' ||
    !isRecord(value.snapshot) ||
    typeof value.snapshot.id !== 'string' ||
    typeof value.snapshot.url !== 'string' ||
    typeof value.snapshot.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(value.snapshot.sha256) ||
    typeof value.snapshot.byteLength !== 'number' ||
    !Number.isSafeInteger(value.snapshot.byteLength) ||
    value.snapshot.byteLength < 1 ||
    !isRecord(value.snapshot.counts) ||
    !Array.isArray(value.providers)
  ) {
    throw new Error('Update manifest is malformed.');
  }
  for (const key of ['expansions', 'jobs', 'rulesets', 'evaluatorProfiles', 'items', 'materia', 'foods', 'curatedSets'] as Array<keyof SnapshotCounts>) {
    const count = value.snapshot.counts[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Update manifest contains invalid ${key} count.`);
    }
  }
  for (const provider of value.providers) {
    if (
      !isRecord(provider) ||
      typeof provider.id !== 'string' ||
      !['current', 'stale', 'partial', 'failed'].includes(String(provider.status)) ||
      (provider.retrievedAt !== undefined && typeof provider.retrievedAt !== 'string') ||
      (provider.message !== undefined && typeof provider.message !== 'string')
    ) {
      throw new Error('Update manifest contains malformed provider freshness data.');
    }
  }
  return value as unknown as DataUpdateManifest;
};

const parseSnapshot = (value: unknown): GearSnapshot => {
  if (
    !isRecord(value) ||
    !isRecord(value.manifest) ||
    !isRecord(value.registry) ||
    !Array.isArray(value.rulesets) ||
    !Array.isArray(value.evaluatorProfiles) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.materia) ||
    !Array.isArray(value.foods) ||
    !Array.isArray(value.curatedSets)
  ) {
    throw new Error('Downloaded snapshot is malformed.');
  }
  return value as unknown as GearSnapshot;
};

const localhostNames = new Set(['localhost', '127.0.0.1', '[::1]']);

const assertAllowedUrl = (value: string, policy: SnapshotUpdatePolicy, base?: string): URL => {
  const url = new URL(value, base);
  const localException = policy.allowInsecureLocalhost && localhostNames.has(url.hostname);
  if (url.protocol !== 'https:' && !localException) throw new Error(`Update URL must use HTTPS: ${url.href}`);
  if (!policy.allowedOrigins.includes(url.origin)) throw new Error(`Update origin is not allowed: ${url.origin}`);
  if (url.username || url.password) throw new Error('Update URLs cannot contain credentials.');
  return url;
};

const readBounded = async (response: Response, maximumBytes: number, label: string): Promise<ArrayBuffer> => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`${label} exceeds the ${maximumBytes.toLocaleString()} byte limit.`);
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > maximumBytes) throw new Error(`${label} exceeds the ${maximumBytes.toLocaleString()} byte limit.`);
  return body;
};

const fetchChecked = async (fetcher: typeof fetch, url: URL, maximumBytes: number, label: string): Promise<ArrayBuffer> => {
  const response = await fetcher(url.href, {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error(`${label} request failed with HTTP ${response.status}.`);
  return readBounded(response, maximumBytes, label);
};

export const downloadSnapshotCandidate = async (
  policy: SnapshotUpdatePolicy,
  runtime: RuntimeCompatibility,
  fetcher: typeof fetch = fetch
): Promise<DownloadedSnapshotCandidate> => {
  const maximumManifestBytes = policy.maximumManifestBytes ?? 256 * 1024;
  const maximumSnapshotBytes = policy.maximumSnapshotBytes ?? 64 * 1024 * 1024;
  const manifestUrl = assertAllowedUrl(policy.manifestUrl, policy);
  const manifestBytes = await fetchChecked(fetcher, manifestUrl, maximumManifestBytes, 'Update manifest');
  let manifestUnknown: unknown;
  try {
    manifestUnknown = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error('Update manifest is not valid JSON.');
  }
  const updateManifest = parseUpdateManifest(manifestUnknown);
  await verifyUpdateManifestSignature(updateManifest, policy.trustedEd25519Keys);

  if (updateManifest.snapshot.byteLength > maximumSnapshotBytes) {
    throw new Error(`Snapshot exceeds the ${maximumSnapshotBytes.toLocaleString()} byte limit.`);
  }
  const snapshotUrl = assertAllowedUrl(updateManifest.snapshot.url, policy, manifestUrl.href);
  const snapshotBytes = await fetchChecked(fetcher, snapshotUrl, maximumSnapshotBytes, 'Snapshot');
  if (snapshotBytes.byteLength !== updateManifest.snapshot.byteLength) {
    throw new Error(`Snapshot byte length mismatch: expected ${updateManifest.snapshot.byteLength}, received ${snapshotBytes.byteLength}.`);
  }
  const checksum = await sha256Hex(snapshotBytes);
  if (checksum.toLowerCase() !== updateManifest.snapshot.sha256.toLowerCase()) {
    throw new Error('Snapshot checksum does not match the signed update manifest.');
  }

  let snapshotUnknown: unknown;
  try {
    snapshotUnknown = JSON.parse(new TextDecoder().decode(snapshotBytes));
  } catch {
    throw new Error('Downloaded snapshot is not valid JSON.');
  }
  const snapshot = parseSnapshot(snapshotUnknown);
  if (snapshot.manifest.id !== updateManifest.snapshot.id) {
    throw new Error(`Snapshot identity mismatch: expected ${updateManifest.snapshot.id}, received ${snapshot.manifest.id}.`);
  }
  const actualCounts: SnapshotCounts = {
    expansions: snapshot.registry.expansions.length,
    jobs: snapshot.registry.jobs.length,
    rulesets: snapshot.rulesets.length,
    evaluatorProfiles: snapshot.evaluatorProfiles.length,
    items: snapshot.items.length,
    materia: snapshot.materia.length,
    foods: snapshot.foods.length,
    curatedSets: snapshot.curatedSets.length
  };
  for (const key of Object.keys(actualCounts) as Array<keyof SnapshotCounts>) {
    if (actualCounts[key] !== updateManifest.snapshot.counts[key]) {
      throw new Error(`Snapshot ${key} count mismatch: manifest ${updateManifest.snapshot.counts[key]}, actual ${actualCounts[key]}.`);
    }
    const minimum = policy.minimumSnapshotCounts?.[key];
    if (minimum !== undefined && actualCounts[key] < minimum) {
      throw new Error(`Snapshot ${key} count ${actualCounts[key]} is below the required minimum ${minimum}.`);
    }
  }
  let compatibility: SnapshotCompatibilityReport;
  try {
    compatibility = assessSnapshotCompatibility(snapshot, runtime);
  } catch {
    throw new Error('Downloaded snapshot failed structural compatibility validation.');
  }
  if (!compatibility.compatible) {
    throw new Error(`Downloaded snapshot is incompatible: ${compatibility.errors.join(' ')}`);
  }
  return {
    snapshot,
    sha256: checksum,
    downloadedAt: new Date().toISOString(),
    updateManifest,
    compatibility
  };
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
});

export class SnapshotRepository {
  private databasePromise?: Promise<IDBDatabase>;
  private readonly retention: SnapshotRetentionPolicy;

  constructor(
    private readonly runtime: RuntimeCompatibility,
    private readonly databaseName = 'xiv-gear-lab-snapshots',
    private readonly options: SnapshotRepositoryOptions = {}
  ) {
    this.retention = { ...DEFAULT_RETENTION_POLICY, ...options.retention };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, SNAPSHOT_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('candidates')) database.createObjectStore('candidates', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('state')) database.createObjectStore('state', { keyPath: 'key' });
        if (!database.objectStoreNames.contains('metadata')) database.createObjectStore('metadata', { keyPath: 'key' });
        const transaction = request.transaction;
        if (!transaction) return;
        const migrateRecords = (storeName: 'candidates' | 'snapshots') => {
          const cursorRequest = transaction.objectStore(storeName).openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            try {
              const record = cursor.value as Record<string, unknown>;
              const snapshot = record.snapshot as GearSnapshot;
              const fallbackTimestamp = storeName === 'candidates'
                ? String(record.downloadedAt ?? this.nowIso())
                : String(record.activatedAt ?? this.nowIso());
              cursor.update({
                ...record,
                ...storageMetadataFor(snapshot, String(record.lastAccessedAt ?? fallbackTimestamp)),
                ...(storeName === 'candidates' ? { stagedAt: String(record.stagedAt ?? fallbackTimestamp) } : {})
              });
            } catch {
              cursor.delete();
            }
            cursor.continue();
          };
        };
        migrateRecords('candidates');
        migrateRecords('snapshots');
        transaction.objectStore('metadata').put({
          key: 'schema',
          databaseVersion: SNAPSHOT_DATABASE_VERSION,
          snapshotRecordSchema: SNAPSHOT_RECORD_SCHEMA_VERSION,
          embeddedIconSchema: 'embedded-data-url@1'
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Snapshot database could not be opened.'));
      request.onblocked = () => reject(new Error('Snapshot database upgrade is blocked by another application window.'));
    });
    return this.databasePromise;
  }

  private compatibility(snapshot: GearSnapshot): SnapshotCompatibilityReport {
    try {
      return assessSnapshotCompatibility(snapshot, this.runtime);
    } catch {
      return { compatible: false, errors: ['Snapshot structure could not be validated.'], warnings: [] };
    }
  }

  private async writeCandidate(candidate: DownloadedSnapshotCandidate, attempt: number): Promise<void> {
    await this.options.beforeWrite?.('stage', attempt);
    const database = await this.open();
    const transaction = database.transaction('candidates', 'readwrite');
    const stagedAt = this.nowIso();
    transaction.objectStore('candidates').put({
      ...candidate,
      id: candidate.snapshot.manifest.id,
      stagedAt,
      ...storageMetadataFor(candidate.snapshot, stagedAt)
    } satisfies StoredCandidate);
    await transactionDone(transaction);
  }

  async stage(candidate: DownloadedSnapshotCandidate): Promise<void> {
    const compatibility = this.compatibility(candidate.snapshot);
    if (!compatibility.compatible) throw new Error(`Candidate snapshot is incompatible: ${compatibility.errors.join(' ')}`);
    try {
      await this.writeCandidate(candidate, 1);
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      await this.cleanup({ aggressive: true });
      try {
        await this.writeCandidate(candidate, 2);
      } catch (retryError) {
        if (isQuotaExceededError(retryError)) {
          throw new Error('The downloaded data snapshot could not be cached because local storage is full. Protected current, rollback, and saved-set snapshots were left untouched.');
        }
        throw retryError;
      }
    }
  }

  async activateStaged(snapshotId: string): Promise<ActiveSnapshot> {
    const database = await this.open();
    const readTransaction = database.transaction('candidates', 'readonly');
    const candidate = await requestResult(readTransaction.objectStore('candidates').get(snapshotId)) as StoredCandidate | undefined;
    await transactionDone(readTransaction);
    if (!candidate) throw new Error(`Staged snapshot ${snapshotId} does not exist.`);
    const compatibility = this.compatibility(candidate.snapshot);
    if (!compatibility.compatible) throw new Error(`Staged snapshot is no longer compatible: ${compatibility.errors.join(' ')}`);

    const transaction = database.transaction(['candidates', 'snapshots', 'state'], 'readwrite');
    const stateStore = transaction.objectStore('state');
    const current = await requestResult(stateStore.get('activation')) as ActivationState | undefined;
    const activatedAt = this.nowIso();
    transaction.objectStore('snapshots').put({
      id: snapshotId,
      snapshot: candidate.snapshot,
      sha256: candidate.sha256,
      activatedAt,
      updateManifest: candidate.updateManifest,
      ...storageMetadataFor(candidate.snapshot, activatedAt)
    } satisfies StoredSnapshot);
    stateStore.put({
      key: 'activation',
      activeId: snapshotId,
      previousId: current?.activeId && current.activeId !== snapshotId ? current.activeId : current?.previousId
    } satisfies ActivationState);
    transaction.objectStore('candidates').delete(snapshotId);
    await transactionDone(transaction);
    await this.cleanup().catch(() => undefined);
    return {
      snapshot: candidate.snapshot,
      source: 'downloaded',
      activatedAt,
      sha256: candidate.sha256,
      previousSnapshotId: current?.activeId,
      providers: candidate.updateManifest.providers
    };
  }

  async stageAndActivate(candidate: DownloadedSnapshotCandidate): Promise<ActiveSnapshot> {
    await this.stage(candidate);
    return this.activateStaged(candidate.snapshot.manifest.id);
  }

  private async storedSnapshot(id?: string): Promise<StoredSnapshot | undefined> {
    if (!id) return undefined;
    const database = await this.open();
    const transaction = database.transaction('snapshots', 'readonly');
    const result = await requestResult(transaction.objectStore('snapshots').get(id)) as StoredSnapshot | undefined;
    await transactionDone(transaction);
    if (result) {
      const touchTransaction = database.transaction('snapshots', 'readwrite');
      touchTransaction.objectStore('snapshots').put({ ...result, lastAccessedAt: this.nowIso() });
      await transactionDone(touchTransaction).catch(() => undefined);
    }
    return result;
  }

  async setPinnedSnapshotIds(snapshotIds: Iterable<string>): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('state', 'readwrite');
    transaction.objectStore('state').put({
      key: 'pins',
      snapshotIds: [...new Set(snapshotIds)].filter(Boolean).sort(),
      updatedAt: this.nowIso()
    } satisfies PinState);
    await transactionDone(transaction);
    await this.cleanup().catch(() => undefined);
  }

  async cleanup(options: { aggressive?: boolean } = {}): Promise<SnapshotCleanupReport> {
    const database = await this.open();
    const readTransaction = database.transaction(['candidates', 'snapshots', 'state'], 'readonly');
    const done = transactionDone(readTransaction);
    const [candidates, snapshots, activation, pins] = await Promise.all([
      requestResult(readTransaction.objectStore('candidates').getAll()) as Promise<StoredCandidate[]>,
      requestResult(readTransaction.objectStore('snapshots').getAll()) as Promise<StoredSnapshot[]>,
      requestResult(readTransaction.objectStore('state').get('activation')) as Promise<ActivationState | undefined>,
      requestResult(readTransaction.objectStore('state').get('pins')) as Promise<PinState | undefined>
    ]);
    await done;

    const protectedIds = new Set([
      activation?.activeId,
      activation?.previousId,
      ...(pins?.snapshotIds ?? [])
    ].filter((id): id is string => Boolean(id)));
    const now = this.now().getTime();
    const removedCandidateIds = candidates
      .filter((candidate) => options.aggressive || now - Date.parse(candidate.stagedAt ?? candidate.downloadedAt) > this.retention.maximumCandidateAgeMs)
      .map((candidate) => candidate.id);

    let remainingCount = snapshots.length;
    let remainingBytes = snapshots.reduce((total, snapshot) => total + (snapshot.estimatedBytes ?? estimatedSnapshotBytes(snapshot.snapshot)), 0);
    const removedSnapshotIds: string[] = [];
    const removable = snapshots
      .filter((snapshot) => !protectedIds.has(snapshot.id))
      .sort((left, right) => Date.parse(left.lastAccessedAt ?? left.activatedAt) - Date.parse(right.lastAccessedAt ?? right.activatedAt));
    for (const snapshot of removable) {
      const outsidePolicy = remainingCount > this.retention.maximumRetainedSnapshots || remainingBytes > this.retention.maximumRetainedBytes;
      if (!options.aggressive && !outsidePolicy) break;
      removedSnapshotIds.push(snapshot.id);
      remainingCount -= 1;
      remainingBytes -= snapshot.estimatedBytes ?? estimatedSnapshotBytes(snapshot.snapshot);
    }

    if (removedCandidateIds.length > 0 || removedSnapshotIds.length > 0) {
      const writeTransaction = database.transaction(['candidates', 'snapshots'], 'readwrite');
      const candidateStore = writeTransaction.objectStore('candidates');
      const snapshotStore = writeTransaction.objectStore('snapshots');
      removedCandidateIds.forEach((id) => candidateStore.delete(id));
      removedSnapshotIds.forEach((id) => snapshotStore.delete(id));
      await transactionDone(writeTransaction);
    }
    return {
      removedSnapshotIds,
      removedCandidateIds,
      protectedSnapshotIds: [...protectedIds].sort(),
      remainingSnapshots: remainingCount,
      remainingEstimatedBytes: Math.max(0, remainingBytes)
    };
  }

  async load(bundled: GearSnapshot): Promise<ActiveSnapshot> {
    const bundledCompatibility = this.compatibility(bundled);
    if (!bundledCompatibility.compatible) {
      throw new Error(`Bundled snapshot is incompatible: ${bundledCompatibility.errors.join(' ')}`);
    }
    try {
      const database = await this.open();
      const transaction = database.transaction('state', 'readonly');
      const state = await requestResult(transaction.objectStore('state').get('activation')) as ActivationState | undefined;
      await transactionDone(transaction);
      const active = await this.storedSnapshot(state?.activeId);
      if (active && this.compatibility(active.snapshot).compatible) {
        const previous = await this.storedSnapshot(state?.previousId);
        const bundledGeneratedAt = Date.parse(bundled.manifest.generatedAt);
        const activeGeneratedAt = Date.parse(active.snapshot.manifest.generatedAt);
        const previousGeneratedAt = previous && this.compatibility(previous.snapshot).compatible
          ? Date.parse(previous.snapshot.manifest.generatedAt)
          : Number.NaN;
        const intentionalRollback = Number.isFinite(activeGeneratedAt)
          && Number.isFinite(previousGeneratedAt)
          && previousGeneratedAt > activeGeneratedAt;
        const bundledIsNewer = Number.isFinite(bundledGeneratedAt)
          && Number.isFinite(activeGeneratedAt)
          && bundledGeneratedAt > activeGeneratedAt;
        if (bundledIsNewer && !intentionalRollback) {
          return {
            snapshot: bundled,
            source: 'bundled',
            fallbackReason: `Bundled snapshot ${bundled.manifest.id} is newer than cached snapshot ${active.id}.`,
            previousSnapshotId: state?.previousId
          };
        }
        return {
          snapshot: active.snapshot,
          source: 'downloaded',
          activatedAt: active.activatedAt,
          sha256: active.sha256,
          previousSnapshotId: state?.previousId,
          providers: active.updateManifest.providers
        };
      }
      const previous = await this.storedSnapshot(state?.previousId);
      if (previous && this.compatibility(previous.snapshot).compatible) {
        const bundledGeneratedAt = Date.parse(bundled.manifest.generatedAt);
        const previousGeneratedAt = Date.parse(previous.snapshot.manifest.generatedAt);
        if (Number.isFinite(bundledGeneratedAt)
          && Number.isFinite(previousGeneratedAt)
          && bundledGeneratedAt > previousGeneratedAt) {
          return {
            snapshot: bundled,
            source: 'bundled',
            fallbackReason: `Bundled snapshot ${bundled.manifest.id} is newer than fallback cache ${previous.id}.`,
            previousSnapshotId: state?.previousId
          };
        }
        const repairTransaction = database.transaction('state', 'readwrite');
        repairTransaction.objectStore('state').put({
          key: 'activation',
          activeId: previous.id,
          previousId: active?.id
        } satisfies ActivationState);
        await transactionDone(repairTransaction);
        return {
          snapshot: previous.snapshot,
          source: 'downloaded',
          activatedAt: previous.activatedAt,
          sha256: previous.sha256,
          fallbackReason: active ? `Active snapshot ${active.id} was incompatible.` : 'Active snapshot was missing.',
          previousSnapshotId: state?.activeId,
          providers: previous.updateManifest.providers
        };
      }
      return {
        snapshot: bundled,
        source: 'bundled',
        fallbackReason: state ? 'Cached snapshots were missing or incompatible.' : undefined
      };
    } catch (error) {
      return {
        snapshot: bundled,
        source: 'bundled',
        fallbackReason: error instanceof Error ? `Snapshot cache unavailable: ${error.message}` : 'Snapshot cache unavailable.'
      };
    }
  }

  async resolvePinnedSnapshot(snapshotId: string, bundled: GearSnapshot): Promise<GearSnapshot | undefined> {
    if (bundled.manifest.id === snapshotId && this.compatibility(bundled).compatible) return bundled;
    const stored = await this.storedSnapshot(snapshotId);
    return stored && this.compatibility(stored.snapshot).compatible ? stored.snapshot : undefined;
  }

  async rollback(): Promise<ActiveSnapshot> {
    const database = await this.open();
    const readTransaction = database.transaction('state', 'readonly');
    const state = await requestResult(readTransaction.objectStore('state').get('activation')) as ActivationState | undefined;
    await transactionDone(readTransaction);
    if (!state?.previousId) throw new Error('No previous downloaded snapshot is available.');
    const previous = await this.storedSnapshot(state.previousId);
    if (!previous) throw new Error(`Previous snapshot ${state.previousId} is missing.`);
    const compatibility = this.compatibility(previous.snapshot);
    if (!compatibility.compatible) throw new Error(`Previous snapshot is incompatible: ${compatibility.errors.join(' ')}`);

    const transaction = database.transaction('state', 'readwrite');
    transaction.objectStore('state').put({
      key: 'activation',
      activeId: state.previousId,
      previousId: state.activeId
    } satisfies ActivationState);
    await transactionDone(transaction);
    return {
      snapshot: previous.snapshot,
      source: 'downloaded',
      activatedAt: previous.activatedAt,
      sha256: previous.sha256,
      previousSnapshotId: state.activeId,
      fallbackReason: `Rolled back from ${state.activeId}.`,
      providers: previous.updateManifest.providers
    };
  }

  async discardStaged(snapshotId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('candidates', 'readwrite');
    transaction.objectStore('candidates').delete(snapshotId);
    await transactionDone(transaction);
  }

  async close(): Promise<void> {
    const database = await this.databasePromise;
    database?.close();
    this.databasePromise = undefined;
  }
}
