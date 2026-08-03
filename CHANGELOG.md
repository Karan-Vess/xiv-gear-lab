# Changelog

This file records notable changes to XIV Gear Lab. It is maintained from 2026-07-16 onward; earlier prototype work is summarized under v0.6.3 because detailed release-by-release notes were not kept.

## Unreleased

## 0.12.0-alpha.1 - 2026-08-03

### Added

- Started M14 with separate versioned crafter job, stat, equipment, materia, consumable and plan-constraint contracts that cannot be mistaken for combat data.
- Added a persistent Combat / Craft & Gather mode switch and an independent crafting workspace for job, Craftsmanship, Control, CP, source, consumable, melding and plan-objective settings.
- Reserved a separate Gathering workspace for M15 instead of mixing gathering controls into either combat or crafting.

### Changed

- Advanced the preview line to v0.12.0-alpha.1 and made the unfinished M14A data state explicit: no crafter plan is generated until validated official equipment, materia and consumables are admitted in M14B.

### Validation

- Added migration and damaged-storage coverage for non-combat settings, a fail-closed crafter data-boundary fixture and a packaged Electron mode-separation/persistence smoke test.

## 0.11.0 - 2026-08-03

### Changed

- Completed M13 for the current Dawntrail standard-job scope after owner acceptance and deep validation across all 21 standard combat jobs. Next-expansion jobs and evolved modes remain time-gated until authoritative data exists.
- Kept Black Mage's unrestricted-GCD recommendation explicitly preliminary after an external XivGear comparison preferred the matched 2.14-second set. Exact 2.14-second optimisation reproduced the community set, confirming a declared evaluator-model limitation rather than a gear-search failure.
- Recorded that Viper reproduced its compared community set exactly and that XivGear independently ranked the unrestricted Samurai result slightly above the compared 2.14-second community set, while the exact 2.14-second search reproduced that set.

### Validation

- Passed the deep M13E acceptance matrix, including 159 automated tests, curated-free Quality First searches across all 21 standard jobs, Samurai cadence checks, healer MP sustainability, runtime compatibility and packaged desktop smoke paths.

## 0.11.0-beta.3 - 2026-08-01

### Added

- Added strict cutoff diagnostics, per-DoT cadence details and a visible 510-second sensitivity audit that reports when the same retained finalists prefer a different winner than the requested 300-second result.
- Added repeatable Samurai speed-tier and healer MP-sustainability acceptance audits.

### Changed

- Expanded Samurai's generated priority with Meikyo Shisui finishers, Tendo replacements and Higanbana Sen reservation instead of treating raw 300-second damage as the only cadence signal.
- Healer damage spells now spend MP. Natural Piety regeneration, Lucid Dreaming, White Mage Assize, Scholar Aetherflow and Astrologian Draw affect long-window uptime, and evaluated healer results show remaining MP.
- Advanced declarative rotation profiles to schema version 2 while retaining read compatibility with version 1 profiles.

### Fixed

- Rotation evaluation can now wait for a scheduled resource tick and resume instead of ending the entire timeline when the next action is temporarily unaffordable.
- Healer timing caches now include Piety, preventing equal-GCD sets with different MP sustainability from sharing an invalid action timeline.

## 0.11.0-beta.2 - 2026-07-29

### Changed

- Effective-level changes are now drafted until focus leaves the field or Enter is pressed. The control shows the installed level-cap evaluator choices and refreshes level-appropriate materia and food constraints when a supported level is applied.

### Fixed

- Typing a multi-digit effective level no longer briefly applies an unsupported intermediate value and crashes the renderer. Unsupported levels now leave the previous valid level active and explain which level-cap evaluators are installed.

## 0.11.0-beta.1 - 2026-07-29

### Added

- Added repeatable routine and deep M13E acceptance commands that consolidate timing, all-job optimisation, curated-free, persistence and runtime-compatibility checks into one report.
- Added a focused beta owner checklist for cast timing, broad-versus-exact GCD retention, independent build persistence, historical expansion safety and external comparison.

