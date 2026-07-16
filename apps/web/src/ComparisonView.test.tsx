import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { OptimizerConstraints } from '@xiv-gear-lab/domain';
import { ComparisonView } from './ComparisonView';
import { createInitialBuildWorkspaceState } from './workspace';

const constraints: OptimizerConstraints = {
  minResource: 440,
  minGcd: 2.41,
  maxGcd: 2.41,
  allowedSources: ['savage', 'tomestone', 'tomestone-upgrade'],
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 1_800
};

const createState = () => createInitialBuildWorkspaceState({
  expansion: 'dawntrail',
  level: 100,
  job: 'WHM',
  constraints,
  gcdTarget: '2.41',
  selectedSet: gearSnapshot.curatedSets.find((set) => set.job === 'WHM')!,
  message: 'Ready.'
});

describe('three-build comparison', () => {
  it('shows direct deltas for compatible builds and all required timing labels', () => {
    const state = createState();
    state.builds['build-2'].selectedSet.metrics.expectedAction100 += 10;
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('Directly comparable with Build 1');
    expect(html).toContain('Difference from Build 1');
    expect(html).toContain('Base GCD');
    expect(html).toContain('Effective GCD');
    expect(html).toContain('MP regeneration');
    expect(html).toContain('MP / 3s tick');
    expect(html).toContain('from Piety');
    expect(html).toContain('Tenacity outcome');
    expect(html).toContain('Critical Hit outcome');
    expect(html).toContain('Direct Hit outcome');
    expect(html).toContain('Determination damage');
  });

  it('keeps cross-job and cross-snapshot values visible but refuses a fake winner', () => {
    const state = createState();
    state.builds['build-2'].job = 'MNK';
    state.builds['build-2'].selectedSet = structuredClone(gearSnapshot.curatedSets.find((set) => set.job === 'MNK')!);
    state.builds['build-3'].selectedSet.calculationContext = {
      ...state.builds['build-3'].selectedSet.calculationContext!,
      snapshotId: 'different-snapshot'
    };
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('Different jobs: proxy values are not directly comparable.');
    expect(html).toContain('Different data snapshots.');
    expect(html).toContain('Not directly comparable');
    expect(html).toContain('MNK');
  });

  it('shows Tenacity effects for tank comparisons', () => {
    const state = createState();
    const tankSet = gearSnapshot.curatedSets.find((set) => set.job === 'PLD')!;
    for (const build of Object.values(state.builds)) {
      build.job = 'PLD';
      build.selectedSet = structuredClone(tankSet);
    }
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('damage/outgoing healing');
    expect(html).toContain('damage reduction');
  });

  it('warns for different rulesets, evaluator versions, schemas and unknown calculation context', () => {
    const state = createState();
    state.builds['build-2'].selectedSet.calculationContext = {
      ...state.builds['build-2'].selectedSet.calculationContext!,
      rulesetId: 'different-ruleset',
      evaluatorProfileId: 'different-evaluator',
      evaluatorVersion: 'different-version',
      calculationSchema: 'different-schema'
    };
    state.builds['build-3'].selectedSet.calculationContext = undefined;
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('Different calculation rulesets.');
    expect(html).toContain('Different evaluator profiles or versions.');
    expect(html).toContain('Different calculation schemas.');
    expect(html).toContain('At least one result has unknown calculation-version context.');
  });

  it('supports another baseline and a seeded build without an optimiser run', () => {
    const state = createState();
    state.baselineBuildId = 'build-2';
    state.builds['build-3'].result = undefined;
    state.builds['build-3'].constraints.allowedSources = ['tomestone'];
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('Difference from Build 2');
    expect(html).toContain('Directly comparable with Build 2');
    expect(html).toContain('No equipment, meld or food differences.');
    expect(html).toContain('Constraints: tomestone');
  });

  it('makes equipment, meld, food and constraint differences inspectable', () => {
    const state = createState();
    const alternatives = gearSnapshot.curatedSets.filter((set) => set.job === 'WHM');
    state.builds['build-2'].selectedSet = structuredClone((alternatives[1] ?? alternatives[0])!);
    const otherFood = gearSnapshot.foods.find((food) => food.id !== state.builds['build-1'].selectedSet.foodId);
    state.builds['build-2'].selectedSet.foodId = otherFood?.id;
    state.builds['build-2'].constraints.allowedSources = ['savage'];
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('Build 2 changes');
    expect(html).toContain('melds changed');
    expect(html).toContain('<strong>Food</strong>');
    expect(html).toContain('Constraints: savage');
  });

  it('shows Black Mage Ley Lines separately while identifying base GCD as the optimiser target', () => {
    const state = createState();
    const blmSet = gearSnapshot.curatedSets.find((set) => set.job === 'BLM')!;
    for (const build of Object.values(state.builds)) {
      build.job = 'BLM';
      build.selectedSet = structuredClone(blmSet);
      build.gcdTarget = '2.41';
    }
    const html = renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );

    expect(html).toContain('Ley Lines');
    expect(html).toContain('temporary');
    expect(html).toContain('Base GCD · optimiser target');
    expect(html).toContain('2.41s · Base GCD state');
  });

  it('refreshes cached comparison markup within the 100 ms p95 budget', () => {
    const state = createState();
    renderToStaticMarkup(
      <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
    );
    const durations = Array.from({ length: 50 }, () => {
      const started = performance.now();
      renderToStaticMarkup(
        <ComparisonView state={state} snapshot={gearSnapshot} customItems={[]} onBaselineChange={() => undefined} />
      );
      return performance.now() - started;
    }).sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];

    expect(p95).toBeLessThan(100);
  });
});
