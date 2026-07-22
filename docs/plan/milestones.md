# XIV Gear Lab roadmap, acceptance criteria, and test plan

Status: revised through the v0.9.0-alpha.17 M11/M11B checkpoint
Date: 2026-07-21
Current runnable baseline: Windows/browser-capable v0.9.0-alpha.17, Dawntrail level 100 plus Endwalker level 90 and preliminary Shadowbringers level 80, with dormant level 70/60/50 formula compatibility for signed catalogue updates

Current unsigned data-channel candidate: preliminary Stormblood level 70 adds 1,731 cap items across all 15 available jobs, Grade V/VI materia, eleven source families, a level-70 ruleset and 15 preliminary evaluator profiles. The frozen alpha.17 update-baseline executable intentionally does not bundle this candidate.

This roadmap describes the complete intended product, not merely the current prototype. Every milestone must end in runnable evidence. A feature is not complete because its happy-path UI exists, and later work does not silently erase unfinished acceptance criteria from an earlier milestone.

## Status definitions

- **Complete**: the scoped deliverable and its current acceptance evidence exist.
- **Complete for current-tier scope**: the deliberately bounded release slice is complete; broader content remains assigned elsewhere.
- **Partial**: useful implementation exists, but one or more promised behaviours or tests are still missing.
- **Planned**: not yet implemented beyond architecture or exploratory work.

## Audit of the existing milestones

| Milestone | Honest status | Current evidence | Work still owed |
| --- | --- | --- | --- |
| M0 Discovery and governance | Complete for private prototype | Product discovery, architecture, source policy, prototype boundary, provider attribution and private/non-commercial rights gate | Public distribution permissions and final licence review remain release work |
| M1 Secure application shell | Partial | Shared React renderer, browser build, sandboxed Electron host, CSP, restricted navigation, packaged smoke path | Error boundary, formal linting, broader accessibility/zoom checks and security assertions |
| M2 Versioned data and offline cache | Complete | Versioned bundled/downloaded snapshots, signed candidate validation, atomic activation, last-known-good rollback, quota recovery, schema migrations, protected retention, project-controlled hosting and packaged offline-after-online evidence | Broader long-offline and installer hardening remain M17 work |
| M3 Expansion, job and acquisition eligibility | Partial | Expansion caps, effective-level calculation and job unlock filtering | Real lower-level catalogues, route-level expansion/quest checks, curated-set filtering, strict-verified mode and experimental-access overrides |
| M4 Curated catalogue | Complete for current-tier scope | Sixty deduplicated Etro/The Balance references for all 21 standard combat jobs with source links, dates, assumptions, disagreement preservation and isolated runtime provider contracts | Historical/lower-level curated coverage |
| M5 Shared set model and calculations | Partial | Unified set representation, current level-100 stats, food, guaranteed melds, caps, party bonus, Paladin off-hand, calculation provenance and formula compatibility gates | Legal overmelding, selectable race/clan, broader level rules and full meldable custom items |
| M6 End-to-end combat optimiser prototype | Partial | Worker search, source filters, exact GCD targets, comfort constraints, custom-item forcing, closest-speed fallback, saving and generated-set explanations | UI locks/official required and excluded items, GCD ranges, food/materia controls, locked melds, practical comparison workflow and measured performance budgets |
| M7 Standard combat-job expansion | Complete | All 21 standard combat jobs have current-tier gear, curated references, explicit proxy profiles, job speed targets, export and regression coverage | Limited jobs, the next expansion's two jobs, evolved modes and opener/dummy evaluators are deliberately assigned to later milestones |

M7 is complete even though some earlier foundations remain partial. Those debts are not waived; they are explicitly reassigned below.

## Carry-over register

The following requirements existed before this revision and must remain visible:

1. Runtime data refresh, offline-after-online cache, atomic rollback and provider failure isolation -> **M8**.
2. Data-driven expansion/job definitions, new-job onboarding, formula compatibility and evolved-mode versioning -> **M8**.
3. Three independent builds and meaningful set comparison -> **M9**.
4. Required, excluded and locked official gear; GCD ranges; food, materia and overmeld controls -> **M10**.
5. Complete hypothetical-item fields, cloning, meldable custom items and experimental access overrides -> **M10**.
6. Lower-expansion and lower-level equipment, curated sets and route eligibility -> **M11**.
7. Duties, vendors, currencies, recipes, upgrade chains, fixed costs and the full source taxonomy -> **M11**.
8. Job-correct opener and sustained dummy evaluation without encounter simulation -> **M12-M13**.
9. Reusable crafter gear/meld planning and gathering objectives, thresholds and optimisation -> **M14-M15**.
10. Project import/export, backup/restore, durable migrations, sharing and hardened XivGear compatibility -> **M16**.
11. Measured performance, accessibility, long-offline reliability, installer/update hardening and rights approval -> **M17**.
12. Immediate, contextual attribution with direct source links and an explicit distinction between external and XIV Gear Lab calculations -> **M9, M12-M13 and M16-M17**.
13. Curation-independent preliminary patch recommendations plus an owner-run local patch-update assistant -> **M11-M11B**.

## Completed and partial foundation milestones

### M0 - Discovery and governance

Status: **Complete for private prototype**.

Delivered:

- Product discovery, architecture, source policy, prototype scope and major-risk register.
- Windows-first desktop decision with a shared browser-capable renderer.
- Provider purpose/provenance classification and a private, non-commercial rights gate.

Remaining release gate:

- Public distribution, monetisation, third-party data republication and final FFXIV materials-licence review are handled in M17.

### M1 - Workspace and secure application shell

Status: **Complete for private prototype**.

Delivered:

- Typed workspace, browser host, Electron host, shared renderer, build/test/package commands and dark desktop UI.
- Electron context isolation and sandboxing, no renderer Node integration, narrow preload surface, CSP and blocked arbitrary navigation/new windows.
- Packaged executable smoke testing.

Remaining:

- Add a renderer error boundary and recoverable fatal-error screen.
- Add formal lint/static-policy checks and automated Electron security assertions.
- Complete keyboard, screen-reader, high-zoom and reduced-motion audits in M17.

