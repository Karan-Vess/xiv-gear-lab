import { ProviderContractError, assertUnique, expectArray, expectRecord, expectString, providerFailureMessage } from './contracts.mjs';

export const PROVIDER_OVERLAY_SCHEMA = 'provider-overlay@1';
export const PROVIDER_OVERLAY_KINDS = ['official', 'acquisition', 'curated'];
const SOURCE_FAMILIES = new Set([
  'savage', 'alliance-raid', 'normal-raid', 'tomestone', 'tomestone-upgrade',
  'relic', 'crafted', 'dungeon', 'trial', 'ultimate', 'quest', 'vendor', 'custom', 'other', 'unknown'
]);
const STATUS_WEIGHT = { current: 0, partial: 1, stale: 2, failed: 3 };

const validateFreshness = (provider, path) => {
  const record = expectRecord(provider, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, path);
  expectString(record.id, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${path}.id`);
  if (!(record.status in STATUS_WEIGHT)) {
    throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${path}.status is unsupported.`);
  }
  return record;
};

export const createProviderOverlay = ({ kind, generatedAt, status = 'current', providers, payload }) => {
  if (!PROVIDER_OVERLAY_KINDS.includes(kind)) {
    throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, `unknown overlay kind ${kind}.`);
  }
  if (!(status in STATUS_WEIGHT)) {
    throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, `unknown overlay status ${status}.`);
  }
  expectString(generatedAt, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${kind}.generatedAt`);
  const providerRecords = expectArray(providers, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${kind}.providers`);
  providerRecords.forEach((provider, index) => validateFreshness(provider, `${kind}.providers[${index}]`));
  assertUnique(providerRecords, (provider) => provider.id, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${kind} providers`);
  expectRecord(payload, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${kind}.payload`);
  const overlay = { schemaVersion: PROVIDER_OVERLAY_SCHEMA, kind, generatedAt, status, providers: providerRecords, payload };
  validateProviderOverlay(overlay);
  return overlay;
};

