import {
  SnapshotRepository,
  enrichLegacyCatalogueMetadata,
  type ActiveSnapshot,
  type SnapshotUpdatePolicy
} from '@xiv-gear-lab/data';
import type { GearSnapshot, RuntimeCompatibility } from '@xiv-gear-lab/domain';

export const APP_RUNTIME_COMPATIBILITY: RuntimeCompatibility = {
  appVersion: '0.9.0-alpha.19',
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
  evaluatorProfileSchemas: ['generic-hit-profile@1'],
  rotationProfileSchemas: ['combat-rotation-profile@1', 'combat-rotation-profile@2']
};

export interface DataRuntimeBootstrap {
  active: ActiveSnapshot;
  repository: SnapshotRepository;
  updatePolicy?: SnapshotUpdatePolicy;
  configurationMessage?: string;
}

type CapabilityOverlayResult = {
  snapshot: GearSnapshot;
  bundledRotationProfileIds: string[];
};

const rotationRevision = (version: string): number | undefined => {
  const match = version.match(/@(\d+)$/);
  return match ? Number(match[1]) : undefined;
};

const mergeById = <T extends { id: string }>(
  downloaded: readonly T[],
  bundled: readonly T[]
): T[] => {
  const merged = new Map(downloaded.map((entry) => [entry.id, structuredClone(entry)]));
  for (const entry of bundled) {
    if (!merged.has(entry.id)) merged.set(entry.id, structuredClone(entry));
  }
  return [...merged.values()];
};

/**
 * A downloaded snapshot owns catalogue content and keeps its signed identity.
 * The executable may still supply newer evaluator profiles that are already
 * trusted as part of the installed application. This prevents an older cache
 * from hiding capabilities added by a newer executable without mutating the
 * cached snapshot or accepting unsigned network data.
 */
export const overlayBundledEvaluatorCapabilities = (
  downloaded: GearSnapshot,
  bundled: GearSnapshot
): CapabilityOverlayResult => {
  const downloadedRotationProfiles = downloaded.rotationProfiles ?? [];
  const bundledRotationProfileIds: string[] = [];
  const rotationProfiles = new Map(
    downloadedRotationProfiles.map((profile) => [profile.id, structuredClone(profile)])
  );
  for (const profile of bundled.rotationProfiles ?? []) {
    const cached = rotationProfiles.get(profile.id);
    const cachedRevision = cached ? rotationRevision(cached.version) : undefined;
    const bundledRevision = rotationRevision(profile.version);
    const bundledIsNewer = !cached ||
      (bundledRevision !== undefined && (cachedRevision === undefined || bundledRevision > cachedRevision));
    if (bundledIsNewer) {
      rotationProfiles.set(profile.id, structuredClone(profile));
      bundledRotationProfileIds.push(profile.id);
    }
  }

  const rotationProfileIds = new Set(rotationProfiles.keys());
  const downloadedJobs = new Map(
    downloaded.registry.jobs.map((job) => [job.id, structuredClone(job)])
  );
  for (const bundledJob of bundled.registry.jobs) {
    const cachedJob = downloadedJobs.get(bundledJob.id);
    if (!cachedJob) {
      downloadedJobs.set(bundledJob.id, structuredClone(bundledJob));
      continue;
    }
    const modes = new Map(cachedJob.modes.map((mode) => [mode.id, structuredClone(mode)]));
    for (const bundledMode of bundledJob.modes) {
      const cachedMode = modes.get(bundledMode.id);
      if (!cachedMode) {
        modes.set(bundledMode.id, structuredClone(bundledMode));
        continue;
      }
      const capabilities = { ...cachedMode.capabilities };
      for (const evaluationMode of ['opener-30', 'dummy-300'] as const) {
        const bundledCapability = bundledMode.capabilities[evaluationMode];
        const cachedCapability = cachedMode.capabilities[evaluationMode];
        if (
          bundledCapability?.status === 'available' &&
          typeof bundledCapability.profileId === 'string' &&
          rotationProfileIds.has(bundledCapability.profileId) &&
          (
            cachedCapability?.status !== 'available' ||
            cachedCapability.profileId === bundledCapability.profileId
          )
        ) {
          capabilities[evaluationMode] = structuredClone(bundledCapability);
        }
      }
      modes.set(bundledMode.id, {
        ...cachedMode,
        capabilities
      });
    }
    downloadedJobs.set(bundledJob.id, {
      ...cachedJob,
      modes: [...modes.values()]
    });
  }

  return {
    snapshot: {
      ...downloaded,
      registry: {
        ...downloaded.registry,
        expansions: mergeById(downloaded.registry.expansions, bundled.registry.expansions),
        jobs: [...downloadedJobs.values()]
      },
      rulesets: mergeById(downloaded.rulesets, bundled.rulesets),
      evaluatorProfiles: mergeById(downloaded.evaluatorProfiles, bundled.evaluatorProfiles),
      rotationProfiles: [...rotationProfiles.values()]
    },
    bundledRotationProfileIds: bundledRotationProfileIds.sort()
  };
};

