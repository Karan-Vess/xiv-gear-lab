export const ACQUISITION_OVERLAY_SCHEMA = 'acquisition-route@2';

const PATCH_NOTES_URL = 'https://na.finalfantasyxiv.com/lodestone/topics/detail/597d1b99656a1a0d3ba6501a48d43ec46c667068';
const PATCH_75_NOTES_URL = 'https://na.finalfantasyxiv.com/lodestone/topics/detail/07320affa7e0fcd9685afcbe54fbf55405b6d822/';
const PATCH_741_NOTES_URL = 'https://na.finalfantasyxiv.com/lodestone/topics/detail/0de7befbbcefe67d1af77dcbe1bae937b916b67e/';
const HEAVYWEIGHT_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/AAC_Heavyweight_Tier_(Savage)';
const HEAVYWEIGHT_NORMAL_REFERENCE_URL = 'https://na.finalfantasyxiv.com/lodestone/topics/detail/06944d892fd98cc00b2a28ff77edbafa4f7eef54';
const CLYTEUM_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/The_Clyteum';
const RUNAWAY_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Runaway_Weapons';
const PHANTOM_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Phantom_Weapons';
const AUGMENTED_COURTLY_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Eirene/Purchase_Augmented_Courtly_Lover%27s_Equipment_(IL_770_%E2%86%92_780)';
const UNMAKING_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/The_Unmaking_(Extreme)';
const PALAZZO_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Palazzo_Diamond_Weapons';
const ZIRCON_REFERENCE_URL = 'https://na.finalfantasyxiv.com/lodestone/playguide/db/shop/b91d302c07d/';
const THEONE_REFERENCE_URL = 'https://na.finalfantasyxiv.com/lodestone/playguide/db/shop/093fab6cd23/';
const ENDWALKER_GEAR_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Level_90_Gear_Guide';
const ANABASEIOS_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Pand%C3%A6monium:_Anabaseios';
const ANABASEIOS_SAVAGE_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Pand%C3%A6monium:_Anabaseios_(Savage)';
const LUNAR_SUBTERRANE_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/The_Lunar_Subterrane';
const THALEIA_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Thaleia';
const ABYSSAL_FRACTURE_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/The_Abyssal_Fracture_(Extreme)';
const OMEGA_PROTOCOL_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/The_Omega_Protocol_(Ultimate)';
const MANDERVILLE_WEAPONS_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Manderville_Weapons';
const SHADOWBRINGERS_GEAR_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Level_80_Gear_Guide';
const STORMBLOOD_GEAR_REFERENCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Level_70_Gear_Guide';

const patchForSource = (sourceUrl) => {
  if ([ENDWALKER_GEAR_REFERENCE_URL, ANABASEIOS_REFERENCE_URL, ANABASEIOS_SAVAGE_REFERENCE_URL].includes(sourceUrl)) return '6.4';
  if ([LUNAR_SUBTERRANE_REFERENCE_URL, THALEIA_REFERENCE_URL, ABYSSAL_FRACTURE_REFERENCE_URL].includes(sourceUrl)) return '6.5';
  if (sourceUrl === OMEGA_PROTOCOL_REFERENCE_URL) return '6.31';
  if (sourceUrl === MANDERVILLE_WEAPONS_REFERENCE_URL) return '6.55';
  if (sourceUrl === SHADOWBRINGERS_GEAR_REFERENCE_URL) return '5.5';
  if (sourceUrl === STORMBLOOD_GEAR_REFERENCE_URL) return '4.5';
  if (sourceUrl === PATCH_741_NOTES_URL || sourceUrl === PHANTOM_REFERENCE_URL) return '7.41';
  if (sourceUrl === PATCH_75_NOTES_URL || sourceUrl === UNMAKING_REFERENCE_URL || sourceUrl === CLYTEUM_REFERENCE_URL || sourceUrl === AUGMENTED_COURTLY_REFERENCE_URL) return '7.5';
  if (sourceUrl === PALAZZO_REFERENCE_URL) return '7.51';
  return '7.4';
};

const provenance = (generatedAt, status = 'current', sourceUrl = PATCH_NOTES_URL) => ({
  kind: 'acquisition-overlay',
  provider: sourceUrl.includes('finalfantasyxiv.com') ? 'Square Enix Lodestone' : 'FFXIV Community Wiki',
  sourceUrl,
  sourcePatch: patchForSource(sourceUrl),
  sourceVersion: 'combat-acquisition-routes@7',
  schemaVersion: ACQUISITION_OVERLAY_SCHEMA,
  retrievedAt: generatedAt,
  ...(status === 'current' ? { verifiedAt: generatedAt } : {}),
  status: status === 'unknown' ? 'unverified' : status
});

const route = ({ id, name, sourceFamily, status, location, note, requirements = [], costs = [], frequency = 'repeatable', generatedAt, sourceUrl, expansionId = 'dt', minimumLevel = 100 }) => ({
  id,
  name,
  sourceFamily,
  expansionId,
  minimumLevel,
  requirements,
  costs,
  frequency,
  status: status === 'current' ? 'validated' : status,
  ...(location ? { location } : {}),
  note,
  provenance: [provenance(generatedAt, status, sourceUrl)]
});

const tomestoneCostForSlot = (slot) => {
  if (slot === 'weapon' || slot === 'offHand') return 500;
  if (slot === 'body' || slot === 'legs') return 825;
  if (slot === 'head' || slot === 'hands' || slot === 'feet') return 495;
  return 375;
};

const upgradeMaterialForSlot = (slot) => {
  if (slot === 'weapon' || slot === 'offHand') return 'Thundersteeped Solvent';
  if (slot === 'ears' || slot === 'neck' || slot === 'wrists' || slot === 'ring') return 'Thundersteeping Glaze';
  return 'Thundersteeped Twine';
};

const fixedItemCost = (name, amount, itemId, frequency = 'one-time', sharedGroupId) => ({
  kind: 'item',
  name,
  amount,
  itemId,
  frequency,
  valuation: 'fixed',
  ...(sharedGroupId ? { sharedGroupId } : {})
});