### Changed

- Started M13E acceptance with explicit cast-timing, cross-speed, evidence-hierarchy and external-comparison requirements across all 21 standard combat jobs.
- Time-gated next-expansion onboarding so unavailable future data does not block the current Dawntrail acceptance cycle.
- Deferred Blue Mage and Beastmaster optimisation until the standard-job application is otherwise complete and limited-job objectives can be defined from adequate evidence.

### Fixed

- Corrected casted-action timing so casts overlap their action lock and both cast and recast durations scale with the active speed and haste context. This removes artificial Black Mage clipping while preserving Summoner's genuine Slipstream overrun.

## 0.11.0-alpha.8 - 2026-07-29

### Added

- Completed M13C standard-job coverage with generated-priority 30-second and 300-second evaluators for Summoner, Red Mage and Pictomancer.
- Added magical-ranged mechanic fixtures and `npm run validate:m13c:casters` routine/deep curated-free validation commands.

### Changed

- Summoner models the Solar Bahamut, Bahamut, Solar Bahamut and Phoenix cycle, elemental attunements, pet attacks, Aetherflow and Searing Light.
- Red Mage models expected-value Dualcast pairs, balanced mana generation, the fixed-speed enchanted melee and finisher chains, Grand Impact, Vice of Thorns and Prefulgence.
- Pictomancer models additive and subtractive palettes, canvases, creature portraits, Hammer, Starry Muse and a bounded Hyperphantasia haste window.

## 0.11.0-alpha.7 - 2026-07-29

### Added

- Continued M13C with generated-priority 30-second and 300-second evaluators for Bard and Machinist, completing current physical-ranged coverage alongside Dancer.
- Added physical-ranged mechanic fixtures and `npm run validate:m13c:ranged` routine/deep curated-free validation commands.

### Changed

- Bard models damage-over-time upkeep, expected Hawk's Eye, a deterministic 45/45/30-second song cycle, Coda, Soul Voice, personal song effects and expected Repertoire damage; its provenance explicitly states that the pinned XivGear revision has no Bard-specific simulator.
- Machinist models heated combos, tools, fixed three-shot Hypercharge, six-hit Wildfire, Reassemble, Full Metal Field and the pinned 100-Battery Automaton Queen trace.

## 0.11.0-alpha.6 - 2026-07-29

### Fixed

- Downloaded catalogue caches no longer hide evaluator capabilities added by a newer executable. Compatible cached items and signed snapshot identity are retained while newer trusted bundled rotation profiles are applied in memory.
- A newer compatible signed-channel rotation profile still takes precedence over the executable's bundled revision.

## 0.11.0-alpha.5 - 2026-07-29

### Added

- Continued M13C with generated-priority 30-second and 300-second evaluators for Monk, Dragoon, Ninja, Reaper and Viper, completing current melee coverage alongside Samurai.
- Added official Job Guide and pinned XivGear cross-check references, melee-mechanic fixtures and `npm run validate:m13c:melee` routine/deep curated-free validation commands.

### Changed

- Monk models permanent Greased Lightning, expected-value Chakra, deterministic Blitz/nadi sequences and reply actions; Dragoon models both combo branches and Life of the Dragon; Ninja models aggregate Mudra sequences, Ninki, Bunshin and personal vulnerability windows; Reaper models Soul/Shroud and Enshroud; Viper models Vipersight, Vicewinder, Rattling Coils and Reawaken.
- The shared pilot engine now applies permanent job haste separately from maintained action buffs, preventing Monk and Ninja haste from being omitted without double-applying Samurai Fuka or Viper Swiftscaled.

## 0.11.0-alpha.4 - 2026-07-29

### Added

- Continued M13C with generated-priority 30-second and 300-second evaluators for Paladin, Warrior and Gunbreaker, completing current tank coverage alongside Dark Knight.
- Added official Job Guide and pinned XivGear cross-check references, tank-mechanic fixtures and `npm run validate:m13c:tanks` routine/deep curated-free validation commands.

