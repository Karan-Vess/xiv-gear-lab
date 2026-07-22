import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createBalanceAdapter } from './balance.mjs';
import { buildAcquisitionRecords } from './acquisition.mjs';
import {
  createEtroAdapter,
  normalizeEtroEquipmentDiscovery,
  normalizeEtroEquippedItems,
  normalizeEtroFoods,
  normalizeEtroMateria,
  validateEtroBis,
  validateEtroFood,
  validateEtroMateria
} from './etro.mjs';
import { createXivApiAdapter, normalizeXivApiEquipmentRows, validateXivApiSheet } from './xivapi.mjs';
import { normalizeXivGearEquippedItems, validateXivGearRecord } from './xivgear.mjs';

const fixture = async (name: string) => JSON.parse(await readFile(
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
  'utf8'
));

describe('pinned provider contracts', () => {
  it('publishes multiple acquisition routes and fixed current-tier costs without inventing market prices', () => {
    const generatedAt = '2026-07-18T00:00:00.000Z';
    const records = buildAcquisitionRecords([
      { id: 1, name: 'Bygone Brass Shirt of Casting', slot: 'body', jobs: ['BLM'] },
      { id: 2, name: 'Augmented Bygone Brass Shirt of Casting', slot: 'body', jobs: ['BLM'] },
      { id: 3, name: "Grand Champion's Coat of Casting", slot: 'body', jobs: ['BLM'] },
      { id: 4, name: "Vana'dielian Tabard of Casting", slot: 'body', jobs: ['BLM'] },
      { id: 5, name: 'Rod of Naught', slot: 'weapon', jobs: ['BLM'] },
      { id: 6, name: 'Palazzo Diamond Rod', slot: 'weapon', jobs: ['BLM'] },
      { id: 7, name: "Courtly Lover's Longcoat of Casting", slot: 'body', jobs: ['BLM'] },
      { id: 8, name: "Augmented Courtly Lover's Longcoat of Casting", slot: 'body', jobs: ['BLM'] },
      { id: 9, name: 'Heavyweight Coat of Casting', slot: 'body', jobs: ['BLM'] },
      { id: 10, name: 'Praemagitek Coat of Casting', slot: 'body', jobs: ['BLM'] },
      { id: 49490, name: 'Runaway Rod', slot: 'weapon', jobs: ['BLM'] },
      { id: 50045, name: 'Phantom Longpole Obscurum', slot: 'weapon', jobs: ['BLM'] }
    ], generatedAt);
    expect(records[0].acquisitionRoutes[0].costs).toEqual([expect.objectContaining({
      kind: 'currency', name: 'Allagan Tomestone of Mnemonics', amount: 825, valuation: 'fixed'
    })]);
    expect(records[1].acquisitionRoutes).toHaveLength(2);
    expect(records[1].acquisitionRoutes[0].costs.map((cost) => cost.name)).toEqual([
      'Bygone Brass Shirt of Casting', 'Thundersteeped Twine'
    ]);
    expect(records[0].acquisitionRoutes[0].location).toEqual({
      kind: 'vendor', name: 'Zircon', area: 'Solution Nine', x: 8.6, y: 13.5
    });
    expect(records[1].acquisitionRoutes[0].location).toEqual({
      kind: 'vendor', name: 'Theone', area: 'Solution Nine', x: 8.5, y: 13.6
    });
    expect(records[2].acquisitionRoutes.map((route) => route.status)).toEqual(['validated', 'validated']);
    expect(records[2].acquisitionRoutes[0].location?.name).toBe('AAC Heavyweight M3 (Savage)');
    expect(records[2].acquisitionRoutes[1].costs).toEqual([expect.objectContaining({
      name: 'AAC Illustrated: HW Edition III', amount: 6, itemId: 49762
    })]);
    expect(records[3]).toMatchObject({
      sourceFamily: 'alliance-raid',
      acquisitionRoutes: [expect.objectContaining({
        status: 'validated',
        frequency: 'weekly',
        location: { kind: 'duty', name: 'Windurst: The Third Walk' }
      })]
    });
    expect(records[4].sourceFamily).toBe('trial');
    expect(records[4].acquisitionRoutes).toHaveLength(2);
    expect(records[4].acquisitionRoutes[1].costs).toEqual([expect.objectContaining({
      name: 'Totem of Naught', amount: 10, itemId: 50892
    })]);
    expect(records[5].sourceFamily).toBe('ultimate');
    expect(records[5].acquisitionRoutes[0].costs).toEqual([expect.objectContaining({
      name: "Mad Harlequin's Totem", amount: 1, itemId: 52321
    })]);
    expect(records[6]).toMatchObject({
      sourceFamily: 'crafted',
      acquisitionRoutes: [expect.objectContaining({ status: 'validated', costs: [expect.objectContaining({ kind: 'variable' })] })]
    });
    expect(records[7].acquisitionRoutes[0].costs).toEqual([
      expect.objectContaining({ name: 'Everkeep Certificate of Grade 3 Import', amount: 17, itemId: 51188 }),
      expect.objectContaining({ name: 'Treno Rain', amount: 5, itemId: 51187 })
    ]);
    expect(records[8]).toMatchObject({
      sourceFamily: 'normal-raid',
      acquisitionRoutes: [expect.objectContaining({
        frequency: 'weekly',
        costs: [expect.objectContaining({ name: 'Heavy Holoarmor', amount: 4, itemId: 49750 })]
      })]
    });
    expect(records[9]).toMatchObject({
      sourceFamily: 'dungeon',
      acquisitionRoutes: [expect.objectContaining({ location: { kind: 'duty', name: 'The Clyteum' } })]
    });
    expect(records[10]).toMatchObject({
      sourceFamily: 'trial',
      acquisitionRoutes: [expect.anything(), expect.objectContaining({
        costs: [expect.objectContaining({ name: 'Runaway Totem', amount: 10, itemId: 49748 })]
      })]
    });
    expect(records[11]).toMatchObject({
      sourceFamily: 'relic',
      acquisitionRoutes: [
        expect.objectContaining({ status: 'partial' }),
        expect.objectContaining({ costs: expect.arrayContaining([
          expect.objectContaining({ name: 'Waning Arcanite', amount: 3, itemId: 50058 })
        ]) })
      ]
    });
    expect(records.flatMap((record) => record.acquisitionRoutes).flatMap((route) => route.costs).some((cost) => cost.kind === 'gil')).toBe(false);
  });

  it('shares a single weapon token cost across paladin sword and shield pairs', () => {
    const records = buildAcquisitionRecords([
      { id: 10, name: 'Sword of Naught', slot: 'weapon', jobs: ['PLD'] },
      { id: 11, name: 'Shield of Naught', slot: 'offHand', jobs: ['PLD'] },
      { id: 12, name: 'Palazzo Diamond Sword', slot: 'weapon', jobs: ['PLD'] },
      { id: 13, name: 'Palazzo Diamond Shield', slot: 'offHand', jobs: ['PLD'] },
      { id: 49482, name: 'Runaway Shamshir', slot: 'weapon', jobs: ['PLD'] },
      { id: 49503, name: 'Runaway Shield', slot: 'offHand', jobs: ['PLD'] },
      { id: 50032, name: 'Phantom Sword Obscurum', slot: 'weapon', jobs: ['PLD'] },
      { id: 50053, name: 'Phantom Shield Obscurum', slot: 'offHand', jobs: ['PLD'] }
    ], '2026-07-18T00:00:00.000Z');
    const exchangeCost = (index) => records[index].acquisitionRoutes.at(-1)?.costs[0];
    expect(exchangeCost(0)?.sharedGroupId).toBe('naught-paladin-arms');
    expect(exchangeCost(1)?.sharedGroupId).toBe('naught-paladin-arms');
    expect(exchangeCost(2)?.sharedGroupId).toBe('palazzo-paladin-arms');
    expect(exchangeCost(3)?.sharedGroupId).toBe('palazzo-paladin-arms');
    expect(exchangeCost(4)?.sharedGroupId).toBe('runaway-paladin-arms');
    expect(exchangeCost(5)?.sharedGroupId).toBe('runaway-paladin-arms');
    expect(exchangeCost(6)?.sharedGroupId).toBe('phantom-obscurum-paladin-arms');
    expect(exchangeCost(7)?.sharedGroupId).toBe('phantom-obscurum-paladin-arms');
  });

  it('classifies preliminary Heavensward cap routes without leaking another expansion', () => {
    const records = buildAcquisitionRecords([
      { id: 60, name: 'Augmented Shire Preceptor\'s Coat', slot: 'body', jobs: ['WHM'], expansionId: 'hw', itemLevel: 270, quality: 'not-applicable' },
      { id: 61, name: 'Alexandrian Jacket of Casting', slot: 'body', jobs: ['BLM'], expansionId: 'hw', itemLevel: 270, quality: 'not-applicable' },
      { id: 62, name: 'Zurvanite Rod', slot: 'weapon', jobs: ['BLM'], expansionId: 'hw', itemLevel: 265, quality: 'not-applicable' },
      { id: 63, name: 'Aettir Lux', slot: 'weapon', jobs: ['PLD'], expansionId: 'hw', itemLevel: 275, quality: 'not-applicable' }
    ], '2026-07-22T00:00:00.000Z');

    expect(records.map((record) => record.sourceFamily)).toEqual(['tomestone-upgrade', 'savage', 'trial', 'relic']);
    expect(records.every((record) => record.acquisitionRoutes.every((route) =>
      route.expansionId === 'hw' && route.minimumLevel === 60 && route.status === 'partial'
    ))).toBe(true);
  });

  it('accepts the pinned XIVAPI sheet and rejects missing, duplicate, and bad IDs', async () => {
    const sheet = await fixture('xivapi-item-sheet.json');
    expect(validateXivApiSheet(sheet, [1001, 1002], 'fixture').rows).toHaveLength(2);
    expect(() => validateXivApiSheet({ ...sheet, rows: sheet.rows.slice(0, 1) }, [1001, 1002], 'fixture')).toThrow('ID mismatch');
    expect(() => validateXivApiSheet({ ...sheet, rows: [sheet.rows[0], sheet.rows[0]] }, [1001, 1002], 'fixture')).toThrow('duplicate key');
    expect(() => validateXivApiSheet({ ...sheet, rows: [{ ...sheet.rows[0], row_id: -1 }, sheet.rows[1]] }, [-1, 1002], 'fixture')).toThrow('safe integer');
  });

  it('refuses pagination when XIVAPI changes schema mid-request', async () => {
    const sheet = await fixture('xivapi-item-sheet.json');
    const client = {
      getJson: vi.fn()
        .mockResolvedValueOnce({ ...sheet, rows: [sheet.rows[0]] })
        .mockResolvedValueOnce({ ...sheet, schema: 'drifted-schema', rows: [sheet.rows[1]] })
    };
    const adapter = createXivApiAdapter({ client });
    await expect(adapter.sheetRows('Item', [1001, 1002], 'Name', { batchSize: 1 })).rejects.toThrow('changed version or schema');
  });

  it('accepts pinned Etro shapes and fails closed on renamed required fields', async () => {
    const equipment = await fixture('etro-equipment.json');
    const bis = await fixture('etro-bis.json');
    const food = await fixture('etro-food.json');
    const materia = await fixture('etro-materia.json');
    const client = { getJson: vi.fn().mockResolvedValue(equipment) };
    await expect(createEtroAdapter({ client }).equipment('WHM', 780, 795)).resolves.toEqual(equipment);
    expect(validateEtroBis(bis)).toHaveLength(1);
    expect(validateEtroFood(food, 501).name).toBe('Fixture HQ Food');
    expect(validateEtroMateria(materia)).toHaveLength(1);
    expect(() => validateEtroBis([{ ...bis[0], jobAbbrev: undefined, job: 'WHM' }])).toThrow('jobAbbrev');
    expect(() => validateEtroFood({ ...food, valueHQ0: undefined }, 501)).toThrow('valueHQ0');
    expect(() => validateEtroMateria([{ ...materia[0], param: undefined }])).toThrow('.param');
  });

  it('normalises the pinned XivGear shortlink and rejects incomplete selected sets', async () => {
    const record = await fixture('xivgear-shortlink.json');
    const reference = { job: 'WHM', recordId: 'fixture-record', guidePatch: '7.51', guideUpdatedAt: '2026-07-15' };
    const [selection] = validateXivGearRecord(record, reference);
    expect(selection.name).toBe('Fixture XivGear Set');
    expect(Object.keys(selection.rawItems)).toHaveLength(11);
    const incomplete = { ...record, items: { ...record.items } };
    delete incomplete.items.RingRight;
    expect(() => validateXivGearRecord(incomplete, reference)).toThrow('10/11 equipped slots');
  });

  it('validates The Balance catalogue and its exact resolved selection count', () => {
    const adapter = createBalanceAdapter({
      references: [{ job: 'WHM', recordId: 'fixture', guidePatch: '7.51', guideUpdatedAt: '2026-07-15' }],
      guideUrls: { WHM: 'https://www.thebalanceffxiv.com/jobs/healers/white-mage/best-in-slot/' },
      expectedSetCount: 1
    });
    expect(() => adapter.assertSelectionCount([])).toThrow('0/1');
    expect(adapter.provenance(adapter.references[0], '2026-07-15T00:00:00.000Z').provider).toBe('The Balance');
  });

  it('normalises provider records into stable domain-facing shapes', async () => {
    const equipment = await fixture('etro-equipment.json');
    const food = await fixture('etro-food.json');
    const materiaFixture = await fixture('etro-materia.json');
    const discovery = normalizeEtroEquipmentDiscovery([['WHM', equipment]], { include: () => true, minimumPerJob: 2 });
    expect(discovery.jobsByItemId.get(1001)).toEqual(['WHM']);
    const paramToStat = { 27: 'criticalHit', 44: 'determination' };
    expect(normalizeEtroFoods([food], { paramToStat, generatedAt: '2026-07-15T00:00:00.000Z' })[0].bonuses).toEqual([
      { stat: 'criticalHit', percent: 10, cap: 120 },
      { stat: 'determination', percent: 10, cap: 72 }
    ]);
    const materia = normalizeEtroMateria(materiaFixture, { referencedIds: new Set([6001]), paramToStat, includedTiers: [11, 12] });
    expect(materia).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 6000, tier: 11, value: 18, advancedMeldingLimit: 'unrestricted' }),
      expect.objectContaining({ id: 6001, tier: 12, value: 54, advancedMeldingLimit: 'first-slot-only' })
    ]));
    expect(normalizeEtroEquippedItems({ weapon: 1001, materia: { 1001: { 0: 6001 } } }, { weapon: 'weapon' })).toEqual({
      weapon: { itemId: 1001, materiaIds: [6001] }
    });

    const xivGearRecord = await fixture('xivgear-shortlink.json');
    const [reference] = validateXivGearRecord(xivGearRecord, { job: 'WHM', recordId: 'fixture', guidePatch: '7.51', guideUpdatedAt: '2026-07-15' });
    expect(normalizeXivGearEquippedItems(reference, Object.fromEntries(Object.keys(xivGearRecord.items).map((slot) => [slot, slot]))).Weapon).toEqual({
      itemId: 1001,
      materiaIds: [6001]
    });
  });

  it('normalises XIVAPI item stats and rejects mismatched parameter arrays', async () => {
    const emptyStats = () => ({
      strength: 0, dexterity: 0, intelligence: 0, mind: 0, vitality: 0, piety: 0, tenacity: 0,
      criticalHit: 0, determination: 0, directHit: 0, skillSpeed: 0, spellSpeed: 0
    });
    const fields = {
      Name: 'Fixture Staff',
      Icon: { path: 'fixture.tex' },
      LevelEquip: 100,
      'LevelItem@as(raw)': 790,
      ItemUICategory: { fields: { Name: 'Conjurer\'s Arm' } },
      'BaseParam@as(raw)': [5, 27],
      BaseParamValue: [500, 300],
      DamageMag: 150,
      Delayms: 3000,
      MateriaSlotCount: 2,
      IsAdvancedMeldingPermitted: false,
      IsUnique: false,
      CanBeHq: false
    };
    const caps = {
      Strength: 1000, Dexterity: 1000, Intelligence: 1000, Mind: 1000, Vitality: 1000, Piety: 1000,
      Tenacity: 1000, CriticalHit: 1000, Determination: 1000, DirectHitRate: 1000, SkillSpeed: 1000, SpellSpeed: 1000
    };
    const options = {
      response: { version: 'fixture', schema: 'fixture', rows: [{ row_id: 1001, fields }] },
      itemLevelCaps: new Map([[790, caps]]),
      jobsByItemId: new Map([[1001, ['WHM']]]),
      paramToStat: { 5: 'mind', 27: 'criticalHit' },
      slotCoefficients: { weapon: 140 },
      slotFromCategory: () => 'weapon',
      emptyStats,
      casterJobs: [],
      healerJobs: ['WHM'],
      expansionForLevel: () => 'dt',
      generatedAt: '2026-07-15T00:00:00.000Z',
      gamePatch: '7.51'
    };
    expect(normalizeXivApiEquipmentRows(options)[0]).toMatchObject({
      weaponDamage: 150,
      expansionId: 'dt',
      quality: 'not-applicable',
      stats: { mind: 500, criticalHit: 300 }
    });
    expect(() => normalizeXivApiEquipmentRows({
      ...options,
      response: { ...options.response, rows: [{ row_id: 1001, fields: { ...fields, BaseParamValue: [500] } }] }
    })).toThrow('differ in length');
  });

  it('normalises HQ-capable equipment using HQ stat and weapon-damage contributions only', () => {
    const emptyStats = () => ({
      strength: 0, dexterity: 0, intelligence: 0, mind: 0, vitality: 0, piety: 0, tenacity: 0,
      criticalHit: 0, determination: 0, directHit: 0, skillSpeed: 0, spellSpeed: 0
    });
    const fields = {
      Name: 'Fixture Crafted Staff',
      Icon: { path: 'fixture.tex' },
      LevelEquip: 100,
      'LevelItem@as(raw)': 710,
      ItemUICategory: { fields: { Name: 'Conjurer\'s Arm' } },
      'BaseParam@as(raw)': [5, 3, 27, 44],
      BaseParamValue: [495, 462, 333, 233],
      'BaseParamSpecial@as(raw)': [12, 13, 5, 3, 27, 44],
      BaseParamValueSpecial: [14, 14, 55, 51, 37, 26],
      DamageMag: 132,
      Delayms: 3000,
      MateriaSlotCount: 2,
      IsAdvancedMeldingPermitted: true,
      IsUnique: false,
      CanBeHq: true
    };
    const caps = {
      Strength: 1000, Dexterity: 1000, Intelligence: 1000, Mind: 1000, Vitality: 1000, Piety: 1000,
      Tenacity: 1000, CriticalHit: 1000, Determination: 1000, DirectHitRate: 1000, SkillSpeed: 1000, SpellSpeed: 1000
    };
    const options = {
      response: { version: 'fixture', schema: 'fixture', rows: [{ row_id: 2001, fields }] },
      itemLevelCaps: new Map([[710, caps]]),
      jobsByItemId: new Map([[2001, ['WHM']]]),
      paramToStat: { 3: 'vitality', 5: 'mind', 27: 'criticalHit', 44: 'determination' },
      slotCoefficients: { weapon: 140 },
      slotFromCategory: () => 'weapon',
      emptyStats,
      casterJobs: [],
      healerJobs: ['WHM'],
      expansionForLevel: () => 'dt',
      generatedAt: '2026-07-18T00:00:00.000Z',
      gamePatch: '7.51'
    };

    expect(normalizeXivApiEquipmentRows(options)[0]).toMatchObject({
      quality: 'hq',
      weaponDamage: 146,
      stats: { mind: 550, vitality: 513, criticalHit: 370, determination: 259 }
    });
    expect(() => normalizeXivApiEquipmentRows({
      ...options,
      response: { ...options.response, rows: [{ row_id: 2001, fields: { ...fields, BaseParamValueSpecial: [14] } }] }
    })).toThrow('HQ parameter and value arrays differ in length');
  });
});