const SAVAGE_SLOT_DATA = {
  weapon: { duty: 'AAC Heavyweight M4 (Savage)', book: 'AAC Illustrated: HW Edition IV', amount: 8, itemId: 49763 },
  offHand: { duty: 'AAC Heavyweight M4 (Savage)', book: 'AAC Illustrated: HW Edition IV', amount: 3, itemId: 49763 },
  head: { duty: 'AAC Heavyweight M2 (Savage)', book: 'AAC Illustrated: HW Edition II', amount: 4, itemId: 49761 },
  body: { duty: 'AAC Heavyweight M3 (Savage)', book: 'AAC Illustrated: HW Edition III', amount: 6, itemId: 49762 },
  hands: { duty: 'AAC Heavyweight M2 (Savage)', book: 'AAC Illustrated: HW Edition II', amount: 4, itemId: 49761 },
  legs: { duty: 'AAC Heavyweight M3 (Savage)', book: 'AAC Illustrated: HW Edition III', amount: 6, itemId: 49762 },
  feet: { duty: 'AAC Heavyweight M2 (Savage)', book: 'AAC Illustrated: HW Edition II', amount: 4, itemId: 49761 },
  ears: { duty: 'AAC Heavyweight M1 (Savage)', book: 'AAC Illustrated: HW Edition I', amount: 3, itemId: 49760 },
  neck: { duty: 'AAC Heavyweight M1 (Savage)', book: 'AAC Illustrated: HW Edition I', amount: 3, itemId: 49760 },
  wrists: { duty: 'AAC Heavyweight M1 (Savage)', book: 'AAC Illustrated: HW Edition I', amount: 3, itemId: 49760 },
  ring: { duty: 'AAC Heavyweight M1 (Savage)', book: 'AAC Illustrated: HW Edition I', amount: 3, itemId: 49760 }
};

const NORMAL_RAID_SLOT_DATA = {
  head: { token: 'Heavy Holohelm', amount: 2, itemId: 49749 },
  body: { token: 'Heavy Holoarmor', amount: 4, itemId: 49750 },
  hands: { token: 'Heavy Hologauntlets', amount: 2, itemId: 49751 },
  legs: { token: 'Heavy Holotrousers', amount: 4, itemId: 49752 },
  feet: { token: 'Heavy Hologreaves', amount: 2, itemId: 49753 },
  ears: { token: 'Heavy Holoring', amount: 1, itemId: 49754 },
  neck: { token: 'Heavy Holoring', amount: 1, itemId: 49754 },
  wrists: { token: 'Heavy Holoring', amount: 1, itemId: 49754 },
  ring: { token: 'Heavy Holoring', amount: 1, itemId: 49754 }
};

const ENDWALKER_SAVAGE_SLOT_DATA = {
  weapon: { duty: 'Anabaseios: The Twelfth Circle (Savage)', book: 'Anabaseios Mythos IV', amount: 8, itemId: 40306 },
  offHand: { duty: 'Anabaseios: The Twelfth Circle (Savage)', book: 'Anabaseios Mythos IV', amount: 3, itemId: 40306 },
  head: { duty: 'Anabaseios: The Tenth Circle (Savage)', book: 'Anabaseios Mythos II', amount: 4, itemId: 40304 },
  body: { duty: 'Anabaseios: The Eleventh Circle (Savage)', book: 'Anabaseios Mythos III', amount: 6, itemId: 40305 },
  hands: { duty: 'Anabaseios: The Tenth Circle (Savage)', book: 'Anabaseios Mythos II', amount: 4, itemId: 40304 },
  legs: { duty: 'Anabaseios: The Eleventh Circle (Savage)', book: 'Anabaseios Mythos III', amount: 6, itemId: 40305 },
  feet: { duty: 'Anabaseios: The Tenth Circle (Savage)', book: 'Anabaseios Mythos II', amount: 4, itemId: 40304 },
  ears: { duty: 'Anabaseios: The Ninth Circle (Savage)', book: 'Anabaseios Mythos I', amount: 3, itemId: 40303 },
  neck: { duty: 'Anabaseios: The Ninth Circle (Savage)', book: 'Anabaseios Mythos I', amount: 3, itemId: 40303 },
  wrists: { duty: 'Anabaseios: The Ninth Circle (Savage)', book: 'Anabaseios Mythos I', amount: 3, itemId: 40303 },
  ring: { duty: 'Anabaseios: The Ninth Circle (Savage)', book: 'Anabaseios Mythos I', amount: 3, itemId: 40303 }
};

const ENDWALKER_NORMAL_RAID_SLOT_DATA = {
  head: { token: 'Unsung Helm of Anabaseios', amount: 2, itemId: 40297 },
  body: { token: 'Unsung Armor of Anabaseios', amount: 4, itemId: 40298 },
  hands: { token: 'Unsung Gauntlets of Anabaseios', amount: 2, itemId: 40299 },
  legs: { token: 'Unsung Chausses of Anabaseios', amount: 4, itemId: 40300 },
  feet: { token: 'Unsung Greaves of Anabaseios', amount: 2, itemId: 40301 },
  ears: { token: 'Unsung Ring of Anabaseios', amount: 1, itemId: 40302 },
  neck: { token: 'Unsung Ring of Anabaseios', amount: 1, itemId: 40302 },
  wrists: { token: 'Unsung Ring of Anabaseios', amount: 1, itemId: 40302 },
  ring: { token: 'Unsung Ring of Anabaseios', amount: 1, itemId: 40302 }
};

const endwalkerUpgradeMaterialForSlot = (slot) => {
  if (slot === 'weapon' || slot === 'offHand') return { name: 'Divine Solvent', itemId: 40318 };
  if (slot === 'ears' || slot === 'neck' || slot === 'wrists' || slot === 'ring') return { name: 'Divine Shine', itemId: 40320 };
  return { name: 'Divine Twine', itemId: 40319 };
};

const augmentedCourtlyCosts = (item) => {
  const amounts = item.slot === 'weapon'
    ? (item.jobs.includes('PLD') ? [10, 4] : [17, 7])
    : item.slot === 'offHand'
      ? [7, 3]
      : item.slot === 'body' || item.slot === 'legs'
        ? [17, 5]
        : item.slot === 'head' || item.slot === 'hands' || item.slot === 'feet'
          ? [11, 3]
          : [7, 2];
  return [
    fixedItemCost('Everkeep Certificate of Grade 3 Import', amounts[0], 51188),
    fixedItemCost('Treno Rain', amounts[1], 51187)
  ];
};

const isRunawayWeapon = (item) => item.id >= 49482 && item.id <= 49503;
const isPhantomObscurumWeapon = (item) => item.id >= 50032 && item.id <= 50053;