### Changed

- Paladin models Fight or Flight, Goring Blade, Imperator, the Confiteor and Atonement chains, Blade of Honor and fixed base-recast spells; Warrior models Surging Tempest, Beast Gauge, Inner Release, guaranteed critical/direct-hit finishers and Primal Wrath; Gunbreaker models No Mercy, cartridge spending, Bloodfest, Reign of Beasts and complete Continuation chains.
- Warrior's Infuriate timing uses a visible effective-cooldown approximation until active cooldown reduction is supported by the signed profile contract.

## 0.11.0-alpha.3 - 2026-07-29

### Added

- Started M13C role-batch coverage with generated-priority 30-second and 300-second evaluators for White Mage, Scholar, Astrologian and Sage.
- Added official Job Guide and pinned XivGear cross-check references, per-healer audit metadata, role-mechanic fixtures and `npm run validate:m13c:healers` routine/deep curated-free validation commands.

### Changed

- The shared pilot engine now supports healer role identity, Mind damage profiles and spell-speed timing without job-name special cases.
- White Mage models Presence of Mind, Sacred Sight, Glare IV, Dia and Assize; Scholar models Chain Stratagem, Baneful Impaction, Aetherflow and Energy Drain; Astrologian models personal Divination, Oracle, Lord of Crowns and mature Earthly Star damage; Sage models its fixed Eukrasian DoT sequence, Phlegma charges and Psyche.
- Combat-potion provenance now links the main-stat variant appropriate to each supported evaluator.

## 0.11.0-alpha.2 - 2026-07-29

### Added

- Completed the M13B pilot audit with explicit independent cross-check metadata, dated source references, checked components and visible remaining limitations for Samurai, Dancer, Black Mage and Dark Knight.
- Added repeatable four-job curated-set ablation validation. Removing every curated warm start reproduces the same generated equipment and meld plan in the bounded validation scenario, with each result remaining within the declared one-percent comparability threshold against its community reference.
- Added `npm run validate:m13b` for the routine validation report and `npm run validate:m13b:deep` for the slower quality-first audit.

### Changed

- Samurai simulation now includes Kaeshi: Setsugekka and Zanshin in its generated priority.
- Dancer simulation now distinguishes Flourish-granted Finishing Move from the longer Standard Step sequence.
- Rotation methodology now shows independent trace-audit status separately from generated-priority confidence. Cross-checking a trace does not mislabel the generated method as a community-authored opener.

## 0.11.0-alpha.1 - 2026-07-29

### Added

- Started M13 with explicit standard/evolved ruleset mode identity, an exact per-ruleset capability resolver, and calculation contexts that pin both job mode and evaluation mode.
- Added compact per-build ruleset controls and catalogue, 100-potency, 30-second and 300-second capability status. Missing evolved or rotation profiles remain visible but cannot borrow standard-mode logic.
- Added component-level generic-hit method references that distinguish original author, hosting platform, external formula cross-checks and XIV Gear Lab-owned implementation/ranking.
- Added deterministic migration from pre-M13 workspaces to the standard mode while preserving all three independent builds.

### Changed

- Optimizer, recalculation and simulator profile lookup now use the selected job mode throughout, including warm starts, generated results, copied builds and opened saved sets.
- Local workspace storage advanced to schema version 2 and database version 7.

## 0.10.0-beta.5 - 2026-07-28

### Added

- Added per-build search effort controls. Quality First is the desktop default, while Quick Preview retains the earlier interactive search size.
- Added explicit result optimality status. The app only says optimality is proven when no legal frontier was truncated; bounded simulator results are labelled as the strongest result found instead.

### Changed

- Quality-first searches retain up to six times the normal gear frontier, simulate up to 48 speed-diverse finalists and inspect legal single-slot neighbours around the leading sets.
- Preserved weapon-delay identity during candidate pruning and whole-set deduplication, and safely rejects partial branches that cannot reach a strict ranged GCD constraint.
- Documented that unrestricted GCD searches can still favour a mathematically strong but rotationally inferior speed; recommended or explicit GCD targets remain the reliable path for rotation-sensitive jobs.

