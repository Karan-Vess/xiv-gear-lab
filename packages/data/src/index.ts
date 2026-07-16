import type { GearSnapshot } from '@xiv-gear-lab/domain';
import snapshotJson from './generated/whm-snapshot.json';
import {
  CURRENT_EVALUATOR_PROFILES,
  CURRENT_REGISTRY,
  CURRENT_RULESETS,
  REGISTRY_SCHEMA_VERSION,
  RULESET_SCHEMA_VERSION,
  SNAPSHOT_SCHEMA_VERSION
} from './current-registry';

export * from './runtime-updates';

const legacySnapshot = snapshotJson as unknown as Omit<GearSnapshot, 'registry' | 'rulesets' | 'evaluatorProfiles'>;

export const gearSnapshot: GearSnapshot = {
  ...legacySnapshot,
  manifest: {
    ...legacySnapshot.manifest,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    registrySchemaVersion: REGISTRY_SCHEMA_VERSION,
    rulesetSchemaVersion: RULESET_SCHEMA_VERSION,
    minimumAppVersion: '0.5.0'
  },
  registry: CURRENT_REGISTRY,
  rulesets: CURRENT_RULESETS,
  evaluatorProfiles: CURRENT_EVALUATOR_PROFILES,
  curatedSets: legacySnapshot.curatedSets.map((set) => {
    const profile = CURRENT_EVALUATOR_PROFILES.find((entry) => entry.job === set.job && entry.jobMode === 'standard');
    const ruleset = profile ? CURRENT_RULESETS.find((entry) => entry.id === profile.rulesetId) : undefined;
    return profile && ruleset
      ? {
        ...set,
        calculationContext: {
          snapshotId: legacySnapshot.manifest.id,
          rulesetId: ruleset.id,
          evaluatorProfileId: profile.id,
          evaluatorVersion: profile.version,
          calculationSchema: ruleset.calculationSchema
        }
      }
      : set;
  })
};
export const whmSnapshot: GearSnapshot = {
  ...gearSnapshot,
  items: gearSnapshot.items.filter((item) => item.jobs.includes('WHM')),
  curatedSets: gearSnapshot.curatedSets.filter((set) => set.job === 'WHM')
};

export const getItem = (id: number | string) =>
  gearSnapshot.items.find((item) => String(item.id) === String(id));

export const getFood = (id?: number) =>
  id === undefined ? undefined : gearSnapshot.foods.find((food) => food.id === id);
