import { useEffect, useMemo, useRef, useState } from 'react';
import { getCombatEvaluatorProfile, recalculateGearSet, zeroCaps } from '@xiv-gear-lab/calculations';
import {
  downloadSnapshotCandidate,
  gearSnapshot as bundledGearSnapshot,
  type ActiveSnapshot
} from '@xiv-gear-lab/data';
import {
  effectiveLevel,
  emptyStats,
  getEvaluatorCapability,
  gearSlotsForJob,
  jobAvailableAtAccess,
  type CombatJob,
  type EquipmentItem,
  type EquippedItem,
  type ExpansionId,
  type GearSet,
  type GearSlot,
  type Materia,
  type OptimizerConstraints,
  type SourceFamily
} from '@xiv-gear-lab/domain';
import { exportToXivGearJson, XivGearExportError } from '@xiv-gear-lab/export';
import type { OptimizerResult } from '@xiv-gear-lab/optimizer';
import {
  deleteCustomItem as deleteStoredCustomItem,
  deleteSavedSet,
  loadCustomItems,
  loadSavedSets,
  pinnedSnapshotIdsForSavedSets,
  saveCustomItem as saveStoredCustomItem,
  saveSet
} from './storage';
import { APP_RUNTIME_COMPATIBILITY, type DataRuntimeBootstrap } from './data-runtime';

let gearSnapshot = bundledGearSnapshot;
let EXPANSIONS = gearSnapshot.registry.expansions;
let SUPPORTED_JOBS = gearSnapshot.registry.jobs;
const evaluatorProfileFor = (job: CombatJob) =>
  getCombatEvaluatorProfile(job, gearSnapshot.evaluatorProfiles);

type View = 'optimize' | 'community' | 'saved' | 'about';
type RunState = 'idle' | 'running' | 'done' | 'error';
type CustomFallback = { slot: GearSlot; equipped?: EquippedItem };
type CustomDraft = {
  slot: GearSlot;
  name: string;
  itemLevel: string;
  mainStat: string;
  resourceStat: string;
  criticalHit: string;
  determination: string;
  directHit: string;
  speedStat: string;
  weaponDamage: string;
};
type CustomLimitField = Exclude<keyof CustomDraft, 'slot' | 'name'>;
type CustomItemLimit = { recorded: number; maximum: number };
type CustomItemLimits = Record<CustomLimitField, CustomItemLimit>;
type PendingDeletion =
  | { kind: 'saved-set'; set: GearSet }
  | { kind: 'custom-item'; item: EquipmentItem; usedBySavedSet: boolean };

const createCustomDraft = (job: CombatJob, item?: EquipmentItem, slot: GearSlot = 'head'): CustomDraft => {
  const profile = evaluatorProfileFor(job);
  return {
    slot,
    name: item?.name ?? `Hypothetical ${profile.role} item`,
    itemLevel: String(item?.itemLevel ?? 790),
    mainStat: String(item?.stats[profile.mainStat] ?? 500),
    resourceStat: String(profile.resourceStat ? item?.stats[profile.resourceStat] ?? 0 : 0),
    criticalHit: String(item?.stats.criticalHit ?? 300),
    determination: String(item?.stats.determination ?? 200),
    directHit: String(item?.stats.directHit ?? 0),
    speedStat: String(item?.stats[profile.speedStat] ?? 0),
    weaponDamage: String(item?.weaponDamage ?? 158)
  };
};

const itemMatchesGearSlot = (item: EquipmentItem, slot: GearSlot) =>
  item.slot === slot || (item.slot === 'ring' && (slot === 'ringLeft' || slot === 'ringRight'));

const getCustomItemLimits = (job: CombatJob, slot: GearSlot): CustomItemLimits => {
  const profile = evaluatorProfileFor(job);
  const jobItems = gearSnapshot.items.filter((item) => item.origin === 'official' && item.jobs.includes(job));
  const slotItems = jobItems.filter((item) => itemMatchesGearSlot(item, slot));
  const limitFor = (read: (item: EquipmentItem) => number, minimum = 0) => {
    const slotMaximum = Math.max(minimum, ...slotItems.map(read));
    const fallbackMaximum = Math.max(minimum, ...jobItems.map(read));
    const recorded = slotMaximum > minimum ? slotMaximum : fallbackMaximum;
    return { recorded, maximum: Math.ceil(recorded * 1.2) };
  };
  return {
    itemLevel: limitFor((item) => item.itemLevel, 1),
    mainStat: limitFor((item) => item.stats[profile.mainStat]),
    resourceStat: profile.resourceStat
      ? limitFor((item) => item.stats[profile.resourceStat!])
      : { recorded: 0, maximum: 0 },
    criticalHit: limitFor((item) => item.stats.criticalHit),
    determination: limitFor((item) => item.stats.determination),
    directHit: limitFor((item) => item.stats.directHit),
    speedStat: limitFor((item) => item.stats[profile.speedStat]),
    weaponDamage: limitFor((item) => item.weaponDamage)
  };
};

const SOURCE_GROUPS: Array<{ id: string; sources: SourceFamily[]; label: string; detail: string }> = [
  { id: 'savage', sources: ['savage'], label: 'Savage raid', detail: 'Grand Champion gear' },
  {
    id: 'tomestone',
    sources: ['tomestone', 'tomestone-upgrade'],
    label: 'Tomestone gear',
    detail: 'Bygone Brass and its augmented upgrades'
  }
];

const UNAVAILABLE_SOURCE_OPTIONS = [
  { id: 'alliance', label: 'Alliance raids (24-player)', detail: 'Not included in the current verified pool' },
  { id: 'normal', label: 'Normal raids', detail: 'Not included in the current verified pool' },
  { id: 'trials', label: 'Trials', detail: 'Not included in the current verified pool' },
  { id: 'dungeons', label: 'Dungeons', detail: 'Not included in the current verified pool' },
  { id: 'crafted', label: 'Crafted gear', detail: 'Not included in the current verified pool' }
];

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

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const sourceLabel = (source?: SourceFamily) => {
  if (source === 'savage') return 'Savage';
  if (source === 'tomestone-upgrade') return 'Tome upgrade';
  if (source === 'tomestone') return 'Tomestone';
  if (source === 'custom') return 'Custom';
  return 'Unknown';
};

const curatedProviderLabel = (set: GearSet) => {
  const providers = new Set(
    set.provenance.filter((entry) => entry.kind === 'community-curated').map((entry) => entry.provider)
  );
  if (providers.has('Etro') && providers.has('The Balance')) return 'Etro + The Balance';
  if (providers.has('The Balance')) return 'The Balance · XivGear';
  return [...providers].join(' + ') || 'Community reference';
};

const curatedUpdatedDate = (set: GearSet) => {
  const latest = Math.max(...set.provenance
    .filter((entry) => entry.kind === 'community-curated')
    .map((entry) => Date.parse(entry.sourceVersion ?? entry.verifiedAt ?? ''))
    .filter(Number.isFinite));
  return Number.isFinite(latest) ? new Date(latest).toLocaleDateString() : 'Source date unavailable';
};

const defaultConstraints: OptimizerConstraints = {
  minResource: 440,
  minGcd: 2.41,
  maxGcd: 2.41,
  allowedSources: ['savage', 'tomestone-upgrade', 'tomestone'],
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 1_800
};

const findItem = (id: number | string, customItems: EquipmentItem[]) =>
  [...gearSnapshot.items, ...customItems].find((item) => String(item.id) === String(id));

