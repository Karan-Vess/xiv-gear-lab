# Production preview data channel runbook

Status: M8C public-preview infrastructure
Date: 2026-07-16

## Boundary

The GitHub repository, Pages notice and signed data files are public. Every public surface labels the project as an unfinished, unsupported pre-release. The updater channel is public-read because the desktop app deliberately contains no account credential or bearer token.

The channel is non-commercial. Public surfaces carrying FFXIV materials must show `FINAL FANTASY XIV © SQUARE ENIX CO., LTD.` and the FINAL FANTASY trademark notice, link the current Materials Usage License, and comply immediately with any Square Enix removal request. Do not add advertisements, paid access, sponsorship placement, or any other monetisation around the channel or packaged preview.

Repository: `Karan-Vess/xiv-gear-lab`
Pages root: `https://karan-vess.github.io/xiv-gear-lab/`
Manifest: `https://karan-vess.github.io/xiv-gear-lab/channel/manifest.json`

## Key custody

The executable contains only the raw public halves of two Ed25519 keys:

- `stable-2026-07`: active signing key;
- `recovery-2026-07`: pre-trusted recovery key for planned rotation or active-key loss.

Private keys live outside the repository under `%USERPROFILE%\.xiv-gear-lab\signing` and are restricted to the local Windows user. They must never be copied into the workspace, committed, logged, placed in an issue, or bundled with the application. Back up the recovery key to a separate encrypted/offline location before relying on the channel for broader testing.

If the active private key is suspected compromised, stop publication, change `signingKeyId` in `config/data-channel.production.json` to the recovery key, stage a new release, verify it locally, and publish. Existing v0.6.3+ clients trust both public keys.

## Stage and verify a release

From a clean workspace after a validated data sync:

```powershell
npm run sync:data
npm test
npm run stage:data-production
npm run verify:data-production
```

Staging embeds all icons, signs the manifest, checks that the selected private key matches the committed public key, refuses to replace an existing snapshot ID with different bytes, and updates `docs/channel/manifest.json` plus the immutable release directory.

Review the provider freshness and counts in the staged manifest before committing. Optional stale providers may be published only when the manifest states that condition honestly and the retained overlay came from a previously validated cache.

## Publish through GitHub Pages

Commit the code, `docs/channel/manifest.json`, `docs/channel/status.json`, and the new immutable `docs/channel/releases/<snapshot-id>/` directory. Push the default branch, then configure GitHub Pages to deploy from the default branch's `/docs` folder.

After GitHub reports the Pages deployment complete:

```powershell
npm run verify:data-hosted
```

Do not build a production-channel executable until hosted verification passes.

## Package and installed-app drill

```powershell
npm run package:windows:production
npm run drill:hosted-update
```

The production package embeds the HTTPS manifest URL, strict origin allowlist, active public key and recovery public key. The hosted drill launches an isolated copy online, activates the signed snapshot, then launches the same executable and profile with HTTP(S) blocked to prove cached offline use.

## Rollback and retention

Never mutate a published snapshot file. To roll back channel users, sign and publish a new manifest that points to the desired immutable compatible snapshot. Keep every snapshot referenced by a released manifest or reproducible saved result. Client-side cleanup separately protects the active, immediate rollback and saved-set-pinned snapshots.
