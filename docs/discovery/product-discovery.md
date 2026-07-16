# Product discovery

Status: accepted implementation baseline
Research date: 2026-07-15
Target: Windows desktop first; browser-capable shared core; cached offline fallback

## Outcome

The product is feasible as a standalone application. The hard part is not rendering a gear list: it is preserving the meaning and version of data from several kinds of evidence while producing reproducible, explainable recommendations.

The implementation will therefore treat provenance, snapshot versioning, and validation as core product features rather than afterthoughts.

## Confirmed product decisions

- The first user-facing product is a Windows desktop app.
- The calculation, optimiser, data contracts, and most UI code must also run in a browser without a rewrite.
- Internet access is the normal mode. After one successful update, the app must remain usable from an immutable last-known-good cache.
- The first vertical slice is level 100 White Mage using the current Dawntrail raid tier. It covers live data, curated sets, source constraints, melds, food, comparison, custom items, persistence, and XivGear export.
- The eventual product covers combat, crafting, and gathering jobs. Their objectives remain independent because a single universal scoring formula would be misleading.

## Evidence and implications

### Game and version model

The current expansion is Dawntrail and the current level cap is 100. The official update log identifies patch 7.51 as released on 2026-06-02. Patch 7.5 also demonstrates why access cannot be represented as a fixed expansion-to-level lookup: Shadowbringers access changed, while announced Beastmaster content is not yet selectable at the research date.

Sources:

- [Dawntrail official site](https://na.finalfantasyxiv.com/dawntrail/)
- [Dawntrail jobs](https://na.finalfantasyxiv.com/dawntrail/job/)
- [Official update log](https://na.finalfantasyxiv.com/lodestone/special/update_log/)
- [Patch 7.5 notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/9beb8a7b5c46944cd80ed92b2b8e972395fbea80)
- [Patch 7.51 notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/c46881a31a2c90d0965493c921b434eca09113f8)

Implication: an item is eligible only when its job and level are legal and at least one permitted acquisition route satisfies the user's expansion, quest, and source constraints. Patch introduction alone is insufficient.

### Official client data

XIVAPI v2 exposes version-pinnable client sheets and assets without requiring local game files. It explicitly does not cover runtime/server data, and its community-maintained schemas may be imperfect.

Sources:

- [XIVAPI v2 overview](https://v2.xivapi.com/docs/welcome/)
- [Version pinning](https://v2.xivapi.com/docs/guides/pinning/)
- [Sheet access](https://v2.xivapi.com/docs/guides/sheets/)
- [Asset access and caching](https://v2.xivapi.com/docs/guides/assets/)
- [Data concepts and limitations](https://v2.xivapi.com/docs/guides/concepts/)

Implication: XIVAPI is the primary client-data provider, behind an adapter and immutable cache. Duty drops, quest gates, and some acquisition semantics require a separately versioned overlay whose provenance is shown to the user.

### Calculations

XivGear publishes its level constants and formulas for main stat, weapon damage, determination, critical hit, direct hit, speed, GCD, and HP. Current White Mage reference sets provide concrete cross-checks across several GCD tiers.

Sources:

- [XivGear maths reference](https://xivgear.app/math/)
- [XivGear repository](https://github.com/xiv-gear-planner/gear-planner/)
- [Etro public API documentation](https://etro.gg/api/docs/)

Implication: calculations will be clean-room implementations with fixture tests against published examples and independently exported reference sets. XivGear code will not be copied; no repository licence was visible during research, so its implementation is treated as unavailable for reuse.

### Crafting and gathering

Crafting optimisation is a feasibility and reliability problem involving recipe difficulty, quality, durability, craftsmanship, control, CP, and rotations. Gathering involves node access, gathering/perception/GP thresholds, collectability, bonuses, and route constraints. Maximising raw totals is not an adequate objective for either.

Sources:

- [Teamcraft documentation](https://wiki.ffxivteamcraft.com/)
- [Teamcraft simulator documentation](https://ffxiv-teamcraft.github.io/simulator/)
- [Teamcraft repository, MIT licensed](https://github.com/ffxiv-teamcraft/ffxiv-teamcraft)

Implication: combat, crafting, and gathering share equipment legality and melding infrastructure but use separate evaluator contracts, objectives, explanations, and reference tests.

### Assets and public distribution

The current FFXIV Materials Usage License permits use of specified copyrighted materials only under its conditions, including non-commercial use and attribution requirements. Official item icons are covered material.

Source: [FFXIV Materials Usage License, effective 2026-05-07](https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc)

Implication: the prototype is assumed to be private and non-commercial. It must include required copyright and non-affiliation notices. Monetisation, advertising, public distribution, or store publication is a release blocker pending a dedicated rights review. This is a product safety decision, not legal advice.

## Principal risks and mitigations

| Risk | Consequence | Mitigation and proof |
| --- | --- | --- |
| Data drift or partial update | Reproducibly wrong sets | Immutable snapshots, atomic activation, schema validation, last-known-good rollback, visible freshness |
| Incorrect expansion filtering | Recommends inaccessible gear | Route-level access rules and fixtures at every expansion boundary |
| Formula/rounding error | Rankings look plausible but are wrong | Integer-floor unit tests, published formula examples, full reference-set fixtures |
| Optimiser explosion | Frozen UI or unusable latency | Pareto-pruned item/meld variants, branch-and-bound, Web Worker, cancellation, realistic benchmarks |
| Community-set ambiguity | Conflicting sets are silently merged | Preserve each source set independently with patch, assumptions, retrieval date, and original link |
| Source permission uncertainty | Unsafe public release | Provider allowlist, minimal metadata, links rather than copied prose, explicit release gate |
| Custom item contamination | Invalid compatibility export | Distinct custom identity and fail-closed official-only XivGear export |
| One score hides player needs | “Best” set is impractical | Hard constraints plus labelled objectives, confidence, and alternatives |

## Assumptions that remain explicit

- The prototype uses an expected single 100-potency hit comparison proxy, not a complete job rotation or encounter simulation. The UI must name it honestly.
- Live market-board prices are excluded; cost means deterministic currencies, material quantities, and user-entered values until an authorised price provider is selected.
- Community integrations remain provider-gated. A documented public endpoint is not automatically permission to republish a provider's database.
- Historical acquisition coverage will grow by validated snapshots rather than being improvised from item level or patch.

## Decisions deliberately deferred

- Code signing, auto-update infrastructure, installers, and store distribution.
- A public hosting and sync service for the browser edition.
- Market-price providers and account-based inventory imports.
- Full encounter-specific rotation simulation.
- Public or commercial release approval.