const MATERIA_FAMILY_KEYS: Array<[RegExp, string]> = [
  [/^Heavens' Eye\b/, 'HE'],
  [/^Savage Aim\b/, 'SA'],
  [/^Savage Might\b/, 'SM'],
  [/^Quicktongue\b/, 'QT'],
  [/^Quickarm\b/, 'QA'],
  [/^Battledance\b/, 'BD'],
  [/^Piety\b/, 'PI']
];

const materiaShortKey = (materia?: Materia) => {
  if (!materia) return '?';
  const family = MATERIA_FAMILY_KEYS.find(([pattern]) => pattern.test(materia.name))?.[1]
    ?? materia.name.replace(/\s+Materia.*$/i, '').split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  return `${family}${materia.tier}`;
};

const materiaShortList = (ids: number[]) => ids
  .map((id) => materiaShortKey(gearSnapshot.materia.find((entry) => entry.id === id)))
  .join(' · ');

function SafeIcon({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed
    ? <img src={src} alt="" loading="eager" onError={() => setFailed(true)} />
    : <span className="icon-fallback" aria-hidden="true">?</span>;
}

function DataStatus() {
  const online = navigator.onLine;
  return (
    <div className="data-status" aria-label="Data status">
      <span className={`status-dot ${online ? 'is-online' : 'is-cached'}`} aria-hidden="true" />
      <span>
        {online ? 'Online' : 'Cached'} · game {gearSnapshot.manifest.gamePatch} · tier {gearSnapshot.manifest.gearTierPatch}
      </span>
    </div>
  );
}

function RuntimeDataStatus({
  active,
  updateState,
  message,
  canCheck,
  onCheck,
  onRollback
}: {
  active: ActiveSnapshot;
  updateState: 'idle' | 'checking' | 'error';
  message?: string;
  canCheck: boolean;
  onCheck: () => void;
  onRollback: () => void;
}) {
  const downloaded = active.source === 'downloaded';
  const providerIssues = active.providers?.filter((provider) => provider.status !== 'current') ?? [];
  return (
    <div className="data-status-wrap" data-runtime-source={active.source} data-snapshot-id={active.snapshot.manifest.id}>
      <div className="data-status" aria-label="Data status">
        <span className={`status-dot ${downloaded ? 'is-online' : 'is-cached'}`} aria-hidden="true" />
        <span>
          {downloaded ? 'Downloaded cache' : 'Bundled fallback'} · game {gearSnapshot.manifest.gamePatch} · tier {gearSnapshot.manifest.gearTierPatch}
        </span>
      </div>
      {providerIssues.length > 0 && <small>{providerIssues.length} provider source{providerIssues.length === 1 ? '' : 's'} stale, partial, or unavailable.</small>}
      {message && <small className={updateState === 'error' ? 'data-error' : ''}>{message}</small>}
      <div className="data-actions">
        <button data-data-update-check onClick={onCheck} disabled={!canCheck || updateState === 'checking'}>{updateState === 'checking' ? 'Checking…' : 'Check data'}</button>
        {active.previousSnapshotId && <button onClick={onRollback} disabled={updateState === 'checking'}>Rollback</button>}
      </div>
    </div>
  );
}

function StatStrip({ set }: { set: GearSet }) {
  const stats = set.metrics.stats;
  const profile = evaluatorProfileFor(set.job);
  const secondary: [string, number] = profile.resourceStat
    ? [profile.resourceStatAbbreviation!, stats[profile.resourceStat]]
    : ['DHT', stats.directHit];
  const values = [
    [profile.mainStatAbbreviation, stats[profile.mainStat]],
    secondary,
    ['CRT', stats.criticalHit],
    ['DET', stats.determination],
    [profile.speedStatAbbreviation, stats[profile.speedStat]],
    ['GCD', `${set.metrics.gcd.toFixed(2)}s`]
  ];
  return (
    <div className="stat-strip">
      {values.map(([label, value]) => (
        <div className="stat-cell" key={label}>
          <span>{label}</span>
          <strong>{typeof value === 'number' ? formatNumber.format(value) : value}</strong>
        </div>
      ))}
    </div>
  );
}

function SetDetails({
  set,
  previousSet,
  customItems,
  onEditCustom,
  onUnequipCustom
}: {
  set: GearSet;
  previousSet?: GearSet;
  customItems: EquipmentItem[];
  onEditCustom: (item: EquipmentItem) => void;
  onUnequipCustom: (item: EquipmentItem) => void;
}) {
  const food = gearSnapshot.foods.find((entry) => entry.id === set.foodId);
  const previousFood = gearSnapshot.foods.find((entry) => entry.id === previousSet?.foodId);
  const foodChanged = Boolean(previousSet && previousSet.foodId !== set.foodId);
  const communitySources = [...new Map(
    set.provenance
      .filter((entry) => entry.kind === 'community-curated' && entry.sourceUrl)
      .map((entry) => [`${entry.provider}:${entry.sourceUrl}`, entry])
  ).values()];
  const gearSlots = gearSlotsForJob(set.job);
  const gearChanged = Boolean(previousSet && gearSlots.some((slot) =>
    String(previousSet.items[slot]?.itemId) !== String(set.items[slot]?.itemId) ||
    JSON.stringify(previousSet.items[slot]?.materiaIds ?? []) !== JSON.stringify(set.items[slot]?.materiaIds ?? [])
  ));
  return (
    <section className="set-detail" aria-labelledby="set-heading">
      <div className="set-heading-row">
        <div>
          <p className="eyebrow">{set.origin} set · patch {set.patch}</p>
          <h2 id="set-heading">{set.name}</h2>
          {set.evaluation && (
            <span className="evaluation-note" title={`${set.evaluation.objective} ${set.evaluation.limitation}`}>
              {set.evaluation.profileId} · reference-validated proxy
            </span>
          )}
          {set.legacyCalculationContext && (
            <span className="change-legend" title={set.legacyCalculationContext.message}>
              Legacy result · calculation version unknown. Recalculate before treating it as current.
            </span>
          )}
          {previousSet && (
            <span className="change-legend">
              {gearChanged || foodChanged ? 'Highlighted rows changed since the previous optimisation.' : 'No item, meld, or food changes since the previous optimisation.'}
            </span>
          )}
        </div>
        <div className="score-block">
          <span>Expected single 100-potency hit</span>
          <strong>{formatNumber.format(set.metrics.expectedAction100)}</strong>
          <small>Throughput proxy, not encounter DPS</small>
        </div>
      </div>

      <StatStrip set={set} />

      <div className="equipment-list">
        {gearSlots.map((slot) => {
          const equipped = set.items[slot];
          const item = equipped ? findItem(equipped.itemId, customItems) : undefined;
          const previousEquipped = previousSet?.items[slot];
          const previousItem = previousEquipped ? findItem(previousEquipped.itemId, customItems) : undefined;
          const itemChanged = Boolean(previousSet && String(previousEquipped?.itemId) !== String(equipped?.itemId));
          const meldsChanged = Boolean(previousSet && JSON.stringify(previousEquipped?.materiaIds ?? []) !== JSON.stringify(equipped?.materiaIds ?? []));
          return (
            <div className={`equipment-row ${itemChanged || meldsChanged ? 'changed' : ''}`} key={slot}>
              <span className="slot-name">{slotLabel[slot]}</span>
              <div className="item-icon-wrap" aria-hidden="true">
                <SafeIcon src={item?.iconUrl} />
              </div>
              <div className="item-copy">
                <div className="item-name-line">
                  <strong>{item?.name ?? 'Missing item'}</strong>
                  {itemChanged && <span className="previous-item">was {previousItem?.name ?? 'empty'}</span>}
                </div>
                <span>
                  {item ? `i${item.itemLevel} · ${sourceLabel(item.sourceFamily)}` : 'Unresolved'}
                </span>
              </div>
              <div className="equipment-end">
                {item?.origin === 'custom' && (
                  <div className="equipment-item-actions" aria-label={`Actions for ${item.name}`}>
                    <button type="button" className="ghost compact" data-equipped-custom-edit={item.id} onClick={() => onEditCustom(item)}>Edit</button>
                    <button type="button" className="ghost compact" data-equipped-custom-unequip={item.id} onClick={() => onUnequipCustom(item)}>Unequip</button>
                  </div>
                )}
                <div className="meld-stack">
                  <div className="melds" aria-label={`${equipped?.materiaIds.length ?? 0} materia`}>
                    {(equipped?.materiaIds ?? []).map((id, index) => {
                      const materia = gearSnapshot.materia.find((entry) => entry.id === id);
                      return (
                        <span className="materia-chip" key={`${id}-${index}`} title={materia?.name}>
                          <span className="meld-icon"><SafeIcon src={materia?.iconUrl} /></span>
                          <small aria-hidden="true">{materiaShortKey(materia)}</small>
                          <span className="sr-only">{materia?.name ?? 'Unknown materia'}</span>
                        </span>
                      );
                    })}
                  </div>
                  {meldsChanged && <small className="previous-melds">was {materiaShortList(previousEquipped?.materiaIds ?? []) || 'none'}</small>}
                </div>
              </div>
            </div>
          );
        })}
        <div className={`equipment-row food-row ${foodChanged ? 'changed' : ''}`}>
          <span className="slot-name">Food</span>
          <div className="item-icon-wrap" aria-hidden="true">
            <SafeIcon src={food?.iconUrl} />
          </div>
          <div className="item-copy">
            <div className="item-name-line">
              <strong>{food?.name ?? 'No food'}</strong>
              {foodChanged && <span className="previous-item">was {previousFood?.name ?? 'no food'}</span>}
            </div>
            <span>{food?.bonuses.map((bonus) => `${bonus.stat} +10% (max ${bonus.cap})`).join(' · ')}</span>
          </div>
        </div>
      </div>

      <div className="assumptions">
        {communitySources.length > 0 && (
          <div className="curated-sources">
            <h3>Curated sources</h3>
            <div>
              {communitySources.map((source) => (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer" key={`${source.provider}:${source.sourceUrl}`}>
                  {source.provider} ↗
                </a>
              ))}
            </div>
          </div>
        )}
        <h3>What this result assumes</h3>
        <ul>
          {set.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
        </ul>
      </div>
    </section>
  );
}

export function App({ dataRuntime }: { dataRuntime: DataRuntimeBootstrap }) {
  gearSnapshot = dataRuntime.active.snapshot;
  EXPANSIONS = gearSnapshot.registry.expansions;
  SUPPORTED_JOBS = gearSnapshot.registry.jobs;
  const latestExpansion = [...EXPANSIONS].sort((left, right) => right.order - left.order)[0]!;
  const initialJobDefinition = SUPPORTED_JOBS.find((entry) =>
    entry.id === 'WHM' && getEvaluatorCapability(gearSnapshot.registry, entry.id, 'standard', 'generic-hit')?.status === 'available'
  ) ?? SUPPORTED_JOBS.find((entry) =>
    getEvaluatorCapability(gearSnapshot.registry, entry.id, 'standard', 'generic-hit')?.status === 'available'
  )!;
  const initialProfile = evaluatorProfileFor(initialJobDefinition.id);
  const initialSet = gearSnapshot.curatedSets.find((set) => set.job === initialJobDefinition.id) ?? gearSnapshot.curatedSets[0]!;
  const [view, setView] = useState<View>('optimize');
  const [expansion, setExpansion] = useState<ExpansionId>(latestExpansion.id);
  const [level, setLevel] = useState(latestExpansion.levelCap);
  const [constraints, setConstraints] = useState({
    ...defaultConstraints,
    minResource: initialProfile.resourceStat ? initialProfile.baseStats[initialProfile.resourceStat] : 0
  });
  const [gcdTarget, setGcdTarget] = useState(initialJobDefinition.defaultGcdTarget.toFixed(2));
  const [runState, setRunState] = useState<RunState>('idle');
  const [result, setResult] = useState<OptimizerResult>();
  const [message, setMessage] = useState('Ready to search the verified current-tier pool.');
  const [job, setJob] = useState<CombatJob>(initialJobDefinition.id);
  const [selectedSet, setSelectedSet] = useState<GearSet>(initialSet);
  const [savedSets, setSavedSets] = useState<GearSet[]>([]);
  const [customItems, setCustomItems] = useState<EquipmentItem[]>([]);
  const [exportJson, setExportJson] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string>();
  const [customJob, setCustomJob] = useState<CombatJob>(initialJobDefinition.id);
  const [customFallbacks, setCustomFallbacks] = useState<Record<string, CustomFallback>>({});
  const [customDraft, setCustomDraft] = useState<CustomDraft>(() => createCustomDraft(initialJobDefinition.id));
  const [allowUnrealisticCustomValues, setAllowUnrealisticCustomValues] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>();
  const [previousOptimizedSet, setPreviousOptimizedSet] = useState<GearSet>();
  const [dataUpdateState, setDataUpdateState] = useState<'idle' | 'checking' | 'error'>('idle');
  const [dataUpdateMessage, setDataUpdateMessage] = useState(dataRuntime.configurationMessage ?? dataRuntime.active.fallbackReason);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    Promise.allSettled([loadSavedSets(), loadCustomItems()]).then(([savedResult, customResult]) => {
      if (customResult.status === 'fulfilled') {
        setCustomItems(customResult.value.map((record) => record.item));
        setCustomFallbacks(Object.fromEntries(customResult.value.map((record) => [record.id, { slot: record.preferredSlot }])));
      }
      if (savedResult.status === 'fulfilled') {
        setSavedSets(savedResult.value);
        void dataRuntime.repository.setPinnedSnapshotIds(pinnedSnapshotIdsForSavedSets(savedResult.value));
      }
      if (customResult.status === 'rejected') setMessage('Custom items could not be loaded; saved sets using them may show a missing item.');
      else if (savedResult.status === 'rejected') setMessage('Saved sets could not be loaded; the app still works without them.');
    });
    return () => workerRef.current?.terminate();
  }, []);

  const activeLevel = effectiveLevel(gearSnapshot.registry, expansion, level);
  const jobDefinition = SUPPORTED_JOBS.find((entry) => entry.id === job)!;
  const evaluatorProfile = evaluatorProfileFor(job);
  const evaluatorRuleset = gearSnapshot.rulesets.find((entry) => entry.id === evaluatorProfile.rulesetId);
  const customEvaluatorProfile = evaluatorProfileFor(customJob);
  const customItemLimits = useMemo(
    () => getCustomItemLimits(customJob, customDraft.slot),
    [customJob, customDraft.slot]
  );
  const jobIsAvailable = (definition: (typeof SUPPORTED_JOBS)[number]) =>
    jobAvailableAtAccess(gearSnapshot.registry, definition.id, expansion, level);
  const jobCanOptimize = (definition: (typeof SUPPORTED_JOBS)[number]) =>
    getEvaluatorCapability(gearSnapshot.registry, definition.id, 'standard', 'generic-hit')?.status === 'available';

  useEffect(() => {
    if (jobIsAvailable(jobDefinition) && jobCanOptimize(jobDefinition)) return;
    const fallback = SUPPORTED_JOBS.find((entry) => jobIsAvailable(entry) && jobCanOptimize(entry));
    if (!fallback) return;
    const referenceSet = gearSnapshot.curatedSets.find((set) => set.job === fallback.id);
    setJob(fallback.id);
    setGcdTarget(fallback.defaultGcdTarget.toFixed(2));
    const fallbackProfile = evaluatorProfileFor(fallback.id);
    setConstraints((current) => ({
      ...current,
      minResource: fallbackProfile.resourceStat ? fallbackProfile.baseStats[fallbackProfile.resourceStat] : 0
    }));
    setResult(undefined);
    setRunState('idle');
    setPreviousOptimizedSet(undefined);
    if (referenceSet) setSelectedSet(referenceSet);
    setMessage(jobIsAvailable(jobDefinition)
      ? `${jobDefinition.name} data is present, but its evaluator is not ready. Switched to ${fallback.name}.`
      : `${jobDefinition.name} is unavailable at the selected expansion or effective level. Switched to ${fallback.name}.`);
  }, [activeLevel, expansion, job, jobDefinition]);

  const displayedSets = useMemo(
    () => result?.best ? [result.best, ...result.alternatives] : [],
    [result]
  );

  const selectJob = (nextJob: CombatJob) => {
    const definition = SUPPORTED_JOBS.find((entry) => entry.id === nextJob)!;
    const capability = getEvaluatorCapability(gearSnapshot.registry, nextJob, 'standard', 'generic-hit');
    if (capability?.status !== 'available') {
      setMessage(`${definition.name} data is present, but its generic-hit evaluator is ${capability?.status ?? 'unsupported'}. Optimisation remains unavailable until a compatible profile is installed.`);
      return;
    }
    const referenceSet = gearSnapshot.curatedSets.find((set) => set.job === nextJob);
    const nextProfile = evaluatorProfileFor(nextJob);
    setJob(nextJob);
    setGcdTarget(definition.defaultGcdTarget.toFixed(2));
    setConstraints((current) => ({
      ...current,
      minResource: nextProfile.resourceStat ? nextProfile.baseStats[nextProfile.resourceStat] : 0
    }));
    setResult(undefined);
    setRunState('idle');
    setPreviousOptimizedSet(undefined);
    if (referenceSet) setSelectedSet(referenceSet);
    setMessage(`${definition.name} selected. The current evaluator is a reference-validated damage proxy, not a rotation simulation.`);
  };

  const setSourceAllowed = (sources: SourceFamily[], checked: boolean) => {
    setConstraints((current) => ({
      ...current,
      allowedSources: checked
        ? [...new Set([...current.allowedSources, ...sources])]
        : current.allowedSources.filter((entry) => !sources.includes(entry))
    }));
  };

  const runOptimizer = () => {
    if (!evaluatorRuleset || activeLevel < evaluatorRuleset.minimumLevel || activeLevel > evaluatorRuleset.maximumLevel) {
      setRunState('error');
      setMessage(evaluatorRuleset
        ? `The ${evaluatorRuleset.id} evaluator supports levels ${evaluatorRuleset.minimumLevel}–${evaluatorRuleset.maximumLevel}; the selected effective level is ${activeLevel}.`
        : `The active profile references missing ruleset ${evaluatorProfile.rulesetId}.`);
      return;
    }
    if (constraints.allowedSources.length === 0) {
      setRunState('error');
      setMessage('Choose at least one acquisition source. Even an ethereal orb cannot equip pure optimism.');
      return;
    }
    const parsedGcdTarget = Number(gcdTarget);
    if (!Number.isFinite(parsedGcdTarget) || parsedGcdTarget < 1.5 || parsedGcdTarget > 2.5) {
      setRunState('error');
      setMessage('Enter a target GCD between 1.50 and 2.50 seconds. The orb refuses to optimise time itself.');
      return;
    }
    const equippedIds = new Set(Object.values(selectedSet.items).map((entry) => String(entry?.itemId)));
    const activeCustomItems = customItems.filter((item) => equippedIds.has(String(item.id)) && item.jobs.includes(job));
    const optimizerConstraints = {
      ...constraints,
      minGcd: parsedGcdTarget,
      maxGcd: parsedGcdTarget,
      requiredItemIds: [...new Set([...constraints.requiredItemIds, ...activeCustomItems.map((item) => item.id)])]
    };

    workerRef.current?.terminate();
    const worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setRunState('running');
    setMessage(activeCustomItems.length > 0
      ? `Keeping ${activeCustomItems.length} active hypothetical item${activeCustomItems.length === 1 ? '' : 's'} while rebuilding the remaining slots…`
      : 'Building legal meld frontiers and checking every retained stat state…');
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'result') {
        const next = event.data.result as OptimizerResult;
        const previousBest = result?.best;
        setResult(next);
        setRunState('done');
        if (next.best) {
          setPreviousOptimizedSet(previousBest);
          setSelectedSet(next.best);
          setMessage(next.speedFallback
            ? `Exact speed unavailable; showing the closest attainable ${next.speedFallback.achievedGcd.toFixed(2)}s set after searching ${next.evaluatedStates.toLocaleString()} states.`
            : `Searched ${next.evaluatedStates.toLocaleString()} states in ${next.durationMs.toFixed(0)} ms.`);
        } else {
          setPreviousOptimizedSet(undefined);
          setMessage(next.explanation[0] ?? 'No legal set was found.');
        }
        worker.terminate();
      }
      if (event.data.type === 'error') {
        setRunState('error');
        setMessage(event.data.message);
        worker.terminate();
      }
    };
    worker.postMessage({ type: 'optimize', constraints: optimizerConstraints, job, customItems, snapshot: gearSnapshot });
  };

  const cancelOptimizer = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunState('idle');
    setMessage('Search cancelled. Your filters are untouched.');
  };

  const saveCurrent = async () => {
    const saved = { ...selectedSet, id: `saved-${Date.now()}`, origin: 'saved' as const, name: `${selectedSet.name} · saved` };
    try {
      await saveSet(saved);
      const nextSavedSets = [saved, ...savedSets];
      setSavedSets(nextSavedSets);
      await dataRuntime.repository.setPinnedSnapshotIds(pinnedSnapshotIdsForSavedSets(nextSavedSets)).catch(() => undefined);
      setMessage('Set saved locally. It will still be here offline.');
    } catch {
      setMessage('The set could not be saved locally.');
    }
  };

  const requestSavedSetDeletion = (set: GearSet) => {
    setPendingDeletion({ kind: 'saved-set', set });
  };

  const deleteSavedSetPermanently = async (set: GearSet) => {
    try {
      await deleteSavedSet(set.id);
      const nextSavedSets = savedSets.filter((entry) => entry.id !== set.id);
      setSavedSets(nextSavedSets);
      await dataRuntime.repository.setPinnedSnapshotIds(pinnedSnapshotIdsForSavedSets(nextSavedSets)).catch(() => undefined);
      setMessage('Saved set deleted. Any set currently open on screen is left untouched.');
    } catch {
      setMessage('The saved set could not be deleted.');
    }
  };

  const prepareExport = () => {
    try {
      setExportJson(exportToXivGearJson(selectedSet, { ...gearSnapshot, items: [...gearSnapshot.items, ...customItems] }));
    } catch (error) {
      setExportJson(error instanceof XivGearExportError ? error.message : 'Export failed unexpectedly.');
    }
  };

  const recalculateWithCustomItems = (set: GearSet, items: EquipmentItem[]) => {
    const profile = evaluatorProfileFor(set.job);
    const ruleset = gearSnapshot.rulesets.find((entry) => entry.id === profile.rulesetId);
    if (!ruleset) throw new Error(`Missing calculation ruleset ${profile.rulesetId}.`);
    return recalculateGearSet(
      set,
      [...gearSnapshot.items, ...items],
      gearSnapshot.materia,
      gearSnapshot.foods,
      gearSnapshot.evaluatorProfiles,
      {
        snapshotId: gearSnapshot.manifest.id,
        rulesetId: ruleset.id,
        evaluatorProfileId: profile.id,
        evaluatorVersion: profile.version,
        calculationSchema: ruleset.calculationSchema
      }
    );
  };

  const stopPendingOptimizationForCustomChange = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunState('idle');
  };

  const openCustomManager = () => {
    setCustomOpen(true);
  };

  const startCustomCreate = () => {
    const draft = createCustomDraft(job);
    const limits = getCustomItemLimits(job, draft.slot);
    setEditingCustomId(undefined);
    setCustomJob(job);
    setCustomDraft({
      ...draft,
      itemLevel: String(Math.min(Number(draft.itemLevel), limits.itemLevel.maximum)),
      mainStat: String(Math.min(Number(draft.mainStat), limits.mainStat.maximum)),
      resourceStat: String(Math.min(Number(draft.resourceStat), limits.resourceStat.maximum)),
      criticalHit: String(Math.min(Number(draft.criticalHit), limits.criticalHit.maximum)),
      determination: String(Math.min(Number(draft.determination), limits.determination.maximum)),
      directHit: String(Math.min(Number(draft.directHit), limits.directHit.maximum)),
      speedStat: String(Math.min(Number(draft.speedStat), limits.speedStat.maximum)),
      weaponDamage: String(Math.min(Number(draft.weaponDamage), limits.weaponDamage.maximum))
    });
    setAllowUnrealisticCustomValues(false);
    setCustomOpen(false);
    setCustomEditorOpen(true);
  };

  const startCustomEdit = (item: EquipmentItem) => {
    const equippedSlot = gearSlotsForJob(selectedSet.job).find((slot) => String(selectedSet.items[slot]?.itemId) === String(item.id));
    const fallbackSlot = customFallbacks[String(item.id)]?.slot;
    const slot = equippedSlot ?? fallbackSlot ?? (item.slot === 'ring' ? 'ringLeft' : item.slot);
    const itemJob = item.jobs[0] ?? job;
    const profile = evaluatorProfileFor(itemJob);
    const limits = getCustomItemLimits(itemJob, slot);
    const exceedsLimits =
      item.itemLevel > limits.itemLevel.maximum ||
      item.stats[profile.mainStat] > limits.mainStat.maximum ||
      (profile.resourceStat ? item.stats[profile.resourceStat] > limits.resourceStat.maximum : false) ||
      item.stats.criticalHit > limits.criticalHit.maximum ||
      item.stats.determination > limits.determination.maximum ||
      item.stats.directHit > limits.directHit.maximum ||
      item.stats[profile.speedStat] > limits.speedStat.maximum ||
      item.weaponDamage > limits.weaponDamage.maximum;
    setEditingCustomId(String(item.id));
    setCustomJob(itemJob);
    setCustomDraft(createCustomDraft(itemJob, item, slot));
    setAllowUnrealisticCustomValues(exceedsLimits);
    setCustomOpen(false);
    setCustomEditorOpen(true);
  };

  const updateCustomDraftField = (
    field: Exclude<keyof CustomDraft, 'slot'>,
    value: string
  ) => {
    let nextValue = value;
    if (field !== 'name' && value !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed < 0) nextValue = '0';
      if (!allowUnrealisticCustomValues && Number.isFinite(parsed) && parsed > customItemLimits[field].maximum) {
        nextValue = String(customItemLimits[field].maximum);
      }
    }
    setCustomDraft((current) => ({ ...current, [field]: nextValue }));
  };

  const updateCustomDraftSlot = (slot: GearSlot) => {
    const limits = getCustomItemLimits(customJob, slot);
    setCustomDraft((current) => {
      if (allowUnrealisticCustomValues) return { ...current, slot };
      const clamp = (field: CustomLimitField) => String(Math.min(Number(current[field]) || 0, limits[field].maximum));
      return {
        ...current,
        slot,
        itemLevel: clamp('itemLevel'),
        mainStat: clamp('mainStat'),
        resourceStat: clamp('resourceStat'),
        criticalHit: clamp('criticalHit'),
        determination: clamp('determination'),
        directHit: clamp('directHit'),
        speedStat: clamp('speedStat'),
        weaponDamage: clamp('weaponDamage')
      };
    });
  };

  const toggleUnrealisticCustomValues = (enabled: boolean) => {
    setAllowUnrealisticCustomValues(enabled);
    if (enabled) return;
    setCustomDraft((current) => {
      const clamp = (field: CustomLimitField) => String(Math.min(Number(current[field]) || 0, customItemLimits[field].maximum));
      return {
        ...current,
        itemLevel: clamp('itemLevel'),
        mainStat: clamp('mainStat'),
        resourceStat: clamp('resourceStat'),
        criticalHit: clamp('criticalHit'),
        determination: clamp('determination'),
        directHit: clamp('directHit'),
        speedStat: clamp('speedStat'),
        weaponDamage: clamp('weaponDamage')
      };
    });
  };

  const saveCustomOverride = async () => {
    stopPendingOptimizationForCustomChange();
    const rawNumericValues = {
      itemLevel: Number(customDraft.itemLevel),
      mainStat: Number(customDraft.mainStat),
      resourceStat: Number(customDraft.resourceStat),
      criticalHit: Number(customDraft.criticalHit),
      determination: Number(customDraft.determination),
      directHit: Number(customDraft.directHit),
      speedStat: Number(customDraft.speedStat),
      weaponDamage: Number(customDraft.weaponDamage)
    };
    if (
      !customDraft.name.trim() ||
      !Object.values(rawNumericValues).every((value) => Number.isFinite(value) && value >= 0) ||
      rawNumericValues.itemLevel < 1
    ) {
      setMessage('Give the custom item a name and use valid non-negative numbers for every stat.');
      return;
    }
    const numericValues = allowUnrealisticCustomValues
      ? rawNumericValues
      : Object.fromEntries(
        Object.entries(rawNumericValues).map(([field, value]) => [field, Math.min(value, customItemLimits[field as CustomLimitField].maximum)])
      ) as typeof rawNumericValues;

    const stats = emptyStats();
    stats[customEvaluatorProfile.mainStat] = numericValues.mainStat;
    if (customEvaluatorProfile.resourceStat) {
      stats[customEvaluatorProfile.resourceStat] = numericValues.resourceStat;
    }
    stats.criticalHit = numericValues.criticalHit;
    stats.determination = numericValues.determination;
    stats.directHit = numericValues.directHit;
    stats[customEvaluatorProfile.speedStat] = numericValues.speedStat;
    const editingItem = editingCustomId
      ? customItems.find((item) => String(item.id) === editingCustomId)
      : undefined;
    const customSlot = customDraft.slot;
    const custom: EquipmentItem = {
      id: editingItem?.id ?? `custom-${Date.now()}`,
      origin: 'custom',
      name: customDraft.name.trim(),
      slot: customSlot === 'ringLeft' || customSlot === 'ringRight' ? 'ring' : customSlot,
      level: 100,
      itemLevel: numericValues.itemLevel,
      stats,
      statCaps: zeroCaps(),
      weaponDamage: customSlot === 'weapon' ? numericValues.weaponDamage : 0,
      weaponDelayMs: customSlot === 'weapon' ? 3440 : 0,
      materiaSlots: 0,
      advancedMelding: false,
      unique: customSlot === 'ringLeft' || customSlot === 'ringRight',
      jobs: editingItem?.jobs ?? [customJob],
      sourceFamily: 'custom',
      acquisitionNote: 'Local hypothetical item.',
      provenance: editingItem?.provenance ?? [{
        kind: 'custom',
        provider: 'Local user data',
        schemaVersion: 'custom-item@1',
        retrievedAt: new Date().toISOString(),
        status: 'custom'
      }]
    };

    try {
      await saveStoredCustomItem(custom, customSlot);
    } catch {
      setMessage('The custom item could not be saved locally. Nothing was changed.');
      return;
    }

    if (editingItem) {
      const nextItems = customItems.map((item) => String(item.id) === String(custom.id) ? custom : item);
      const equippedSlot = gearSlotsForJob(selectedSet.job).find((slot) => String(selectedSet.items[slot]?.itemId) === String(custom.id));
      const nextFallbacks = { ...customFallbacks };
      setCustomItems(nextItems);
      if (equippedSlot) {
        const equippedItems = { ...selectedSet.items };
        const oldFallback = customFallbacks[String(custom.id)]?.equipped;
        if (oldFallback) equippedItems[equippedSlot] = oldFallback;
        else delete equippedItems[equippedSlot];

        const targetEquipped = equippedItems[customSlot];
        const targetCustom = targetEquipped
          ? customItems.find((item) => String(item.id) === String(targetEquipped.itemId))
          : undefined;
        const targetFallback = targetCustom
          ? customFallbacks[String(targetCustom.id)]?.equipped
          : targetEquipped;
        equippedItems[customSlot] = { itemId: custom.id, materiaIds: [] };
        nextFallbacks[String(custom.id)] = { slot: customSlot, equipped: targetFallback };
        const updatedSet: GearSet = {
          ...selectedSet,
          id: `custom-set-${Date.now()}`,
          origin: 'custom',
          items: equippedItems,
          assumptions: [
            ...selectedSet.assumptions.filter((entry) => entry !== `Custom override in ${slotLabel[equippedSlot]}.`),
            `Custom override in ${slotLabel[customSlot]}.`
          ]
        };
        setSelectedSet(recalculateWithCustomItems(updatedSet, nextItems));
      } else {
        nextFallbacks[String(custom.id)] = { slot: customSlot };
      }
      setCustomFallbacks(nextFallbacks);
      setResult(undefined);
      setPreviousOptimizedSet(undefined);
      setCustomEditorOpen(false);
      setEditingCustomId(undefined);
      setMessage(`Updated ${custom.name}${equippedSlot ? ' and recalculated the open set' : ''}.`);
      return;
    }

    const currentEquipped = selectedSet.items[customSlot];
    const replacedCustom = currentEquipped
      ? customItems.find((item) => String(item.id) === String(currentEquipped.itemId))
      : undefined;
    const fallback = replacedCustom
      ? customFallbacks[String(replacedCustom.id)]?.equipped
      : currentEquipped;
    const nextItems = [...customItems, custom];
    const replaced: GearSet = {
      ...selectedSet,
      id: `custom-set-${Date.now()}`,
      origin: 'custom',
      name: `${selectedSet.name.replace(/(?: · hypothetical)+$/, '')} · hypothetical`,
      items: { ...selectedSet.items, [customSlot]: { itemId: custom.id, materiaIds: [] } },
      assumptions: [...selectedSet.assumptions.filter((entry) => entry !== `Custom override in ${slotLabel[customSlot]}.`), `Custom override in ${slotLabel[customSlot]}.`]
    };
    setCustomItems(nextItems);
    setCustomFallbacks((current) => ({ ...current, [String(custom.id)]: { slot: customSlot, equipped: fallback } }));
    setSelectedSet(recalculateWithCustomItems(replaced, nextItems));
    setResult(undefined);
    setPreviousOptimizedSet(undefined);
    setCustomEditorOpen(false);
    setEditingCustomId(undefined);
    setMessage(`${custom.name} applied to ${slotLabel[customSlot]}. It will remain active when constraints are recalculated.`);
  };

  const applyCustomItem = (item: EquipmentItem) => {
    stopPendingOptimizationForCustomChange();
    if (!item.jobs.includes(job)) {
      setMessage(`${item.name} belongs to ${item.jobs.join('/')} and cannot be applied to ${job}.`);
      return;
    }
    const slot = customFallbacks[String(item.id)]?.slot ?? (item.slot === 'ring' ? 'ringLeft' : item.slot);
    const currentEquipped = selectedSet.items[slot];
    const replacedCustom = currentEquipped
      ? customItems.find((entry) => String(entry.id) === String(currentEquipped.itemId))
      : undefined;
    const fallback = replacedCustom
      ? customFallbacks[String(replacedCustom.id)]?.equipped
      : currentEquipped;
    const replaced: GearSet = {
      ...selectedSet,
      id: `custom-set-${Date.now()}`,
      origin: 'custom',
      items: { ...selectedSet.items, [slot]: { itemId: item.id, materiaIds: [] } }
    };
    setCustomFallbacks((current) => ({ ...current, [String(item.id)]: { slot, equipped: fallback } }));
    setSelectedSet(recalculateWithCustomItems(replaced, customItems));
    setResult(undefined);
    setPreviousOptimizedSet(undefined);
    setCustomOpen(false);
    setMessage(`${item.name} applied to ${slotLabel[slot]}.`);
  };

  const unequipCustomItem = (item: EquipmentItem) => {
    stopPendingOptimizationForCustomChange();
    const equippedSlot = gearSlotsForJob(selectedSet.job).find((slot) => String(selectedSet.items[slot]?.itemId) === String(item.id));
    if (!equippedSlot) {
      setMessage(`${item.name} is not equipped in the current set.`);
      return;
    }

    const equippedItems = { ...selectedSet.items };
    const rememberedFallback = customFallbacks[String(item.id)]?.equipped;
    const referenceFallback = gearSnapshot.curatedSets.find((set) => set.job === selectedSet.job)?.items[equippedSlot];
    const fallback = rememberedFallback ?? referenceFallback;
    if (fallback) equippedItems[equippedSlot] = fallback;
    else delete equippedItems[equippedSlot];

    const restored: GearSet = {
      ...selectedSet,
      id: `custom-set-${Date.now()}`,
      items: equippedItems,
      assumptions: selectedSet.assumptions.filter((entry) => entry !== `Custom override in ${slotLabel[equippedSlot]}.`)
    };
    setSelectedSet(recalculateWithCustomItems(restored, customItems));
    setCustomFallbacks((current) => ({
      ...current,
      [String(item.id)]: { slot: equippedSlot }
    }));
    setResult(undefined);
    setPreviousOptimizedSet(undefined);
    setMessage(`${item.name} removed from the current set and kept in your custom-item library.`);
  };

  const requestCustomItemDeletion = (item: EquipmentItem) => {
    const usedBySavedSet = savedSets.some((set) =>
      Object.values(set.items).some((entry) => String(entry?.itemId) === String(item.id))
    );
    setPendingDeletion({ kind: 'custom-item', item, usedBySavedSet });
  };

  const deleteCustomItemPermanently = async (item: EquipmentItem) => {
    stopPendingOptimizationForCustomChange();
    try {
      await deleteStoredCustomItem(item.id);
    } catch {
      setMessage(`${item.name} could not be removed from local storage.`);
      return;
    }
    const nextItems = customItems.filter((entry) => String(entry.id) !== String(item.id));
    const equippedSlot = gearSlotsForJob(selectedSet.job).find((slot) => String(selectedSet.items[slot]?.itemId) === String(item.id));
    if (equippedSlot) {
      const equippedItems = { ...selectedSet.items };
      const rememberedFallback = customFallbacks[String(item.id)]?.equipped;
      const referenceFallback = gearSnapshot.curatedSets.find((set) => set.job === selectedSet.job)?.items[equippedSlot];
      const fallback = rememberedFallback ?? referenceFallback;
      if (fallback) equippedItems[equippedSlot] = fallback;
      else delete equippedItems[equippedSlot];
      const restored: GearSet = {
        ...selectedSet,
        id: `custom-set-${Date.now()}`,
        items: equippedItems,
        assumptions: selectedSet.assumptions.filter((entry) => entry !== `Custom override in ${slotLabel[equippedSlot]}.`)
      };
      setSelectedSet(recalculateWithCustomItems(restored, nextItems));
      setResult(undefined);
      setPreviousOptimizedSet(undefined);
    }
    setCustomItems(nextItems);
    setCustomFallbacks((current) => {
      const next = { ...current };
      delete next[String(item.id)];
      return next;
    });
    setMessage(`${item.name} permanently deleted from your custom-item library${equippedSlot ? `; the previous ${slotLabel[equippedSlot].toLowerCase()} item was restored` : ''}.`);
  };

  const confirmPendingDeletion = async () => {
    const deletion = pendingDeletion;
    if (!deletion) return;
    setPendingDeletion(undefined);
    if (deletion.kind === 'saved-set') await deleteSavedSetPermanently(deletion.set);
    else await deleteCustomItemPermanently(deletion.item);
  };

  const checkForDataUpdate = async () => {
    if (!dataRuntime.updatePolicy) {
      setDataUpdateState('error');
      setDataUpdateMessage(dataRuntime.configurationMessage ?? 'Live data updates are unavailable in this build.');
      return;
    }
    setDataUpdateState('checking');
    setDataUpdateMessage('Downloading and verifying the signed data manifest…');
    try {
      const candidate = await downloadSnapshotCandidate(
        dataRuntime.updatePolicy,
        APP_RUNTIME_COMPATIBILITY
      );
      if (
        dataRuntime.active.source === 'downloaded' &&
        candidate.snapshot.manifest.id === dataRuntime.active.snapshot.manifest.id &&
        candidate.sha256 === dataRuntime.active.sha256
      ) {
        setDataUpdateState('idle');
        setDataUpdateMessage(`Data is current. Last checked ${new Date().toLocaleString()}.`);
        return;
      }
      setDataUpdateMessage('Manifest verified. Activating the compatible snapshot atomically…');
      await dataRuntime.repository.stageAndActivate(candidate);
      window.location.reload();
    } catch (error) {
      setDataUpdateState('error');
      setDataUpdateMessage(error instanceof Error ? error.message : 'Data update failed unexpectedly.');
    }
  };

  const rollbackData = async () => {
    setDataUpdateState('checking');
    setDataUpdateMessage('Checking and restoring the previous compatible snapshot…');
    try {
      await dataRuntime.repository.rollback();
      window.location.reload();
    } catch (error) {
      setDataUpdateState('error');
      setDataUpdateMessage(error instanceof Error ? error.message : 'Data rollback failed unexpectedly.');
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-orb" aria-hidden="true" />
          <div><strong>XIV Gear Lab</strong><span className="preview-label">Unfinished preview · not a release</span></div>
        </div>
        <nav aria-label="Main navigation">
          {([
            ['optimize', 'Optimise', '⌁'],
            ['community', 'Community sets', '✦'],
            ['saved', 'Saved locally', '◇'],
            ['about', 'Data & sources', 'ⓘ']
          ] as Array<[View, string, string]>).map(([id, label, icon]) => (
            <button className={view === id ? 'active' : ''} onClick={() => setView(id)} key={id}>
              <span aria-hidden="true">{icon}</span>{label}
              {id === 'saved' && savedSets.length > 0 && <em>{savedSets.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <RuntimeDataStatus
            active={dataRuntime.active}
            updateState={dataUpdateState}
            message={dataUpdateMessage}
            canCheck={Boolean(dataRuntime.updatePolicy)}
            onCheck={checkForDataUpdate}
            onRollback={rollbackData}
          />
          <small>Data {gearSnapshot.manifest.xivapiVersion.slice(0, 8)} · calc {gearSnapshot.manifest.calculationVersion}</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Unfinished preview · Windows-first prototype · browser-capable core</p>
            <h1>{view === 'optimize' ? 'Build around how you actually play.' : view === 'community' ? 'Current community reference sets' : view === 'saved' ? 'Your locally saved sets' : 'Data, provenance, and limits'}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost" data-custom-library-open onClick={openCustomManager} disabled={!selectedSet}>Custom items{customItems.length > 0 ? ` · ${customItems.length}` : ''}</button>
            <button className="ghost" onClick={saveCurrent}>Save set</button>
            <button className="primary small" onClick={prepareExport}>XivGear JSON</button>
          </div>
        </header>

        {view === 'optimize' && (
          <div className="workspace">
            <section className="control-panel" aria-label="Optimisation controls">
              <div className="panel-title"><div><p className="eyebrow">Constraints</p><h2>Recommendation brief</h2></div><span className="verified-badge">{gearSnapshot.items.length} official items</span></div>

              <label>Expansion access
                <select value={expansion} onChange={(event) => setExpansion(event.target.value as ExpansionId)}>
                  {EXPANSIONS.map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · cap {entry.levelCap}</option>)}
                </select>
              </label>
              <label>Effective level
                <input type="number" min="1" max="100" value={level} onChange={(event) => setLevel(Number(event.target.value))} />
                <small>Applied: {activeLevel}. Expansion cap is enforced.</small>
              </label>
              <label>Job
                <select id="job-select" value={job} onChange={(event) => selectJob(event.target.value as CombatJob)}>
                  {SUPPORTED_JOBS.map((entry) => {
                    const capability = getEvaluatorCapability(gearSnapshot.registry, entry.id, 'standard', 'generic-hit');
                    const capabilityLabel = capability?.status === 'available' ? 'validated proxy' : `evaluator ${capability?.status ?? 'unsupported'}`;
                    return <option value={entry.id} disabled={!jobIsAvailable(entry) || capability?.status !== 'available'} key={entry.id}>{entry.name} · {capabilityLabel}</option>;
                  })}
                </select>
                <small>{jobDefinition.name}: {evaluatorProfile.objective} {evaluatorProfile.limitation}</small>
              </label>
              <div className="control-field gcd-control">
                <label htmlFor="gcd-target">Target GCD</label>
                <div className="gcd-input-wrap">
                  <input
                    id="gcd-target"
                    type="number"
                    inputMode="decimal"
                    min="1.5"
                    max="2.5"
                    step="0.01"
                    value={gcdTarget}
                    onChange={(event) => setGcdTarget(event.target.value)}
                  />
                  <span>seconds</span>
                </div>
                <small>Current {job} reference targets:</small>
                <div className="gcd-suggestions" aria-label="Recommended GCD targets">
                  {jobDefinition.recommendedGcdTargets.map((target) => (
                    <button type="button" onClick={() => setGcdTarget(target.toFixed(2))} key={target}>{target.toFixed(2)}s</button>
                  ))}
                </div>
                <small>If the exact target is impossible, the closest attainable meld plan is shown and labelled.</small>
              </div>
              {evaluatorProfile.resourceStat && <label>Minimum {evaluatorProfile.resourceLabel}
                <input type="number" min={evaluatorProfile.baseStats[evaluatorProfile.resourceStat]} step="10" value={constraints.minResource} onChange={(event) => setConstraints((current) => ({ ...current, minResource: Number(event.target.value) }))} />
                <small>Comfort constraint, not silently baked into “best”.</small>
              </label>}

              <fieldset>
                <legend>Allowed acquisition</legend>
                {SOURCE_GROUPS.map((source) => (
                  <label className="check-row" key={source.id}>
                    <input type="checkbox" checked={source.sources.every((entry) => constraints.allowedSources.includes(entry))} onChange={(event) => setSourceAllowed(source.sources, event.target.checked)} />
                    <span><strong>{source.label}</strong><small>{source.detail}</small></span>
                  </label>
                ))}
                {UNAVAILABLE_SOURCE_OPTIONS.map((source) => (
                  <label className="check-row unavailable" key={source.id} title="Planned for a broader data-pool milestone">
                    <input type="checkbox" disabled />
                    <span><strong>{source.label}<em>Not in pool</em></strong><small>{source.detail}</small></span>
                  </label>
                ))}
                {constraints.allowedSources.length === 1 && constraints.allowedSources[0] === 'savage' && (
                  <p className="source-warning">Savage alone has only one unique ring in this prototype pool. Add Tomestone gear to fill both ring slots.</p>
                )}
              </fieldset>

              <div className={`run-message ${runState}`} role="status"><span aria-hidden="true">{runState === 'running' ? '◌' : runState === 'error' ? '!' : '✓'}</span><p>{message}</p></div>
              {result?.explanation.map((line) => <p className="explanation" key={line}>{line}</p>)}
              {runState === 'running'
                ? <button className="danger wide" onClick={cancelOptimizer}>Cancel search</button>
                : <button className="primary wide" onClick={runOptimizer}>Optimise this brief <span>→</span></button>}
            </section>

            <div className="result-column">
              {displayedSets.length > 0 && (
                <div className="alternative-tabs" role="tablist" aria-label="Generated alternatives">
                  {displayedSets.map((set) => <button role="tab" aria-selected={selectedSet.id === set.id} className={selectedSet.id === set.id ? 'active' : ''} onClick={() => setSelectedSet(set)} key={set.id}>{set.name}<span>{set.metrics.gcd.toFixed(2)}s · {formatNumber.format(set.metrics.expectedAction100)}</span></button>)}
                </div>
              )}
              <SetDetails
                set={selectedSet}
                previousSet={previousOptimizedSet}
                customItems={customItems}
                onEditCustom={startCustomEdit}
                onUnequipCustom={unequipCustomItem}
              />
            </div>
          </div>
        )}

        {view === 'community' && (
          <div className="card-grid">
            {gearSnapshot.curatedSets.filter((set) => set.job === job).map((set) => (
              <button className="set-card" key={set.id} onClick={() => { setSelectedSet(set); setView('optimize'); }}>
                <div><span className="source-pill" data-curated-providers={curatedProviderLabel(set)}>{curatedProviderLabel(set)} · patch {set.patch}</span><span>{curatedUpdatedDate(set)}</span></div>
                <h2>{set.name}</h2>
                <StatStrip set={set} />
                <p>{formatNumber.format(set.metrics.expectedAction100)} expected single 100-potency hit · i{formatNumber.format(set.metrics.averageItemLevel)}</p>
                <strong>Inspect without merging assumptions →</strong>
              </button>
            ))}
          </div>
        )}

        {view === 'saved' && (
          <div className="card-grid">
            {savedSets.length === 0
              ? <div className="empty-state"><span>◇</span><h2>No saved sets yet</h2><p>Save any generated or community set. It is stored locally and remains available offline.</p></div>
              : savedSets.map((set) => (
                <article className="set-card saved-set-card" key={set.id}>
                  <button className="saved-set-summary" onClick={() => { setSelectedSet(set); setView('optimize'); }}>
                    <span className="source-pill">Saved locally</span>
                    <h2>{set.name}</h2>
                    {set.legacyCalculationContext && <p className="source-warning">Legacy result · calculation version unknown</p>}
                    <StatStrip set={set} />
                    <strong>Open set →</strong>
                  </button>
                  <div className="saved-set-actions">
                    <small>Stored on this device</small>
                    <button className="danger compact" data-saved-set-delete={set.id} onClick={() => requestSavedSetDeletion(set)}>Delete</button>
                  </div>
                </article>
              ))}
          </div>
        )}

        {view === 'about' && (
          <div className="about-grid">
            <article><p className="eyebrow">Official client data</p><h2>XIVAPI v2</h2><p>Items, stats, slots and icons are cached from version <code>{gearSnapshot.manifest.xivapiVersion}</code> using schema <code>{gearSnapshot.manifest.xivapiSchema}</code>.</p><a href="https://v2.xivapi.com/docs/welcome/" target="_blank" rel="noreferrer">Provider documentation ↗</a></article>
            <article><p className="eyebrow">Community references</p><h2>Etro + The Balance</h2><p>Sixty final-tier recommendations across all 21 standard combat jobs retain exact source links. Fifty-one exact Etro/Balance overlaps are cross-attributed instead of duplicated; genuinely different source variants remain separate.</p><a href="https://etro.gg/api/docs/" target="_blank" rel="noreferrer">Etro API ↗</a> · <a href="https://www.thebalanceffxiv.com/jobs/" target="_blank" rel="noreferrer">The Balance job guides ↗</a></article>
            <article><p className="eyebrow">Calculation</p><h2>Transparent evaluator profiles</h2><p>Every supported combat job has an identifiable profile and independently recalculated level-100 reference fixtures. The objective is an expected single 100-potency hit comparison, not encounter DPS, healing, mitigation, raid-buff value, or a rotation simulation.</p><a href="https://xivgear.app/math/" target="_blank" rel="noreferrer">Independent maths reference ↗</a></article>
            <article><p className="eyebrow">Rights</p><h2>Public, non-commercial preview</h2><p>FINAL FANTASY XIV © SQUARE ENIX CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. XIV Gear Lab is an unfinished fan project and is not affiliated with or endorsed by Square Enix. FFXIV materials are used under the Materials Usage License; monetisation is not permitted.</p><a href="https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc" target="_blank" rel="noreferrer">Materials usage licence ↗</a></article>
          </div>
        )}
      </main>

      {pendingDeletion && (
        <div className="modal-backdrop confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPendingDeletion(undefined); }}>
          <div className="modal confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" data-confirm-dialog>
            <div>
              <p className="eyebrow">Please confirm</p>
              <h2 id="confirmation-title">{pendingDeletion.kind === 'saved-set' ? 'Delete saved set?' : 'Delete custom item?'}</h2>
              <p id="confirmation-description">
                {pendingDeletion.kind === 'saved-set'
                  ? `“${pendingDeletion.set.name}” will be removed from locally saved sets. The set currently open on screen is left untouched.`
                  : `“${pendingDeletion.item.name}” will be permanently removed from your custom-item library.`}
              </p>
              {pendingDeletion.kind === 'custom-item' && pendingDeletion.usedBySavedSet && (
                <p className="confirmation-warning">A locally saved set uses this item. Deleting it will make that saved set show a missing item.</p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" data-confirm-cancel autoFocus onClick={() => setPendingDeletion(undefined)}>Cancel</button>
              <button type="button" className="danger" data-confirm-accept onClick={() => { void confirmPendingDeletion(); }}>
                {pendingDeletion.kind === 'saved-set' ? 'Delete saved set' : 'Delete custom item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {customOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setCustomOpen(false); }}>
          <div className="modal custom-library" role="dialog" aria-modal="true" aria-labelledby="custom-library-title" data-custom-library>
            <div><p className="eyebrow">Local hypothetical gear</p><h2 id="custom-library-title">Custom items</h2><p>Create items here, then apply any saved item to the set currently on screen.</p></div>
            <button type="button" className="primary custom-library-create" data-custom-new onClick={startCustomCreate}>+ Create new item</button>

            {customItems.length === 0 ? (
              <div className="custom-library-empty"><span>◇</span><p>No custom items yet.</p></div>
            ) : (
              <div className="custom-item-list">
                {customItems.map((item) => {
                  const equippedSlot = gearSlotsForJob(selectedSet.job).find((slot) => String(selectedSet.items[slot]?.itemId) === String(item.id));
                  const compatible = item.jobs.includes(job);
                  return (
                    <article className="custom-item-row" data-custom-item={item.id} key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.jobs.join('/')} · i{item.itemLevel} · {equippedSlot ? `active in ${slotLabel[equippedSlot]}` : slotLabel[customFallbacks[String(item.id)]?.slot ?? (item.slot === 'ring' ? 'ringLeft' : item.slot)]}</span>
                      </div>
                      <div className="custom-item-actions">
                        <button
                          type="button"
                          className="ghost compact"
                          data-custom-apply={item.id}
                          disabled={Boolean(equippedSlot) || !compatible}
                          onClick={() => applyCustomItem(item)}
                        >
                          {equippedSlot ? 'Applied' : compatible ? 'Apply' : `Requires ${item.jobs.join('/')}`}
                        </button>
                        <button type="button" className="ghost compact" data-library-custom-edit={item.id} onClick={() => startCustomEdit(item)}>Edit</button>
                        <button type="button" className="danger compact" data-library-custom-delete={item.id} onClick={() => requestCustomItemDeletion(item)}>Delete</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCustomOpen(false)}>Close</button></div>
          </div>
        </div>
      )}

      {customEditorOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setCustomEditorOpen(false); }}>
          <form className="modal custom-editor-modal" role="dialog" aria-modal="true" aria-labelledby="custom-editor-title" data-custom-editor onSubmit={(event) => { event.preventDefault(); void saveCustomOverride(); }}>
            <div>
              <p className="eyebrow">Local hypothetical gear</p>
              <h2 id="custom-editor-title">{editingCustomId ? 'Edit custom item' : 'Create custom item'}</h2>
              <p>{editingCustomId ? 'Changing the slot moves the equipped item and restores what it previously replaced.' : 'The new item is added to your library and applied to the current set.'}</p>
            </div>
            <label>Slot
              <select data-custom-slot value={customDraft.slot} onChange={(event) => updateCustomDraftSlot(event.target.value as GearSlot)}>
                {gearSlotsForJob(customJob).map((slot) => <option value={slot} key={slot}>{slotLabel[slot]}</option>)}
              </select>
            </label>
            <label>Name<input name="name" value={customDraft.name} onChange={(event) => updateCustomDraftField('name', event.target.value)} required /></label>
            <div className="custom-limit-summary">
              Each field shows the highest value recorded on a current official {customJob} item for this slot and the maximum allowed value after the 20% buffer. Larger entries are clamped automatically.
            </div>
            <div className="field-grid">
              <label>Item level<input name="itemLevel" type="number" value={customDraft.itemLevel} onChange={(event) => updateCustomDraftField('itemLevel', event.target.value)} min="1" max={allowUnrealisticCustomValues ? undefined : customItemLimits.itemLevel.maximum} required /><small>Highest recorded {customItemLimits.itemLevel.recorded} | maximum {customItemLimits.itemLevel.maximum}</small></label>
              <label>{customEvaluatorProfile.mainStatLabel}<input name={customEvaluatorProfile.mainStat} data-custom-main-stat type="number" value={customDraft.mainStat} onChange={(event) => updateCustomDraftField('mainStat', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.mainStat.maximum} required /><small>Highest recorded {customItemLimits.mainStat.recorded} | maximum {customItemLimits.mainStat.maximum}</small></label>
              {customEvaluatorProfile.resourceStat && <label>{customEvaluatorProfile.resourceLabel}<input name={customEvaluatorProfile.resourceStat} data-custom-resource-stat type="number" value={customDraft.resourceStat} onChange={(event) => updateCustomDraftField('resourceStat', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.resourceStat.maximum} required /><small>Highest recorded {customItemLimits.resourceStat.recorded} | maximum {customItemLimits.resourceStat.maximum}</small></label>}
              <label>Critical Hit<input name="criticalHit" type="number" value={customDraft.criticalHit} onChange={(event) => updateCustomDraftField('criticalHit', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.criticalHit.maximum} required /><small>Highest recorded {customItemLimits.criticalHit.recorded} | maximum {customItemLimits.criticalHit.maximum}</small></label>
              <label>Determination<input name="determination" type="number" value={customDraft.determination} onChange={(event) => updateCustomDraftField('determination', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.determination.maximum} required /><small>Highest recorded {customItemLimits.determination.recorded} | maximum {customItemLimits.determination.maximum}</small></label>
              <label>Direct Hit<input name="directHit" type="number" value={customDraft.directHit} onChange={(event) => updateCustomDraftField('directHit', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.directHit.maximum} required /><small>Highest recorded {customItemLimits.directHit.recorded} | maximum {customItemLimits.directHit.maximum}</small></label>
              <label>{customEvaluatorProfile.speedStatLabel}<input name={customEvaluatorProfile.speedStat} data-custom-speed-stat type="number" value={customDraft.speedStat} onChange={(event) => updateCustomDraftField('speedStat', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.speedStat.maximum} required /><small>Highest recorded {customItemLimits.speedStat.recorded} | maximum {customItemLimits.speedStat.maximum}</small></label>
            </div>
            {customDraft.slot === 'weapon' && <label>Weapon damage<input name="weaponDamage" type="number" value={customDraft.weaponDamage} onChange={(event) => updateCustomDraftField('weaponDamage', event.target.value)} min="0" max={allowUnrealisticCustomValues ? undefined : customItemLimits.weaponDamage.maximum} required /><small>Highest recorded {customItemLimits.weaponDamage.recorded} | maximum {customItemLimits.weaponDamage.maximum}</small></label>}
            <label className={`check-row custom-limit-toggle ${allowUnrealisticCustomValues ? 'enabled' : ''}`}>
              <input type="checkbox" data-custom-unrealistic-toggle checked={allowUnrealisticCustomValues} onChange={(event) => toggleUnrealisticCustomValues(event.target.checked)} />
              <span><strong>Allow unrealistic values</strong><small>Values above the standard limits can produce absurd calculations and may break the UI.</small></span>
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setCustomEditorOpen(false)}>Cancel</button>
              <button className="primary" type="submit">{editingCustomId ? 'Save changes' : 'Create and apply'}</button>
            </div>
          </form>
        </div>
      )}

      {exportJson && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setExportJson(''); }}>
          <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
            <div><p className="eyebrow">Compatibility adapter</p><h2 id="export-title">XivGear JSON</h2><p>Official items only. The adapter fails closed if the selected set contains custom data.</p></div>
            <textarea readOnly value={exportJson} rows={18} />
            <div className="modal-actions"><button className="ghost" onClick={() => setExportJson('')}>Close</button><button className="primary" onClick={() => navigator.clipboard.writeText(exportJson).then(() => setMessage('XivGear JSON copied.'))}>Copy JSON</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
