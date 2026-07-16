import {
  SnapshotRepository,
  type ActiveSnapshot,
  type SnapshotUpdatePolicy
} from '@xiv-gear-lab/data';
import type { GearSnapshot, RuntimeCompatibility } from '@xiv-gear-lab/domain';

export const APP_RUNTIME_COMPATIBILITY: RuntimeCompatibility = {
  appVersion: '0.8.0',
  snapshotSchemas: ['gear-snapshot@1'],
  registrySchemas: ['game-registry@1'],
  rulesetSchemas: ['combat-ruleset@1'],
  calculationSchemas: ['ffxiv-combat-level-100@1'],
  evaluatorProfileSchemas: ['generic-hit-profile@1']
};

export interface DataRuntimeBootstrap {
  active: ActiveSnapshot;
  repository: SnapshotRepository;
  updatePolicy?: SnapshotUpdatePolicy;
  configurationMessage?: string;
}

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
        rulesets: 1,
        evaluatorProfiles: bundled.evaluatorProfiles.length,
        items: Math.max(1, Math.floor(bundled.items.length / 2)),
        materia: 1,
        foods: 1,
        curatedSets: Math.max(1, Math.floor(bundled.curatedSets.length / 2))
      }
    }
  };
};

export const bootstrapDataRuntime = async (bundled: GearSnapshot): Promise<DataRuntimeBootstrap> => {
  const repository = new SnapshotRepository(APP_RUNTIME_COMPATIBILITY);
  const active = await repository.load(bundled);
  const configured = configuredUpdatePolicy(bundled);
  return {
    active,
    repository,
    updatePolicy: configured.policy,
    configurationMessage: configured.message
  };
};