const weaponBundleId = (item) => item.jobs.includes('PLD') && (item.slot === 'weapon' || item.slot === 'offHand')
  ? 'bygone-brass-paladin-weapon-bundle'
  : undefined;

const acquisitionForItem = (item, generatedAt) => {
  const endwalkerRoute = (details) => route({ ...details, expansionId: 'ew', minimumLevel: 90 });
  const shadowbringersRoute = (details) => route({ ...details, expansionId: 'shb', minimumLevel: 80 });
  const stormbloodRoute = (details) => route({ ...details, expansionId: 'sb', minimumLevel: 70 });
  if (item.name.startsWith('Mandervillous')) {
    const sharedGroupId = item.jobs.includes('PLD') ? 'mandervillous-paladin-arms' : undefined;
    return {
      sourceFamily: 'relic',
      acquisitionNote: 'Upgrade the corresponding Majestic Manderville weapon with three Cosmic Crystallites purchased for 1,500 Allagan Tomestones of Poetics.',
      routes: [endwalkerRoute({
        id: `relic-mandervillous-upgrade:${item.id}`,
        name: 'Mandervillous weapon upgrade',
        sourceFamily: 'relic',
        status: 'current',
        location: { kind: 'quest', name: 'Gentlemen at Heart', area: 'Radz-at-Han', x: 12.0, y: 7.1 },
        note: 'Trade the corresponding Majestic Manderville weapon and three Cosmic Crystallites. Jubrunnah sells each crystallite for 500 Allagan Tomestones of Poetics.',
        requirements: [{ kind: 'content', contentId: 'quest:mandervillous-weapons', description: 'Complete the Manderville weapon quests through Gentlemen at Heart.' }],
        costs: [
          fixedItemCost('Corresponding Majestic Manderville weapon', 1, undefined, 'one-time', sharedGroupId),
          fixedItemCost('Cosmic Crystallite', 3, 41032, 'one-time', sharedGroupId),
          {
            kind: 'currency', name: 'Allagan Tomestone of Poetics', amount: 1500, currencyId: 'currency:poetics',
            frequency: 'one-time', valuation: 'fixed', ...(sharedGroupId ? { sharedGroupId } : {})
          }
        ],
        frequency: 'one-time',
        generatedAt,
        sourceUrl: MANDERVILLE_WEAPONS_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Voidmoon')) {
    return {
      sourceFamily: 'dungeon',
      acquisitionNote: 'Equipment drop from the level 90 dungeon The Lunar Subterrane.',
      routes: [endwalkerRoute({
        id: `dungeon-lunar-subterrane-drop:${item.id}`,
        name: 'The Lunar Subterrane equipment drop',
        sourceFamily: 'dungeon',
        status: 'current',
        location: { kind: 'duty', name: 'The Lunar Subterrane' },
        note: 'Obtained from a treasure coffer in The Lunar Subterrane.',
        requirements: [{ kind: 'content', contentId: 'duty:lunar-subterrane', description: 'Unlock and complete The Lunar Subterrane.' }],
        generatedAt,
        sourceUrl: LUNAR_SUBTERRANE_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Augmented Diadochos')) {
    const amounts = item.slot === 'weapon'
      ? (item.jobs.includes('PLD') ? [10, 4] : [17, 7])
      : item.slot === 'offHand' ? [7, 3]
        : item.slot === 'body' || item.slot === 'legs' ? [17, 5]
          : item.slot === 'head' || item.slot === 'hands' || item.slot === 'feet' ? [11, 3] : [7, 2];
    return {
      sourceFamily: 'crafted',
      acquisitionNote: 'Exchange grade 3 import certificates and Divine Rain for upgraded Diadochos equipment.',
      routes: [endwalkerRoute({
        id: `crafted-diadochos-augmentation:${item.id}`,
        name: 'Diadochos equipment augmentation',
        sourceFamily: 'crafted',
        status: 'current',
        location: { kind: 'vendor', name: 'Rashti', area: 'Radz-at-Han', x: 10.8, y: 9.9 },
        note: 'Exchange the required Hannish certificates and Divine Rain with Rashti.',
        requirements: [{ kind: 'content', contentId: 'vendor:rashti-grade-3', description: 'Unlock the grade 3 equipment exchange in Radz-at-Han.' }],
        costs: [
          fixedItemCost('Hannish Certificate of Grade 3 Import', amounts[0], 40896),
          fixedItemCost('Divine Rain', amounts[1], 40895)
        ],
        generatedAt,
        sourceUrl: ENDWALKER_GEAR_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Diadochos')) {
    return {
      sourceFamily: 'crafted',
      acquisitionNote: 'Crafted as high quality equipment or purchased from the market board.',
      routes: [endwalkerRoute({
        id: `crafted-diadochos-hq:${item.id}`,
        name: 'High quality Diadochos crafting recipe',
        sourceFamily: 'crafted',
        status: 'current',
        location: { kind: 'recipe', name: 'Diadochos crafting recipe' },
        note: 'Craft as a high quality item with the applicable Master Recipe X, or purchase the high quality item from another player.',
        requirements: [{ kind: 'content', contentId: 'recipe:diadochos', description: 'Use the applicable level 90 Master Recipe X or acquire the high quality item from another player.' }],
        costs: [{ kind: 'variable', name: 'Crafting materials or market-board price', frequency: 'variable', valuation: 'user-defined' }],
        generatedAt,
        sourceUrl: ENDWALKER_GEAR_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Anabaseios')) {
    const normalRaid = ENDWALKER_NORMAL_RAID_SLOT_DATA[item.slot];
    if (!normalRaid) throw new Error(`No Endwalker normal-raid acquisition mapping exists for slot ${item.slot}.`);
    return {
      sourceFamily: 'normal-raid',
      acquisitionNote: 'Exchange Anabaseios normal-raid tokens for equipment.',
      routes: [endwalkerRoute({
        id: `normal-anabaseios-exchange:${item.id}`,
        name: `${normalRaid.token} exchange`,
        sourceFamily: 'normal-raid',
        status: 'current',
        location: { kind: 'vendor', name: 'Djole', area: 'Radz-at-Han', x: 10.3, y: 9.6 },
        note: `Exchange ${normalRaid.amount} ${normalRaid.token} with Djole.`,
        requirements: [{ kind: 'content', contentId: 'duty:anabaseios-normal', description: 'Unlock Pandæmonium: Anabaseios.' }],
        costs: [fixedItemCost(normalRaid.token, normalRaid.amount, normalRaid.itemId, 'weekly')],
        frequency: 'weekly',
        generatedAt,
        sourceUrl: ANABASEIOS_REFERENCE_URL
      })]
    };
  }
  if (item.name.includes('Ascension')) {
    const savage = ENDWALKER_SAVAGE_SLOT_DATA[item.slot];
    if (!savage) throw new Error(`No Endwalker Savage acquisition mapping exists for slot ${item.slot}.`);
    const amount = item.slot === 'weapon' && item.jobs.includes('PLD') ? 5 : savage.amount;
    const bundle = item.jobs.includes('PLD') && (item.slot === 'weapon' || item.slot === 'offHand') ? 'ascension-paladin-arms' : undefined;
    return {
      sourceFamily: 'savage',
      acquisitionNote: 'Anabaseios Savage coffer drop or Mythos exchange.',
      routes: [
        endwalkerRoute({
          id: `savage-anabaseios-coffer:${item.id}`,
          name: `${savage.duty} equipment coffer`,
          sourceFamily: 'savage',
          status: 'current',
          location: { kind: 'duty', name: savage.duty },
          note: `Obtained from the matching Ascension equipment coffer in ${savage.duty}.`,
          requirements: [{ kind: 'content', contentId: 'duty:anabaseios-savage', description: 'Clear the applicable Anabaseios Savage encounter.' }],
          frequency: 'weekly',
          generatedAt,
          sourceUrl: ANABASEIOS_SAVAGE_REFERENCE_URL
        }),
        endwalkerRoute({
          id: `savage-anabaseios-book:${item.id}`,
          name: `${savage.book} exchange`,
          sourceFamily: 'savage',
          status: 'current',
          location: { kind: 'vendor', name: 'Djole', area: 'Radz-at-Han', x: 10.3, y: 9.6 },
          note: `Exchange ${amount} ${savage.book} with Djole.`,
          requirements: [{ kind: 'content', contentId: 'duty:anabaseios-savage', description: 'Clear the applicable Anabaseios Savage encounter.' }],
          costs: [fixedItemCost(savage.book, amount, savage.itemId, 'weekly', bundle)],
          frequency: 'weekly',
          generatedAt,
          sourceUrl: ANABASEIOS_SAVAGE_REFERENCE_URL
        })
      ]
    };
  }
  if (item.name.startsWith('Augmented Credendum')) {
    const baseItemName = item.name.replace(/^Augmented /, '');
    const material = endwalkerUpgradeMaterialForSlot(item.slot);
    const bundle = item.jobs.includes('PLD') && (item.slot === 'weapon' || item.slot === 'offHand') ? 'credendum-paladin-arms' : undefined;
    return {
      sourceFamily: 'tomestone-upgrade',
      acquisitionNote: `Upgrade ${baseItemName} with one ${material.name}.`,
      routes: [endwalkerRoute({
        id: `tomestone-credendum-upgrade:${item.id}`,
        name: 'Credendum tomestone upgrade',
        sourceFamily: 'tomestone-upgrade',
        status: 'current',
        location: { kind: 'vendor', name: 'Khaldeen', area: 'Radz-at-Han', x: 10.9, y: 10.4 },
        note: `Exchange ${baseItemName} and one ${material.name} with Khaldeen.`,
        requirements: [{ kind: 'content', contentId: 'vendor:khaldeen', description: 'Unlock Credendum augmentation in Radz-at-Han.' }],
        costs: [
          { kind: 'item', name: baseItemName, amount: 1, frequency: 'one-time', valuation: 'fixed', ...(bundle ? { sharedGroupId: bundle } : {}) },
          fixedItemCost(material.name, 1, material.itemId, 'weekly', bundle)
        ],
        generatedAt,
        sourceUrl: ENDWALKER_GEAR_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Credendum')) {
    const bundle = item.jobs.includes('PLD') && (item.slot === 'weapon' || item.slot === 'offHand') ? 'credendum-paladin-arms' : undefined;
    const costs = [{
      kind: 'currency', name: 'Allagan Tomestone of Comedy', amount: tomestoneCostForSlot(item.slot), currencyId: 'currency:comedy',
      frequency: 'weekly', valuation: 'fixed', ...(bundle ? { sharedGroupId: bundle } : {})
    }];
    if (item.slot === 'weapon' || item.slot === 'offHand') costs.push(fixedItemCost('Hermetic Tomestone', 1, 40321, 'weekly', bundle));
    return {
      sourceFamily: 'tomestone',
      acquisitionNote: 'Purchased with Allagan Tomestones of Comedy during Endwalker.',
      routes: [endwalkerRoute({
        id: `comedy-vendor:${item.id}`,
        name: 'Cihanti tomestone exchange',
        sourceFamily: 'tomestone',
        status: 'current',
        location: { kind: 'vendor', name: 'Cihanti', area: 'Radz-at-Han', x: 10.8, y: 10.3 },
        note: 'Historical Endwalker purchase from Cihanti with Allagan Tomestones of Comedy.',
        requirements: [{ kind: 'content', contentId: 'vendor:cihanti', description: 'Complete Endwalker and unlock Cihanti.' }],
        costs,
        generatedAt,
        sourceUrl: ENDWALKER_GEAR_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Theogonic')) {
    return {
      sourceFamily: 'alliance-raid',
      acquisitionNote: 'Treasure reward from Thaleia.',
      routes: [endwalkerRoute({
        id: `alliance-thaleia-drop:${item.id}`,
        name: 'Thaleia treasure reward',
        sourceFamily: 'alliance-raid',
        status: 'current',
        location: { kind: 'duty', name: 'Thaleia' },
        note: 'Obtained from a party treasure chest in Thaleia.',
        requirements: [{ kind: 'content', contentId: 'duty:thaleia', description: 'Unlock and complete Thaleia.' }],
        frequency: 'weekly',
        generatedAt,
        sourceUrl: THALEIA_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Voidvessel')) {
    const bundle = item.jobs.includes('PLD') ? 'voidvessel-paladin-arms' : undefined;
    return {
      sourceFamily: 'trial',
      acquisitionNote: 'Weapon drop or Voidvessel Totem exchange from The Abyssal Fracture (Extreme).',
      routes: [
        endwalkerRoute({
          id: `trial-abyssal-fracture-drop:${item.id}`,
          name: 'The Abyssal Fracture (Extreme) weapon drop',
          sourceFamily: 'trial', status: 'current', location: { kind: 'duty', name: 'The Abyssal Fracture (Extreme)' },
          note: 'Obtained from the duty treasure coffer.',
          requirements: [{ kind: 'content', contentId: 'duty:abyssal-fracture-extreme', description: 'Unlock and complete The Abyssal Fracture (Extreme).' }],
          generatedAt, sourceUrl: ABYSSAL_FRACTURE_REFERENCE_URL
        }),
        endwalkerRoute({
          id: `trial-voidvessel-exchange:${item.id}`,
          name: 'Voidvessel Totem exchange', sourceFamily: 'trial', status: 'current',
          location: { kind: 'vendor', name: 'Nesvaaz', area: 'Radz-at-Han', x: 10.6, y: 10.0 },
          note: 'Exchange ten Voidvessel Totems with Nesvaaz.',
          requirements: [{ kind: 'content', contentId: 'vendor:nesvaaz', description: 'Unlock the Endwalker Totem Gear exchange.' }],
          costs: [fixedItemCost('Voidvessel Totem', 10, 41053, 'repeatable', bundle)],
          generatedAt, sourceUrl: ABYSSAL_FRACTURE_REFERENCE_URL
        })
      ]
    };
  }
  if (item.name.startsWith('Ultimate Omega')) {
    const bundle = item.jobs.includes('PLD') ? 'ultimate-omega-paladin-arms' : undefined;
    return {
      sourceFamily: 'ultimate',
      acquisitionNote: 'Omega Totem exchange from The Omega Protocol (Ultimate).',
      routes: [endwalkerRoute({
        id: `ultimate-omega-exchange:${item.id}`,
        name: 'Omega Totem exchange', sourceFamily: 'ultimate', status: 'current',
        location: { kind: 'vendor', name: 'Nesvaaz', area: 'Radz-at-Han', x: 10.6, y: 10.0 },
        note: 'Exchange one Omega Totem with Nesvaaz.',
        requirements: [{ kind: 'content', contentId: 'duty:omega-protocol-ultimate', description: 'Complete The Omega Protocol (Ultimate).' }],
        costs: [fixedItemCost('Omega Totem', 1, 38951, 'weekly', bundle)],
        frequency: 'weekly', generatedAt, sourceUrl: OMEGA_PROTOCOL_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Praemagitek')) {
    return {
      sourceFamily: 'dungeon',
      acquisitionNote: 'Equipment drop from the level 100 dungeon The Clyteum.',
      routes: [route({
        id: `dungeon-clyteum-drop:${item.id}`,
        name: 'The Clyteum equipment drop',
        sourceFamily: 'dungeon',
        status: 'current',
        location: { kind: 'duty', name: 'The Clyteum' },
        note: 'Obtained from a treasure coffer in The Clyteum.',
        requirements: [{ kind: 'content', contentId: 'duty:the-clyteum', description: 'Unlock and complete The Clyteum.' }],
        generatedAt,
        sourceUrl: CLYTEUM_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Augmented Courtly Lover\'s')) {
    return {
      sourceFamily: 'crafted',
      acquisitionNote: 'Exchange grade 3 import certificates and Treno Rain for upgraded crafted equipment.',
      routes: [route({
        id: `crafted-courtly-augmentation:${item.id}`,
        name: 'Courtly Lover equipment augmentation',
        sourceFamily: 'crafted',
        status: 'current',
        location: { kind: 'vendor', name: 'Eirene', area: 'Solution Nine', x: 8.1, y: 14.0 },
        note: 'Exchange the required grade 3 import certificates and Treno Rain with Eirene.',
        requirements: [{ kind: 'content', contentId: 'vendor:eirene-grade-3', description: 'Complete Dawntrail and unlock Eirene\'s grade 3 exchange.' }],
        costs: augmentedCourtlyCosts(item),
        generatedAt,
        sourceUrl: AUGMENTED_COURTLY_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith('Courtly Lover\'s')) {
    return {
      sourceFamily: 'crafted',
      acquisitionNote: 'Crafted as high quality equipment or purchased from the market board.',
      routes: [route({
        id: `crafted-courtly-hq:${item.id}`,
        name: 'High quality Courtly Lover crafting recipe',
        sourceFamily: 'crafted',
        status: 'current',
        location: { kind: 'recipe', name: 'Courtly Lover crafting recipe' },
        note: 'Craft as a high quality item with the applicable level 100 Master Recipe XII, or purchase the high quality item from another player.',
        requirements: [{ kind: 'content', contentId: 'recipe:courtly-lover', description: 'Use the applicable level 100 Master Recipe XII or acquire the high quality item from another player.' }],
        costs: [{ kind: 'variable', name: 'Crafting materials or market-board price', frequency: 'variable', valuation: 'user-defined' }],
        generatedAt,
        sourceUrl: PATCH_NOTES_URL
      })]
    };
  }
  if (item.name.startsWith('Heavyweight')) {
    const normalRaid = NORMAL_RAID_SLOT_DATA[item.slot];
    if (!normalRaid) throw new Error(`No normal-raid acquisition mapping exists for slot ${item.slot}.`);
    return {
      sourceFamily: 'normal-raid',
      acquisitionNote: 'Exchange weekly AAC Heavyweight normal-raid tokens with Hhihwi.',
      routes: [route({
        id: `normal-heavyweight-exchange:${item.id}`,
        name: `${normalRaid.token} exchange`,
        sourceFamily: 'normal-raid',
        status: 'current',
        location: { kind: 'vendor', name: 'Hhihwi', area: 'Solution Nine', x: 8.7, y: 13.4 },
        note: `Exchange ${normalRaid.amount} ${normalRaid.token} with Hhihwi. Tokens are weekly rewards from AAC Heavyweight Tier.`,
        requirements: [
          { kind: 'content', contentId: 'duty:aac-heavyweight-normal', description: 'Unlock and complete the applicable AAC Heavyweight normal encounter.' },
          { kind: 'content', contentId: 'vendor:hhihwi', description: 'Unlock Hhihwi in Solution Nine.' }
        ],
        costs: [fixedItemCost(normalRaid.token, normalRaid.amount, normalRaid.itemId, 'weekly')],
        frequency: 'weekly',
        generatedAt,
        sourceUrl: HEAVYWEIGHT_NORMAL_REFERENCE_URL
      })]
    };
  }
  if (isRunawayWeapon(item)) {
    const sharedGroupId = item.jobs.includes('PLD') ? 'runaway-paladin-arms' : undefined;
    return {
      sourceFamily: 'trial',
      acquisitionNote: 'Weapon drop or Runaway Totem exchange from Hell on Rails (Extreme).',
      routes: [
        route({
          id: `trial-runaway-drop:${item.id}`,
          name: 'Hell on Rails (Extreme) weapon drop',
          sourceFamily: 'trial',
          status: 'current',
          location: { kind: 'duty', name: 'Hell on Rails (Extreme)' },
          note: 'Obtained from the duty treasure coffer.',
          requirements: [{ kind: 'content', contentId: 'duty:hell-on-rails-extreme', description: 'Unlock and complete Hell on Rails (Extreme).' }],
          generatedAt,
          sourceUrl: RUNAWAY_REFERENCE_URL
        }),
        route({
          id: `trial-runaway-exchange:${item.id}`,
          name: 'Runaway Totem exchange',
          sourceFamily: 'trial',
          status: 'current',
          location: { kind: 'vendor', name: "Uah'shepya", area: 'Solution Nine', x: 8.7, y: 13.5 },
          note: "Exchange ten Runaway Totems with Uah'shepya.",
          requirements: [{ kind: 'content', contentId: 'vendor:uahshepya', description: "Unlock Uah'shepya's Totem Gear exchange." }],
          costs: [fixedItemCost('Runaway Totem', 10, 49748, 'repeatable', sharedGroupId)],
          generatedAt,
          sourceUrl: RUNAWAY_REFERENCE_URL
        })
      ]
    };
  }
  if (isPhantomObscurumWeapon(item)) {
    const sharedGroupId = item.jobs.includes('PLD') ? 'phantom-obscurum-paladin-arms' : undefined;
    const priorWeaponName = 'Corresponding Phantom Weapon Umbrae';
    return {
      sourceFamily: 'relic',
      acquisitionNote: 'Complete the Phantom Weapon Obscurum quest chain; repeat weapons use the prior Umbrae weapon and Waning Arcanite.',
      routes: [
        route({
          id: `relic-phantom-obscurum-quest:${item.id}`,
          name: 'A Phantom Reborn quest reward',
          sourceFamily: 'relic',
          status: 'partial',
          location: { kind: 'quest', name: 'A Phantom Reborn', area: 'Phantom Village' },
          note: 'The first Obscurum weapon requires the versioned multi-step relic quest and its one-time materials; the full one-time cost overlay remains partial.',
          requirements: [{ kind: 'content', contentId: 'quest:phantom-obscurum', description: 'Complete the Phantom Weapon Obscurum quest chain.' }],
          frequency: 'one-time',
          generatedAt,
          sourceUrl: PHANTOM_REFERENCE_URL
        }),
        route({
          id: `relic-phantom-obscurum-repeat:${item.id}`,
          name: 'Dodokkuli repeat-weapon exchange',
          sourceFamily: 'relic',
          status: 'current',
          location: { kind: 'vendor', name: 'Dodokkuli', area: 'Phantom Village', x: 6.7, y: 7.1 },
          note: 'Exchange the corresponding Phantom Weapon Umbrae and three Waning Arcanite after completing A Phantom Reborn.',
          requirements: [{ kind: 'content', contentId: 'quest:phantom-obscurum', description: 'Complete A Phantom Reborn.' }],
          costs: [
            fixedItemCost(priorWeaponName, 1, undefined, 'one-time', sharedGroupId),
            fixedItemCost('Waning Arcanite', 3, 50058, 'one-time', sharedGroupId)
          ],
          generatedAt,
          sourceUrl: PHANTOM_REFERENCE_URL
        })
      ]
    };
  }
  if (item.name.startsWith("Vana'dielian")) {
    return {
      sourceFamily: 'alliance-raid',
      acquisitionNote: 'Weekly treasure reward from Windurst: The Third Walk.',
      routes: [route({
        id: `alliance-windurst-drop:${item.id}`,
        name: 'Windurst: The Third Walk treasure reward',
        sourceFamily: 'alliance-raid',
        status: 'current',
        location: { kind: 'duty', name: 'Windurst: The Third Walk' },
        note: 'Obtained from a party treasure chest; one equipment reward may be claimed per week.',
        requirements: [{ kind: 'content', contentId: 'duty:windurst-third-walk', description: 'Unlock and complete Windurst: The Third Walk.' }],
        frequency: 'weekly',
        generatedAt,
        sourceUrl: PATCH_75_NOTES_URL
      })]
    };
  }
  if (item.name.endsWith('of Naught')) {
    const sharedGroupId = item.jobs.includes('PLD') ? 'naught-paladin-arms' : undefined;
    return {
      sourceFamily: 'trial',
      acquisitionNote: 'Weapon drop or Totem of Naught exchange from The Unmaking (Extreme).',
      routes: [
        route({
          id: `trial-unmaking-drop:${item.id}`,
          name: 'The Unmaking (Extreme) weapon drop',
          sourceFamily: 'trial',
          status: 'current',
          location: { kind: 'duty', name: 'The Unmaking (Extreme)' },
          note: 'Obtained from the duty treasure coffer.',
          requirements: [{ kind: 'content', contentId: 'duty:unmaking-extreme', description: 'Unlock and complete The Unmaking (Extreme).' }],
          generatedAt,
          sourceUrl: UNMAKING_REFERENCE_URL
        }),
        route({
          id: `trial-naught-exchange:${item.id}`,
          name: 'Totem of Naught exchange',
          sourceFamily: 'trial',
          status: 'current',
          location: { kind: 'vendor', name: "Uah'shepya", area: 'Solution Nine', x: 8.7, y: 13.5 },
          note: "Exchange ten Totems of Naught with Uah'shepya.",
          requirements: [{ kind: 'content', contentId: 'vendor:uahshepya', description: "Unlock Uah'shepya's Totem Gear exchange." }],
          costs: [fixedItemCost('Totem of Naught', 10, 50892, 'repeatable', sharedGroupId)],
          generatedAt,
          sourceUrl: UNMAKING_REFERENCE_URL
        })
      ]
    };
  }
  if (item.name.startsWith('Palazzo Diamond')) {
    const sharedGroupId = item.jobs.includes('PLD') ? 'palazzo-paladin-arms' : undefined;
    return {
      sourceFamily: 'ultimate',
      acquisitionNote: "Weekly Mad Harlequin's Totem exchange from Dancing Mad (Ultimate).",
      routes: [route({
        id: `ultimate-palazzo-exchange:${item.id}`,
        name: "Mad Harlequin's Totem exchange",
        sourceFamily: 'ultimate',
        status: 'current',
        location: { kind: 'vendor', name: "Uah'shepya", area: 'Solution Nine', x: 8.7, y: 13.5 },
        note: "Exchange one Mad Harlequin's Totem with Uah'shepya.",
        requirements: [{ kind: 'content', contentId: 'duty:dancing-mad-ultimate', description: 'Complete Dancing Mad (Ultimate).' }],
        costs: [fixedItemCost("Mad Harlequin's Totem", 1, 52321, 'weekly', sharedGroupId)],
        frequency: 'weekly',
        generatedAt,
        sourceUrl: PALAZZO_REFERENCE_URL
      })]
    };
  }
  if (item.name.startsWith("Grand Champion's")) {
    const savage = SAVAGE_SLOT_DATA[item.slot];
    if (!savage) throw new Error(`No Savage acquisition mapping exists for slot ${item.slot}.`);
    const bookAmount = item.slot === 'weapon' && item.jobs.includes('PLD') ? 5 : savage.amount;
    return {
      sourceFamily: 'savage',
      acquisitionNote: 'AAC Heavyweight Tier (Savage) coffer drop or illustrated-book exchange.',
      routes: [
        route({
          id: `savage-coffer:${item.id}`,
          name: `${savage.duty} equipment coffer`,
          sourceFamily: 'savage',
          status: 'current',
          location: { kind: 'duty', name: savage.duty },
          note: `Obtained from the matching Grand Champion equipment coffer in ${savage.duty}.`,
          requirements: [{ kind: 'content', contentId: 'duty:aac-heavyweight-savage', description: 'Clear the applicable AAC Heavyweight Savage encounter.' }],
          frequency: 'weekly',
          generatedAt,
          sourceUrl: HEAVYWEIGHT_REFERENCE_URL
        }),
        route({
          id: `savage-book-exchange:${item.id}`,
          name: `${savage.book} exchange`,
          sourceFamily: 'savage',
          status: 'current',
          location: { kind: 'vendor', name: 'Hhihwi', area: 'Solution Nine', x: 8.7, y: 13.4 },
          note: `Exchange ${bookAmount} ${savage.book} with Hhihwi.`,
          requirements: [
            { kind: 'content', contentId: 'duty:aac-heavyweight-savage', description: 'Clear the applicable AAC Heavyweight Savage encounter.' },
            { kind: 'content', contentId: 'vendor:hhihwi', description: 'Unlock Hhihwi in Solution Nine.' }
          ],
          costs: [fixedItemCost(savage.book, bookAmount, savage.itemId, 'weekly')],
          frequency: 'weekly',
          generatedAt,
          sourceUrl: HEAVYWEIGHT_REFERENCE_URL
        })
      ]
    };
  }
  if (item.name.startsWith('Augmented Bygone Brass')) {
    const baseItemName = item.name.replace(/^Augmented /, '');
    const material = upgradeMaterialForSlot(item.slot);
    const materialItemId = material === 'Thundersteeped Solvent' ? 49757 : material === 'Thundersteeped Twine' ? 49758 : 49759;
    const costs = [
      { kind: 'item', name: baseItemName, amount: 1, frequency: 'one-time', valuation: 'fixed', ...(weaponBundleId(item) ? { sharedGroupId: weaponBundleId(item) } : {}) },
      fixedItemCost(material, 1, materialItemId, 'weekly', weaponBundleId(item))
    ];
    return {
      sourceFamily: 'tomestone-upgrade',
      acquisitionNote: `Upgrade ${baseItemName} with one ${material}; the material has Savage and later catch-up routes.`,
      routes: [
        route({
          id: `tomestone-upgrade-savage:${item.id}`,
          name: 'Bygone Brass upgrade with Savage material',
          sourceFamily: 'tomestone-upgrade',
          status: 'current',
          location: { kind: 'vendor', name: 'Theone', area: 'Solution Nine', x: 8.5, y: 13.6 },
          note: `Exchange ${baseItemName} and one ${material} with Theone in Solution Nine.`,
          requirements: [{ kind: 'content', contentId: 'vendor:theone', description: 'Unlock Bygone Brass gear augmentation in Solution Nine.' }],
          costs,
          frequency: 'repeatable',
          generatedAt,
          sourceUrl: THEONE_REFERENCE_URL
        }),
        route({
          id: `tomestone-upgrade-catchup:${item.id}`,
          name: 'Bygone Brass upgrade with alliance or hunt material',
          sourceFamily: 'tomestone-upgrade',
          status: 'partial',
          location: { kind: 'vendor', name: 'Theone', area: 'Solution Nine', x: 8.5, y: 13.6 },
          note: 'Catch-up material exchanges are recorded as an alternative route; exact coin and hunt costs remain provider-partial.',
          requirements: [{ kind: 'manual', description: 'Obtain the matching upgrade material through the current alliance-raid or hunt catch-up exchange.' }],
          costs,
          frequency: 'weekly',
          generatedAt,
          sourceUrl: THEONE_REFERENCE_URL
        })
      ]
    };
  }
  if (item.name.startsWith('Bygone Brass')) {
    const sharedGroupId = weaponBundleId(item);
    const costs = [{
      kind: 'currency',
      name: 'Allagan Tomestone of Mnemonics',
      amount: tomestoneCostForSlot(item.slot),
      currencyId: 'currency:mnemonics',
      frequency: 'weekly',
      valuation: 'fixed',
      ...(sharedGroupId ? { sharedGroupId } : {})
    }];
    if (item.slot === 'weapon' || item.slot === 'offHand') {
      costs.push({
        kind: 'item',
        name: 'Universal Tomestone 3.0',
        amount: 1,
        itemId: 49756,
        frequency: 'weekly',
        valuation: 'fixed',
        ...(sharedGroupId ? { sharedGroupId } : {})
      });
    }
    return {
      sourceFamily: 'tomestone',
      acquisitionNote: 'Purchased from Zircon in Solution Nine with Allagan Tomestones of Mnemonics.',
      routes: [route({
        id: `mnemonics-vendor:${item.id}`,
        name: 'Zircon tomestone exchange',
        sourceFamily: 'tomestone',
        status: 'current',
        location: { kind: 'vendor', name: 'Zircon', area: 'Solution Nine', x: 8.6, y: 13.5 },
        note: item.slot === 'offHand'
          ? 'Paladin sword and shield are purchased as one weapon bundle.'
          : 'Purchased from Zircon in Solution Nine.',
        requirements: [{ kind: 'content', contentId: 'vendor:zircon', description: 'Complete Dawntrail and unlock Zircon in Solution Nine.' }],
        costs,
        frequency: 'repeatable',
        generatedAt,
        sourceUrl: ZIRCON_REFERENCE_URL
      })]
    };
  }
  const shadowbringersSource = (() => {
    if (item.name.startsWith('Augmented Exarchic')) return ['crafted', 'Exarchic equipment augmentation'];
    if (item.name.startsWith('Exarchic')) return ['crafted', 'High quality Exarchic crafting recipe'];
    if (item.name.startsWith('Edenmete')) return ['normal-raid', "Eden's Promise normal-raid exchange"];
    if (item.name.startsWith('Edenmorn')) return ['savage', "Eden's Promise Savage drop or exchange"];
    if (item.name.startsWith("Augmented Cryptlurker's")) return ['tomestone-upgrade', 'Cryptlurker equipment upgrade'];
    if (item.name.startsWith("Cryptlurker's")) return ['tomestone', 'Cryptlurker tomestone exchange'];
    if (/^YoRHa Type-5[135]/.test(item.name)) return ['alliance-raid', 'YoRHa alliance-raid drop'];
    if (item.name.startsWith("Paglth'an")) return ['dungeon', "Paglth'an equipment drop"];
    if (item.name.startsWith('Diamond Zeta')) return ['trial', 'The Cloud Deck (Extreme) weapon'];
    if (item.name.startsWith("Blade's")) return ['relic', 'Shadowbringers resistance equipment'];
    if (item.name.startsWith('Ultimate')) return ['ultimate', 'Ultimate-duty weapon exchange'];
    return undefined;
  })();
  if (item.expansionId === 'shb' && shadowbringersSource) {
    const [sourceFamily, name] = shadowbringersSource;
    return {
      sourceFamily,
      acquisitionNote: `${name}. Exact duty, vendor and cost validation is pending.`,
      routes: [shadowbringersRoute({
        id: `shadowbringers-preliminary:${sourceFamily}:${item.id}`,
        name,
        sourceFamily,
        status: 'partial',
        note: 'The source family is classified from the official item family. Exact historical route, location and cost details remain to be validated.',
        requirements: [{ kind: 'content', contentId: 'expansion:shb', description: 'Own Shadowbringers and reach level 80.' }],
        generatedAt,
        sourceUrl: SHADOWBRINGERS_GEAR_REFERENCE_URL
      })]
    };
  }
  const stormbloodSource = (() => {
    if (item.quality === 'hq') return ['crafted', 'High quality level-70 crafted equipment'];
    if (/^(Bonewicca|Royal Volunteer's|Alliance )/.test(item.name)) return ['dungeon', 'Level-70 dungeon drop'];
    if (/^(Carborundum|Omicron)/.test(item.name)) return ['normal-raid', 'Omega normal-raid exchange'];
    if (/^(Genji|Diamond |Omega )/.test(item.name)) return ['savage', 'Omega Savage drop or exchange'];
    if (/^(Dai-ryumyaku|Augmented Scaevan)/.test(item.name)) return ['tomestone-upgrade', 'Augmented tomestone equipment exchange'];
    if (/^(Ryumyaku|Scaevan)/.test(item.name)) return ['tomestone', 'Level-70 tomestone equipment exchange'];
    if (item.name.startsWith('Ivalician')) return ['alliance-raid', 'Return to Ivalice alliance-raid drop'];
    if (/^(Byakko's|Tsukuyomi's|Suzaku's|Seiryu's)/.test(item.name)) return ['trial', 'Stormblood Extreme-trial weapon'];
    if (item.name.startsWith('Ultimate Dreadwyrm') || / Ultima$/.test(item.name)) return ['ultimate', 'Stormblood Ultimate weapon exchange'];
    if (
      /^(Anemos |Elemental |Pyros |Hydatos )/.test(item.name) ||
      / (Anemos|Pagos(?: \+1)?|Eureka|Physeos)$/.test(item.name) ||
      (item.itemLevel === 345 && (item.name.endsWith('+2') || item.name.startsWith('Seventh '))) ||
      (item.itemLevel === 400 && ['weapon', 'offHand'].includes(item.slot))
    ) return ['relic', 'Eureka equipment progression'];
    return ['other', 'Other level-70 equipment source'];
  })();
  if (item.expansionId === 'sb') {
    const [sourceFamily, name] = stormbloodSource;
    return {
      sourceFamily,
      acquisitionNote: `${name}. Exact duty, vendor and cost validation is pending.`,
      routes: [stormbloodRoute({
        id: `stormblood-preliminary:${sourceFamily}:${item.id}`,
        name,
        sourceFamily,
        status: 'partial',
        note: 'The source family is classified from the official item family. Exact historical route, location and cost details remain to be validated.',
        requirements: [{ kind: 'content', contentId: 'expansion:sb', description: 'Own Stormblood and reach level 70.' }],
        generatedAt,
        sourceUrl: STORMBLOOD_GEAR_REFERENCE_URL
      })]
    };
  }
  return {
    sourceFamily: 'other',
    acquisitionNote: 'Acquisition route is not available in the current overlay.',
    routes: [route({
      id: `unknown:${item.id}`,
      name: 'Unclassified acquisition',
      sourceFamily: 'other',
      status: 'unknown',
      note: 'Acquisition route is not available in the current overlay.',
      requirements: [{ kind: 'manual', description: 'Acquisition requirements are unknown.' }],
      generatedAt
    })]
  };
};

export const buildAcquisitionRecords = (items, generatedAt) => items.map((item) => {
  const acquisition = acquisitionForItem(item, generatedAt);
  return {
    itemId: item.id,
    sourceFamily: acquisition.sourceFamily,
    acquisitionNote: acquisition.acquisitionNote,
    acquisitionRoutes: acquisition.routes,
    provenance: acquisition.routes.flatMap((entry) => entry.provenance)
  };
});