export const validateProviderOverlay = (overlay) => {
  const record = expectRecord(overlay, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'overlay');
  if (record.schemaVersion !== PROVIDER_OVERLAY_SCHEMA || !PROVIDER_OVERLAY_KINDS.includes(record.kind)) {
    throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'overlay schema or kind is unsupported.');
  }
  const payload = expectRecord(record.payload, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `${record.kind}.payload`);
  if (record.kind === 'official') {
    const items = expectArray(payload.items, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official.payload.items');
    const materia = expectArray(payload.materia, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official.payload.materia');
    const foods = expectArray(payload.foods, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official.payload.foods');
    if (payload.contentGraph !== undefined) {
      const graph = expectRecord(payload.contentGraph, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official.payload.contentGraph');
      const nodes = expectArray(graph.nodes, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official.payload.contentGraph.nodes');
      assertUnique(nodes, (node) => node.id, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'content graph nodes');
    }
    if (items.length === 0) throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official overlay cannot contain zero items.');
    assertUnique(items, (item) => String(item.id), 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official items');
    assertUnique(materia, (entry) => String(entry.id), 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official materia');
    assertUnique(foods, (food) => String(food.id), 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'official foods');
  } else if (record.kind === 'acquisition') {
    const items = expectArray(payload.items, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'acquisition.payload.items');
    assertUnique(items, (item) => String(item.itemId), 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'acquisition items');
    for (const item of items) {
      if (!SOURCE_FAMILIES.has(item.sourceFamily)) {
        throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, `item ${item.itemId} has unsupported source family ${item.sourceFamily}.`);
      }
      if (item.acquisitionRoutes !== undefined) {
        const routes = expectArray(item.acquisitionRoutes, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `item ${item.itemId}.acquisitionRoutes`);
        assertUnique(routes, (route) => route.id, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, `item ${item.itemId} acquisition routes`);
        for (const route of routes) {
          if (!SOURCE_FAMILIES.has(route.sourceFamily)) {
            throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, `item ${item.itemId} route ${route.id} has unsupported source family ${route.sourceFamily}.`);
          }
        }
      }
    }
  } else {
    const sets = expectArray(payload.sets, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'curated.payload.sets');
    assertUnique(sets, (set) => set.id, 'snapshot builder', PROVIDER_OVERLAY_SCHEMA, 'curated sets');
  }
  return record;
};

export const captureOverlay = async (refresh) => {
  try {
    return { ok: true, overlay: validateProviderOverlay(await refresh()) };
  } catch (error) {
    return { ok: false, error };
  }
};

const previousOverlays = (snapshot) => {
  const generatedAt = snapshot.manifest.generatedAt;
  return {
    official: createProviderOverlay({
      kind: 'official', generatedAt, providers: [{ id: 'xivapi', status: 'current', retrievedAt: generatedAt }],
      payload: {
        items: snapshot.items.map((item) => ({
          ...item,
          sourceFamily: 'other',
          acquisitionNote: 'Acquisition route is supplied by a separate overlay.',
          provenance: item.provenance.filter((entry) => entry.kind !== 'acquisition-overlay')
        })),
        materia: snapshot.materia,
        foods: snapshot.foods,
        contentGraph: snapshot.contentGraph
      }
    }),
    acquisition: createProviderOverlay({
      kind: 'acquisition', generatedAt, providers: [{ id: 'acquisition-data', status: snapshot.manifest.status === 'partial' ? 'partial' : 'current', retrievedAt: generatedAt }],
      payload: { items: snapshot.items.map((item) => ({
        itemId: item.id,
        sourceFamily: item.sourceFamily,
        acquisitionNote: item.acquisitionNote,
        acquisitionRoutes: item.acquisitionRoutes,
        provenance: item.provenance.filter((entry) => entry.kind === 'acquisition-overlay')
      })) }
    }),
    curated: createProviderOverlay({
      kind: 'curated', generatedAt, providers: [{ id: 'curated-data', status: snapshot.manifest.status === 'partial' ? 'partial' : 'current', retrievedAt: generatedAt }],
      payload: { sets: snapshot.curatedSets }
    })
  };
};

const staleFallback = (overlay, message) => ({
  ...overlay,
  status: 'stale',
  providers: overlay.providers.map((provider) => ({ ...provider, status: 'stale', message }))
});

const resolveAttempt = (kind, attempt, previous, essential) => {
  if (attempt?.ok) return attempt.overlay;
  const message = `${kind} refresh failed; retained last-known-good overlay. ${providerFailureMessage(attempt?.error ?? 'No candidate was supplied.')}`;
  if (previous) return staleFallback(previous, message);
  if (essential) throw new ProviderContractError('snapshot builder', PROVIDER_OVERLAY_SCHEMA, message);
  return createProviderOverlay({
    kind,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    providers: [{ id: `${kind}-data`, status: 'failed', message }],
    payload: kind === 'curated' ? { sets: [] } : { items: [] }
  });
};

const assertCuratedReferences = (sets, official) => {
  const itemIds = new Set(official.payload.items.map((item) => String(item.id)));
  const materiaIds = new Set(official.payload.materia.map((entry) => String(entry.id)));
  const foodIds = new Set(official.payload.foods.map((food) => String(food.id)));
  for (const set of sets) {
    for (const equipped of Object.values(set.items ?? {})) {
      if (!itemIds.has(String(equipped.itemId))) throw new Error(`curated set ${set.id} references missing item ${equipped.itemId}`);
      for (const materiaId of equipped.materiaIds ?? []) {
        if (!materiaIds.has(String(materiaId))) throw new Error(`curated set ${set.id} references missing materia ${materiaId}`);
      }
    }
    if (set.foodId !== undefined && !foodIds.has(String(set.foodId))) throw new Error(`curated set ${set.id} references missing food ${set.foodId}`);
  }
};

const worstStatus = (left, right) => STATUS_WEIGHT[left] >= STATUS_WEIGHT[right] ? left : right;
const mergeFreshness = (overlays) => {
  const combined = new Map();
  for (const overlay of overlays) {
    combined.set(`${overlay.kind}-overlay`, {
      id: `${overlay.kind}-overlay`,
      status: overlay.status,
      retrievedAt: overlay.generatedAt,
      ...(overlay.status === 'current' ? {} : { message: `${overlay.kind} overlay is ${overlay.status}.` })
    });
    for (const provider of overlay.providers) {
      const existing = combined.get(provider.id);
      combined.set(provider.id, existing
        ? { ...existing, ...provider, status: worstStatus(existing.status, provider.status) }
        : { ...provider });
    }
  }
  return [...combined.values()];
};

export const publishOverlaySnapshot = ({ previousSnapshot, manifest, attempts }) => {
  const previous = previousSnapshot ? previousOverlays(previousSnapshot) : {};
  const official = resolveAttempt('official', attempts.official, previous.official, true);
  const acquisition = resolveAttempt('acquisition', attempts.acquisition, previous.acquisition, false);
  let curated = resolveAttempt('curated', attempts.curated, previous.curated, false);
  try {
    assertCuratedReferences(curated.payload.sets, official);
  } catch (error) {
    if (curated !== previous.curated && previous.curated) {
      curated = staleFallback(previous.curated, `fresh curated overlay was incompatible with official data: ${providerFailureMessage(error)}`);
      try {
        assertCuratedReferences(curated.payload.sets, official);
      } catch (fallbackError) {
        curated = createProviderOverlay({
          kind: 'curated', generatedAt: manifest.generatedAt, status: 'failed',
          providers: [{ id: 'curated-data', status: 'failed', message: providerFailureMessage(fallbackError) }],
          payload: { sets: [] }
        });
      }
    } else {
      throw error;
    }
  }

  const acquisitionById = new Map(acquisition.payload.items.map((entry) => [String(entry.itemId), entry]));
  const items = official.payload.items.map((item) => {
    const overlay = acquisitionById.get(String(item.id));
    return {
      ...item,
      sourceFamily: overlay?.sourceFamily ?? 'other',
      acquisitionNote: overlay?.acquisitionNote ?? 'Acquisition route is not available in the current overlay.',
      acquisitionRoutes: overlay?.acquisitionRoutes ?? item.acquisitionRoutes,
      provenance: [
        ...item.provenance.filter((entry) => entry.kind !== 'acquisition-overlay'),
        ...(overlay?.provenance ?? [])
      ]
    };
  });
  const providers = mergeFreshness([official, acquisition, curated]);
  const partial = providers.some((provider) => provider.status !== 'current');
  return {
    snapshot: {
      manifest: { ...manifest, status: partial ? 'partial' : 'online-current', providerFreshness: providers },
      items,
      materia: official.payload.materia,
      foods: official.payload.foods,
      contentGraph: official.payload.contentGraph,
      curatedSets: curated.payload.sets
    },
    providers,
    overlays: { official, acquisition, curated }
  };
};
