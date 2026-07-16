# Architecture

Status: implementation baseline
Date: 2026-07-16

This document describes the target architecture as well as the implemented shell. In v0.6.3, local persistence covers settings, custom items, saved sets and versioned data snapshots. Signed runtime download, compatibility validation, provider-isolated synchronisation, partial-freshness overlays, atomic activation, schema migration, quota recovery, protected retention, bundled/previous fallback and manual rollback are implemented. The production build trusts project-controlled stable and recovery public keys, and its GitHub Pages HTTPS channel has passed local, hosted and packaged online-to-offline verification.

## Shape

The application is a TypeScript workspace with a React/Vite renderer shared by two hosts:

```text
apps/web                 browser/PWA host
apps/desktop             secure Electron shell
packages/domain          identities, constraints, provenance, access policy
packages/calculations    integer-safe FFXIV stat calculations
packages/optimizer       search, Pareto pruning, alternatives, explanations
packages/data            provider adapters, validation, snapshots, caching
packages/export          XivGear and future compatibility adapters
```

Electron is selected over Tauri for the first build because Node is already available, while the current machine has no Rust toolchain. Keeping Electron thin preserves a direct route to a browser build and avoids prematurely maintaining two implementations.

The desktop security baseline follows Electron's documented recommendations: context isolation, sandboxing, no renderer Node integration, a narrow preload bridge, restrictive content security policy, validated IPC messages, and blocked arbitrary navigation/new windows.

Sources:

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)

## Dependency direction

```text
UI hosts -> application services -> domain contracts
                              \-> calculations
                              \-> optimizer
                              \-> data provider interfaces
                              \-> export adapters

Provider implementations -> provider interfaces
Storage implementations  -> snapshot/cache interfaces
```

Domain, calculations, optimiser, and export packages do not import Electron, React, storage engines, or network clients. This is the browser portability boundary.

## Data identities

Every displayed fact has one of these identities:

- `official-client`: client data or assets retrieved from a pinned XIVAPI snapshot.
- `official-published`: rules or release facts from Square Enix publications.
- `community-curated`: a recommendation kept as a source record, never silently merged.
- `acquisition-overlay`: manually or community maintained route semantics not present in client data.
- `calculated`: output from a named, versioned calculation profile.
- `custom`: local user-authored equipment or overrides.

Provenance is part of the stored value, not UI decoration. At minimum it includes provider, source URL or record identifier, retrieved time, source patch/tier, data version, schema version, and confidence/status.

## Snapshot lifecycle

1. Fetch each provider through its HTTPS/allowlisted transport and provider-specific contract.
2. Cache a response only after it passes that provider's shape and identity checks.
3. Normalise official, acquisition and curated records into independent overlays.
4. Reuse a provider's last validated response when a live optional source fails, marking the affected overlay stale.
5. Assemble and cross-validate the overlays into a new immutable snapshot.
6. Sign the manifest, counts, checksum, provider freshness and immutable snapshot URL.
7. Download into inert staging and atomically mark the snapshot active only if every required runtime check passes.
8. Retain the previous active snapshot as the last-known-good fallback and protect snapshots referenced by saved sets.
9. Prune only abandoned candidates and least-recently-used unprotected snapshots; recover from quota exhaustion with one bounded cleanup/retry.

An unsafe, corrupt or incomplete update never mutates the active snapshot. A safe partial-freshness release may activate only when essential official data is valid and every stale optional component came from a previously validated overlay. The UI distinguishes `online-current`, `cached-current`, `cached-stale`, `updating`, `partial`, and `unavailable` states without relying only on colour.

Saved sets contain a snapshot reference. Recalculation with newer data is an explicit migration that produces a new result rather than silently changing history. Legacy saves without a context retain their numbers but are explicitly labelled unknown rather than assigned invented provenance.

## Access and eligibility

Eligibility is computed, never inferred from one field:

```text
effectiveLevel = min(selectedLevel, selectedExpansion.levelCap)

item is eligible when:
  job/category permits it
  AND equipLevel <= effectiveLevel
  AND at least one allowed acquisition route is accessible
  AND all user source, lock, exclude, unique-ring, and quality constraints pass
```

Expansion, job, and route definitions are versioned. Future or announced jobs are represented but cannot be selected before their availability version. Limited jobs are modelled explicitly rather than forced into normal progression.

## Optimiser pipeline

1. Filter item candidates by legality and user constraints.
2. Generate legal materia variants per item, respecting slot grade, overmeld rules, stat caps, and locked melds.
3. Remove dominated variants while preserving relevant thresholds such as GCD, Piety, CP, GP, source cost, and required items.
4. Combine slot frontiers with branch-and-bound and a deterministic tie-break order.
5. Evaluate the remaining frontier with the selected job discipline evaluator.
6. Return the winner plus deliberately varied alternatives and machine-readable explanations.

The optimiser runs in a Web Worker, reports progress, accepts cancellation, and returns immutable results. A Rust/WASM engine is a later benchmark-driven option, not a prerequisite.

### Evaluator contracts

- Combat: base stats and speed tiers, expected single-100-potency-hit value initially, later job/encounter simulation profiles.
- Crafting: target recipe feasibility, HQ/reliability objective, rotation assumptions, minimum stats, then cost and waste.
- Gathering: target node/collectability/bonus feasibility, rotation and GP assumptions, then cost and waste.

Each result records the evaluator ID/version and objective. The UI never labels a proxy calculation as a full simulation.

## Storage

The browser host uses IndexedDB for snapshots, settings, custom items, and saved sets. The desktop prototype uses the same interface and implementation so offline behaviour is identical. A SQLite desktop adapter may be added later if measured data volume, migrations, or backup requirements justify it.

Bundled snapshots use packaged icon files. Downloaded release snapshots embed their verified PNG assets as data URLs before signing, so newly added icons remain available offline and activate atomically with their records. Missing or corrupt icons fall back to a labelled placeholder and cannot block calculations.

## XivGear boundary

XivGear export is an adapter, not the internal model. The current external set contract is validated against documented `SetExportExternalSingle` fields and slot keys.

Sources:

- [XivGear API notes](https://raw.githubusercontent.com/xiv-gear-planner/gear-planner/main/API_DOC.md)
- [External set type](https://xivgear.app/docs/interfaces/_xivgear_xivmath.geartypes.SetExportExternalSingle.html)
- [Item slot export](https://xivgear.app/docs/interfaces/_xivgear_xivmath.geartypes.ItemSlotExport.html)

Export rules:

- Only official item, food, and materia IDs may be emitted.
- Any selected custom item causes a clear refusal naming the incompatible slots.
- Unsupported levels or unknown schema versions fail closed.
- Contract fixtures are periodically imported into the live XivGear application during release validation.

## Security and privacy

- No account credentials, game process access, logs, plugins, packet capture, or local game files.
- Provider requests use an allowlist, HTTPS, timeouts, size limits, schema validation, and conditional cache requests.
- Community prose is not mirrored unless its terms permit it; links and minimal metadata are preferred.
- Custom items and saved sets remain local in the initial product.
- Telemetry is absent unless it is later designed as explicit opt-in.