### M2 - Versioned static data baseline

Status: **Complete**.

Delivered:

- Immutable bundled snapshot with game, tier, XIVAPI schema and calculation versions.
- Official IDs, stats, caps, icons, food, materia and provenance.
- Offline use of bundled and previously downloaded release data.
- Signed runtime candidate validation, inert staging, atomic activation, previous-version repair/rollback and explicit provider freshness.
- Version-two snapshot/icon cache migration, saved-set pins, bounded retention, abandoned-candidate cleanup and quota retry without deleting active, rollback or saved-set snapshots.
- Packaged online-update/offline-relaunch drill plus a simulated six-month cache-age test.

Production boundary:

- The v0.6.3 production build trusts project-controlled stable and recovery public keys and reads the signed HTTPS channel hosted from the public project repository. Private signing keys remain outside the workspace and application.

### M3 - Expansion, job and acquisition eligibility

Status: **Partial**.

Delivered:

- Expansion definitions, effective level caps and job introduction/start-level checks.
- Unsupported jobs are disabled for the selected access state.

Not yet delivered:

- The current catalogue is level-100/current-tier only; selecting a lower expansion does not produce a real historical recommendation pool.
- Equipment, food, materia, curated sets and acquisition routes are not yet filtered through a complete versioned access graph.
- Quest gates, duty access, strict-verified mode and explicit future-item overrides move to M10-M11.

### M4 - Current-tier curated catalogue

Status: **Complete for current-tier standard combat jobs**.

Delivered:

- Sixty current final-tier recommendations across the 21 standard combat jobs.
- Exact source identity, links, dates, patch/tier, equipment, materia, food and assumptions.
- Exact overlaps are cross-attributed; genuinely different Etro/Balance variants remain separate.
- A curated source is reference evidence, not automatically the optimiser answer.

Future extension:

- Runtime provider adapters and partial-provider freshness move to M8.
- Historical and lower-level curated discovery moves to M11.

### M5 - Shared set model and current combat calculations

Status: **Partial**.

Delivered:

- Curated, generated, saved and custom sets share a common model and renderer.
- Current level-100 main stat, weapon damage, Determination, Critical Hit, Direct Hit, Tenacity, speed, GCD, party bonus, food and guaranteed materia calculations.
- Stat-cap waste, unique-ring legality and Paladin weapon/off-hand weighting.
- Calculation version and evaluator identity on results.

Remaining:

- Compatibility refusal when a snapshot requires an unsupported formula/ruleset schema -> M8.
- NQ equipment is deliberately out of scope; future crafted-equipment ingestion must use HQ stats only -> M11.
- Overmeld grade/slot legality, locked melds and fully meldable custom bases -> M10.
- Selectable race/clan and broader level-scaling rules -> M10-M11.

### M6 - End-to-end combat optimiser prototype

Status: **Partial**.

Delivered:

- Responsive Web Worker search with a bounded frontier and cancellation.
- Current Savage/tomestone filters, exact GCD targets, healer/tank comfort minimums, custom-item forcing and closest-attainable speed fallback.
- Local saved sets and persistent custom items.
- Changed item/meld highlighting after a rerun.

Remaining:

- Opaque automatic Alternatives 2-4 are replaced by the independent-build workflow in M9.
- Expose official required/excluded/locked items, GCD ranges, food and materia restrictions in M10.
- Add locked melds, overmelding controls and better unsatisfiable-cause reporting in M10.
- Prove realistic p95 performance rather than relying only on bounded unit/smoke timings in M17.

### M7 - Standard combat-job expansion

Status: **Complete**.

Delivered in v0.5.0:

- WHM, SCH, AST, SGE, PLD, WAR, DRK, GNB, MNK, DRG, NIN, SAM, RPR, VPR, BRD, MCH, DNC, BLM, SMN, RDM and PCT.
- Job-filtered official equipment, 60 curated references and explicit evaluator-profile identities.
- Role-correct main/resource/speed stats, Paladin off-hand support and current job-specific GCD targets.
- Haste-adjusted primary GCDs for MNK, NIN, SAM and VPR.
- Official-only XivGear JSON export and unsupported-profile refusal.
- Transparent expected-single-100-potency-hit limitation rather than a false rotation-DPS claim.

Scope decision:

- The former open-ended rotation/encounter requirement is removed from M7.
- Bounded 30-second opener and 300-second dummy evaluation move to M12-M13.
- Encounter timelines, boss downtime, movement and fight-specific scripting are not part of the current product target.

## Revised forward roadmap

### M8 - Runtime data, formula compatibility, and new-job onboarding

Status: **Complete - foundation delivered in v0.6.0, M8A in v0.6.1, M8B in v0.6.2 and M8C in v0.6.3**.

Delivered in v0.6.0:

- Project-controlled, cryptographically verified update manifest with provider allowlist, checksums, schema versions, minimum app version and formula/ruleset compatibility requirements.
- Bounded HTTPS provider transport adapters with origin allowlists, timeouts, retries, content limits and provider-specific errors.
- IndexedDB snapshot repository with inert candidate staging, atomic activation, bundled fallback, automatic last-known-good repair, manual rollback and pinned-snapshot lookup.
- Signed snapshot publisher that embeds local PNG assets into the downloadable artifact for complete offline icons.
- Provider freshness states in the signed manifest and honest bundled/downloaded, progress, failure, provider-issue and rollback UI.
- Data-driven expansion and job registry instead of fixed operational assumptions such as exactly 21 jobs.
- Versioned ruleset identity: expansion/patch, level band, job, mode, profile version and calculation schema.
- Safe declarative profile packs for existing formula structures: main stat, modifiers, base stats, speed effects, recommended targets and capability flags.
- Named timing effects with passive/maintained/temporary classification and an explicit target-GCD state.
- Capability states per job: catalogue, generic-hit evaluator, opener evaluator and dummy evaluator.
- Onboarding path for the next expansion's two jobs and evolved modes without rewriting UI or optimiser core logic.
- New curated/generated/saved results pin their snapshot, ruleset, calculation schema and evaluator identity; compatible cached snapshots can be resolved by ID.

