import type {
  AcquisitionRoute,
  ContentAccessGraph,
  EquipmentItem,
  ExpansionId,
  GameRegistry,
  GearSnapshot,
  Provenance
} from '@xiv-gear-lab/domain';

const expansionForLevel = (registry: GameRegistry, level: number): ExpansionId => {
  const ordered = [...registry.expansions].sort((left, right) => left.levelCap - right.levelCap || left.order - right.order);
  return ordered.find((entry) => level <= entry.levelCap)?.id ?? ordered.at(-1)!.id;
};

const expansionForItemLevel = (registry: GameRegistry, itemLevel: number): ExpansionId => {
  const caps = [
    { maximum: 130, expansionId: 'arr' },
    { maximum: 270, expansionId: 'hw' },
    { maximum: 400, expansionId: 'sb' },
    { maximum: 530, expansionId: 'shb' },
    { maximum: 660, expansionId: 'ew' }
  ];
  const known = caps.find((entry) => itemLevel <= entry.maximum && registry.expansions.some((expansion) => expansion.id === entry.expansionId));
  return known?.expansionId ?? registry.expansions.at(-1)!.id;
};

const derivedProvenance = (snapshot: GearSnapshot): Provenance => ({
  kind: 'calculated',
  provider: 'XIV Gear Lab',
  sourcePatch: snapshot.manifest.gamePatch,
  sourceVersion: 'm11-legacy-catalogue-enrichment@1',
  schemaVersion: 'content-access@1',
  retrievedAt: snapshot.manifest.generatedAt,
  verifiedAt: snapshot.manifest.generatedAt,
  status: 'current'
});

const legacyRoute = (item: EquipmentItem, snapshot: GearSnapshot, expansionId: ExpansionId): AcquisitionRoute => {
  const acquisitionProvenance = item.provenance.filter((entry) => entry.kind === 'acquisition-overlay');
  const status = acquisitionProvenance.length === 0
    ? 'unknown'
    : acquisitionProvenance.every((entry) => entry.status === 'current')
      ? 'validated'
      : 'partial';
  return {
    id: `legacy:${item.id}:${item.sourceFamily}`,
    name: item.acquisitionNote || 'Acquisition route unavailable',
    sourceFamily: item.sourceFamily,
    expansionId,
    minimumLevel: item.level,
    requirements: [],
    costs: [],
    frequency: 'repeatable',
    status,
    note: item.acquisitionNote || 'Acquisition route is not available in the current overlay.',
    provenance: acquisitionProvenance.length > 0 ? acquisitionProvenance : [derivedProvenance(snapshot)]
  };
};

const legacyContentGraph = (snapshot: GearSnapshot): ContentAccessGraph => {
  const provenance = [derivedProvenance(snapshot)];
  const ordered = [...snapshot.registry.expansions].sort((left, right) => left.order - right.order);
  return {
    schemaVersion: 'content-access@1',
    nodes: ordered.map((expansion, index) => ({
      id: `expansion:${expansion.id}`,
      kind: 'expansion',
      name: expansion.name,
      expansionId: expansion.id,
      level: expansion.levelCap,
      prerequisites: index === 0 ? [] : [`expansion:${ordered[index - 1]!.id}`],
      provenance
    }))
  };
};

/**
 * Adds safe M11 metadata to older signed snapshots without inventing routes or
 * costs. Provider-published M11 fields always win over this compatibility layer.
 */
export const enrichLegacyCatalogueMetadata = (snapshot: GearSnapshot): GearSnapshot => ({
  ...snapshot,
  items: snapshot.items.map((item) => {
    const expansionId = item.expansionId ?? item.customData?.expansionId ?? expansionForLevel(snapshot.registry, item.level);
    return {
      ...item,
      expansionId,
      quality: item.quality ?? 'not-applicable',
      acquisitionRoutes: item.acquisitionRoutes ?? [legacyRoute(item, snapshot, expansionId)]
    };
  }),
  materia: snapshot.materia.map((materia) => ({
    ...materia,
    expansionId: materia.expansionId ?? (materia.tier >= 11 ? 'dt' : materia.tier >= 9 ? 'ew' : materia.tier >= 7 ? 'shb' : undefined),
    requiredLevel: materia.requiredLevel ?? (materia.tier >= 11 ? 100 : materia.tier >= 9 ? 90 : materia.tier >= 7 ? 80 : undefined)
  })),
  foods: snapshot.foods.map((food) => ({
    ...food,
    expansionId: food.expansionId ?? expansionForItemLevel(snapshot.registry, food.itemLevel)
  })),
  contentGraph: snapshot.contentGraph ?? legacyContentGraph(snapshot)
});
