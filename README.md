This entire project is made by instructing chatgpt 5.6. As of this writing, no human has looked at the code. I am familiar with basic coding practices and concepts but I cannot evaluate code quality.

# XIV Gear Lab

> [!WARNING]
> **Unfinished pre-release project.** This repository and its public data channel exist for active development and testing. The app is not a finished release, has no support or uptime promise, and should not yet be treated as authoritative gearing advice.

XIV Gear Lab is a standalone FFXIV gear recommendation and optimisation tool. It is designed as a Windows desktop application with a shared browser-capable core. The v0.9.0-alpha.17 executable bundles Dawntrail, Endwalker and preliminary Shadowbringers data, and is prepared to receive preliminary Stormblood level-70 support through the signed M11B data channel.

The first end-to-end vertical slice began with current-patch White Mage. The combat-job expansion now supports all 21 standard combat jobs: four healers, four tanks, six melee DPS, three physical ranged DPS, and four magical ranged DPS.

## Try the Windows prototype

Run `release/XIV-Gear-Lab-0.9.0-alpha.17-portable.exe`. It is an unsigned, unfinished, non-commercial preview, so Windows may show an unknown-publisher warning. It does not require installation, the game client, an FFXIV account, logs, or plugins.

The same renderer builds as a browser application. For local development:

```powershell
npm run dev:web
```

For the desktop development host:

```powershell
npm run dev:desktop
```

## Product principles

- Do not require the game client, an account, logs, plugins, packet capture, or game files.
- Keep official game data, community recommendations, calculated results, acquisition annotations, and user-created items visibly distinct.
- Pin every saved result to its data, calculation, and source versions.
- Explain why a set was selected and offer practical alternatives instead of presenting one opaque answer.
- Fail closed when data, formulas, source rights, or export compatibility are uncertain.

## Documents

- [Product discovery](docs/discovery/product-discovery.md)
- [Architecture](docs/architecture/architecture.md)
- [Data and source policy](docs/data/source-policy.md)
- [Combat proxy formula provenance](docs/data/formula-provenance.md)
- [Runtime data releases](docs/data/runtime-updates.md)
- [Prototype definition](docs/prototype/vertical-slice.md)
- [Milestones and acceptance criteria](docs/plan/milestones.md)

## Changelog

Notable project changes are recorded in [CHANGELOG.md](CHANGELOG.md). It is updated alongside user-visible changes, milestone completions and releases.

## Implemented slice

- Current generated XIVAPI v2 candidate with 3,498 official combat-job items: 618 Dawntrail records, 540 Endwalker level-90 records, 609 preliminary Shadowbringers level-80 records and 1,731 preliminary Stormblood level-70 records, with official IDs, job eligibility, stats, caps, slots and content-addressed icons. The frozen alpha.17 executable still bundles the pre-Stormblood 1,767-item baseline for the M11B update drill.
- Sixty deduplicated final-tier references across all 21 standard combat jobs. Fifty-one exact Etro/The Balance combinations are cross-attributed, while genuinely distinct source variants remain separate and retain their original links.
- Independently identified level-100 evaluator profiles for every standard combat job, including Paladin's separate sword and shield budgets and the haste-adjusted GCDs used by Monk, Ninja, Samurai, and Viper.
- Background reference-pool optimisation across Critical Hit, Determination, Direct Hit, role speed, food, Piety or Tenacity, GCD, and acquisition constraints.
- Job selection with expansion/level availability, job-specific exact-GCD reference shortcuts, Tomestone-only/non-Savage paths, closest-attainable fallbacks, unique materia shorthand, inline highlighted rerun comparisons, clear source-pool availability and legality explanations, local saving, job-aware custom hypothetical overrides, and fail-closed official-only XivGear JSON export for all 21 supported combat jobs.
- Secure Electron host, direct browser build, immutable bundled offline snapshot, source/freshness display, keyboard focus states, and explicit calculation limitations.
- Data-driven expansion/job/evaluator registries, versioned formula compatibility gates, synthetic onboarding coverage for two future jobs and evolved modes, and evaluator-pending refusal rather than deceptive fallback maths.
- Signed/checksummed runtime snapshot support with HTTPS/provider allowlists, bounded downloads, atomic IndexedDB activation, last-known-good fallback, manual rollback, pinned result context and embedded offline icons.
- Provider-specific XIVAPI, Etro, The Balance and XivGear contracts and normalisers, validated read-through response caches, independent official/acquisition/curated overlays, and safe stale-overlay publication when an optional source is unavailable.
- Versioned snapshot/icon and saved-set storage migrations, protected snapshot retention, bounded quota recovery, explicit unknown-context legacy saves and a repeatable packaged online/offline update drill.
- Three independently persistent build workspaces, a selectable-baseline comparison table, role-labelled job colours, named base/effective GCD states and per-result source/methodology details.
- Final post-materia stats on every equipped item, actual per-slot meld contributions, derived Critical Hit/Direct Hit/Determination outcomes, and direct loadout-copy controls between builds.
- Named exact or ranged GCD targets; expansion-appropriate Grade VII-XII materia and currently validated food; five-slot overmeld; official-item and locked-meld rules; actionable conflicts; and complete persistent custom equipment with cloning, caps, legal advanced melding and explicit hypothetical-access warnings.

All 21 current combat jobs use bounded expected-single-100-potency-hit proxy profiles rather than rotation or encounter simulation, and the UI labels that limitation explicitly. Endwalker and Shadowbringers use separate cap-specific formula constants; Shadowbringers evaluator profiles and acquisition details are explicitly preliminary until independently validated. Historical recommendations currently lack compatible community curation. Final Mandervillous weapons use optimised player-allocated stats, including Paladin's split sword and shield values. The v0.9.0-alpha.17 preview uses the existing public-read HTTPS channel with signed, immutable snapshots and a pre-trusted recovery key. Its bundled catalogue stops at Shadowbringers, while dormant level-70, level-60 and level-50 formula support prepares the unchanged client to accept older cap catalogues through signed data updates. Crafting-job optimisation, gathering, bundled pre-Shadowbringers historical tiers, a signed executable installer, commercial use, and any claim that this is a supported public release remain out of scope.

## Rights and project status

This repository, its Pages site, and the updater channel are an unfinished, unsupported, non-commercial preview. FINAL FANTASY XIV © SQUARE ENIX CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. XIV Gear Lab is unofficial and is not affiliated with or endorsed by Square Enix. FFXIV materials are used under the [FINAL FANTASY XIV Materials Usage License](https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc) and must be removed if Square Enix requests it. No FFXIV materials in this repository are offered for sale or commercial reuse.

## Verification

```powershell
npm test
npm run typecheck
npm run verify:data-production
npm run package:windows:production
# Hosted signed-update/offline package drill:
npm run drill:hosted-update
```

The packaged smoke path uses an isolated local profile, runs a real optimisation in its production Web Worker, exercises persistence and custom-item controls, and captures the rendered result for review.
