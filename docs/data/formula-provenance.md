# Combat formula and evaluator provenance audit

Status: M13 complete for the current Dawntrail standard-job scope
Date: 2026-08-03

This audit prevents XIV Gear Lab from assigning convenient but unverified credit to a platform merely because that platform publishes similar outputs. It covers the expected-single-100-potency-hit proxy and the M12 Samurai, Dancer, Black Mage and Dark Knight pilot evaluators. It does not validate encounter DPS, healing, mitigation or raid contribution.

## Attribution boundary

| Component | Current implementation | External reference | Attribution shown to users |
| --- | --- | --- | --- |
| Main-stat, weapon-damage, Determination, Critical Hit, Direct Hit, Tenacity and speed/GCD formula structure | Clean-room TypeScript in `packages/calculations/src/index.ts` | [XivGear maths](https://xivgear.app/math/) is the published cross-check used by project discovery | XivGear is labelled as a formula reference; implementation and combination are labelled XIV Gear Lab-owned |
| Integer-floor order and displayed 100-potency expectation | XIV Gear Lab implementation with local boundary/reference fixtures | XivGear maths page and independently recalculated set fixtures | XIV Gear Lab clean-room proxy, not XivGear output |
| Level-100 constants (`440`, `420`, `2780`) | Stored in the XIV Gear Lab calculation package | No component-level source URL was retained during the original prototype work | Internal/unverified until an exact external citation is recorded |
| Job attack-power, main-stat and trait modifiers | Versioned evaluator profile data in the active snapshot | Component references are now supported; constants without a precise direct source remain explicitly project-owned/internal | Internal/unverified profile constants; never credited to Etro, The Balance or XivGear by implication |
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
| Cutoff and duration stability | Strict application cutoff plus an internal 510-second comparison pass over the same finalists | None; the longer pass is a sensitivity check rather than external ground truth | The normal 300-second result remains primary and a visible warning appears if the longer audit prefers another finalist |
| MP sustainability | Official spell costs and job MP restoration in declarative profiles; Piety regeneration and Refresh conversion in the local engine | Official Job Guides for costs and action effects; Allagan Studies remains the separately linked Piety formula cross-check | Ending MP is shown for evaluated healer results; the 550-MP Refresh tick conversion remains a labelled local assumption |

## M13A attribution contract

- Generic-hit evaluator profiles may carry component-level references naming the formula, data, timing or ranking parts they support.
- Original author/community and hosting platform are stored separately. A website that hosts a method is not silently presented as its author.
- A missing external URL is allowed only when the component is explicitly declared as developed by XIV Gear Lab.
- Every new calculation result pins its standard/evolved job mode and generic/rotation evaluation identity alongside snapshot, ruleset, schema and evaluator version.
- The UI renders these references per result and continues to support older signed snapshots that predate the optional reference fields.

## M13B pilot validation

M13B adds a validation layer that is deliberately separate from method confidence. `independently-cross-checked` means that action data or trace behaviour was checked against the profile's direct official and pinned XivGear references. It does not mean the generated priority was written, approved or maintained by the community, so the four pilots remain `generated-preliminary`.

| Pilot | Independently checked | Material correction in M13B | Remaining declared approximation |
| --- | --- | --- | --- |
| Samurai | Core combo, Iaijutsu/Kaeshi, Ikishoten/Zanshin/Ogi, Meikyo Shisui and Tendo data plus deterministic speed-tier traces | Added Kaeshi: Setsugekka, Zanshin, Meikyo finishers, Tendo replacements and Higanbana Sen reservation | Third Eye gains and exact community burst alignment |
| Dancer | Core potencies, fixed dance timing, guaranteed-hit actions and expected two-minute count structure | Separated Flourish's Finishing Move from Standard Step | Aggregate dance actions, no party Esprit and expected-value rather than rolled RNG |
| Black Mage | Fire/Ice timing, Astral Soul, Flare Star, Polyglot and spell-speed trace changes | No safe partial rewrite was made during the audit | Paradox, detailed Umbral Heart costs, Triplecast, Swiftcast and transpose lines |
| Dark Knight | Level-100 combo/burst data, MP ticks and the exact Living Shadow delay/cadence/sequence | Existing MP tick and pet behaviour passed the audit | Defensive TBN/Dark Arts timing and encounter-specific pooling |

The repeatable curated-set ablation uses the same legal constraints and local formulas with `curatedSets` emptied before candidate generation. In the routine fixture, normal and curated-free searches produced the same equipment and meld plan for all four pilots. Against the corresponding community set, recalculated by the same evaluator for an apples-to-apples optimiser comparison, the curated-free result was 0.618% higher for SAM, 0.652% for DNC, 0.281% for BLM and 0.555% for DRK. These percentages validate optimiser independence only; they are not an external DPS-accuracy claim.

## Current confidence statement

The current UI may call the proxy `reference-validated` because its implementation has boundary tests and independently recalculated fixtures. That label does not mean every constant has a complete authorship trail. Evaluator profiles now identify supported components and distinguish external references from XIV Gear Lab-owned logic; constants without an exact component citation remain internal/unverified.

## M13C healer role batch

The first M13C role batch adds White Mage, Scholar, Astrologian and Sage while preserving the M13B separation between independent cross-check status and generated-priority confidence.

| Pilot | Independently checked | Explicit personal-damage model | Remaining declared approximation |
| --- | --- | --- | --- |
| White Mage | Glare III, Dia, Assize, Presence of Mind, Sacred Sight, Glare IV, Lucid Dreaming and MP effects | Maintains Dia, uses Assize, spends three Sacred Sight stacks and accounts for spell costs plus Piety regeneration | Healing-driven Lily GCDs and Afflatus Misery are excluded from the uninterrupted dummy |
| Scholar | Broil IV, Biolysis, Chain Stratagem, Baneful Impaction, Aetherflow, Energy Drain, Lucid Dreaming and MP effects | Applies the 10% critical-hit-rate window, spends damage-only Aetherflow and accounts for spell costs plus MP restoration | Dissipation and healing-driven Aetherflow trade-offs are excluded |
| Astrologian | Fall Malefic, Combust III, Divination, Oracle, Draw, Lord of Crowns, Earthly Star, Lucid Dreaming and MP effects | Counts personal damage, alternates Draw every 55 seconds and accounts for spell costs plus MP restoration | The card sequence remains aggregated; card raid contribution is excluded |
| Sage | Patch-7.5 Dosis III, Eukrasian Dosis III, Phlegma III, Psyche, Lucid Dreaming and MP effects | Maintains the DoT and spends Phlegma while spell costs and Piety regeneration can constrain long-window uptime | Eukrasia plus Eukrasian Dosis is one fixed 2.5-second aggregate; healing-driven Addersgall MP restoration and Pneuma are excluded |

The routine curated-free validation reproduced the same normal and ablated equipment/meld plan in all four healer fixtures. Against the corresponding community set recalculated by the same local evaluator, the curated-free rotation result was 0.459% higher for WHM, 0.260% for SCH, 0.499% for AST and 0.478% for SGE. This tests optimiser independence and internal consistency, not external DPS accuracy or raid contribution.

## M13C tank role batch

The second M13C role batch adds Paladin, Warrior and Gunbreaker, completing current tank coverage alongside the Dark Knight pilot audited in M13B.

| Pilot | Independently checked | Explicit personal-damage model | Remaining declared approximation |
| --- | --- | --- | --- |
| Paladin | Royal Authority, Atonement, Divine Might, Fight or Flight, Imperator and the Confiteor sequence | Models physical combos, fixed 2.50-second spells, Goring Blade, Blade of Honor and damage oGCDs | Hard-cast Holy Spirit opener and exact eight-versus-nine-GCD Fight or Flight branches are omitted |
| Warrior | Storm combos, Beast Gauge, Inner Release, Inner Chaos, Primal Rend, Primal Ruination and Primal Wrath | Models Surging Tempest, gauge spending and guaranteed critical/direct-hit actions | Infuriate uses a declared 50-second effective recharge because active cooldown reduction is not in the current signed profile schema |
| Gunbreaker | Solid Barrel, cartridges, No Mercy, Bloodfest, Double Down, Gnashing Fang and Reign of Beasts data | Models complete Continuation chains and one-minute personal burst windows | GCD-tier-specific No Mercy branches and intentional clipping variants are omitted |

The routine 2.50-second curated-free validation reproduced the same normal and ablated equipment/meld plan for all three tanks. Against the corresponding community set recalculated by the same local evaluator, the curated-free rotation result was 0.552% higher for PLD, 0.903% higher for WAR and 0.552% higher for GNB. This validates optimiser independence and internal consistency, not external DPS accuracy or encounter performance.

## M13C melee role batch

The third M13C role batch adds Monk, Dragoon, Ninja, Reaper and Viper, completing current melee coverage alongside the Samurai pilot audited in M13B.

| Pilot | Independently checked | Explicit personal-damage model | Remaining declared approximation |
| --- | --- | --- | --- |
| Monk | Forms, fury actions, permanent Greased Lightning, Chakra, Perfect Balance, Blitz, nadi and reply actions | Uses expected-value Chakra, a deterministic three-form Blitz route and both nadi finishers | Party-generated Brotherhood Chakra and community opener-specific Blitz routing are excluded |
| Dragoon | Both five-part combo branches, Chaotic Spring, Battle Litany, Life of the Dragon, jumps and follow-ups | Maintains the DoT and executes the job-owned Life of the Dragon damage chain | Life Surge routing and animation-lock-specific jump placement are omitted |
| Ninja | Combo/Kazematoi, permanent speed trait, Ninki, Raiton/Raiju, Kunai Bane, Dokumori, Bunshin and two-minute attacks | Models personal vulnerability windows, aggregate Mudra GCDs and a fixed five-hit Bunshin schedule | Individual Mudra inputs and action-specific Bunshin shadow distinctions are aggregated |
| Reaper | Death Design, Soul/Shroud, Gluttony, Executioner, Enshroud, Communio and Perfectio | Models the complete personal gauge loop and deterministic Enshroud sequence | Plentiful Harvest uses the self-generated one-stack potency because external party actions are disabled |
| Viper | Vipersight branches, Hunter Instinct, Swiftscaled, Vicewinder, Rattling Coils and Reawaken | Models the full five-tribute Reawaken chain and fixed continuation timing | Equal-potency continuation choices and venom routing are deterministic aggregates |

The routine curated-free validation retained 10 of 11 normal-search items for MNK and all 11 for DRG, NIN, RPR and VPR. Against the corresponding community set recalculated by the same local evaluator, the curated-free rotation result was 0.573% higher for MNK, 0.595% higher for DRG, 0.618% higher for NIN, 0.619% higher for RPR and 0.622% higher for VPR. This tests optimiser independence and internal consistency, not external DPS accuracy, opener approval or encounter performance.

## M13C physical-ranged role batch

The fourth M13C role batch adds Bard and Machinist, completing current physical-ranged coverage alongside the Dancer pilot audited in M13B.

| Pilot | Independently checked | Explicit personal-damage model | Remaining declared approximation |
| --- | --- | --- | --- |
| Bard | Official level-100 DoTs, Hawk's Eye, songs, Repertoire, Coda, Soul Voice and burst actions; pinned XivGear shared timeline behaviour only | Maintains both DoTs, uses a deterministic 45/45/30-second song cycle and spends expected procs, Coda and Soul Voice | The pinned XivGear revision has no Bard simulator; Repertoire damage and Army haste are expected-value aggregates rather than random three-second rolls |
| Machinist | Heated combo, tools, Hypercharge, Wildfire, Full Metal Field and the pinned XivGear Queen action trace | Models three-shot Hypercharge, six-weaponskill Wildfire, Reassemble, tool cooldowns and a fixed 100-Battery Queen | Tool drift uses a stable priority instead of XivGear's look-ahead scheduler; partial-Battery Queen deployment and pet-specific damage scaling are omitted |

The routine 2.49-second BRD and 2.50-second MCH curated-free validation reproduced all 11 normal-search items for both jobs. Against the corresponding community set recalculated by the same local evaluator, the curated-free rotation result was 0.617% higher for BRD and 0.825% higher for MCH. This tests optimiser independence and internal consistency, not external DPS accuracy, Bard opener approval or encounter performance.

## M13C magical-ranged role batch

The final M13C role batch adds Summoner, Red Mage and Pictomancer, completing current standard-job coverage alongside the Black Mage pilot audited in M13B.

| Pilot | Independently checked | Explicit personal-damage model | Remaining declared approximation |
| --- | --- | --- | --- |
| Summoner | Official level-100 Demi-Summons, elemental attunements, Aetherflow and Searing Light; pinned XivGear shared timeline behaviour only | Runs a deterministic Solar Bahamut, Bahamut, Solar Bahamut and Phoenix cycle with Ifrit, Titan and Garuda phases, pet attacks and burst resources | The pinned XivGear revision has no Summoner simulator; primal order is fixed and Demi pet response timing is represented by eight deterministic attacks |
| Red Mage | Official level-100 mana, enchanted melee, finishers, Grand Impact, Vice of Thorns and Prefulgence; pinned XivGear shared timeline behaviour only | Builds balanced mana through spell-speed-sensitive expected Dualcast pairs and executes the fixed-speed melee and finisher chain | The pinned XivGear revision has no Red Mage simulator; Dualcast, procs and the Verflare or Verholy choice are expected-value aggregates |
| Pictomancer | Official action data plus pinned XivGear Pictomancer action and gauge helpers | Models additive and subtractive palettes, canvases, portraits, Hammer, Starry Muse, Star Prism and Rainbow Drip | The pinned XivGear revision has no complete Pictomancer rotation oracle; Hyperphantasia is a bounded timed haste window and motif repainting follows a fixed priority |

The routine 2.48-second SMN, 2.49-second RDM and 2.50-second PCT curated-free validation reproduced all 11 normal-search items. Against the corresponding community set recalculated by the same local evaluator, the curated-free rotation result was 0.585% higher for SMN, 0.583% higher for RDM and 0.901% higher for PCT. This tests optimiser independence and internal consistency, not external DPS accuracy, opener approval or encounter performance.

## M13E external simulator findings

The 2026-07-29 owner comparison exposed one genuine model disagreement and one useful non-disagreement:

- Black Mage: XivGear scored the imported XIV Gear Lab unrestricted 2.35-second candidate at `42,011.87` simulated DPS and the 2.14-second candidate at `42,333.18`. XIV Gear Lab preferred the unrestricted candidate under its own preliminary evaluator. This is not evidence that the local model is better. It is consistent with the declared omission of detailed Paradox, Umbral Heart, Triplecast, Swiftcast and transpose-line behaviour, so recommended or exact GCD targets remain the safer Black Mage workflow.
- Samurai: XivGear scored the imported unrestricted 2.11-second candidate at `43,408.92` simulated DPS and the 2.14-second candidate at `43,301.97`. XivGear therefore agrees that this particular unrestricted candidate wins its matched 300-second simulation, even though its generic 100-potency value is lower. This illustrates why the rotation result and the single-hit proxy must remain separate measurements.

External simulators are comparison evidence, not automatic ground truth. A disagreement must be traced to shared timing, action logic, assumptions or a declared approximation before either implementation is treated as more faithful to the game.

The final owner comparison on 2026-08-03 added three current relic-set checks:

- Viper: the generated plan reproduced the compared community plan and XivGear score exactly at `42,683.20` DPS.
- Samurai: the exact 2.14-second generated plan reproduced the community plan. XivGear scored the strongest imported unrestricted 2.12-second result at `41,284.29` DPS versus `41,191.20` for the community plan over its displayed `514.680`-second trace. This supports optimiser independence while leaving the nonstandard cadence as a practical-use caveat.
- Black Mage: the exact 2.14-second generated plan reproduced the community plan and its `42,333.18` XivGear score. XivGear scored the unrestricted 2.35-second result at `41,990.38` over its displayed 510-second trace. The gap is retained as a declared preliminary job-model limitation rather than being silently tuned to the external result.

## M13E cadence and duration findings

- The Samurai profile now models Meikyo Shisui, Tendo replacements and Higanbana Sen reservation. A repeatable matrix directly evaluates 2.08, 2.11, 2.14 and 2.17 seconds plus a broad search. In the current local 300-second fixture, 2.14 is the strongest of those four named targets and 2.11 loses Higanbana ticks. This is evidence for the current local model, not a universal gameplay claim.
- The primary dummy result remains the requested 300 seconds. The same retained finalists are also evaluated at 510 seconds as a sensitivity audit. A changed winner is shown to the user instead of silently replacing the requested result.
- Healer damage spells now spend their official MP costs. Natural three-second regeneration uses the existing Piety formula, Lucid Dreaming is represented as seven expected 550-MP ticks, and White Mage Assize, Scholar Aetherflow and Astrologian Draw restore their documented shares of maximum MP. Healing-driven Sage Addersgall spending remains excluded from the stationary damage dummy.

## Rules for future changes

- Add a direct source URL, patch/version and author/community identity before changing an internal/unverified component to externally attributed.
- Preserve original authorship separately from the website or application hosting a set.
- If a URL is absent, malformed or outside the application allowlist, state that the link is unavailable instead of rendering it.
- Formula, profile and optimiser versions must remain pinned in saved and workspace results.
- M13 must extend this ledger for every additional job, evolved mode and community opener component by component.
