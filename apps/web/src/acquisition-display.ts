import type {
  AcquisitionCost,
  AcquisitionLocation,
  AcquisitionRoute,
  EquipmentItem,
  SourceFamily
} from '@xiv-gear-lab/domain';

const icon = (name: string) => `./icons/acquisition/${name}.png`;

const SOURCE_ICONS: Partial<Record<SourceFamily, string>> = {
  crafted: icon('crafted'),
  'normal-raid': icon('raid'),
  savage: icon('raid'),
  tomestone: icon('mnemonics'),
  'tomestone-upgrade': icon('mnemonics'),
  dungeon: icon('dungeon'),
  trial: icon('trial'),
  'alliance-raid': icon('raid'),
  relic: icon('quest'),
  ultimate: icon('ultimate'),
  quest: icon('quest'),
  vendor: icon('mnemonics')
};

const COST_ICONS: Record<string, string> = {
  'Allagan Tomestone of Mnemonics': icon('mnemonics'),
  'Allagan Tomestone of Comedy': icon('comedy'),
  'Allagan Tomestone of Poetics': icon('poetics'),
  'Anabaseios Mythos I': icon('anabaseios-mythos-1'),
  'Anabaseios Mythos II': icon('anabaseios-mythos-2'),
  'Anabaseios Mythos III': icon('anabaseios-mythos-3'),
  'Anabaseios Mythos IV': icon('anabaseios-mythos-4'),
  'Unsung Helm of Anabaseios': icon('unsung-helm-anabaseios'),
  'Unsung Armor of Anabaseios': icon('unsung-armor-anabaseios'),
  'Unsung Gauntlets of Anabaseios': icon('unsung-gauntlets-anabaseios'),
  'Unsung Chausses of Anabaseios': icon('unsung-chausses-anabaseios'),
  'Unsung Greaves of Anabaseios': icon('unsung-greaves-anabaseios'),
  'Unsung Ring of Anabaseios': icon('unsung-ring-anabaseios'),
  'Hermetic Tomestone': icon('hermetic-tomestone'),
  'Divine Solvent': icon('divine-solvent'),
  'Divine Twine': icon('divine-twine'),
  'Divine Shine': icon('divine-shine'),
  'Voidvessel Totem': icon('voidvessel-totem'),
  'Cosmic Crystallite': icon('cosmic-crystallite'),
  'Hannish Certificate of Grade 3 Import': icon('hannish-certificate-grade-3'),
  'Divine Rain': icon('divine-rain'),
  'Omega Totem': icon('omega-totem'),
  'AAC Illustrated: HW Edition I': icon('aac-book-1'),
  'AAC Illustrated: HW Edition II': icon('aac-book-2'),
  'AAC Illustrated: HW Edition III': icon('aac-book-3'),
  'AAC Illustrated: HW Edition IV': icon('aac-book-4'),
  'Heavy Holohelm': icon('heavy-holohelm'),
  'Heavy Holoarmor': icon('heavy-holoarmor'),
  'Heavy Hologauntlets': icon('heavy-hologauntlets'),
  'Heavy Holotrousers': icon('heavy-holotrousers'),
  'Heavy Hologreaves': icon('heavy-hologreaves'),
  'Heavy Holoring': icon('heavy-holoring'),
  'Thundersteeped Solvent': icon('thundersteeped-solvent'),
  'Thundersteeped Twine': icon('thundersteeped-twine'),
  'Thundersteeping Glaze': icon('thundersteeping-glaze'),
  'Universal Tomestone 3.0': icon('universal-tomestone-3'),
  'Totem of Naught': icon('totem-of-naught'),
  "Mad Harlequin's Totem": icon('mad-harlequin-totem'),
  'Runaway Totem': icon('runaway-totem'),
  'Waning Arcanite': icon('waning-arcanite'),
  'Corresponding Phantom Weapon Umbrae': icon('quest'),
  'Everkeep Certificate of Grade 3 Import': icon('everkeep-certificate-grade-3'),
  'Treno Rain': icon('treno-rain')
};

export const acquisitionSourceIconUrl = (source: SourceFamily): string | undefined => SOURCE_ICONS[source];

export const acquisitionCostIconUrl = (cost: AcquisitionCost): string | undefined => COST_ICONS[cost.name];

export const fixedAcquisitionCosts = (item: EquipmentItem): AcquisitionCost[] => {
  const costs = (item.acquisitionRoutes ?? [])
    .filter((route) => route.status !== 'unknown')
    .flatMap((route) => route.costs)
    .filter((cost) => cost.valuation === 'fixed' && cost.amount !== undefined);
  return [...new Map(costs.map((cost) => [
    `${cost.kind}:${cost.name}:${cost.amount}:${cost.sharedGroupId ?? ''}`,
    cost
  ])).values()];
};

const uniqueCosts = (costs: AcquisitionCost[]): AcquisitionCost[] => [...new Map(costs.map((cost) => [
  `${cost.kind}:${cost.name}:${cost.amount}:${cost.sharedGroupId ?? ''}`,
  cost
])).values()];

const expandEquipmentCosts = (
  costs: AcquisitionCost[],
  catalogue: EquipmentItem[]
): AcquisitionCost[] => uniqueCosts(costs.flatMap((cost) => {
  if (cost.kind !== 'item') return [cost];
  const prerequisite = catalogue.find((candidate) => candidate.name === cost.name);
  if (!prerequisite) return [cost];
  const prerequisiteCosts = fixedAcquisitionCosts(prerequisite);
  if (prerequisiteCosts.length === 0) return [cost];
  const quantity = cost.amount ?? 1;
  return prerequisiteCosts.map((prerequisiteCost) => ({
    ...prerequisiteCost,
    amount: prerequisiteCost.amount === undefined ? undefined : prerequisiteCost.amount * quantity,
    sharedGroupId: cost.sharedGroupId ?? prerequisiteCost.sharedGroupId
  }));
}));

/** Replaces a required equipment item with the fixed costs needed to buy that prerequisite. */
export const displayAcquisitionCosts = (
  item: EquipmentItem,
  catalogue: EquipmentItem[]
): AcquisitionCost[] => expandEquipmentCosts(fixedAcquisitionCosts(item), catalogue);

export const displayRouteCosts = (
  route: AcquisitionRoute,
  catalogue: EquipmentItem[]
): AcquisitionCost[] => expandEquipmentCosts(
  route.costs.filter((cost) => cost.valuation === 'fixed' && cost.amount !== undefined),
  catalogue
);

export interface AcquisitionRouteGroup {
  key: string;
  routes: AcquisitionRoute[];
}

/** Keeps alternate routes from the same duty or vendor under one compact heading. */
export const groupAcquisitionRoutes = (routes: AcquisitionRoute[]): AcquisitionRouteGroup[] => {
  const groups = new Map<string, AcquisitionRoute[]>();
  for (const route of routes) {
    const location = route.location;
    const key = location
      ? [location.kind, location.name, location.area ?? '', location.x ?? '', location.y ?? ''].join(':')
      : `route:${route.id}`;
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  return [...groups].map(([key, groupedRoutes]) => ({ key, routes: groupedRoutes }));
};

export const acquisitionLocationLabel = (location?: AcquisitionLocation): string | undefined => {
  if (!location) return undefined;
  const area = location.area ? `, ${location.area}` : '';
  const coordinates = location.x !== undefined && location.y !== undefined
    ? ` (X:${location.x.toFixed(1)} Y:${location.y.toFixed(1)})`
    : '';
  return `${location.name}${area}${coordinates}`;
};