Delivered in v0.6.1 (M8A):

- XIVAPI, Etro, The Balance and XivGear have provider-specific fetch, shape-validation and normalisation modules with pinned contract fixtures.
- Provider JSON is cached only after its live response passes the matching contract; timeouts or schema drift can reuse the last validated response and are marked stale.
- Official, acquisition and curated data are assembled as separate versioned overlays by a shared snapshot builder.
- Optional stale overlays can be safely retained while fresh sibling overlays publish; essential official data still fails closed when neither a valid candidate nor last-known-good fallback exists.
- Signed release manifests inherit the exact per-provider and per-overlay freshness recorded by the snapshot.
- A live 231-item/6-materia/4-food/60-set refresh and a forced Etro-outage drill both completed with reference counts intact and honest stale-source reporting.

Delivered in v0.6.2 (M8B):

- Snapshot IndexedDB v2 migrates old snapshot/candidate records, records storage and icon-schema identities, and preserves compatible active data during upgrade.
- Retention protects active, rollback and saved-set-pinned snapshots, removes expired candidates and prunes oldest unreferenced versions to count/size budgets.
- A quota failure triggers aggressive safe cleanup and one bounded retry; a second failure leaves protected snapshots untouched and reports a useful storage-full error.
- Saved-set IndexedDB v4 marks pre-context results as calculation-version unknown while preserving their stored stats and never fabricating snapshot, ruleset or evaluator provenance.
- The UI warns on legacy saved results, and current saved sets keep their real snapshot IDs pinned until the final referencing set is deleted.
- A real packaged EXE updated from an ephemeral signed channel, reloaded from the downloaded cache, then launched again with that channel shut down; both phases optimised successfully with complete embedded icons.
- Unit coverage also restores an active downloaded cache after a simulated six-month offline gap.

Delivered in v0.6.3 (M8C):

- A public-read, project-controlled GitHub Pages channel serves the immutable snapshot and signed manifest over HTTPS while the landing page clearly labels the project as an unfinished, unsupported, non-commercial preview.
- Production and recovery Ed25519 public keys are trusted by the packaged application; both private keys are held outside the repository and application, with documented staging, verification and rotation commands.
- The staged release was verified locally and again through the exact hosted URLs before packaging.
- The v0.6.3 portable EXE downloaded and activated the hosted snapshot, then relaunched with network access disabled against the same isolated profile and optimised successfully from its cached copy with embedded icons.
- The hosted snapshot contains 21 jobs, 231 items, 6 materia, 4 foods and 60 curated sets under snapshot ID `xivapi-f8764efd76cdb31a-etro-balance-all-combat-jobs-2026-07-15`.
- The final hosted drill measured a 323 ms cached application bootstrap and a 0 ms catalogue responsiveness probe on the reference machine; it also exposed 4.72 seconds of portable self-extraction overhead, which is recorded honestly as M17 distribution-startup work.

Accept when:

- A normal gear-tier patch can update items, icons, food, materia and curated references without publishing a new executable.
- A synthetic future job can enter the catalogue through registry/profile data without UI or optimiser-core edits.
- A job with no compatible evaluator is visible as data-available/evaluator-pending and cannot be optimised deceptively.
- Installing a compatible declarative generic-hit profile enables that capability without core-code changes.
- Unknown formula schemas, evolved modes or provider shapes fail closed and leave the active snapshot untouched.
- An interrupted, corrupt, partial or suspicious update cannot replace the last-known-good snapshot.
- After one successful online update, the app launches and remains useful offline.
- Old saved results remain reproducible against their pinned snapshot/ruleset.

Tests:

- Pinned provider contract fixtures; schema drift; renamed/removed fields; pagination; timeouts; retries; bad IDs; hostile sizes; checksum/count anomalies.
- Partial provider outage; corrupt icons; cache quota; interrupted activation; rollback; long-offline launch; migration from the bundled v0.5 snapshot.
- Synthetic next-expansion fixtures with two new jobs, a new level cap, one compatible profile, one unsupported formula schema and evolved-mode variants.
- Formula/profile compatibility matrix and old-save reproducibility checks.

Performance:

- Once the Electron application process starts, cached data reaches an interactive UI under 2 seconds on reference hardware; the hosted packaged drill records application bootstrap and outer portable-wrapper time separately.
- Update work does not block the renderer; the hosted drill probes an enabled catalogue control during download/validation and requires a response within 500 ms while the active snapshot remains visible.
- End-to-end portable-EXE launch includes self-extraction and does not yet meet a two-second release target; cold-start packaging, installed-versus-portable policy and the final user-perceived launch budget are explicit M17 work rather than an unmeasured M8 claim.

### M9 - Three build workspaces and comparison clarity

Status: **Complete in v0.7.3**.

Delivered across v0.7.0-v0.7.3:

- Build 1, Build 2 and Build 3 now retain independent jobs, access settings, constraints, selected gear, custom-item fallbacks, result state and calculation mode; the former unexplained alternative tabs are removed.
- IndexedDB schema v5 adds a versioned workspace record without rewriting existing saved sets or custom items. Fresh and upgraded profiles seed three deep-independent builds, and interrupted searches recover to an honest idle state.
- The shared custom-item library reports multi-build usage. Equipping and unequipping remain build-local, while edits recalculate every affected build and permanent deletion restores each build's remembered fallback where possible.
- The Comparison tab has a selectable baseline and exposes score, comparable delta, stats, Piety/MP-regeneration limitation, base/effective GCD, item level, food, meld waste, equipment/meld/food differences, constraints, acquisition coverage and currently unknown costs.
- Cross-job, snapshot, ruleset, evaluator and schema mismatches remain visible but suppress the misleading score delta and display compatibility warnings.
- The job picker uses labelled tank/healer/DPS groups with blue/green/red backdrops, and hasted jobs display both base timing and the named effective state used by their evaluator.
- Each result shows compact source attribution plus expandable methodology and exact community/item links. The generic-hit formula audit records XivGear as an external structure reference while explicitly marking uncited profile constants internal/unverified.
- Browser and Electron external navigation use the same exact-host HTTPS allowlist. Lookalike domains, non-HTTPS URLs and script URLs fail closed.
- The v0.7.0 portable EXE passed the all-job, focus/modal/input, shared custom-item, three-workspace, cross-job comparison and restart-persistence smoke path. The cached comparison render has an automated p95 budget below 100 ms.
- The v0.7.1-v0.7.3 closure passes added direct loadout copying, final per-item and per-materia contribution clarity, complete custom-weapon delay handling, Black Mage Ley Lines timing alongside its base optimiser target and the missing comparison/timing/provenance regression cases.

