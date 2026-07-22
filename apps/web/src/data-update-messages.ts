import { SnapshotBelowMinimumError } from '@xiv-gear-lab/data';

export interface DataUpdateErrorDisplay {
  message: string;
  technicalMessage?: string;
}

export const describeDataUpdateError = (error: unknown): DataUpdateErrorDisplay => {
  if (error instanceof SnapshotBelowMinimumError) {
    return {
      message: 'Compatible data has not been published yet. This client expects newer expansion data than the update channel currently provides. Your installed data was left unchanged; try again after the catalogue update is released.',
      technicalMessage: error.message
    };
  }
  return {
    message: error instanceof Error ? error.message : 'Data update failed unexpectedly.'
  };
};
