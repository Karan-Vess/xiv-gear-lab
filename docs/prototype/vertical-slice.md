# First vertical slice: White Mage

Implementation note (v0.5.0): this file records the original slice target, not a claim that every acceptance check below is complete. The audited status and reassignment of unfinished work are maintained in `docs/plan/milestones.md`; runtime snapshot activation moved to M8 and required/excluded/locked optimiser controls moved to M10.

Status: selected
Target game state: patch 7.51 with patch 7.4 raid-tier reference sets
Target level: 100

## Why this slice

White Mage exposes several hard product requirements with a compact rules surface: speed tiers, nested integer rounding, materia caps, food caps, Piety comfort constraints, multiple legitimate community targets, and meaningful raid-versus-tome trade-offs. It can disprove a weak architecture without first requiring a complete encounter simulator.

The domain model, catalogue, access system, melding engine, persistence, comparison, cache, and export contract remain job-independent.

## User journey

1. Launch the Windows app and see the active data/source/calculation versions and online or cached state.
2. Select expansion access, effective level, White Mage, and preferred source availability.
3. Browse attributed current community sets without losing their distinct assumptions.
4. Set a GCD target or range, minimum Piety, allowed sources, required/excluded gear, and locked items or melds.
5. Optimise in a cancellable background worker.
6. Review a best-throughput proxy result plus practical, no-savage, and alternate-speed options with explanations.
7. Inspect item icons, stats, caps, materia, food, acquisition routes, source attribution, and warnings in one set view.
8. Compare generated, curated, saved, and custom-containing sets.
9. Save locally and reopen offline.
10. Export an official-only set to XivGear JSON, or receive a precise refusal if custom items are selected.

## Included

- Windows Electron host and directly runnable browser host.
- Secure desktop shell and keyboard-accessible dark interface.
- Immutable versioned XIVAPI-derived snapshot and last-known-good offline cache.
- Expansion/access metadata and effective-level enforcement.
- Current official WHM-compatible equipment, materia, food, and icons needed by the candidate pool.
- Versioned acquisition overlay for the included candidate pool.
- Six current Etro WHM reference records, subject to provider gating and release rights review.
- Integer-safe level-100 main stat, weapon damage, determination, critical hit, direct hit, speed, GCD, food, and meld-cap calculations.
- Transparent `expected single 100-potency hit` proxy objective, GCD and minimum-Piety constraints.
- Source filters, required/excluded items, and locked gear/melds.
- Pareto-pruned search with progress, cancellation, deterministic tie-breaking, and alternatives.
- Set detail, comparison, local persistence, custom hypothetical item/override, and official-only XivGear export.
- Provenance, freshness, warnings, and legal notices.

## Explicitly excluded from this slice

- Optimisation for other jobs; full White Mage encounter/rotation simulation.
- Crafting and gathering optimisation.
- Exhaustive historical acquisition routes and historical curated sets.
- Live market-board prices, inventories, accounts, logs, plugins, packet capture, or game files.
- Public cloud sync, telemetry, auto-update, code signing, and store distribution.
- Public or commercial release.

## Calculation truthfulness

The initial objective estimates the expected output of a single 100-potency hit from the selected stats. It is useful for validating gear arithmetic and comparing closely related sets, but it is not a promise of encounter DPS, healing, or mitigation performance. The UI uses the full label and lists omissions.

## Acceptance evidence

The slice is complete only when all of these are demonstrated:

- A clean machine can run the desktop app and the browser host.
- Cached launch works after a successful update with the network unavailable.
- All six source WHM reference sets reproduce item/materia/food identity and their published total parameters within explicitly documented rounding.
- Formula tests cover every floor boundary used by main stat, weapon damage, DET, CRT, DH, SPS, and GCD.
- Access fixtures prevent later-expansion and inaccessible-route leakage.
- Excluding savage sources changes the result and explains the replacement choices.
- Required, excluded, and locked selections are either honoured or produce an unsatisfiable explanation.
- A representative standard search completes below 2 seconds at p95 on the reference Windows machine; cancellation is observed promptly.
- The interface remains responsive during optimisation.
- An exported official set imports successfully into current XivGear during manual release validation.
- A set with a custom item is refused export and identifies the affected slot.
- Keyboard navigation, focus visibility, contrast, non-colour status labels, loading, empty, stale, partial, and error states pass manual review.