Deliver:

- Replace the current result/alternative tabs with persistent Build 1, Build 2, Build 3 and Comparison tabs.
- Each build owns its job, expansion/level access, constraints, equipped set, custom-item usage, calculation mode and optimiser result.
- Running or editing one build must not overwrite either of the others.
- Shared custom-item library with independent equip state per build and clear multi-build edit impact.
- Versioned build-workspace domain/storage contract plus a migration that seeds Build 1 from the existing single workspace and creates safe independent defaults for Builds 2 and 3 without altering saved sets or custom items.
- Comparison table using Build 1 as the default baseline, with optional baseline selection.
- Compare evaluation score and percentage delta, main/resource/secondary stats, base/effective GCD, item level, food, materia, waste, changed equipment, constraints, source availability, acquisition and costs when known.
- Healer comparison shows Piety and MP regeneration rather than misleading fixed maximum-MP differences.
- Cross-job or cross-evaluator comparisons remain viewable but clearly state which values are not directly comparable.
- Role-coloured job choices: tank blue, healer green, DPS red, always accompanied by text/group labels so colour is not the only signal.
- Named GCD presentation: base GCD plus relevant passive, maintained or temporary states such as Greased Lightning, Fuka, Swiftscaled or Ley Lines; the optimiser target identifies the state it uses.
- Compact, immediately visible source attribution for item data, curated sets, formula references and XIV Gear Lab-owned calculations without turning the workspace into a credits screen.
- A per-result data-and-methodology panel that distinguishes independently generated, curated and community-validated results and links directly to the applicable provider, original set/author and formula reference rather than only to generic home pages.
- Audit the existing generic-hit formula implementation and constants before labelling them: every current credit must resolve to an exact reference, or the component must be marked internal/unknown rather than assigned a convenient but unverified source.
- External source links open through a narrowly allowlisted system-browser path; missing or unknown provenance is stated instead of hidden.

Accept when:

- Three different jobs/constraints/custom-item combinations survive tab switches and app restarts independently.
- Recalculating one build changes only that build and updates the comparison deterministically.
- Item, meld, food and constraint causes of every displayed difference are inspectable.
- Different rulesets/snapshots/evaluator modes trigger a compatibility warning instead of a misleading winner.
- The Windows executable renders and operates the role-coded job picker reliably with keyboard and mouse input.
- Every result can answer which data and formulas came from external projects, which parts were implemented by XIV Gear Lab and whether a curated set influenced the recommendation.
- Attribution remains readable without colour, and every displayed external reference can be opened safely from the packaged application.
- No formula or set is credited to a platform merely because that platform hosts it, and no unverified formula attribution is presented as fact.

Tests:

- Workspace persistence/migration; independent state; delete/edit custom item referenced by one or more builds; stale/missing item recovery.
- Same-job and cross-job comparisons; same/different snapshot, ruleset, evaluator and schema; seeded build before its first optimiser run; identical builds.
- Base/effective GCD boundaries for passive, maintained and temporary effects.
- Packaged Electron focus, dropdown, modal and keyboard regression tests.
- Generated/curated/validated provenance states; partial or missing author metadata; exact and fallback source links; rejected non-allowlisted URLs.

Performance:

- Workspace switch and comparison refresh under 100 ms p95 for cached results.

### M10 - Optimiser controls and complete hypothetical equipment

Status: **Completed in v0.8.0 and polished in v0.8.1 (2026-07-16)**.

Deliver:

- UI controls for required, excluded and locked official equipment and locked melds.
- Minimum/maximum GCD ranges as well as exact targets, with named target-GCD state.
- Food allowed/disallowed/locked, materia-family and grade restrictions, overmelding permission and custom-item permission.
- Clear minimal useful cause when constraints are unsatisfiable.
- Create a custom item from scratch or clone an official/custom item.
- Full custom fields: name, job/role, slot, level, expansion, item level, main stat, Vitality, all relevant secondary stats, weapon damage/delay, materia slots, overmeld permission, stat caps, source category/description, fixed cost, notes and icon provenance.
- Two custom modes: final-stat item and meldable base item.
- Normal access enforcement plus an explicit experimental future/inaccessible override that marks every dependent result hypothetical.
- Custom library edit/delete/duplicate controls and safe behaviour when saved sets/workspaces reference an item.

Accept when:

- Every exposed restriction is honoured by generated and warm-start candidates or produces an actionable failure.
- Custom items cannot masquerade as official data and cannot enter official-only exports.
- Legal custom melds respect slots, grades, overmeld rules and caps; deliberate unrealistic values require explicit warning acknowledgement.
- Experimental-access results display the inaccessible expansion/level assumption everywhere relevant.

Tests:

- Required/excluded/locked conflicts; locked melds; food off/locked; materia restrictions; overmeld legality; impossible GCD/stat bands.
- Clone/edit/delete/restart; final versus meldable mode; user/generic/reused icons; strange caps; future-level override; custom item referenced by multiple builds and saved sets.

### M11 - Expansion/content eligibility, acquisition routes, and fixed costs

Status: **In progress**.

Current checkpoint:

- The versioned content/access contract, complete source taxonomy, alternate-route access checks, HQ-only XIVAPI normalisation, fixed current-tier tomestone and upgrade costs, explicit recommendation confidence, and preliminary-patch readiness gates are implemented.
- The live current-tier catalogue now contains 618 official items. Crafted and augmented-crafted, normal-raid, Savage, tomestone, augmented-tomestone, dungeon, alliance-raid, Extreme-trial, relic and Ultimate categories have usable acquisition coverage, including fixed raid-token, upgrade-material, certificate, rain, relic-material and totem costs where applicable.
- The first historical cap is usable end to end: 540 Endwalker level-90 items across 19 then-available jobs, ten source families, Grade IX/X materia, eight foods, a level-90 calculation ruleset and 635 validated historical acquisition routes. Optimiser candidates, locks, food and materia are bounded to the selected expansion and cap.
- The M11B backfill path has generated the second historical cap: 609 Shadowbringers level-80 items across all 17 then-available jobs and ten source families, Grade VII/VIII materia, a level-80 ruleset and explicit internal-preliminary evaluator profiles. Slot/job coverage is complete and optimisation works; exact acquisition details, food and historical curation remain pending.
- The unsigned Stormblood channel candidate adds 1,731 level-70 items across all 15 then-available jobs, eleven source families, Grade V/VI materia, a level-70 ruleset and 15 internal-preliminary evaluator profiles. It is reserved for the frozen-client M11B update drill and is not bundled into the alpha.17 baseline executable.
- All final Mandervillous arms use a versioned configurable-stat model. The optimiser chooses their legal two-large/one-small allocation, handles Paladin's split sword and shield values, displays allocation-only changes and exports compatible relic stats to XivGear.
- Endwalker results are honestly marked as lacking compatible historical curation even while current Dawntrail curation is loaded.
- Current-tier acquisition coverage is intentionally partial where a provider does not yet verify the exact exchange requirement. ARR and Heavensward cap catalogues/rules/consumables, Stormblood and Shadowbringers consumables and exact routes, historical curation, and broader route/cost coverage remain before M11 can be marked complete.
- The Lodestone item-link feasibility check found no trustworthy direct mapping from official game item IDs to Lodestone's separate opaque Eorzea Database IDs. Exact item links are therefore deferred under `Do later / explicitly deferred`.

Deliver:

- Historical/lower-level official catalogues, materia, food and curated sets needed for supported expansion/level choices.
- HQ-only crafted equipment ingestion; NQ equipment variants are excluded from catalogues, recommendations and optimisation.
- Versioned content/access graph for expansions, quests, duties, job unlocks, vendors, recipes, nodes and route prerequisites.
- Full source taxonomy: crafted, normal raid, Savage, tomestone, augmented tomestone, dungeon, trial, alliance raid, relic, ultimate, quest, vendor, custom and explicitly classified additional families.
- Multiple acquisition routes per item with provenance and access checks.
- Time-box research into making official item names open their exact Lodestone Eorzea Database pages. Implement it during M11 only if a trustworthy, maintainable identifier mapping is available with a few minutes of work; otherwise record it in a `Maybe later` list with the reason and continue M11 without expanding its scope.
- Fixed costs: gil vendor prices, tomestones/scrips, raid books/tokens, trial totems, upgrade materials, quest requirements, recipe materials and other deterministic currencies.
- Weekly/one-time/recurring classifications and user-entered cost preferences where values are legitimately subjective.
- No live market-board prices and no invented gil value for non-market rewards.
- Curated and generated recommendations respect the selected expansion and effective level; later content may be shown only as clearly unavailable reference material.
- Curation-independent preliminary-patch mode that can optimise a newly detected compatible equipment tier from official data while marking incomplete acquisition information and absent community validation honestly.
- Patch-readiness checks for complete slot/job coverage, item/stat/cap sanity, HQ-only crafted variants, upgrade identities, icons, pagination and formula/ruleset compatibility.
- Explicit confidence states for complete preliminary data, incomplete catalogue/acquisition data, evaluator-outdated data and later community validation; a missing curated overlay never blocks a safe official-data candidate.

Accept when:

- A lower-expansion user receives only legal jobs, items, food, materia, curated sets and routes.
- Every crafted equipment candidate uses its HQ stats, and provider-supplied NQ variants are rejected during normalisation.
- An item with one accessible and one inaccessible route remains usable through the legal route.
- Recommendations explain how every official item is obtained and distinguish unknown, fixed, weekly and variable requirements.
- Disabled source categories become functional only when their route coverage is validated.
- With the curated overlay absent, a compatible new-patch official catalogue still produces clearly labelled preliminary recommendations rather than failing or pretending to be community validated.
- Incomplete slot coverage, suspicious stat jumps or an incompatible evaluator prevents a normal-confidence recommendation and identifies the precise readiness failure.
- The Lodestone-link research has a recorded outcome: exact allowlisted links if the mapping proved trivial, or an explicit `Maybe later` deferral if it did not.

Tests:

- Every expansion cap/job boundary; route alternatives; quest/duty gates; current and obsolete currencies; weekly limits; unavailable content; no-route and unknown-route failures.
- HQ-only crafted-equipment fixtures, crafted ingredient expansion and circular recipes; upgrade chains; later-expansion leakage property tests.
- Synthetic patch roll-forward with no curated sets; partial pagination; missing weapon/slot; corrected provider data; unknown acquisition route; formula-compatible and formula-incompatible candidates.
- If exact Lodestone links are implemented: known item, missing mapping, custom item and rejected non-allowlisted URL coverage.

### M11B - Local patch-update assistant

Status: **In progress**.

Current checkpoint:

- `npm run catalogue:update` provides a read-only local inspection and JSON report; historical candidates require explicit `--mode backfill --expansion <id> --apply` permission and never sign or publish.
- Cap profiles, deterministic content fingerprints, job/slot/ruleset/evaluator coverage checks, icon-duplication analysis and separate catalogue/icon/rollback size budgets are implemented.
- The workflow has produced and validated real Shadowbringers and Stormblood backfill candidates rather than relying only on synthetic fixtures. Stormblood is the first candidate reserved for delivery to a frozen client through the signed channel.
- Item, food and materia icons are content-addressed for bundled builds: 3,566 catalogue references currently resolve to 1,900 unique physical assets. Provider source-ID copies remain local for repeatable refreshes and are excluded from release builds.
- Current-patch detection, provider-fingerprint no-op decisions, exact acquisition/food enrichment, separate runtime-channel icon delivery, explicit owner confirmation, signing and hosted publication verification remain.

