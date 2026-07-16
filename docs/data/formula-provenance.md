# Combat proxy formula provenance audit

Status: M9 implementation audit
Date: 2026-07-16

This audit prevents XIV Gear Lab from assigning convenient but unverified credit to a platform merely because that platform publishes similar outputs. It covers the current expected-single-100-potency-hit proxy only. It does not validate a rotation, encounter DPS, healing, mitigation or raid contribution model.

## Attribution boundary

| Component | Current implementation | External reference | Attribution shown to users |
| --- | --- | --- | --- |
| Main-stat, weapon-damage, Determination, Critical Hit, Direct Hit, Tenacity and speed/GCD formula structure | Clean-room TypeScript in `packages/calculations/src/index.ts` | [XivGear maths](https://xivgear.app/math/) is the published cross-check used by project discovery | XivGear is labelled as a formula reference; implementation and combination are labelled XIV Gear Lab-owned |
| Integer-floor order and displayed 100-potency expectation | XIV Gear Lab implementation with local boundary/reference fixtures | XivGear maths page and independently recalculated set fixtures | XIV Gear Lab clean-room proxy, not XivGear output |
| Level-100 constants (`440`, `420`, `2780`) | Stored in the XIV Gear Lab calculation package | No component-level source URL was retained during the original prototype work | Internal/unverified until an exact external citation is recorded |
| Job attack-power, main-stat and trait modifiers | Versioned evaluator profile data in the active snapshot | No component-level author/source field currently exists in evaluator profiles | Internal/unverified profile constants; never credited to Etro, The Balance or XivGear by implication |
| Five-percent party bonus | Applied by XIV Gear Lab's set calculator | No exact retained source citation | Internal assumption shown in every result |
| Food, materia values and item stat caps | Active snapshot provider data | Per-record XIVAPI URLs retained in item provenance | XIVAPI item/data reference with direct applicable links |
| Candidate generation, frontier pruning, constraints, tie-breaking and result ranking | XIV Gear Lab optimiser | None; this is project-owned behaviour | XIV Gear Lab calculation/ranking |
| Curated configurations used as legal warm starts | Recalculated through the same local legality and formula path as generated candidates | Original Etro, The Balance and XivGear links retained per set where available | Original community reference is shown; hosting provider is not presented as the formula author |

## Current confidence statement

The current UI may call the proxy `reference-validated` because its implementation has boundary tests and independently recalculated fixtures. That label does not mean every constant has a complete authorship trail. Until evaluator profiles gain component-level provenance, their constants remain explicitly marked internal/unverified in the methodology panel.

## Rules for future changes

- Add a direct source URL, patch/version and author/community identity before changing an internal/unverified component to externally attributed.
- Preserve original authorship separately from the website or application hosting a set.
- If a URL is absent, malformed or outside the application allowlist, state that the link is unavailable instead of rendering it.
- Formula, profile and optimiser versions must remain pinned in saved and workspace results.
- M12 and M13 must extend this ledger for action timing, job mechanics, opener scripts and dummy priorities component by component.

