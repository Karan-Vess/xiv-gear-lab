import { getCombatEvaluatorProfile } from '@xiv-gear-lab/calculations';
import { derivedCombatStats, percentage } from './derived-stats';
import { gearSetTimingDisplay } from './timing-display';
import {
  BUILD_IDS,
  type BuildId,
  type BuildWorkspace,
  type BuildWorkspaceState
} from './workspace';
import {
  gearSlotsForJob,
  type EquipmentItem,
  type GearSet,
  type GearSlot,
  type GearSnapshot
} from '@xiv-gear-lab/domain';

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const slotLabel: Record<GearSlot, string> = {
  weapon: 'Weapon',
  offHand: 'Off-hand',
  head: 'Head',
  body: 'Body',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  ears: 'Earrings',
  neck: 'Necklace',
  wrists: 'Bracelet',
  ringLeft: 'Left ring',
  ringRight: 'Right ring'
};

const itemFor = (
  id: number | string | undefined,
  snapshot: GearSnapshot,
  customItems: EquipmentItem[]
) => id === undefined
  ? undefined
  : [...snapshot.items, ...customItems].find((item) => String(item.id) === String(id));

const foodName = (set: GearSet, snapshot: GearSnapshot) =>
  snapshot.foods.find((food) => food.id === set.foodId)?.name ?? 'No food';

const timingFor = (set: GearSet, snapshot: GearSnapshot) => gearSetTimingDisplay(set, snapshot);

const contextsMatch = (left: GearSet, right: GearSet) => {
  const a = left.calculationContext;
  const b = right.calculationContext;
  return Boolean(
    a && b &&
    left.job === right.job &&
    a.snapshotId === b.snapshotId &&
    a.rulesetId === b.rulesetId &&
    a.evaluatorProfileId === b.evaluatorProfileId &&
    a.evaluatorVersion === b.evaluatorVersion &&
    a.calculationSchema === b.calculationSchema
  );
};

const compatibilityWarnings = (baseline: GearSet, candidate: GearSet): string[] => {
  const warnings: string[] = [];
  if (baseline.job !== candidate.job) warnings.push('Different jobs: proxy values are not directly comparable.');
  if (!baseline.calculationContext || !candidate.calculationContext) {
    warnings.push('At least one result has unknown calculation-version context.');
    return warnings;
  }
  if (baseline.calculationContext.snapshotId !== candidate.calculationContext.snapshotId) warnings.push('Different data snapshots.');
  if (baseline.calculationContext.rulesetId !== candidate.calculationContext.rulesetId) warnings.push('Different calculation rulesets.');
  if (
    baseline.calculationContext.evaluatorProfileId !== candidate.calculationContext.evaluatorProfileId ||
    baseline.calculationContext.evaluatorVersion !== candidate.calculationContext.evaluatorVersion
  ) warnings.push('Different evaluator profiles or versions.');
  if (baseline.calculationContext.calculationSchema !== candidate.calculationContext.calculationSchema) warnings.push('Different calculation schemas.');
  return warnings;
};

const materiaCount = (set: GearSet) => Object.values(set.items)
  .reduce((total, equipped) => total + (equipped?.materiaIds.length ?? 0), 0);

const sourceSummary = (build: BuildWorkspace) => build.constraints.allowedSources.length > 0
  ? build.constraints.allowedSources.join(', ')
  : 'No acquisition sources';

const acquisitionSummary = (
  set: GearSet,
  snapshot: GearSnapshot,
  customItems: EquipmentItem[]
) => {
  const items = Object.values(set.items)
    .map((entry) => itemFor(entry?.itemId, snapshot, customItems))
    .filter((item): item is EquipmentItem => Boolean(item));
  const unknown = items.filter((item) => item.sourceFamily === 'unknown' || !item.acquisitionNote).length;
  return unknown > 0 ? `${unknown} route${unknown === 1 ? '' : 's'} unknown` : 'Every item has an acquisition note';
};

interface MetricRow {
  label: string;
  value: (build: BuildWorkspace) => string;
}

