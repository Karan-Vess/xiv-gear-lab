# Changelog

This file records notable changes to XIV Gear Lab. It is maintained from 2026-07-16 onward; earlier prototype work is summarized under v0.6.3 because detailed release-by-release notes were not kept.

## Unreleased

### Added

- Added an owner-run `Update-Heavensward-Data.cmd` workflow that builds and validates the level-60 candidate locally, shows its coverage, and requires the exact `PUBLISH HEAVENSWARD` confirmation before signing, committing or uploading anything.
- Added a preliminary Heavensward level-60 ruleset and 13 internal evaluator profiles to the client while deliberately leaving the level-60 item and Grade III/IV materia catalogue absent for the frozen-client update test.
- Added gzip delivery for signed runtime snapshots. Checksums and signatures cover the compressed payload, and the client applies separate compressed and expanded size limits before activation.
- Added a full-app recovery screen for unexpected renderer or startup failures, with safe reload and build-workspace reset actions instead of an unexplained blank window.
- Added a preliminary Stormblood level-70 catalogue with 1,731 items across all 15 jobs available at that cap, eleven classified source families, Grade V/VI materia, a level-70 ruleset and 15 internal-preliminary evaluator profiles.
- Added dormant level-70, level-60 and level-50 calculation-schema compatibility so a frozen client can accept future Stormblood, Heavensward and A Realm Reborn cap catalogues through the signed data channel without an executable rebuild.
- Added a persistent Settings page with whole-interface scaling from 90% to 175%. Desktop builds use native Chromium zoom while browser builds retain a CSS fallback.
- Added the first M11B local catalogue-update assistant with read-only inspection, explicit historical-backfill application, cap/job/slot readiness checks, separate size budgets, machine-readable reports and a hard prohibition on signing or publication from unfinished patch mode.
- Added a preliminary Shadowbringers level-80 catalogue containing 609 official items across all 17 jobs available at that cap, ten source families, Grade VII/VIII materia, a level-80 ruleset and 17 explicitly internal-preliminary evaluator profiles.
- Added content-addressed item, food and materia icons. The generated catalogue now reuses one physical asset for byte-identical icons while preserving each record's own identity and labels.
- Added all 20 final Endwalker Mandervillous arms as level-90 relic candidates, including Paladin's correctly split sword-and-shield allocation and validated upgrade routes.
- Added a versioned discrete relic-stat model. The optimiser now chooses two large and one small legal stat allocation, displays it on the equipped item, includes it in change comparisons, and preserves it in calculations and saves.
- Added the first historical-cap slice: 540 Endwalker level-90 items for its 19 combat jobs across dungeon, HQ crafted, normal-raid, Savage, tomestone, augmented-tomestone, alliance-raid, Extreme-trial, relic and Ultimate sources.
- Added an Endwalker level-90 calculation ruleset and job profiles, 635 validated historical acquisition routes, Grade IX/X materia and eight level-90 foods.
- Added expansion-aware formula constants and cap-specific item, food, materia, source, lock and readiness filtering so level-90 optimisation cannot leak Dawntrail records.
- Added all seven Grade XI and Grade XII combat materia families to the active catalogue, including Piety, so legal five-slot crafted overmelds can mix high- and low-grade materia.
- Added 308 current-patch items across HQ Courtly Lover crafted and augmented-crafted gear, Heavyweight normal-raid gear, Praemagitek dungeon gear, Runaway trial weapons and Phantom Obscurum relic weapons, with validated or explicitly partial acquisition routes and official local icons.
- Added fixed Heavyweight token, Courtly augmentation, Runaway Totem and repeatable Phantom Obscurum costs, plus current access-graph nodes for their duties, recipe, vendors and relic quest.
- Added per-build individual item-level constraints with unrestricted, exact, and range modes; official, custom, required, locked, generated, and curated candidates all follow the selected bounds.
- Added M11 content/access and acquisition-route contracts, alternate-route eligibility checks, fixed and recurring cost metadata, complete acquisition-source taxonomy, and item-level route details in build results.
- Added 35 Vana'dielian alliance-raid armour pieces, 22 weapons from The Unmaking (Extreme), and 22 Palazzo Diamond Ultimate weapons to the selectable current-tier catalogue.
- Added validated Windurst treasure, Unmaking drop/totem, and Dancing Mad totem routes, including exact fixed token costs and official local source/token icons.
- Added patch-readiness gates and explicit community-validated, official-preliminary, incomplete-acquisition and evaluator-outdated recommendation confidence states.
- Added HQ-only crafted-equipment normalisation using official HQ stat and weapon-damage bonuses, with NQ crafted candidates rejected by compatibility and readiness checks.
- Added a dedicated acquisition column after Materia, using official in-game source and cost icons with expandable duty, vendor, location, route and reference details.

### Changed