Deliver:

- One documented local command or launcher that the repository owner runs manually from their own Windows PC after a patch releases.
- The assistant compares the official current patch and provider fingerprints with the active data-channel snapshot and exits quickly when nothing changed.
- When a patch changed, it refreshes official and supporting providers, then reuses the M11 catalogue, acquisition, HQ-only, schema, formula and evaluator readiness gates.
- Essential official data can produce a clearly labelled preliminary candidate without waiting for community curation; incomplete optional acquisition or curated overlays remain honest and may be refreshed later.
- Suspicious count/stat changes, incomplete slot coverage, unknown schemas, incompatible formulas/evaluators, unsupported mechanics and provider drift stop the update and produce an actionable local report.
- A successful run builds and verifies the candidate locally, presents the patch/version and validation summary, and requires explicit owner confirmation before signing and publishing it to the existing data channel.
- Signing credentials and recovery keys remain only on the owner's PC. No hosted watcher, scheduled GitHub workflow or unattended publication is part of M11B.
- The launcher and non-secret workflow may be source-controlled, but execution state and credentials remain local and ignored by Git.

Accept when:

- Running the local assistant against the active patch exits without rebuilding or republishing anything.
- A simulated compatible patch produces a locally verified preliminary candidate from official data even when curated sets are absent.
- Gradually updating or unsafe providers cannot replace the active channel; the owner receives a precise report and can rerun the same command later.
- Nothing is signed or published until the owner confirms the validated candidate summary.
- After publication, hosted verification confirms that the channel serves the signed snapshot and the app can activate it.
- A new machine without the local credentials can validate and build a candidate but cannot publish it.

Tests:

- Unchanged patch/content fingerprints; compatible patch; gradual pagination; missing slot/job; essential and optional provider outages; later acquisition and curation overlays.
- Unknown schema, formula/evaluator incompatibility, suspicious stat/count jumps, signing-secret absence, declined confirmation, interrupted publication and hosted verification failure.
- Repeat runs after failure, after successful publication and from a clean machine with no publishing credentials.

### M12 - Bounded combat evaluator framework

Status: **Planned**.

Deliver:

- Evaluator contract with three standard modes:
  1. Job-correct generic single 100-potency hit.
  2. Fixed 30-second opener total and DPS.
  3. Fixed 300-second single-target dummy total and DPS, including the opener.
- Shared deterministic timing engine for GCDs, casts, animation locks, weaving, cooldowns/charges, buffs, DoTs, gauges, expected-value procs, pets/summons and relevant auto-attacks.
- Fixed dummy assumptions: one stationary target, 100% uptime, no movement/downtime/phases, expected-value RNG, no external party buffs by default and a versioned latency/weave assumption.
- Job evaluator supplies action catalogue, opener, ongoing priority rules, state/resource model and version metadata.
- Every externally derived formula, timing assumption and job mechanic carries a named reference, direct source URL, applicable patch/version and accessed/published date where available; internally developed calculations are explicitly attributed to XIV Gear Lab instead.
- Personal-damage output is not presented as raid contribution; support-job contribution requires a separately defined future metric.
- Fast proxy searches the full candidate space, then opener/dummy modes rerank a bounded finalist shortlist instead of simulating every frontier state.
- At least four pilot evaluators representing deterministic melee, proc-heavy physical ranged, caster state/timing and pet/summon behaviour.

Accept when:

- The same gear produces deterministic results for a fixed evaluator/ruleset.
- Speed changes can alter action count, cooldown drift or ranking and the explanation identifies why.
- Generic-hit, opener and dummy modes never share labels that imply equivalent meaning.
- Unsupported jobs/modes remain visibly unavailable rather than falling back to a generic rotation.
- Encounter mechanics, movement and fight scripting are absent by design and stated clearly.
- Every evaluator result exposes its formula/methodology references without requiring the application to reproduce or teach the source material.

Tests:

- Action timelines, floor/round boundaries, clipping, double-weave legality, charges, buff snapshots, DoT ticks, resource overcap, expected proc values, pets, auto-attacks and cooldown drift.
- 30.00-second and 300.00-second boundary actions; speed-tier action-count changes; deterministic replay; independent reference traces for pilot jobs.

Performance:

- Fast proxy remains the default interactive search.
- A normal opener/dummy shortlist rerank completes within 5 seconds p95, is cancellable and never blocks the renderer.

### M13 - Combat evaluator coverage and evolved modes

Status: **Planned**.

Deliver:

- Expand validated opener/dummy evaluators across supported standard combat jobs in role-sized batches.
- Add the next expansion's two jobs through the M8 onboarding contract.
- Version existing jobs by ruleset and evolved/standard mode without overwriting Dawntrail profiles or saved results.
- Explicit capability display for catalogue, generic hit, opener and dummy support.
- Per-job provenance audit that identifies the origin of formulas and assumptions component by component, preserves original authorship where known and distinguishes a hosting platform from the author/community that produced a set or method.
- Define whether and how limited jobs are supported; they remain outside normal recommendations until an evidence-backed objective and ruleset exist.

Accept when:

- Every selectable evaluator mode has job-specific fixtures and transparent assumptions.
- New jobs using an existing supported formula/evaluator schema require only registry/profile/action data; genuinely new mechanics are isolated to a job evaluator module.
- Old and new expansion modes can coexist and reproduce their own saved results.
- No missing evaluator silently borrows another job's logic.
- No selectable evaluator lacks either a precise external reference link or an explicit declaration that the relevant method was developed by XIV Gear Lab.

Tests:

- Per-job opener and five-minute traces; role-specific mechanic fixtures; evolved-mode boundaries; new-job gear/profile onboarding; old-save migration and cross-ruleset comparison warnings.

### M14 - Crafter gear and materia optimiser

Status: **Planned**.

Deliver:

- Crafter job/access data, the newest eligible crafted and scrip gear progression, crafting materia, food and medicine. Do not search every historical crafter item when a newer tier straightforwardly replaces it.
- Narrow equipment optimisation across the eligible crafted and scrip pieces. Mixed crafted/scrip sets remain legal when they improve the finished plan or are needed for user restrictions, locked items or unusual stat breakpoints.
- Materia-first optimisation that generates and compares complete gear-plus-meld plans rather than treating equipment and melding as unrelated steps.
- Locked items and minimum Craftsmanship, Control and CP thresholds, plus explicit food and medicine assumptions.
- Materia-family and grade limits, guaranteed slots, advanced melding legality, overmeld difficulty, stat caps and wasted-stat accounting.
- Practical plan objectives and alternatives, including maximum achievable stats, budget-conscious, minimum-overmeld and balanced plans. Costs or overmeld difficulty that cannot be known exactly remain explicit assumptions rather than invented precision.
- Optional, versioned recipe and rotation validation targets that check whether a finished plan meets known Craftsmanship, Control, CP and other documented thresholds. Recipes and rotations do not create, save or recommend a separate equipment set per recipe.
- Clear provenance for crafter formulas, thresholds, gear progression, materia rules and any externally supplied recipe/rotation assumptions.

Accept when:

- The optimiser returns reusable complete crafter gear-and-meld plans from the newest eligible crafted and scrip pool, including a mixed set when it is superior or required by the active restrictions.
- Minimum Craftsmanship, Control and CP constraints are hard requirements; impossible combinations fail with the precise item, meld, food, medicine or threshold restriction that prevents completion.
- Locked items, materia-grade restrictions, advanced-meld legality, caps and waste remain valid throughout optimisation and cannot be bypassed by a generated alternative.
- Maximum-stat, budget, minimum-overmeld and balanced objectives produce meaningfully distinct, explainable alternatives when the underlying candidate pool permits them.
- Overmeld difficulty and cost are visible in ranking and explanation without pretending uncertain market prices or success costs are exact.
- A finished plan can be checked against zero, one or several optional recipe/rotation validation targets without changing its identity or creating duplicate saved/recommended sets.
- Validation explains which known thresholds pass or fail and identifies the versioned recipe/rotation assumptions used; recipe-specific simulation is not required to generate the plan.
- Older, replaced or inaccessible crafter gear and recipes cannot leak into the normal eligible pool through expansion, level or content filtering.

Tests:

- All-crafted, all-scrip and mixed crafted/scrip winners; locked crafted and scrip pieces; exclusions; no legal equipment combination; newest-tier replacement boundaries and later-expansion leakage.
- Exact, exceeded and impossible Craftsmanship, Control and CP thresholds; food off/automatic/locked; medicine off/assumed/locked; combined consumable breakpoints.
- Materia-family and grade restrictions; guaranteed slots; legal and illegal advanced melds; capped and wasted stats; overmeld-difficulty ranking; known-cost, unknown-cost and budget frontiers.
- Maximum-stat, budget, minimum-overmeld and balanced plan fixtures, including ties and cases where a nominally weaker equipment piece enables a better finished meld plan.
- One finished plan validated against multiple recipes and rotations without set duplication; validation added or removed without rerunning equipment optimisation; outdated or incomplete validation assumptions remain labelled.
- Independent Teamcraft/MIT-compatible formula and threshold fixtures where legally usable, including specialist, condition, durability and star-recipe boundaries; these fixtures validate the finished plan and do not define a separate per-recipe gear recommendation.

### M15 - Gatherer gear and materia optimiser

Status: **Planned**.

Deliver:

- Gatherer job/access data, the newest eligible crafted and scrip gear progression, gathering materia and food. Do not search every historical gatherer item when a newer tier straightforwardly replaces it.
- Narrow equipment optimisation across the eligible crafted and scrip pieces. Mixed crafted/scrip sets remain legal when they improve the finished plan or are needed for user restrictions, locked items or unusual Gathering, Perception or GP breakpoints.
- Materia-first optimisation that generates and compares complete gear-plus-meld plans rather than treating equipment and melding as unrelated steps.
- Locked items and minimum Gathering, Perception and GP thresholds, plus explicit food assumptions.
- Materia-family and grade limits, guaranteed slots, advanced melding legality, overmeld difficulty, stat caps and wasted-stat accounting.
- Practical plan objectives and alternatives, including maximum achievable stats, budget-conscious, minimum-overmeld and balanced plans. Costs or overmeld difficulty that cannot be known exactly remain explicit assumptions rather than invented precision.
- Optional, versioned node, item and rotation validation targets covering collectability, bonus thresholds, GP requirements and timed, legendary or folklore access. Validation targets do not create, save or recommend a separate equipment set per node or item.
- Clear provenance for gathering formulas, thresholds, gear progression, materia rules and any externally supplied node or rotation assumptions. Unknown hidden or community-derived data remains labelled rather than inferred.

Accept when:

- The optimiser returns reusable complete gatherer gear-and-meld plans from the newest eligible crafted and scrip pool, including a mixed set when it is superior or required by the active restrictions.
- Minimum Gathering, Perception and GP constraints are hard requirements; impossible combinations fail with the precise item, meld, food or threshold restriction that prevents completion.
- Locked items, materia-grade restrictions, advanced-meld legality, caps and waste remain valid throughout optimisation and cannot be bypassed by a generated alternative.
- Maximum-stat, budget, minimum-overmeld and balanced objectives produce meaningfully distinct, explainable alternatives when the underlying candidate pool permits them.
- Overmeld difficulty and cost are visible in ranking and explanation without pretending uncertain market prices or success costs are exact.
- A finished plan can be checked against zero, one or several optional node, item or rotation validation targets without changing its identity or creating duplicate saved/recommended sets.
- Validation explains node access and which known collectability, bonus-stat and GP rotation thresholds pass or fail, identifies the versioned assumptions used and keeps unknown data explicitly labelled.
- Older, replaced or inaccessible gatherer gear, nodes and folklore cannot leak into the normal eligible pool through expansion, level or content filtering.

Tests:

- All-crafted, all-scrip and mixed crafted/scrip winners; locked crafted and scrip pieces; exclusions; no legal equipment combination; newest-tier replacement boundaries and later-expansion leakage.
- Exact, exceeded and impossible Gathering, Perception and GP thresholds; food off/automatic/locked; food-enabled breakpoints.
- Materia-family and grade restrictions; guaranteed slots; legal and illegal advanced melds; capped and wasted stats; overmeld-difficulty ranking; known-cost, unknown-cost and budget frontiers.
- Maximum-stat, budget, minimum-overmeld and balanced plan fixtures, including ties and cases where a nominally weaker equipment piece enables a better finished meld plan.
- One finished plan validated against multiple normal, timed, legendary and collectable nodes without set duplication; validation added or removed without rerunning equipment optimisation; folklore, bonus and GP rotation boundaries; unavailable targets and incomplete assumptions remain labelled.

### M16 - Persistence, sharing, and interoperability

Status: **Planned**.

Deliver:

- Full saved-set and workspace management, naming, notes, folders/tags where justified and bulk comparison entry points.
- Versioned XIV Gear Lab project format for import/export, sharing and backup/restore of settings, workspaces, sets, custom items and calculation context.
- Durable schema migrations with preview, refusal and rollback for unsupported data.
- Hardened XivGear adapter with verified current examples, supported relic allocations and explicit compatibility versions.
- Continue to reject custom/missing identities from official XivGear export without silently dropping them.
- Preserve data providers, original curated-set author/community and hosting links, formula references, patch/version, snapshot, ruleset, evaluator identity and internal/external calculation attribution in saved workspaces, backups and native exports.

Accept when:

- Historical results remain reproducible or migrate only through an explicit copied result.
- A full local backup restores without changing identities or provenance.
- Round-tripping a project preserves its contextual attribution and source links exactly, including the explicit absence of community validation for independently generated preliminary results.
- Hostile, corrupt or future-schema imports fail safely.
- XivGear exports pass periodic manual import validation against the live application.

Tests:

- Corrupt/hostile/large imports; duplicate identities; schema migrations; backup/restore; custom/official boundary; snapshot unavailable; current XivGear import checklist.

### M17 - Reliability, accessibility, performance, and release readiness

Status: **Planned**.

Deliver:

- Close remaining M1 hardening: error boundary, lint/static policy checks and Electron security assertions.
- Measured performance tuning for realistic catalogues, optimiser pools, comparisons, updates and evaluator shortlist simulations.
- Accessibility audit: keyboard, screen reader, contrast, high zoom, reduced motion and non-colour status communication.
- Fresh-install/update/rollback, long-offline, provider-outage, malformed-cache and disk/quota recovery.
- Windows installer/portable release policy, code signing and executable auto-update plan; browser deployment remains supported by the shared core.
- End-to-end installed and portable cold-start budgets, including the current portable self-extraction overhead that sits outside M8's cached application-bootstrap measurement.
- Licences/notices, privacy statement, provider permissions and FFXIV materials-usage review for the intended distribution model.
- Final attribution audit covering direct-link accuracy, original authorship versus hosting, formula-component provenance, provider terms, link failure behaviour and non-endorsement wording.

Accept when:

- No supported job, level, content tier or evaluator mode lacks evidence-backed formulas and fixtures.
- Normal recommendation, comparison and update paths meet declared p95 budgets on minimum reference hardware.
- Release rights are documented; unsigned or unapproved public builds remain blocked as appropriate.
- Every externally sourced datum, curated set and formula used in a supported result has an appropriate visible credit and usable reference link, while internally developed work is labelled honestly.
- Critical journeys are usable with keyboard and assistive technology.

Tests:

- Full regression matrix; fresh install and migration from supported releases; data and executable update/rollback; long offline period; provider outage; malformed cache; minimum-hardware benchmarks; screen reader/keyboard/high zoom; security and distribution checklist.

## Do later / explicitly deferred

These ideas remain useful, but they are outside the committed milestones until their value justifies the added scope:

- Select or lock an official item directly from its main build-slot row instead of opening the separate Equipment constraints menu. The M10 modal remains the supported path for now.
- Hosted unattended patch watching, announcement-aware scheduling, adaptive polling and automatic publication. M11B deliberately provides a manual local launcher first; hosted automation can be reconsidered only after the patch workflow is proven and there is a real need for unattended operation.
- Exact Lodestone item links. M11's time-boxed research found that Lodestone uses separate opaque Eorzea Database IDs, while the official game item ID and XIVAPI v2 do not expose a trustworthy direct mapping. Search-result scraping or guessed links would not be maintainable enough for the app.

## Test layers used throughout

- Unit tests for policy, integer arithmetic, caps, transformations and adapters.
- Property tests for eligibility, dominance, deterministic ordering and optimiser legality.
- Contract tests from pinned provider fixtures; normal CI never depends on the live network.
- Differential tests against independently calculated small exhaustive searches and published references.
- Integration tests for snapshot activation, offline fallback, persistence, workers and export.
- UI tests for critical browser and packaged-Electron journeys plus manual accessibility/visual review.
- Explicit, rate-limited release checks against live providers and XivGear.

## Requirement traceability summary

| Product requirement | Owning milestone(s) |
| --- | --- |
| Safe live data refresh and offline fallback | M8 |
| Next expansion, two new jobs and evolved modes | M8, M13 |
| Three independent builds and comparison | M9 |
| Role colours and clear base/buffed GCDs | M9 |
| Full optimiser restrictions and hypothetical items | M10 |
| Expansion/level content legality, sources and costs | M11 |
| Preliminary patch recommendations without curated sets | M11-M13 |
| Owner-run local patch update and safe publication | M11B |
| Hosted adaptive unattended patch watch | Do later |
| Generic hit, opener and five-minute dummy | M12-M13 |
| Crafting | M14 |
| Gathering | M15 |
| Save/share/backup/XivGear hardening | M16 |
| Contextual source/formula attribution and direct links | M9, M12-M13, M16-M17 |
| Accessibility, performance, reliability and release | M17 |