## 0.10.0-beta.4 - 2026-07-28

### Changed

- Rotation-mode range searches now reserve simulator finalists for the strongest distinct GCD tiers before spending the remaining shortlist on raw throughput and broad speed samples. A broad Samurai search using only Grade XI and XII materia no longer skips its stronger legal 2.14-second result.

## 0.10.0-beta.3 - 2026-07-28

### Added

- Published the owner-verified Patch 7.55 official-data catalogue through the signed data channel with 831 level-100 items (xivapi-7583112015aaef5d-dt-ew-shb-sb-hw-arr-1dfe5fad937bbf1e).

- Published the owner-verified Patch 7.55 official-data catalogue through the signed data channel with 647 level-100 items (xivapi-7583112015aaef5d-dt-ew-shb-sb-hw-arr-5a003864eb5dfba5).

- Added `Check-Game-Data.cmd`, a generic read-only owner tool that reports whether the configured providers expose no change, a compatible official change or data requiring application compatibility work.

### Changed

- Rotation-mode optimisation now preserves competitive speed lanes during bounded gear search, retains high-throughput GCD tiers and gives curated warm starts the same legal strictly dominating item and Relic-allocation improvements as generated sets. Inferior Savage weapons can no longer reach the simulator while a same-timing Ultimate or configurable Relic upgrade is available.
- Fixed patch updates silently omitting new official equipment when a supporting provider lagged behind XIVAPI. Official sheet search now discovers the candidate pool directly, and Phantom Weapon allocations are derived from the official enhancement data.
- Added Patch 7.55 Phantom Weapon Occultum acquisition metadata and raised the default item-level ceiling to 795.
- Made long-running owner publications accept an exact explicit confirmation argument so Windows cannot close a piped approval before validation finishes.
- Made hosted publication verification wait for the exact newly signed snapshot instead of accepting an older valid release while deployment is still in progress.
- Made the owner-run data publication confirmation recover from typing mistakes by prompting again, while deliberate cancellation now restores the generated candidate instead of blocking the next update attempt.
- Expanded the M13 acceptance checklist with curated-set ablation tests, requiring generated optimisation to demonstrate comparable results without curated warm starts and to disclose any material quality gap.

## 0.10.0-beta.2 - 2026-07-28

### Added

- Added a three-score equipped-set panel with an always-visible 100-potency proxy and one-click 30-second and 300-second results without rerunning gear optimisation. Rotation results retain the selected potion assumption and visibly expire when the loadout or assumption changes.

### Changed

- Mixed proxy and simulator builds now retain a directly comparable 100-potency value and delta. Rotation damage is reported through a separate compatibility-aware comparison.
- Marked M12 complete after owner acceptance of the combat evaluator and equipped-set evaluation workflow.

## 0.10.0-beta.1 - 2026-07-26

### Added

