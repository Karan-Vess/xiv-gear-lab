# Changelog

This file records notable changes to XIV Gear Lab. It is maintained from 2026-07-16 onward; earlier prototype work is summarized under v0.6.3 because detailed release-by-release notes were not kept.

## Unreleased

No notable changes yet.

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
