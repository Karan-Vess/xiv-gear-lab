import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import type { CombatJob, EquipmentItem, GearSnapshot, OptimizerConstraints } from '@xiv-gear-lab/domain';

self.onmessage = (event: MessageEvent<{ type: 'optimize'; constraints: OptimizerConstraints; job: CombatJob; customItems: EquipmentItem[]; snapshot: GearSnapshot }>) => {
  if (event.data.type !== 'optimize') return;
  self.postMessage({ type: 'started' });
  try {
    const snapshot = {
      ...event.data.snapshot,
      items: [...event.data.snapshot.items, ...event.data.customItems]
    };
    const result = optimizeCombatJob(snapshot, event.data.constraints, event.data.job);
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'The optimiser failed unexpectedly.'
    });
  }
};
