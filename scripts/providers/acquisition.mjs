export const ACQUISITION_OVERLAY_SCHEMA = 'acquisition-route@1';

export const acquisitionForName = (name) => {
  if (name.startsWith("Grand Champion's")) {
    return {
      sourceFamily: 'savage',
      acquisitionNote: 'AAC Heavyweight Tier (Savage) coffer or related exchange.',
      sourceUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/06944d892fd98cc00b2a28ff77edbafa4f7eef54',
      sourcePatch: '7.4',
      status: 'current'
    };
  }
  if (name.startsWith('Augmented Bygone Brass')) {
    return {
      sourceFamily: 'tomestone-upgrade',
      acquisitionNote: 'Upgraded Allagan tomestone of mnemonics equipment; exact upgrade route is retained as a partial acquisition overlay.',
      sourceUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/597d1b99656a1a0d3ba6501a48d43ec46c667068',
      sourcePatch: '7.4',
      status: 'partial'
    };
  }
  if (name.startsWith('Bygone Brass')) {
    return {
      sourceFamily: 'tomestone',
      acquisitionNote: 'Purchased with Allagan tomestones of mnemonics in Solution Nine.',
      sourceUrl: 'https://na.finalfantasyxiv.com/lodestone/topics/detail/597d1b99656a1a0d3ba6501a48d43ec46c667068',
      sourcePatch: '7.4',
      status: 'current'
    };
  }
  return {
    sourceFamily: 'other',
    acquisitionNote: 'Acquisition route is not available in the current overlay.',
    sourcePatch: 'unknown',
    status: 'partial'
  };
};

export const buildAcquisitionRecords = (items, generatedAt) => items.map((item) => {
  const acquisition = acquisitionForName(item.name);
  return {
    itemId: item.id,
    sourceFamily: acquisition.sourceFamily,
    acquisitionNote: acquisition.acquisitionNote,
    provenance: [{
      kind: 'acquisition-overlay',
      provider: 'XIV Gear Lab',
      ...(acquisition.sourceUrl ? { sourceUrl: acquisition.sourceUrl } : {}),
      sourcePatch: acquisition.sourcePatch,
      sourceVersion: 'combat-role-acquisition@4',
      schemaVersion: ACQUISITION_OVERLAY_SCHEMA,
      retrievedAt: generatedAt,
      ...(acquisition.status === 'current' ? { verifiedAt: generatedAt } : {}),
      status: acquisition.status
    }]
  };
});
