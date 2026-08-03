import type { CrafterGearPool, CrafterJobDefinition } from '@xiv-gear-lab/domain';

export const CRAFTER_JOB_DEFINITIONS: CrafterJobDefinition[] = [
  { id: 'CRP', name: 'Carpenter', minimumLevel: 1 },
  { id: 'BSM', name: 'Blacksmith', minimumLevel: 1 },
  { id: 'ARM', name: 'Armorer', minimumLevel: 1 },
  { id: 'GSM', name: 'Goldsmith', minimumLevel: 1 },
  { id: 'LTW', name: 'Leatherworker', minimumLevel: 1 },
  { id: 'WVR', name: 'Weaver', minimumLevel: 1 },
  { id: 'ALC', name: 'Alchemist', minimumLevel: 1 },
  { id: 'CUL', name: 'Culinarian', minimumLevel: 1 }
];

/**
 * M14A publishes the stable boundary before official crafting records are
 * admitted. Keeping this pool explicitly incomplete prevents the UI or a
 * future optimiser from treating placeholder numbers as game data.
 */
export const crafterGearPool: CrafterGearPool = {
  schemaVersion: 'crafter-gear-pool@1',
  patch: '7.55',
  levelCap: 100,
  progressionTier: 'dawntrail-current',
  status: 'foundation',
  jobs: CRAFTER_JOB_DEFINITIONS,
  items: [],
  materia: [],
  food: [],
  medicine: [],
  limitations: [
    'Official current-tier crafted and scrip equipment is admitted in M14B.',
    'Crafting materia, food and medicine are admitted only after provider and legality validation.',
    'No crafter plan can be generated from this foundation-only pool.'
  ]
};