- Heavensward can now be selected in the deliberately incomplete test client and reports that its level-60 catalogue must be supplied through the local updater and Check data flow.
- The Heavensward backfill profile now accepts only level-60 items in the i235-i275 cap range, keeps HQ-only crafted gear, adds Grade III/IV materia, and classifies preliminary historical source families.
- Expansion choices whose calculation data is not installed now remain on the current build and direct the user to Check data instead of crashing the interface. Persisted prototype builds with unavailable evaluator data reset safely during startup.
- Updated the packaged hosted-update drill to target the current build optimiser control after the M9 workspace redesign.
- Optimizer result construction now uses an indexed item lookup, preventing historical catalogue growth from making unrelated current-tier searches scan the full item list for every equipped piece.
- Historical backfill discovery now retains existing populated expansions and rejects cross-expansion records outside each configured level-cap and item-level slice.
- Snapshot identities now fingerprint stable item stats, materia, food, acquisition and curated-set content, so metadata changes cannot reuse an immutable release ID while timestamp-only rebuilds remain stable.
- Provider-ID icon refresh copies remain local and ignored by Git; only deduplicated content-addressed assets and signed channel payloads are distributed.
- Stormblood acquisition families are available to the optimiser with visibly partial route metadata; exact historical duties, vendors, costs, food and curation remain pending validation.
- Catalogue generation now retries transient Windows file-lock failures when replacing the generated snapshot.
- Switching expansions now resets level-dependent resource minima, selects compatible materia grades, clears an inaccessible locked food and cancels any stale search while preserving source, GCD, item-level and custom-equipment choices. Optional food now permits a foodless result when the selected expansion has no populated compatible foods.
- Corrected the sandboxed Electron preload format so the desktop bridge, including native UI scaling, loads in packaged builds.
- Snapshot identities now include the selected expansion profiles and a deterministic catalogue-content fingerprint, preventing different same-day candidates from sharing an immutable release ID.
- Release builds exclude provider source-ID icon copies after generating the deduplicated content-addressed asset set.
- Shadowbringers acquisition families are available to the optimiser with visibly partial route metadata; exact historical duties, vendors, costs, foods and curated sets remain pending validation.
- Reworked configurable relic stats into a compact, labelled chip layout in the Materia column.
- Fixed an Endwalker relic result-rendering crash caused by the materia-slot display dropping the weapon's chosen configurable stat allocation.
- XivGear export now uses the build's actual level and emits compatible Endwalker relic-stat keys instead of hardcoding level 100 and dropping configurable weapon stats.
- Historical recommendations now check curation against the selected job, level and ruleset, so Endwalker official-data results cannot inherit a false community-validated label from Dawntrail sets.
- Existing workspaces automatically enable newly added Grade IX-XII materia once while preserving deliberate materia-grade choices after migration.
- Overmeld optimisation now permits useful partially wasted melds, treats waste as a tie-breaker rather than a damage penalty, and keeps deliberate partial overmeld plans when further melds add nothing.
- Optimising after opening a curated or saved set now highlights every item, meld and food change against that previously displayed set.
- Added a `Use augmented crafted gear` sub-toggle so crafted-source searches can use only the base HQ set when desired.
- Rescoped planned M14 and M15 around reusable crafter and gatherer gear-and-meld plans using the newest eligible crafted and scrip progression. Recipe, rotation, node and item targets are optional threshold validation and no longer imply separate saved or recommended sets per target.
- Added a `Use upgraded tomestone gear` acquisition toggle, defaulting on for existing builds, so base tomestone gear can be compared against equal-item-level sources without augmented pieces taking over.
- Applying or creating a custom item now re-enables custom equipment automatically, and an equipped custom ring satisfies the second-ring requirement when the selected official sources provide only one unique ring.
- Acquisition categories now state which equipment slots their current catalogue covers, and incomplete source combinations report every missing slot instead of incorrectly reducing the failure to unique rings.
- Prefer newer compatible data bundled with an app update over an older downloaded cache, while preserving explicit data rollbacks and retained snapshots.
- Condensed acquisition details into grouped duty/vendor entries, removed repeated route prose and references, and show the base tomestone price for augmented gear alongside its upgrade material.
- Enabled direct HTTPS links to the FFXIV Community Wiki references used by the acquisition overlay.
- Separated food, materia and custom-equipment controls into clearly labelled groups; materia grade restrictions now explain that selecting no grades intentionally leaves all materia slots empty.
- Current-tier tomestone, augmented-tomestone and Savage items now carry versioned acquisition routes, known fixed costs, recurrence classifications and honest partial states for requirements that are not yet fully verified.
- Acquisition-source controls now expose the full M11 taxonomy and enable a category only when the active catalogue includes usable route coverage.
- Marked M11 in progress and deferred exact Lodestone item links after the time-boxed check found no trustworthy mapping from game item IDs to Lodestone's separate opaque database IDs.
- Adopted Semantic Versioning for pre-release builds: incomplete milestone builds use `alpha`, feature-complete testing uses `beta`, acceptance candidates use `rc`, completed milestones remove the suffix, and patch numbers are reserved for fixes and polish.
- Corrected current Savage floor and book-exchange routes, vendor coordinates, Universal Tomestone 3.0 weapon costs and the Thundersteeping Glaze item name.
- Renamed the compact upgraded-tomestone route label from `Savage material` to `Tomestone upgrade`.

## 0.8.1 - 2026-07-16

