# Changelog

This file records notable changes to XIV Gear Lab. It is maintained from 2026-07-16 onward; earlier prototype work is summarized under v0.6.3 because detailed release-by-release notes were not kept.

## Unreleased

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
