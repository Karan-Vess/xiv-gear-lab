import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import {
  evaluateGearSetByRotation,
  rerankGearSetsByRotation
} from '@xiv-gear-lab/simulator/rerank-gearsets';
import type {
  CombatJob,
  EquipmentItem,
  EvaluationMode,
  GearSet,
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

interface EvaluateEquippedWorkerRequest {
  type: 'evaluate-equipped';
  set: GearSet;
  customItems: EquipmentItem[];
  snapshot: GearSnapshot;
  rotationPotion: 'none' | 'included';
}

type WorkerRequest = OptimizeWorkerRequest | EvaluateEquippedWorkerRequest;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  self.postMessage({ type: 'started' });
  try {
    const snapshot = {
      ...event.data.snapshot,
      items: [...event.data.snapshot.items, ...event.data.customItems]
    };
    if (event.data.type === 'evaluate-equipped') {
      const request = event.data;
      const modes = ['opener-30', 'dummy-300'] as const;
      const results = Object.fromEntries(modes.map((mode, modeIndex) => {
        const summary = evaluateGearSetByRotation(
          snapshot,
          request.set,
          mode,
          request.rotationPotion,
          {
            isCancelled: () => false,
            reportProgress: (progress) => self.postMessage({
              type: 'progress',
              progress: (modeIndex + progress) / modes.length,
              phase: 'equipped-evaluation',
              message: mode === 'opener-30'
                ? 'Evaluating the equipped 30-second burst.'
                : 'Evaluating the equipped five-minute dummy rotation.'
            })
          }
        );
        return [mode, summary];
      }));
      self.postMessage({ type: 'equipped-evaluation-result', results });
      return;
    }

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
      const rotationWinner = {
        ...reranked.best,
        name: `Best ${reranked.best.rotationEvaluation?.label.toLowerCase() ?? 'rotation'} result found (${result.optimality?.searchMode ?? 'quick'})`
      };
      const rankingExplanation = reranked.winnerChanged
        ? `The rotation evaluator changed the winner from ${proxyWinner?.metrics.gcd.toFixed(2) ?? 'unknown'}s GCD to ${rotationWinner.metrics.gcd.toFixed(2)}s GCD. It scores action count, cooldown drift, gauges, DoTs, auto-attacks and pets rather than treating every set as one generic hit.`
        : `The fast generic-hit proxy winner remained first. Rotation scoring still checked action count, cooldown drift, gauges, DoTs, auto-attacks and pets across the shortlist.`;
      const stabilityExplanation = reranked.stability
        ? reranked.stability.winnerChanged
          ? `Duration-sensitive result: the ${reranked.stability.durationMs / 1000}-second audit preferred a ${reranked.stability.bestSetGcd.toFixed(2)}s finalist by ${reranked.stability.gapToBestPercent.toFixed(3)}%.`
          : `The ${reranked.stability.durationMs / 1000}-second audit retained the same winner.`
        : undefined;
      result = {
        ...result,
        best: rotationWinner,
        alternatives: reranked.alternatives,
        rotationRerank: {
          mode: event.data.evaluationMode,
          candidateCount: reranked.evaluatedCandidates,
          durationMs: reranked.durationMs,
          proxyBestSetId: reranked.proxyBestSetId,
          winnerChanged: reranked.winnerChanged,
          timelineCacheHits: reranked.timelineCacheHits,
          ...(reranked.stability ? {
            stability: {
              durationMs: reranked.stability.durationMs,
              bestSetId: reranked.stability.bestSetId,
              bestSetGcd: reranked.stability.bestSetGcd,
              winnerChanged: reranked.stability.winnerChanged,
              gapToBestPercent: reranked.stability.gapToBestPercent
            }
          } : {})
        },
        optimality: {
          status: 'not-proven',
          objective: event.data.evaluationMode,
          searchMode: result.optimality?.searchMode ?? 'quick',
          reason: `The simulator reranked ${reranked.evaluatedCandidates} retained finalists; unevaluated legal combinations may still exist.`
        },
        explanation: [
          ...result.explanation,
          `Reranked ${reranked.evaluatedCandidates} speed-diverse finalists by ${reranked.best.rotationEvaluation?.label.toLowerCase()} in ${reranked.durationMs.toFixed(0)} ms.`,
          `${rankingExplanation} Reused ${reranked.timelineCacheHits} identical timing timeline${reranked.timelineCacheHits === 1 ? '' : 's'} for damage-only stat changes.`,
          ...(stabilityExplanation ? [stabilityExplanation] : []),
          'This is the strongest simulated finalist found, not a mathematical proof that no unevaluated legal set can score higher.'
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
