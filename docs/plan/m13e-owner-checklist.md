# M13E owner acceptance record

The `0.11.0-beta.3` portable executable was the owner-acceptance build for the current Dawntrail standard-job scope. The accepted result is packaged as `release/XIV-Gear-Lab-0.11.0-portable.exe`. It remains an unsigned, unfinished preview rather than a supported public release.

## Required checks

1. Launch the portable executable and confirm the main interface appears without a blank window.
2. Select Dawntrail Black Mage, five-minute dummy, Quality First and a `1.50` to `2.50` GCD range. Run the optimiser and record its winning GCD and total damage.
3. Rerun Black Mage with an exact GCD equal to the broad run's winner. The exact run may tie the broad run, but it must not produce a stronger result that the broad run failed to retain.
4. Repeat the broad-versus-exact check for Samurai using a recommended target such as `2.14`.
5. Evaluate the currently equipped set. Confirm the result strip always shows the 100-potency value and, after evaluation, also shows the 30-second and 300-second values.
6. Put generic-hit, 30-second and 300-second optimisation modes in the three build tabs. Restart the app and confirm each tab retains its own mode, potion assumption and result.
7. Cancel a running Quality First search. Confirm the UI returns to an idle state and a new search can start normally.
8. Switch through A Realm Reborn, Heavensward, Stormblood, Shadowbringers, Endwalker and Dawntrail. No selection may blank or crash the renderer; unsupported evaluator modes must remain visibly unavailable.
9. With Dawntrail access and Samurai selected, type `90` one digit at a time and apply it. Run an optimisation and confirm level-90 equipment is used. Enter unsupported `99` and confirm the prior valid level remains active with a useful message rather than a blank renderer.
10. With a compatible downloaded catalogue active, confirm all 21 Dawntrail standard jobs still expose both rotation modes. Bundled evaluator overlays must not replace newer compatible downloaded profiles.
11. Spot-check at least one healer, tank, melee, physical-ranged and magical-ranged result against a trusted community set or XivGear sheet using matched duration, potion, party and GCD assumptions. Record differences rather than assuming the external simulator is automatically correct.
12. Run Samurai at exact 2.08, 2.11, 2.14 and 2.17 targets, then with the broad range. Confirm cadence details remain visible and the broad run does not lose a stronger exact-target result.
13. Inspect a broad 300-second result whose 510-second audit changes the preferred finalist. Confirm the 300-second score remains primary and the duration-sensitive warning names the longer audit's GCD and gap.
14. Evaluate one healer set. Confirm the methodology shows remaining MP and that changing Piety can affect a long-window result without changing the direct damage formula.

## Known non-blockers

- Evaluators remain labelled `generated-preliminary` and retain their declared job-specific approximations.
- The 510-second pass is a sensitivity audit over retained finalists, not a fourth public evaluation mode or a claim that 510 seconds is the uniquely correct duration.
- A mathematically winning unrestricted GCD can still be undesirable in real play when the job profile does not yet model every rotational alignment rule.
- The current Black Mage evaluator prefers an unrestricted 2.35-second candidate that XivGear ranks below the compared 2.14-second candidate. Treat this as a declared preliminary-model limitation, not evidence that XIV Gear Lab is more accurate.
- The compared Samurai unrestricted 2.11-second candidate also wins in XivGear's matched 300-second simulation, despite losing on the generic 100-potency proxy.
- Historical recommendations lack compatible community curation.
- Blue Mage and Beastmaster are deferred until after the standard-job roadmap.
- The next expansion's two jobs and evolved modes remain time-gated until authoritative data exists.

## Acceptance result

**Passed on 2026-08-03 for the current 21-job Dawntrail standard-mode scope.**

- Automated acceptance: `npm run validate:m13e:deep` passed 159 tests plus the deep curated-free Quality First matrix for all 21 standard jobs. Normal and curated-free searches reproduced the same complete item plans in every audited role batch.
- Viper owner comparison: XIV Gear Lab reproduced the compared community plan and XivGear score exactly at `42,683.20` DPS.
- Samurai owner comparison: the exact 2.14-second search reproduced the community plan. XivGear scored the strongest imported unrestricted 2.12-second XIV Gear Lab result at `41,284.29` DPS versus `41,191.20` for the community 2.14-second plan, a roughly 0.23% dummy gain. The nonstandard cadence remains a practical-use caveat rather than a search failure.
- Black Mage owner comparison: the exact 2.14-second search reproduced the community plan and its `42,333.18` XivGear result. XivGear scored the unrestricted 2.35-second XIV Gear Lab recommendation at `41,990.38`, roughly 0.81% lower. This is retained as an explicit preliminary evaluator limitation, not claimed as a superior model or hidden by forcing the community result.
- Packaged acceptance: rotation evaluation, equipped-set evaluation, transactional effective-level entry, historical catalogue switching and renderer survival passed automated desktop smoke checks.
- Deferred: next-expansion jobs and evolved modes await authoritative data; Blue Mage and Beastmaster remain on the maybe-later list. These do not block the accepted current scope.