export function ComparisonView({
  state,
  snapshot,
  customItems,
  onBaselineChange
}: {
  state: BuildWorkspaceState;
  snapshot: GearSnapshot;
  customItems: EquipmentItem[];
  onBaselineChange: (id: BuildId) => void;
}) {
  const builds = BUILD_IDS.map((id) => state.builds[id]);
  const baseline = state.builds[state.baselineBuildId];
  const baselineSet = baseline.selectedSet;
  const metricRows: MetricRow[] = [
    { label: 'Job', value: (build) => `${build.job} · ${snapshot.registry.jobs.find((job) => job.id === build.job)?.role ?? 'unknown role'}` },
    { label: 'Result', value: (build) => `${build.selectedSet.name} · ${build.selectedSet.origin}` },
    { label: 'Evaluation', value: (build) => build.selectedSet.evaluation?.objective ?? 'Calculation version unknown' },
    { label: 'Expected single 100-potency hit', value: (build) => formatNumber.format(build.selectedSet.metrics.expectedAction100) },
    {
      label: `Difference from ${baseline.name}`,
      value: (build) => {
        if (build.id === baseline.id) return 'Baseline';
        if (!contextsMatch(baselineSet, build.selectedSet)) return 'Not directly comparable';
        const delta = build.selectedSet.metrics.expectedAction100 - baselineSet.metrics.expectedAction100;
        const percent = baselineSet.metrics.expectedAction100 === 0 ? 0 : delta / baselineSet.metrics.expectedAction100 * 100;
        return `${delta >= 0 ? '+' : ''}${formatNumber.format(delta)} · ${percent >= 0 ? '+' : ''}${percent.toFixed(3)}%`;
      }
    },
    {
      label: 'Main stat',
      value: (build) => {
        const profile = getCombatEvaluatorProfile(build.job, snapshot.evaluatorProfiles);
        return `${profile.mainStatAbbreviation} ${formatNumber.format(build.selectedSet.metrics.stats[profile.mainStat])}`;
      }
    },
    {
      label: 'Resource',
      value: (build) => {
        const profile = getCombatEvaluatorProfile(build.job, snapshot.evaluatorProfiles);
        return profile.resourceStat
          ? `${profile.resourceStatAbbreviation} ${formatNumber.format(build.selectedSet.metrics.stats[profile.resourceStat])}`
          : 'No resource stat';
      }
    },
    {
      label: 'MP regeneration',
      value: (build) => getCombatEvaluatorProfile(build.job, snapshot.evaluatorProfiles).role === 'healer'
        ? 'Not modelled yet · compare Piety'
        : 'Not applicable'
    },
    { label: 'Critical Hit', value: (build) => formatNumber.format(build.selectedSet.metrics.stats.criticalHit) },
    { label: 'Critical Hit outcome', value: (build) => {
      const derived = derivedCombatStats(build.selectedSet.metrics.stats);
      return `${percentage(derived.criticalChance)} chance · ${percentage(derived.criticalDamage)} damage`;
    } },
    { label: 'Determination', value: (build) => formatNumber.format(build.selectedSet.metrics.stats.determination) },
    { label: 'Determination damage', value: (build) => `+${percentage(derivedCombatStats(build.selectedSet.metrics.stats).determinationIncrease)}` },
    { label: 'Direct Hit', value: (build) => formatNumber.format(build.selectedSet.metrics.stats.directHit) },
    { label: 'Direct Hit outcome', value: (build) => {
      const derived = derivedCombatStats(build.selectedSet.metrics.stats);
      return `${percentage(derived.directChance)} chance · ${percentage(derived.directDamage)} damage`;
    } },
    {
      label: 'Role speed',
      value: (build) => {
        const profile = getCombatEvaluatorProfile(build.job, snapshot.evaluatorProfiles);
        return `${profile.speedStatAbbreviation} ${formatNumber.format(build.selectedSet.metrics.stats[profile.speedStat])}`;
      }
    },
    { label: 'Base GCD', value: (build) => `${timingFor(build.selectedSet, snapshot).base.toFixed(2)}s` },
    {
      label: 'Effective GCD',
      value: (build) => {
        const timing = timingFor(build.selectedSet, snapshot);
        return `${timing.target.gcd.toFixed(2)}s · ${timing.target.name} · optimiser target`;
      }
    },
    {
      label: 'Other named GCD states',
      value: (build) => {
        const timing = timingFor(build.selectedSet, snapshot);
        const otherStates = timing.additionalStates.filter((state) => !state.isTarget);
        return otherStates.length > 0
          ? otherStates.map((state) => `${state.name} ${state.gcd.toFixed(2)}s · ${state.kind}`).join(' · ')
          : 'None outside the optimiser target';
      }
    },
    { label: 'Average item level', value: (build) => formatNumber.format(build.selectedSet.metrics.averageItemLevel) },
    { label: 'Weapon damage', value: (build) => formatNumber.format(build.selectedSet.metrics.weaponDamage) },
    { label: 'Food', value: (build) => foodName(build.selectedSet, snapshot) },
    { label: 'Materia', value: (build) => `${materiaCount(build.selectedSet)} melds · ${formatNumber.format(build.selectedSet.metrics.materiaWaste)} waste` },
    { label: 'Allowed sources', value: sourceSummary },
    { label: 'Target GCD', value: (build) => `${build.gcdTarget}s · ${timingFor(build.selectedSet, snapshot).target.name} state` },
    {
      label: 'Minimum resource',
      value: (build) => {
        const profile = getCombatEvaluatorProfile(build.job, snapshot.evaluatorProfiles);
        return profile.resourceStat ? `${formatNumber.format(build.constraints.minResource)} ${profile.resourceLabel}` : 'None';
      }
    },
    { label: 'Acquisition', value: (build) => acquisitionSummary(build.selectedSet, snapshot, customItems) },
    { label: 'Fixed costs', value: () => 'Not present in the current data model' }
  ];

  return (
    <section className="comparison-view" aria-labelledby="comparison-heading" data-comparison-view>
      <div className="comparison-heading-row">
        <div>
          <p className="eyebrow">Three independent workspaces</p>
          <h2 id="comparison-heading">Build comparison</h2>
          <p>Every value stays visible. Incompatible jobs, snapshots or evaluators are labelled instead of producing a fake winner.</p>
        </div>
        <label>Comparison baseline
          <select value={state.baselineBuildId} onChange={(event) => onBaselineChange(event.target.value as BuildId)}>
            {builds.map((build) => <option value={build.id} key={build.id}>{build.name}</option>)}
          </select>
        </label>
      </div>

      <div className="comparison-warnings" aria-label="Comparison compatibility">
        {builds.filter((build) => build.id !== baseline.id).map((build) => {
          const warnings = compatibilityWarnings(baselineSet, build.selectedSet);
          return (
            <div className={warnings.length > 0 ? 'warning' : 'compatible'} data-comparison-status={build.id} key={build.id}>
              <strong>{build.name}</strong>
              <span>{warnings.length > 0 ? warnings.join(' ') : `Directly comparable with ${baseline.name}.`}</span>
            </div>
          );
        })}
      </div>

      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr><th scope="col">Metric</th>{builds.map((build) => <th scope="col" key={build.id}>{build.name}</th>)}</tr>
          </thead>
          <tbody>
            {metricRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {builds.map((build) => <td key={build.id}>{row.value(build)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="comparison-differences">
        {builds.filter((build) => build.id !== baseline.id).map((build) => {
          const slots = [...new Set([...gearSlotsForJob(baseline.job), ...gearSlotsForJob(build.job)])];
          const differences = slots.flatMap((slot) => {
            const baseEquipped = baselineSet.items[slot];
            const comparedEquipped = build.selectedSet.items[slot];
            const sameItem = String(baseEquipped?.itemId) === String(comparedEquipped?.itemId);
            const sameMateria = JSON.stringify(baseEquipped?.materiaIds ?? []) === JSON.stringify(comparedEquipped?.materiaIds ?? []);
            if (sameItem && sameMateria) return [];
            return [{
              slot,
              baseline: itemFor(baseEquipped?.itemId, snapshot, customItems)?.name ?? 'Empty or missing',
              candidate: itemFor(comparedEquipped?.itemId, snapshot, customItems)?.name ?? 'Empty or missing',
              meldChanged: !sameMateria
            }];
          });
          const foodChanged = baselineSet.foodId !== build.selectedSet.foodId;
          return (
            <article key={build.id}>
              <p className="eyebrow">Compared with {baseline.name}</p>
              <h3>{build.name} changes</h3>
              {differences.length === 0 && !foodChanged
                ? <p>No equipment, meld or food differences.</p>
                : <ul>
                  {differences.map((difference) => (
                    <li key={difference.slot}>
                      <strong>{slotLabel[difference.slot]}</strong>: {difference.baseline} → {difference.candidate}{difference.meldChanged ? ' · melds changed' : ''}
                    </li>
                  ))}
                  {foodChanged && <li><strong>Food</strong>: {foodName(baselineSet, snapshot)} → {foodName(build.selectedSet, snapshot)}</li>}
                </ul>}
              <p className="constraint-summary">
                Constraints: {sourceSummary(build)} · {build.gcdTarget}s target
                {getCombatEvaluatorProfile(build.job, snapshot.evaluatorProfiles).resourceStat ? ` · minimum resource ${build.constraints.minResource}` : ''}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
