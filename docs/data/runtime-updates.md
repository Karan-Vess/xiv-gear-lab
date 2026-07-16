# Runtime data releases

Status: v0.6.2 M8B cache lifecycle implemented; production channel remains unconfigured
Date: 2026-07-16

## Trust boundary

The installed application contains only an Ed25519 public key. The private signing key belongs in protected release infrastructure and must never be committed, bundled, logged or sent to a provider.

The update client accepts a candidate only when all of the following pass:

- manifest and snapshot URLs use HTTPS and match the build-time origin allowlist;
- the manifest schema and signing-key ID are supported;
- the Ed25519 signature is valid;
- declared and received byte lengths remain within policy limits;
- the snapshot SHA-256 checksum matches;
- signed expansion, job, ruleset, evaluator, item, materia, food and curated-set counts match the payload and exceed configured minimums;
- registry, ruleset, calculation and evaluator schemas are compatible with the installed app;
- identities, references, timing effects, capabilities and pinned curated-set contexts are internally valid.

Failure leaves the current snapshot untouched.

## Provider isolation and partial freshness

XIVAPI, Etro, The Balance and XivGear use separate provider contracts and normalisers. A live JSON response is written to `.cache/provider-data` only after it passes its provider contract. A later timeout, outage or incompatible shape can reuse that exact last-known-good response; the affected provider and overlay are then marked `stale` in the signed release metadata.

The release builder assembles three independent overlays:

- `official`: item identities, job eligibility, stats, caps, icons, materia and food;
- `acquisition`: source families, route notes and acquisition provenance;
- `curated`: Etro/The Balance/XivGear sets and their source provenance.

Essential official data must have either a valid new candidate or a compatible last-known-good overlay. Curated data may be retained stale, or omitted on a first release, without blocking a safe official refresh. Cross-overlay item, materia and food references are validated before publication.

For a local release drill after one successful online sync:

```powershell
$env:XIV_GEAR_LAB_SYNC_FAIL_PROVIDERS='etro'
npm run sync:data
```

Accepted IDs are `xivapi`, `etro` and `xivgear`. This switch is diagnostic only; it never disables contract validation or permits unvalidated cache contents.

## Activation and fallback

Downloaded candidates are first written to an inert IndexedDB candidate store. Activation moves the candidate into the immutable snapshot store and updates the active/previous pointers in one transaction. A crash or failed transaction therefore cannot expose a half-written snapshot.

At startup the application tries, in order:

1. compatible active downloaded snapshot;
2. compatible previous downloaded snapshot, repairing it as active;
3. the compatible snapshot bundled with the executable.

Manual rollback swaps the downloaded active and previous pointers. Saved results record their snapshot, ruleset, calculation schema and evaluator identity; retained compatible snapshots can be resolved by that ID.

## Cache schema, retention and quota recovery

The snapshot database is versioned independently from snapshot payload schemas. Database v2 migrates old candidate and snapshot records in place, adds record-size/access metadata, and labels whether their icons are embedded data URLs, legacy external URLs or absent. A migration never rewrites unknown external icon content or pretends it was embedded.

Retention defaults to eight downloaded snapshots and 64 MiB of estimated snapshot JSON. The active snapshot, immediate rollback snapshot and every snapshot referenced by a current saved set are protected. Cleanup removes candidates abandoned for more than 24 hours, then prunes the least-recently-used unprotected snapshots until the budgets are met. If staging fails with a browser quota error, cleanup removes every unprotected candidate/snapshot and retries once. A second failure reports storage exhaustion without mutating the protected set.

Saved-set database v4 marks records created before calculation-context tracking as `unknown`. Their stored numbers remain visible, but the UI asks the user to recalculate before treating them as current. Migration deliberately does not invent a historical snapshot, ruleset, formula or evaluator ID.

## Offline icons

The data-release builder embeds every local item, materia and food PNG as a data URL before hashing and signing the snapshot. A downloaded patch therefore remains visually complete after internet access disappears. Runtime data never trusts an unsigned remote icon URL.

## Build configuration

The application update channel is configured at build time:

```text
VITE_DATA_MANIFEST_URL=https://updates.example/manifest.json
VITE_DATA_ALLOWED_ORIGINS=https://updates.example
VITE_DATA_TRUSTED_KEYS={"stable-2026":"BASE64_RAW_ED25519_PUBLIC_KEY"}
```

Without all required values the application remains fully usable from bundled/cached data and states that the live channel is not configured.

Plain HTTP is rejected. The only exception is an explicit localhost-only diagnostic build using `VITE_DATA_ALLOW_INSECURE_LOCALHOST=true`; the publisher has a matching `XIV_GEAR_LAB_DATA_ALLOW_INSECURE_LOCALHOST=true` switch. Both still require an allowlisted origin, signature, checksum, count and compatibility checks, and neither flag belongs in a normal release.

The signed release publisher requires protected environment variables:

```text
XIV_GEAR_LAB_DATA_SIGNING_KEY_ID=stable-2026
XIV_GEAR_LAB_DATA_SIGNING_KEY_PKCS8=BASE64_PKCS8_PRIVATE_KEY
XIV_GEAR_LAB_DATA_SNAPSHOT_URL=https://updates.example/snapshot-SNAPSHOT_ID.json
npm run build:data-release -- path/to/empty-output-directory
```

The output contains the complete snapshot and `manifest.json`. Publishing/uploading is intentionally separate so a build cannot silently mutate the live channel.

## Installed update/offline drill

`npm run drill:installed-update` creates an ephemeral Ed25519 key and signed localhost channel, packages a test-configured EXE, performs a real update, closes the channel, and launches the same EXE with the same isolated user-data directory while offline. Both launches must optimise successfully from downloaded data with embedded item and materia icons and no missing equipment. The command writes its evidence under `artifacts/installed-update-drill-*`.

After this diagnostic command, rebuild `npm run package:windows` without the diagnostic environment so the normal executable returns to the intentionally unconfigured production-channel state.
