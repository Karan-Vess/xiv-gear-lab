This entire project is made by instructing chatgpt 5.6. As of this writing, no human has looked at the code. I am familiar with basic coding practices and concepts but I cannot evaluate code quality.

# XIV Gear Lab

> [!WARNING]
> **Unfinished pre-release project.** This repository and its public data channel exist for active development and testing. The app is not a finished release, has no support or uptime promise, and should not yet be treated as authoritative gearing advice.

XIV Gear Lab is a standalone FFXIV gear recommendation and optimisation tool. It is designed as a Windows desktop application with a shared browser-capable core. The v0.12.0-alpha.1 executable bundles level-cap combat data for Dawntrail, Endwalker, Shadowbringers, Stormblood, Heavensward and A Realm Reborn and starts the isolated M14 crafter workspace.

The first end-to-end vertical slice began with current-patch White Mage. The combat-job expansion now supports all 21 standard combat jobs: four healers, four tanks, six melee DPS, three physical ranged DPS, and four magical ranged DPS.

## Try the Windows prototype

Run `release/XIV-Gear-Lab-0.12.0-alpha.1-portable.exe`. It is an unsigned, unfinished, non-commercial preview, so Windows may show an unknown-publisher warning. It does not require installation, the game client, an FFXIV account, logs, or plugins.

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
- [Combat formula and evaluator provenance](docs/data/formula-provenance.md)
- [Runtime data releases](docs/data/runtime-updates.md)
- [Prototype definition](docs/prototype/vertical-slice.md)
- [Milestones and acceptance criteria](docs/plan/milestones.md)
- [M13E owner beta checklist](docs/plan/m13e-owner-checklist.md)

## Changelog

Notable project changes are recorded in [CHANGELOG.md](CHANGELOG.md). It is updated alongside user-visible changes, milestone completions and releases.

## Implemented slice

- Current generated XIVAPI v2 candidate with 5,754 official combat-job items: 647 Dawntrail, 540 Endwalker, 609 Shadowbringers, 1,731 Stormblood, 1,025 Heavensward and 1,202 A Realm Reborn level-cap records, with official IDs, job eligibility, stats, caps, slots and content-addressed icons.
- Expansion-appropriate level-cap consumables with 84 materia and 48 foods. Intermediate levelling equipment is deliberately excluded.
- Sixty deduplicated final-tier references across all 21 standard combat jobs. Fifty-one exact Etro/The Balance combinations are cross-attributed, while genuinely distinct source variants remain separate and retain their original links.
- Independently identified level-100 evaluator profiles for every standard combat job, including Paladin's separate sword and shield budgets and the haste-adjusted GCDs used by Monk, Ninja, Samurai, and Viper.
- Background reference-pool optimisation across Critical Hit, Determination, Direct Hit, role speed, food, Piety or Tenacity, GCD, and acquisition constraints. The desktop defaults to a quality-first search with a substantially larger frontier and finalist pool, while Quick Preview is available for rapid constraint changes.
- Job selection with expansion/level availability, job-specific exact-GCD reference shortcuts, Tomestone-only/non-Savage paths, closest-attainable fallbacks, unique materia shorthand, inline highlighted rerun comparisons, clear source-pool availability and legality explanations, local saving, job-aware custom hypothetical overrides, and fail-closed official-only XivGear JSON export for all 21 supported combat jobs.
- Secure Electron host, direct browser build, immutable bundled offline snapshot, source/freshness display, keyboard focus states, and explicit calculation limitations.
- Data-driven expansion/job/evaluator registries, versioned formula compatibility gates, synthetic onboarding coverage for two future jobs and evolved modes, and evaluator-pending refusal rather than deceptive fallback maths.
- Explicit standard/evolved ruleset identity, exact per-ruleset capability status for catalogue, generic hit, opener and dummy evaluation, and component-level method attribution that separates authors, hosts and XIV Gear Lab-owned logic.
- Signed/checksummed runtime snapshot support with HTTPS/provider allowlists, bounded downloads, atomic IndexedDB activation, last-known-good fallback, manual rollback, pinned result context and embedded offline icons.
- Provider-specific XIVAPI, Etro, The Balance and XivGear contracts and normalisers, validated read-through response caches, independent official/acquisition/curated overlays, and safe stale-overlay publication when an optional source is unavailable.
- Versioned snapshot/icon and saved-set storage migrations, protected snapshot retention, bounded quota recovery, explicit unknown-context legacy saves and a repeatable packaged online/offline update drill.
- Three independently persistent build workspaces, a selectable-baseline comparison table, role-labelled job colours, named base/effective GCD states and per-result source/methodology details.
- A persistent top-level Combat / Craft & Gather mode switch. The isolated M14 crafting workspace now retains crafter, threshold, source, consumable, melding and objective settings; official crafter items and plan generation remain explicitly pending M14B. Gathering has a separate M15 landing state rather than combat-screen controls.
- Final post-materia stats on every equipped item, actual per-slot meld contributions, derived Critical Hit/Direct Hit/Determination outcomes, and direct loadout-copy controls between builds.
- Named exact or ranged GCD targets; expansion-appropriate Grade VII-XII materia and currently validated food; five-slot overmeld; official-item and locked-meld rules; actionable conflicts; and complete persistent custom equipment with cloning, caps, legal advanced melding and explicit hypothetical-access warnings.
- App-owned current-cap pilot evaluators for all 21 standard combat jobs, using safe declarative generated priorities for deterministic 30-second burst and 300-second dummy traces with explicit source attribution.
- Independent action or timing audit metadata for all 21 pilots, with checked components and unresolved approximations shown separately from method confidence. Jobs without a pinned job-specific XivGear simulator say so explicitly; every profile declares its aggregate, defensive, healing, party or alignment omissions.
- Selectable burst and dummy evaluation for all 21 pilots. Quality-first mode reranks up to 48 speed-diverse finalists and legal single-slot refinements in a background worker; Quick Preview uses up to 12. Compatible timing timelines are reused for damage-only stat changes.
- Visible DoT/cooldown cadence and strict-cutoff diagnostics, plus a 510-second sensitivity pass that warns when the same retained finalists prefer a different winner than the requested 300-second result.
- Healer MP sustainability with official damage-spell costs, Piety-based three-second regeneration, Lucid Dreaming, job-owned MP restoration and remaining-MP details on evaluated results.

