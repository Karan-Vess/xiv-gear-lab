import { useMemo, useState } from 'react';
import {
  gearSlotsForJob,
  resolveOptimizerConstraints,
  type CombatJob,
  type EquipmentItem,
  type GearSet,
  type GearSlot,
  type GearSnapshot,
  type OptimizerConstraints,
  type StatKey
} from '@xiv-gear-lab/domain';

const slotLabel: Record<GearSlot, string> = {
  weapon: 'Weapon', offHand: 'Off-hand', head: 'Head', body: 'Body', hands: 'Hands', legs: 'Legs', feet: 'Feet',
  ears: 'Earrings', neck: 'Necklace', wrists: 'Bracelet', ringLeft: 'Left ring', ringRight: 'Right ring'
};

const statLabel: Record<StatKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', intelligence: 'Intelligence', mind: 'Mind', vitality: 'Vitality',
  piety: 'Piety', tenacity: 'Tenacity', criticalHit: 'Critical Hit', determination: 'Determination',
  directHit: 'Direct Hit', skillSpeed: 'Skill Speed', spellSpeed: 'Spell Speed'
};

const itemMatchesSlot = (item: EquipmentItem, slot: GearSlot) =>
  item.slot === slot || (item.slot === 'ring' && (slot === 'ringLeft' || slot === 'ringRight'));

const materiaFitsIndex = (item: EquipmentItem, index: number, tier: number, explicit?: 'forbidden' | 'first-slot-only' | 'unrestricted') => {
  if (index < item.materiaSlots) return true;
  const limit = explicit ?? ([8, 10, 12].includes(tier) ? 'first-slot-only' : [7, 9, 11].includes(tier) ? 'unrestricted' : 'forbidden');
  return limit === 'unrestricted' || (limit === 'first-slot-only' && index === item.materiaSlots);
};

