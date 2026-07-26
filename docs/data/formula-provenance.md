# Combat formula and evaluator provenance audit

Status: M12 beta implementation audit
Date: 2026-07-26

This audit prevents XIV Gear Lab from assigning convenient but unverified credit to a platform merely because that platform publishes similar outputs. It covers the expected-single-100-potency-hit proxy and the M12 Samurai, Dancer, Black Mage and Dark Knight pilot evaluators. It does not validate encounter DPS, healing, mitigation or raid contribution.

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

## M12 rotation-evaluator boundary

| Component | Current implementation | External reference | Attribution shown to users |
| --- | --- | --- | --- |
| Action potency, recast, effects and job descriptions | Versioned declarative Dawntrail pilot profiles | Direct official Lodestone Job Guide links stored on each action and profile | Official action reference, with the executable evaluator labelled XIV Gear Lab-owned |
| Generated opener and sustained priorities | XIV Gear Lab clean-room deterministic rules | Community resources are linked as consumable context where available, but are not claimed as the author of generated logic | Generated preliminary method, never community validated |
| Timing scheduler, clipping, snapshots, expected-value procs, pets and action selection | XIV Gear Lab integer-millisecond engine and job-owned mechanic adapters | Pinned XivGear output traces are retained as independent behavioural oracles for overlapping cases; its unlicensed source is not copied | XIV Gear Lab rotation evaluator, with direct independent reference links |
| Community opener selection | Versioned optional declarative profile contract | The opener profile must retain its actual author/community and direct URL | Community opener only when patch and assumptions match; otherwise a visible generated fallback warning |
| Candidate generation and reranking | XIV Gear Lab optimiser | None | Fast generic-hit search followed by bounded rotation reranking of speed-diverse finalists |
| Timeline cache identity | XIV Gear Lab simulator | None | Compatible speed/timing identities may reuse a timeline; damage is recalculated for every gear set |

## Current confidence statement

The current UI may call the proxy `reference-validated` because its implementation has boundary tests and independently recalculated fixtures. That label does not mean every constant has a complete authorship trail. Until evaluator profiles gain component-level provenance, their constants remain explicitly marked internal/unverified in the methodology panel.

## Rules for future changes

- Add a direct source URL, patch/version and author/community identity before changing an internal/unverified component to externally attributed.
- Preserve original authorship separately from the website or application hosting a set.
- If a URL is absent, malformed or outside the application allowlist, state that the link is unavailable instead of rendering it.
- Formula, profile and optimiser versions must remain pinned in saved and workspace results.
- M13 must extend this ledger for every additional job, evolved mode and community opener component by component.