- Completed M12E with selectable generic-hit, 30-second burst and 300-second dummy modes. Samurai, Dancer, Black Mage and Dark Knight rerank a bounded speed-diverse finalist shortlist in the background; unsupported jobs and incompatible rulesets remain visibly unavailable.
- Added per-result rotation totals, DPS, action/GCD/oGCD counts, clipping, method confidence, fallback warnings, direct references and compatible-timeline reuse diagnostics to build and comparison views.
- Added the M12D current-cap pilot evaluators: deterministic Samurai Sen and Iaijutsu priorities, expected-value Dancer procs, Black Mage cast-state and Polyglot timing, and Dark Knight's delayed Living Shadow sequence. All four run generated 30-second and 300-second profiles with direct official, community-consumable, pinned XivGear-oracle and XIV Gear Lab methodology references.
- Added the M12C hybrid rotation policy: patch- and assumption-matched community openers hand off to ordered generated priorities, while missing, stale, potion-mismatched or party-buff-mismatched openers fall back with an explicit warning. Declarative conditions, safe-weave enforcement, controlled clipping, consumable filtering and per-action decision traces are covered for exact 30-second and 300-second runs.
- Added the M12B deterministic integer-millisecond combat scheduler with exact action/application cutoffs, casts, locks, weaving checks, sequential charges, cooldown drift, buff and DoT snapshots, global ticks, combos, resources, expected procs, app-owned mechanic state, delayed pet actions, auto-attacks, cancellation and bounded timing-template caching.
- Started M12 with a safe versioned combat-rotation profile contract, generated-priority/community-opener method states, direct methodology references, timing-cache identities and strict compatibility validation. Executable mechanics remain app-owned while signed data may update compatible actions, priorities and opener sequences.
- Added the complete level-cap catalogue baseline: 1,202 A Realm Reborn items, Grade I/II materia, five level-50 foods, a level-50 ruleset and ten preliminary cap-job evaluator profiles.
- Added expansion-appropriate cap foods for all six supported expansions, bringing the catalogue to 5,754 official items, 84 materia and 48 foods without including intermediate levelling gear.
- Added `Update-Game-Data.cmd`, which detects compatible official patch changes, blocks unknown jobs, levels or schemas, supports an explicit later supporting-source refresh, and preserves owner confirmation before signing or publication.
- Added validated AAC Cruiserweight M4 (Savage) routes for Babyface Champion weapons and Khloe certificate exchanges for Ornate Courtly Lover body armour.
- Added 1,025 preliminary Heavensward level-60 items, Grade III/IV materia and 13 cap-job evaluator profiles through the owner-run signed data channel (xivapi-f8764efd76cdb31a-dt-ew-shb-sb-hw-30515b767b74635d).

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

- The optimiser now keeps a speed-diverse twelve-set finalist shortlist after the fast proxy search, then optionally reranks it by rotation total damage. Damage-only stat changes reuse matching timing timelines while recalculating each set's damage.
- Optimisation and rotation reranking report progress from a Web Worker, can be cancelled without blocking the renderer, and explain when action timing changes the winning set.
- Extended combat profile and timing support for independent GCD cooldowns, guaranteed or disabled hit expectations, accumulated deterministic proc costs, periodic resources and explicit cast-snapshot versus delayed-application state changes.
- Hardened signed combat-rotation profiles with validated potion actions, opener assumptions, condition values, clipping policies and a mandatory unconditional GCD fallback for generated rotations.
- Hardened bounded optimisation before M12: provably dominated official items are removed without excluding stronger lower-item-level alternatives, remaining-slot bounds guide frontier retention, impossible resource branches stop early, and locked equal-stat unique rings remain distinct. The broad all-grade Paladin stress case retains the same result while evaluating about 46% fewer combinations.
- Historical materia now follows its own expansion-era advanced-melding limits: high-grade even tiers are restricted to the first advanced slot while the applicable lower grades can fill later overmeld slots.
- Historical acquisition records now require an explicit validated or partial route state. Family-classified preliminary routes remain usable without pretending that an unverified duty, vendor or cost is exact.
- Snapshot identities now include the content-access graph, preventing changed duty, vendor or prerequisite data from reusing an immutable catalogue ID.
- Marked M11 and M11B complete with all six level-cap catalogues populated, while retaining exact historical route enrichment and later community curation as ongoing data maintenance.
- Advanced-meld searches now compress equivalent materia choices, remove dominated completed meld plans and item outcomes, preserve speed diversity in bounded slot shortlists, and maintain a fixed-size whole-set frontier. Broad all-grade searches no longer overflow the JavaScript call stack and complete without unbounded memory growth.
- Combat-job regression tests now select an explicit expansion and level cap, preventing historical catalogue growth from making current-tier tank checks search unrelated equipment.
- Older signed channels that do not yet contain a newly supported expansion now show a clear "compatible data has not been published yet" message while preserving the strict rollback guard. Raw count diagnostics are available under optional technical details.
- Expansion choices with calculation support but no published gear catalogue now tell users to check again after release instead of instructing them to run the repository owner's local updater.
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