export function OptimizerRules({
  constraints,
  onChange,
  job,
  snapshot,
  customItems,
  selectedSet
}: {
  constraints: OptimizerConstraints;
  onChange: (next: OptimizerConstraints) => void;
  job: CombatJob;
  snapshot: GearSnapshot;
  customItems: EquipmentItem[];
  selectedSet: GearSet;
}) {
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const resolved = resolveOptimizerConstraints(constraints, snapshot.materia);
  const profile = snapshot.evaluatorProfiles.find((entry) => entry.job === job)!;
  const slots = gearSlotsForJob(job);
  const allItems = useMemo(() => [...snapshot.items, ...customItems], [snapshot, customItems]);
  const officialItems = snapshot.items.filter((item) => item.origin === 'official' && item.jobs.includes(job));
  const applicableMateria = snapshot.materia.filter((entry) => profile.meldStats.includes(entry.stat));
  const materiaStats = [...new Set(applicableMateria.map((entry) => entry.stat))];
  const materiaTiers = [...new Set(applicableMateria.map((entry) => entry.tier))].sort((a, b) => b - a);
  const patch = (changes: Partial<OptimizerConstraints>) => onChange({ ...constraints, ...changes });

  const setItemRule = (item: EquipmentItem, rule: 'any' | 'required' | 'excluded') => {
    const id = String(item.id);
    patch({
      requiredItemIds: rule === 'required'
        ? [...constraints.requiredItemIds.filter((entry) => String(entry) !== id), item.id]
        : constraints.requiredItemIds.filter((entry) => String(entry) !== id),
      excludedItemIds: rule === 'excluded'
        ? [...constraints.excludedItemIds.filter((entry) => String(entry) !== id), item.id]
        : constraints.excludedItemIds.filter((entry) => String(entry) !== id)
    });
  };

  const lockItem = (slot: GearSlot, rawId: string) => {
    const next = { ...resolved.lockedItemIdsBySlot };
    const melds = { ...resolved.lockedMateriaBySlot };
    if (!rawId) {
      delete next[slot];
    } else {
      const item = allItems.find((entry) => String(entry.id) === rawId);
      if (item) {
        next[slot] = item.id;
        melds[slot] = [];
      }
    }
    patch({ lockedItemIdsBySlot: next, lockedMateriaBySlot: melds });
  };

  const itemForMeldLock = (slot: GearSlot) => {
    const itemId = resolved.lockedItemIdsBySlot[slot] ?? selectedSet.items[slot]?.itemId;
    return allItems.find((item) => String(item.id) === String(itemId));
  };

  const updateLockedMateria = (slot: GearSlot, index: number, rawId: string) => {
    const next = { ...resolved.lockedMateriaBySlot };
    const current = [...(next[slot] ?? [])];
    if (!rawId) current.splice(index);
    else current[index] = Number(rawId);
    next[slot] = current;
    patch({ lockedMateriaBySlot: next });
  };

  const equipmentRuleCount = constraints.requiredItemIds.length + constraints.excludedItemIds.length + Object.keys(resolved.lockedItemIdsBySlot).length;
  const meldLockCount = Object.values(resolved.lockedMateriaBySlot).reduce((total, ids) => total + (ids?.length ?? 0), 0);

  return (
    <>
      <fieldset className="optimizer-rule-group">
        <legend>Food</legend>
        <label>Food rule
          <select data-food-mode value={resolved.foodMode} onChange={(event) => patch({ foodMode: event.target.value as 'allowed' | 'none' | 'locked' })}>
            <option value="allowed">Allow optimiser to choose food</option>
            <option value="none">No food</option>
            <option value="locked">Lock one food</option>
          </select>
        </label>
        {resolved.foodMode === 'locked' && (
          <label>Locked food
            <select value={resolved.lockedFoodId ?? ''} onChange={(event) => patch({ lockedFoodId: Number(event.target.value) })}>
              <option value="">Choose food…</option>
              {snapshot.foods.map((food) => <option value={food.id} key={food.id}>{food.name}</option>)}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className="optimizer-rule-group">
        <legend>Materia</legend>
        <p className="optimizer-rule-note">Allowed materia families</p>
        <div className="rule-chip-grid" aria-label="Allowed materia families">
          {materiaStats.map((stat) => (
            <label className="rule-chip" key={stat}>
              <input type="checkbox" checked={resolved.allowedMateriaStats.includes(stat)} onChange={(event) => patch({
                allowedMateriaStats: event.target.checked
                  ? [...new Set([...resolved.allowedMateriaStats, stat])]
                  : resolved.allowedMateriaStats.filter((entry) => entry !== stat)
              })} />
              <span>{statLabel[stat]}</span>
            </label>
          ))}
        </div>
        <p className="optimizer-rule-note">Allowed materia grades. If no grades are selected, the optimiser leaves all materia slots empty.</p>
        <div className="rule-chip-grid" aria-label="Allowed materia grades">
          {materiaTiers.map((tier) => (
            <label className="rule-chip" key={tier}>
              <input type="checkbox" checked={resolved.allowedMateriaTiers.includes(tier)} onChange={(event) => patch({
                allowedMateriaTiers: event.target.checked
                  ? [...new Set([...resolved.allowedMateriaTiers, tier])]
                  : resolved.allowedMateriaTiers.filter((entry) => entry !== tier)
              })} />
              <span>Grade {tier}</span>
            </label>
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" data-allow-overmelds checked={resolved.allowOvermelds} onChange={(event) => patch({ allowOvermelds: event.target.checked })} />
          <span><strong>Allow advanced melding</strong><small>Only items explicitly marked as overmeldable can gain extra slots, up to five total.</small></span>
        </label>
      </fieldset>

      <fieldset className="optimizer-rule-group">
        <legend>Custom equipment</legend>
        <label className="check-row">
          <input type="checkbox" checked={resolved.allowCustomItems} onChange={(event) => patch({ allowCustomItems: event.target.checked })} />
          <span><strong>Allow custom items</strong><small>Equipped hypothetical items are kept only when this is enabled.</small></span>
        </label>
        <label className={`check-row experimental-rule ${resolved.allowExperimentalAccess ? 'enabled' : ''}`}>
          <input type="checkbox" data-experimental-access checked={resolved.allowExperimentalAccess} onChange={(event) => patch({ allowExperimentalAccess: event.target.checked })} />
          <span><strong>Experimental inaccessible/future override</strong><small>Allows custom equipment beyond the selected expansion or level. Every dependent result is marked hypothetical.</small></span>
        </label>
      </fieldset>

      <button type="button" className="ghost wide rules-button" data-optimizer-rules-open onClick={() => setEquipmentOpen(true)}>
        Equipment constraints <span>{equipmentRuleCount + meldLockCount > 0 ? `${equipmentRuleCount + meldLockCount} active` : 'No rules'}</span>
      </button>

      {equipmentOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEquipmentOpen(false); }}>
          <div className="modal equipment-rules-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-rules-title" data-equipment-rules>
            <div><p className="eyebrow">Official equipment and meld constraints</p><h2 id="equipment-rules-title">Equipment rules</h2><p>Required items may occupy any compatible slot. A slot lock fixes the exact position. Exclusions always win as an actionable conflict instead of being silently ignored.</p></div>
            {slots.map((slot) => {
              const candidates = officialItems.filter((item) => itemMatchesSlot(item, slot));
              const meldItem = itemForMeldLock(slot);
              const lockedMelds = resolved.lockedMateriaBySlot[slot] ?? [];
              const capacity = meldItem ? meldItem.materiaSlots + (resolved.allowOvermelds && meldItem.advancedMelding ? Math.max(0, 5 - meldItem.materiaSlots) : 0) : 0;
              return (
                <section className="equipment-rule-slot" key={slot}>
                  <div className="equipment-rule-heading"><strong>{slotLabel[slot]}</strong><label>Lock slot
                    <select data-equipment-lock={slot} value={resolved.lockedItemIdsBySlot[slot] ?? ''} onChange={(event) => lockItem(slot, event.target.value)}>
                      <option value="">Optimiser chooses</option>
                      {candidates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                    </select>
                  </label></div>
                  <div className="equipment-item-rules">
                    {candidates.map((item) => {
                      const required = constraints.requiredItemIds.some((id) => String(id) === String(item.id));
                      const excluded = constraints.excludedItemIds.some((id) => String(id) === String(item.id));
                      return <label key={item.id}><span>{item.name}<small>i{item.itemLevel} · {item.sourceFamily}</small></span><select data-item-rule={item.id} value={required ? 'required' : excluded ? 'excluded' : 'any'} onChange={(event) => setItemRule(item, event.target.value as 'any' | 'required' | 'excluded')}><option value="any">Available</option><option value="required">Required</option><option value="excluded">Excluded</option></select></label>;
                    })}
                  </div>
                  {meldItem && capacity > 0 && (
                    <div className="locked-meld-row"><span><strong>Locked meld prefix</strong><small>{meldItem.name} · {meldItem.materiaSlots} guaranteed{meldItem.advancedMelding ? ' · advanced-capable' : ''}</small></span><div>
                      {Array.from({ length: Math.min(capacity, lockedMelds.length + 1) }, (_, index) => (
                        <select aria-label={`${slotLabel[slot]} locked materia ${index + 1}`} value={lockedMelds[index] ?? ''} onChange={(event) => updateLockedMateria(slot, index, event.target.value)} key={index}>
                          <option value="">{index === 0 ? 'No locked melds' : 'Optimise from here'}</option>
                          {applicableMateria.filter((materia) => materiaFitsIndex(meldItem, index, materia.tier, materia.advancedMeldingLimit)).map((materia) => <option value={materia.id} key={materia.id}>{materia.name} (+{materia.value})</option>)}
                        </select>
                      ))}
                    </div></div>
                  )}
                </section>
              );
            })}
            <div className="modal-actions"><button type="button" className="primary" onClick={() => setEquipmentOpen(false)}>Done</button></div>
          </div>
        </div>
      )}
    </>
  );
}
