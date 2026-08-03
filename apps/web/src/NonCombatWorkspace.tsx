import type {
  CrafterGearPool,
  CrafterPlanObjective,
  CrafterSourceFamily,
  CraftingStatKey
} from '@xiv-gear-lab/domain';
import type { NonCombatWorkspaceState } from './noncombat-workspace';

interface NonCombatWorkspaceProps {
  pool: CrafterGearPool;
  state: NonCombatWorkspaceState;
  onChange: (state: NonCombatWorkspaceState) => void;
}

const objectiveLabels: Record<CrafterPlanObjective, string> = {
  maximum: 'Maximum stats',
  balanced: 'Balanced',
  budget: 'Budget conscious',
  'minimum-overmeld': 'Minimum overmelds'
};

const statLabels: Record<CraftingStatKey, string> = {
  craftsmanship: 'Craftsmanship',
  control: 'Control',
  cp: 'CP'
};

export function NonCombatWorkspace({ pool, state, onChange }: NonCombatWorkspaceProps) {
  const updateCrafter = (update: Partial<NonCombatWorkspaceState['crafter']>) =>
    onChange({ ...state, crafter: { ...state.crafter, ...update } });
  const toggleSource = (source: CrafterSourceFamily, enabled: boolean) => updateCrafter({
    allowedSources: enabled
      ? [...new Set([...state.crafter.allowedSources, source])]
      : state.crafter.allowedSources.filter((entry) => entry !== source)
  });

  return (
    <section className="noncombat-workspace" data-noncombat-workspace>
      <div className="discipline-switch" role="tablist" aria-label="Crafting and gathering workspace">
        <button
          type="button"
          role="tab"
          aria-selected={state.discipline === 'crafting'}
          className={state.discipline === 'crafting' ? 'active' : ''}
          onClick={() => onChange({ ...state, discipline: 'crafting' })}
        >
          <strong>Crafting</strong><span>M14</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.discipline === 'gathering'}
          className={state.discipline === 'gathering' ? 'active' : ''}
          onClick={() => onChange({ ...state, discipline: 'gathering' })}
        >
          <strong>Gathering</strong><span>M15</span>
        </button>
      </div>

      {state.discipline === 'gathering' ? (
        <div className="noncombat-placeholder">
          <p className="eyebrow">Gathering workspace reserved</p>
          <h2>Gathering gets its own optimiser in M15.</h2>
          <p>The mode boundary is already here, so Gathering, Perception, GP, node validation and gatherer meld rules will not be squeezed into either the combat or crafting interface.</p>
          <span className="status-pill planned">Planned, not active</span>
        </div>
      ) : (
        <div className="noncombat-layout">
          <aside className="crafter-constraints" aria-label="Crafter plan constraints">
            <div className="panel-title">
              <div><p className="eyebrow">Crafter constraints</p><h2>Reusable gear and meld plan</h2></div>
              <span className="status-pill foundation">M14A</span>
            </div>

            <label>Crafting job
              <select value={state.crafter.job} onChange={(event) => updateCrafter({ job: event.target.value as NonCombatWorkspaceState['crafter']['job'] })}>
                {pool.jobs.map((job) => <option value={job.id} key={job.id}>{job.name} ({job.id})</option>)}
              </select>
            </label>

            <div className="threshold-grid">
              {(Object.keys(statLabels) as CraftingStatKey[]).map((stat) => (
                <label key={stat}>{`Minimum ${statLabels[stat]}`}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={state.crafter.minimumStats[stat]}
                    onChange={(event) => updateCrafter({
                      minimumStats: { ...state.crafter.minimumStats, [stat]: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0) }
                    })}
                  />
                </label>
              ))}
            </div>

            <fieldset>
              <legend>Eligible equipment</legend>
              <label className="check-row"><input type="checkbox" checked={state.crafter.allowedSources.includes('crafted')} onChange={(event) => toggleSource('crafted', event.target.checked)} /><span><strong>Newest crafted gear</strong><small>HQ only. Advanced melding can apply.</small></span></label>
              <label className="check-row"><input type="checkbox" checked={state.crafter.allowedSources.includes('scrip')} onChange={(event) => toggleSource('scrip', event.target.checked)} /><span><strong>Newest scrip gear</strong><small>May mix with crafted pieces.</small></span></label>
            </fieldset>

            <label>Plan objective
              <select value={state.crafter.objective} onChange={(event) => updateCrafter({ objective: event.target.value as CrafterPlanObjective })}>
                {(Object.keys(objectiveLabels) as CrafterPlanObjective[]).map((objective) => <option value={objective} key={objective}>{objectiveLabels[objective]}</option>)}
              </select>
            </label>

            <div className="consumable-grid">
              <label>Food assumption
                <select value={state.crafter.foodMode} onChange={(event) => updateCrafter({ foodMode: event.target.value as NonCombatWorkspaceState['crafter']['foodMode'] })}>
                  <option value="none">None</option><option value="automatic">Choose automatically</option><option value="locked">Locked item</option>
                </select>
              </label>
              <label>Medicine assumption
                <select value={state.crafter.medicineMode} onChange={(event) => updateCrafter({ medicineMode: event.target.value as NonCombatWorkspaceState['crafter']['medicineMode'] })}>
                  <option value="none">None</option><option value="automatic">Choose automatically</option><option value="locked">Locked item</option>
                </select>
              </label>
            </div>

            <label className="check-row"><input type="checkbox" checked={state.crafter.allowAdvancedMelding} onChange={(event) => updateCrafter({ allowAdvancedMelding: event.target.checked })} /><span><strong>Allow advanced melding</strong><small>Legality, caps, waste and overmeld difficulty remain hard constraints.</small></span></label>
          </aside>

          <div className="crafter-foundation">
            <section className="foundation-hero">
              <div><p className="eyebrow">M14A foundation</p><h2>The clean room is built. The machinery comes next.</h2></div>
              <span className="status-pill foundation">Contract ready</span>
              <p>These settings are independent from all three combat builds and are saved locally. M14B will populate the official current-tier pool and generate plans from this contract.</p>
            </section>
            <section className="pool-readiness" aria-label="Crafter data pool readiness">
              <div><span>Jobs</span><strong>{pool.jobs.length}</strong><small>All standard crafting classes</small></div>
              <div><span>Equipment</span><strong>{pool.items.length}</strong><small>Official import pending M14B</small></div>
              <div><span>Materia</span><strong>{pool.materia.length}</strong><small>Legality audit pending M14B</small></div>
              <div><span>Consumables</span><strong>{pool.food.length + pool.medicine.length}</strong><small>Food and medicine pending</small></div>
            </section>
            <section className="scope-card">
              <h3>What this optimiser will search</h3>
              <ul>
                <li>One reusable level-{pool.levelCap} plan, not one set per recipe.</li>
                <li>Newest eligible HQ crafted and scrip pieces, including legal mixed sets.</li>
                <li>Complete equipment plus meld plans against hard Craftsmanship, Control and CP thresholds.</li>
                <li>Maximum, balanced, budget and minimum-overmeld alternatives with explicit assumptions.</li>
              </ul>
            </section>
            <button className="primary crafter-run" type="button" disabled>Generate crafter plans in M14B</button>
          </div>
        </div>
      )}
    </section>
  );
}
