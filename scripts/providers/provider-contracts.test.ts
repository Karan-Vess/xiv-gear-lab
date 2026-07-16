import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createBalanceAdapter } from './balance.mjs';
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
    expect(normalizeEtroMateria(materiaFixture, { referencedIds: new Set([6001]), paramToStat })[0]).toMatchObject({ id: 6001, tier: 12, value: 54, advancedMeldingLimit: 'first-slot-only' });
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
      IsUnique: false
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
      generatedAt: '2026-07-15T00:00:00.000Z',
      gamePatch: '7.51'
    };
    expect(normalizeXivApiEquipmentRows(options)[0]).toMatchObject({ weaponDamage: 150, stats: { mind: 500, criticalHit: 300 } });
    expect(() => normalizeXivApiEquipmentRows({
      ...options,
      response: { ...options.response, rows: [{ row_id: 1001, fields: { ...fields, BaseParamValue: [500] } }] }
    })).toThrow('differ in length');
  });
});