The expected-single-100-potency-hit proxy and generated-priority 30-second burst and 300-second dummy modes are available for all 21 current standard combat jobs; the currently equipped set can also be evaluated in both windows without rerunning gear optimisation. All pilots have independent action or timing cross-checks, but deliberately remain `generated-preliminary`. Summoner fixes the elemental order and approximates Demi pet response timing; Red Mage folds Dualcast and procs into expected-value pairs; Pictomancer bounds Hyperphantasia as a timed haste window; and the other job profiles retain their explicitly listed approximations. None claims exact community opener alignment. Cast duration, recast availability and action lock are modelled separately, and speed or haste scales both cast and recast duration. The primary sustained score remains the requested 300-second dummy; a 510-second pass over the same retained finalists is only a visible duration-sensitivity audit. Healer results now spend MP and show remaining MP, but exclude healing-driven resource choices. Broad gear and rotation searches remain bounded because literal exhaustive enumeration grows beyond safe desktop memory and time budgets. Each generated result therefore states whether optimality was actually proven or whether it is the strongest result found within the retained search. Unrestricted GCD searches can still prefer a mathematically strong speed that is rotationally inferior under community job-specific alignment; use a recommended or user-specified GCD target for rotation-sensitive jobs. Incompatible historical rulesets remain visibly unavailable until their own M13 evaluators are installed. These are personal-damage dummy estimates, not encounter DPS, healing output or raid contribution. Historical evaluator profiles and acquisition details are explicitly preliminary until independently validated. Historical recommendations currently lack compatible community curation. Final Mandervillous weapons use optimised player-allocated stats, including Paladin's split sword and shield values. The v0.12.0-alpha.1 preview uses the existing public-read HTTPS channel with signed, immutable, compressed snapshots and a pre-trusted recovery key. Compatible downloaded catalogues retain their signed identity and newer item data while the executable overlays newer trusted built-in evaluator profiles; a still-newer compatible signed-channel profile wins over the bundled revision. `Check-Game-Data.cmd` performs a generic read-only availability check, while `Update-Game-Data.cmd` can produce an owner-reviewed preliminary patch candidate and blocks unknown jobs, levels or schemas before publication. Crafter plan generation, gathering optimisation, intermediate levelling gear, Blue Mage, Beastmaster, a signed executable installer, commercial use, and any claim that this is a supported public release remain out of scope for this alpha.

## Rights and project status

This repository, its Pages site, and the updater channel are an unfinished, unsupported, non-commercial preview. FINAL FANTASY XIV © SQUARE ENIX CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. XIV Gear Lab is unofficial and is not affiliated with or endorsed by Square Enix. FFXIV materials are used under the [FINAL FANTASY XIV Materials Usage License](https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc) and must be removed if Square Enix requests it. No FFXIV materials in this repository are offered for sale or commercial reuse.

## Verification

```powershell
npm test
npm run typecheck
npm run validate:m13e
# Slower, larger search frontiers:
npm run validate:m13e:deep
npm run verify:data-production
npm run package:windows:production
# Hosted signed-update/offline package drill:
npm run drill:hosted-update
```

The packaged smoke path uses an isolated local profile, runs a real optimisation in its production Web Worker, exercises persistence and custom-item controls, and captures the rendered result for review.
