import { describe, expect, it } from 'vitest';
import { SnapshotBelowMinimumError } from '@xiv-gear-lab/data';
import { describeDataUpdateError } from './data-update-messages';

describe('data update messages', () => {
  it('describes an older valid channel as not yet published and preserves the technical reason', () => {
    expect(describeDataUpdateError(new SnapshotBelowMinimumError('rulesets', 4, 5))).toEqual({
      message: 'Compatible data has not been published yet. This client expects newer expansion data than the update channel currently provides. Your installed data was left unchanged; try again after the catalogue update is released.',
      technicalMessage: 'Snapshot rulesets count 4 is below the required minimum 5.'
    });
  });

  it('does not disguise unrelated verification failures', () => {
    expect(describeDataUpdateError(new Error('Update manifest signature is invalid.'))).toEqual({
      message: 'Update manifest signature is invalid.'
    });
  });
});