const configuredUpdatePolicy = (bundled: GearSnapshot): { policy?: SnapshotUpdatePolicy; message?: string } => {
  const manifestUrl = import.meta.env.VITE_DATA_MANIFEST_URL?.trim();
  if (!manifestUrl) return { message: 'Live data channel is not configured in this build.' };
  let manifestOrigin: string;
  try {
    manifestOrigin = new URL(manifestUrl).origin;
  } catch {
    return { message: 'The configured data manifest URL is invalid.' };
  }
  let trustedKeys: Record<string, string>;
  try {
    const parsed = JSON.parse(import.meta.env.VITE_DATA_TRUSTED_KEYS ?? '{}') as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid');
    trustedKeys = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return { message: 'The configured trusted data-signing keys are invalid.' };
  }
  if (Object.keys(trustedKeys).length === 0) return { message: 'No trusted data-signing key is configured for this build.' };
  const configuredOrigins = (import.meta.env.VITE_DATA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry: string) => entry.trim())
    .filter(Boolean);
  const manifestHostname = new URL(manifestUrl).hostname;
  const allowInsecureLocalhost = import.meta.env.VITE_DATA_ALLOW_INSECURE_LOCALHOST === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(manifestHostname);
  return {
    policy: {
      manifestUrl,
      allowedOrigins: [...new Set([manifestOrigin, ...configuredOrigins])],
      trustedEd25519Keys: trustedKeys,
      allowInsecureLocalhost,
      minimumSnapshotCounts: {
        expansions: bundled.registry.expansions.length,
        jobs: bundled.registry.jobs.length,
        rulesets: bundled.rulesets.length,
        evaluatorProfiles: bundled.evaluatorProfiles.length,
        items: Math.max(1, Math.floor(bundled.items.length / 2)),
        materia: Math.max(1, Math.floor(bundled.materia.length / 2)),
        foods: Math.max(1, Math.floor(bundled.foods.length / 2)),
        curatedSets: Math.max(1, Math.floor(bundled.curatedSets.length / 2))
      }
    }
  };
};

export const bootstrapDataRuntime = async (bundled: GearSnapshot): Promise<DataRuntimeBootstrap> => {
  const repository = new SnapshotRepository(APP_RUNTIME_COMPATIBILITY);
  const loaded = await repository.load(bundled);
  const overlay = loaded.source === 'downloaded'
    ? overlayBundledEvaluatorCapabilities(loaded.snapshot, bundled)
    : { snapshot: loaded.snapshot, bundledRotationProfileIds: [] };
  const active = {
    ...loaded,
    snapshot: enrichLegacyCatalogueMetadata(overlay.snapshot),
    ...(overlay.bundledRotationProfileIds.length > 0 ? {
      fallbackReason:
        `Downloaded catalogue retained; ${overlay.bundledRotationProfileIds.length} newer bundled evaluator ` +
        `profile${overlay.bundledRotationProfileIds.length === 1 ? '' : 's'} applied for this executable.`
    } : {})
  };
  const configured = configuredUpdatePolicy(bundled);
  return {
    active,
    repository,
    updatePolicy: configured.policy,
    configurationMessage: configured.message
  };
};
