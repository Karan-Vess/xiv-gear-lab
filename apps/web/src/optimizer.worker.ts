import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import { rerankGearSetsByRotation } from '@xiv-gear-lab/simulator/rerank-gearsets';
import type {
  CombatJob,
  EquipmentItem,
  EvaluationMode,
  GearSnapshot,
  OptimizerConstraints
} from '@xiv-gear-lab/domain';

interface OptimizeWorkerRequest {
  type: 'optimize';
  constraints: OptimizerConstraints;
  job: CombatJob;
  customItems: EquipmentItem[];
  snapshot: GearSnapshot;
  evaluationMode: EvaluationMode;
  rotationPotion: 'none' | 'included';
}

self.onmessage = (event: MessageEvent<OptimizeWorkerRequest>) => {
  if (event.data.type !== 'optimize') return;
  self.postMessage({ type: 'started' });
  try {
    const snapshot = {
      ...event.data.snapshot,
      items: [...event.data.snapshot.items, ...event.data.customItems]
    };
    let result = optimizeCombatJob(snapshot, event.data.constraints, event.data.job, {
      isCancelled: () => false,
      reportProgress: (update) => self.postMessage({
        type: 'progress',
        progress: update.progress * 0.8,
        phase: update.phase,
        message: update.message
      })
    });
    if (result.best && event.data.evaluationMode !== 'generic-hit') {
      const finalists = result.finalists?.length ? result.finalists : [result.best, ...result.alternatives];
      const proxyBestSetId = finalists[0]?.id ?? result.best.id;
      const reranked = rerankGearSetsByRotation(
        snapshot,
        finalists,
        event.data.job,
        event.data.evaluationMode,
        event.data.rotationPotion,
        proxyBestSetId,
        {
          isCancelled: () => false,
          reportProgress: (progress, candidateIndex, candidateCount) => self.postMessage({
            type: 'progress',
            progress: 0.8 + progress * 0.2,
            phase: 'rotation-rerank',
            message: `Simulating finalist ${Math.min(candidateIndex + 1, candidateCount)} of ${candidateCount}.`
          })
        }
      );
      const proxyWinner = finalists.find((set) => set.id === reranked.proxyBestSetId);
      const rotationWinner = reranked.best;
      const rankingExplanation = reranked.winnerChanged
        ? `The rotation evaluator changed the winner from ${proxyWinner?.metrics.gcd.toFixed(2) ?? 'unknown'}s GCD to ${rotationWinner.metrics.gcd.toFixed(2)}s GCD. It scores action count, cooldown drift, gauges, DoTs, auto-attacks and pets rather than treating every set as one generic hit.`
        : `The fast generic-hit proxy winner remained first. Rotation scoring still checked action count, cooldown drift, gauges, DoTs, auto-attacks and pets across the shortlist.`;
      result = {
        ...result,
        best: reranked.best,
        alternatives: reranked.alternatives,
        rotationRerank: {
          mode: event.data.evaluationMode,
          candidateCount: reranked.evaluatedCandidates,
          durationMs: reranked.durationMs,
          proxyBestSetId: reranked.proxyBestSetId,
          winnerChanged: reranked.winnerChanged,
          timelineCacheHits: reranked.timelineCacheHits
        },
        explanation: [
          ...result.explanation,
          `Reranked ${reranked.evaluatedCandidates} speed-diverse finalists by ${reranked.best.rotationEvaluation?.label.toLowerCase()} in ${reranked.durationMs.toFixed(0)} ms.`,
          `${rankingExplanation} Reused ${reranked.timelineCacheHits} identical timing timeline${reranked.timelineCacheHits === 1 ? '' : 's'} for damage-only stat changes.`
        ]
      };
    }
    const { finalists: _finalists, ...transportResult } = result;
    self.postMessage({ type: 'result', result: transportResult });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'The optimiser failed unexpectedly.'
    });
  }
};