### Changed

- Tank build summaries and comparisons now show Tenacity's outgoing damage/healing increase and incoming damage reduction; healer views show total MP restored per three-second recovery tick and the amount added by Piety.
- Added direct Allagan Studies formula attribution for the new Dawntrail Tenacity and Piety calculations.
- Grouped official custom-item clone choices by equipment slot and sorted each group by descending item level, source and item name.
- Removed the misleading editable GCD target-name field; result wording is now generated from the selected target values and timing state.
- Renamed the equipment-rule launcher to `Equipment constraints`.
- Replaced the planned hosted M11B patch watcher with a locally run, owner-controlled patch-update assistant; unattended hosted watching and direct per-slot equipment selection are explicitly deferred.

## 0.8.0 - 2026-07-16

### Added

- Added named exact or ranged GCD targets, food off/automatic/locked modes, materia-family and grade filters, advanced-meld permission, and custom-item/access controls.
- Added official-equipment required, excluded and exact-slot locks plus slot-specific locked meld prefixes with actionable conflict explanations.
- Added complete hypothetical equipment with official/custom cloning, duplication, job and access metadata, final-stat and meldable-base modes, editable caps and slots, notes, costs, source descriptions, and generic, reused or local user icons.
- Added an explicit experimental future/inaccessible access override; affected build tabs, details, comparisons and saved-set cards are marked hypothetical.

### Changed

- Grade XII materia is now restricted to the first advanced meld slot, while explicitly unrestricted lower-grade fixtures can fill later pentameld slots.
- Custom-item deletion is blocked while a saved set references the item, and incompatible edits safely unequip it from affected workspaces.
- Local storage now uses custom-item schema v2 and migrates older workspace constraints onto safe M10 defaults.

## 0.7.3 - 2026-07-16

### Changed

- Black Mage results now show both base GCD and temporary Ley Lines GCD while explicitly identifying Base GCD as the optimiser target.
- Completed M9 regression coverage for named timing states, comparison compatibility and incomplete or community-influenced provenance.

## 0.7.2 - 2026-07-16

### Changed

- Equipped-item rows now separate final post-materia item stats from materia slots, with every slot showing its actual stat contribution after caps.
- Custom weapons now use job-appropriate default delays and expose editable weapon delay with realistic fast/slow bounds plus the existing unrealistic-value override.

## 0.7.1 - 2026-07-16

### Added

- Added compact raw-stat lines to every equipped item and derived Critical Hit, Direct Hit and Determination outcome percentages to build summaries and comparisons.
- Added direct loadout-copy controls between build workspaces while keeping destination access and acquisition restrictions independent.

### Changed

- Simplified job-picker group labels to Tanks, Healers and DPS; the existing accessible role colours remain visual styling rather than redundant label text.

## 0.7.0 - 2026-07-16

### Added

- Added three persistent, independent build workspaces and a comparison view with selectable baseline, compatibility warnings, stat/timing/constraint differences and inspectable equipment changes.
- Added role-labelled and role-coloured job choices plus explicit base and maintained-haste GCD values.
- Added per-result methodology and provenance details that distinguish provider data, curated influence, external formula references and XIV Gear Lab-owned calculations.
- Added an exact-host allowlist for external source links in both the browser UI and packaged desktop host.

### Changed

- Shared custom-item edits and deletions now update every affected build while keeping equip state and replaced-item fallbacks independent per build.
- Generated alternatives are no longer presented as unexplained result tabs; the optimiser's primary recommendation occupies the active build workspace.

### Documentation

- Added the explicit AI-authorship and unreviewed-code disclosure to the top of the README.
- Added this changelog and a repository instruction requiring it to be maintained with future notable changes.

## 0.6.3 - 2026-07-16

### Added

- Completed the M8 runtime-data foundation across v0.6.0 through v0.6.3: signed snapshot manifests, compatibility checks, atomic activation, rollback and cached offline operation.
- Added provider-specific XIVAPI, Etro, The Balance and XivGear ingestion contracts with validated caches and independently versioned official, acquisition and curated overlays.
- Added versioned snapshot retention, storage migrations, quota recovery and saved-result calculation provenance.
- Published a public-read GitHub Pages data channel with immutable signed snapshots and separate production and recovery trust keys.
- Verified the packaged Windows application through a hosted online-update and network-disabled relaunch drill.
- Added data-driven onboarding support for future expansions, evolved modes and two new jobs without assuming that unsupported evaluators are valid.

### Current prototype coverage

- Supports all 21 standard level-100 combat jobs with 231 current-tier items, 6 materia, 4 foods and 60 curated set references.
- Uses a bounded expected single 100-potency-hit proxy. It does not yet simulate openers, rotations or encounters.
- Includes an unsigned Windows portable preview and a shared browser-capable renderer.

### Known limitations

- The project remains an unfinished, unsupported, non-commercial preview and is not authoritative gearing advice.
- Historical tiers, complete acquisition families, crafting, gathering, combat rotation evaluators, signed installers and full release hardening remain planned work.
- The portable executable has measurable self-extraction startup overhead that remains assigned to M17.
