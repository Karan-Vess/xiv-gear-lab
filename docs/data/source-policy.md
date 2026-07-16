# Data and source policy

Status: implementation baseline
Date: 2026-07-15

## Provider classes

| Class | Initial provider | Intended use | Release status |
| --- | --- | --- | --- |
| Official client data | XIVAPI v2 | Items, stats, equip rules, materia, food, recipes, shops, nodes, icons | Approved for prototype; version pin and cache |
| Official publications | Lodestone / expansion sites | Patch, expansion, job and access facts | Link and record concise facts |
| Curated sets | Etro public API; The Balance guides via XivGear | Attributed current reference and recommendation sets | Prototype adapters; terms review before public distribution |
| Calculation reference | XivGear maths/docs | Independent fixtures and compatibility contract | Clean-room validation only |
| Craft/gather reference | Teamcraft and simulator | Taxonomy and independently validated algorithms | MIT components may be used with attribution if selected |
| Acquisition overlay | Project-maintained records with citations | Drops, quest gates, currencies, source classification | Required; reviewed and snapshot-versioned |
| User data | Local app | Custom equipment, locks, exclusions, saved sets | Private/local by default |

## Minimum provenance record

```ts
interface Provenance {
  kind: 'official-client' | 'official-published' | 'community-curated' |
        'acquisition-overlay' | 'calculated' | 'custom';
  provider: string;
  providerRecordId?: string;
  sourceUrl?: string;
  sourcePatch?: string;
  sourceVersion?: string;
  schemaVersion: string;
  retrievedAt: string;
  verifiedAt?: string;
  status: 'current' | 'stale' | 'partial' | 'unverified' | 'custom';
}
```

Derived records retain the provenance of every input plus the calculation version that combined them.

## Current combat-job references

The Etro `GET /api/gearsets/bis/` endpoint returned six level-100 White Mage records, one Scholar record, four Astrologian records, and four Sage records for patch 7.4 on 2026-07-15. The Balance's current final-tier healer guides link sixteen XivGear recommendations: six WHM, two SCH, four AST, and four SGE. Fifteen equipment/meld/food combinations exactly match Etro and are cross-attributed rather than duplicated. The Balance adds one distinct Scholar 2.31 max-damage set alongside the shared 2.40 set. WHM spans 2.29, 2.41, and 2.43; AST spans 2.31 and 2.43; SGE spans 2.39, 2.44, and 2.45.

The same Etro endpoint returned nine level-100 tank records: one PLD, two WAR, three DRK, and three GNB. The Balance's current tank guides link eight XivGear recommendations: one PLD, two WAR, two DRK, and three GNB. Seven exact combinations are cross-attributed. Dark Knight's Balance 2.46 set differs from both Etro's 2.46 and its compatible-meld variant, so all three remain separately inspectable. Healers and tanks therefore contribute twenty-six deduplicated references: twenty-four from Etro, twenty-four attributed to The Balance, and twenty-two exact overlaps.

For DPS, Etro returned thirty-two level-100 records and the selected current Balance guides link thirty-one XivGear recommendations. Twenty-nine exact job/equipment/meld/food combinations overlap, producing thirty-four deduplicated DPS references. These cover MNK, DRG, NIN, SAM, RPR, VPR, BRD, MCH, DNC, BLM, SMN, RDM, and PCT, including each guide's displayed speed variants. Across every standard combat job, the snapshot contains sixty references: fifty-six from Etro, fifty-five attributed to The Balance, and fifty-one exact overlaps.

These records are test references, not automatically the product's answer. The importer stores minimal factual metadata and original links, preserves genuine disagreements, and merges only exact job/equipment/materia/food matches. The clearer Balance section label is used for matched cards while the original Etro and XivGear record names remain in assumptions.

The game being on patch 7.51 does not by itself make a 7.4 raid-tier set stale. Freshness is evaluated against the relevant gear tier and source's own update state, not by comparing two patch strings lexically.

Sources: [Etro API documentation](https://etro.gg/api/docs/), [The Balance healer guides](https://www.thebalanceffxiv.com/jobs/healers/), [tank guides](https://www.thebalanceffxiv.com/jobs/tanks/), [melee guides](https://www.thebalanceffxiv.com/jobs/melee/), [physical-ranged guides](https://www.thebalanceffxiv.com/jobs/ranged/), [caster guides](https://www.thebalanceffxiv.com/jobs/casters/), and [XivGear API usage](https://xivgear.app/docs/).

## Custom equipment and overrides

- Custom items use stable local UUIDs and can optionally point to an official item they override.
- Overrides never mutate or masquerade as official data.
- Results containing custom data are visibly marked and keep the custom revision.
- Official-only exports and reference comparisons reject custom identities.
- Impossible values are rejected; unusual-but-legal hypothetical values are allowed with warnings.

## Update and failure policy

- Providers are updated independently and have individual health/freshness states.
- Network failure uses the active cache and shows its age.
- Invalid schemas, missing relationships, suspicious count changes, or failed fixtures quarantine the candidate update.
- A curated provider outage never disables official-data optimisation.
- An icon outage never disables set viewing or optimisation.
- Acquisition uncertainty excludes the route when the user requests strict verified-only mode; otherwise it is labelled and never silently promoted to verified.

## Attribution and rights gate

The desktop prototype displays the Square Enix copyright notice required for covered materials and a clear non-affiliation statement. Third-party sources are attributed at the record and about-screen levels.

Before any public distribution, the release checklist must confirm:

- current FFXIV Materials Usage License compliance;
- non-commercial status or separate permission;
- each community provider's API and republication permission;
- third-party software notices and source-code licence obligations;
- icon and trademark presentation requirements.

No provider may be enabled in a public build merely because its endpoint is technically reachable.
