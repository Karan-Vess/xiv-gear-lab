import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import type { OptimizerConstraints } from '@xiv-gear-lab/domain';
import { OptimizerRules } from './OptimizerRules';

const constraints: OptimizerConstraints = {
  minResource: 440,
  minGcd: 2.5,
  maxGcd: 2.5,
  allowedSources: ['savage', 'tomestone', 'tomestone-upgrade'],
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 1_800
};

describe('optimizer rule grouping', () => {
  it('separates materia grade restrictions from food and explains the empty selection', () => {
    const selectedSet = gearSnapshot.curatedSets.find((set) => set.job === 'WHM')!;
    const html = renderToStaticMarkup(
      <OptimizerRules
        constraints={constraints}
        onChange={() => undefined}
        job="WHM"
        snapshot={gearSnapshot}
        customItems={[]}
        selectedSet={selectedSet}
        expansionId="dt"
        accessLevel={100}
      />
    );

    expect(html).toContain('<legend>Food</legend>');
    expect(html).toContain('<legend>Materia</legend>');
    expect(html).toContain('<legend>Custom equipment</legend>');
    expect(html).toContain('If no grades are selected, the optimiser leaves all materia slots empty.');
    expect(html.indexOf('Allowed materia grades')).toBeGreaterThan(html.indexOf('<legend>Materia</legend>'));
  });
});
