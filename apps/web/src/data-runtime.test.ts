import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { resolveEvaluatorCapability, type CombatJob } from '@xiv-gear-lab/domain';
import { overlayBundledEvaluatorCapabilities } from './data-runtime';

const meleeJobs: CombatJob[] = ['MNK', 'DRG', 'NIN', 'RPR', 'VPR'];

describe('downloaded catalogue capability overlay', () => {
  it('keeps downloaded items and identity while restoring newer bundled melee evaluators', () => {
    const downloaded = structuredClone(gearSnapshot);
    downloaded.manifest.id = 'downloaded-alpha4-catalogue';
    downloaded.items[0]!.name = 'Downloaded catalogue marker';
    downloaded.rotationProfiles = downloaded.rotationProfiles?.filter((profile) =>
      !meleeJobs.includes(profile.job)
    );
    for (const job of downloaded.registry.jobs.filter((entry) => meleeJobs.includes(entry.id))) {
      const standard = job.modes.find((mode) => mode.id === 'standard')!;
      standard.capabilities['opener-30'] = {
        status: 'pending',
        reason: 'Older downloaded cache has no melee evaluator.'
      };
      standard.capabilities['dummy-300'] = {
        status: 'pending',
        reason: 'Older downloaded cache has no melee evaluator.'
      };
    }

    const overlaid = overlayBundledEvaluatorCapabilities(downloaded, gearSnapshot);

    expect(overlaid.snapshot.manifest.id).toBe('downloaded-alpha4-catalogue');
    expect(overlaid.snapshot.items[0]!.name).toBe('Downloaded catalogue marker');
    expect(overlaid.bundledRotationProfileIds).toHaveLength(5);
    expect(overlaid.snapshot.rotationProfiles?.filter((profile) =>
      meleeJobs.includes(profile.job)
    ).map((profile) => profile.job).sort()).toEqual([...meleeJobs].sort());

    for (const job of meleeJobs) {
      expect(resolveEvaluatorCapability(
        overlaid.snapshot,
        job,
        'standard',
        'opener-30',
        'dt-7.51-level-100-standard@1'
      )).toMatchObject({ status: 'available' });
      expect(resolveEvaluatorCapability(
        overlaid.snapshot,
        job,
        'standard',
        'dummy-300',
        'dt-7.51-level-100-standard@1'
      )).toMatchObject({ status: 'available' });
    }
  });

  it('does not replace a newer compatible downloaded profile revision', () => {
    const downloaded = structuredClone(gearSnapshot);
    const viper = downloaded.rotationProfiles!.find((profile) => profile.job === 'VPR')!;
    viper.version = 'dt-7.51-pilot-rotation@99';
    viper.limitation = 'Newer signed-channel Viper profile.';

    const overlaid = overlayBundledEvaluatorCapabilities(downloaded, gearSnapshot);
    const selected = overlaid.snapshot.rotationProfiles!.find((profile) => profile.job === 'VPR')!;

    expect(selected.version).toBe('dt-7.51-pilot-rotation@99');
    expect(selected.limitation).toBe('Newer signed-channel Viper profile.');
    expect(overlaid.bundledRotationProfileIds).not.toContain(viper.id);
  });
});
