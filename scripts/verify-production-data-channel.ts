import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { downloadSnapshotCandidate, type SnapshotCounts, type SnapshotUpdatePolicy } from '@xiv-gear-lab/data';
import type { RuntimeCompatibility } from '@xiv-gear-lab/domain';

const workspace = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(workspace, 'config', 'data-channel.production.json'), 'utf8')) as {
  manifestUrl: string;
  allowedOrigins: string[];
  trustedEd25519Keys: Record<string, string>;
};
const runtime: RuntimeCompatibility = {
  appVersion: '0.9.0-alpha.18',
  snapshotSchemas: ['gear-snapshot@1'],
  registrySchemas: ['game-registry@1'],
  rulesetSchemas: ['combat-ruleset@1'],
  calculationSchemas: [
    'ffxiv-combat-level-100@1',
    'ffxiv-combat-level-90@1',
    'ffxiv-combat-level-80@1',
    'ffxiv-combat-level-70@1',
    'ffxiv-combat-level-60@1',
    'ffxiv-combat-level-50@1'
  ],
  evaluatorProfileSchemas: ['generic-hit-profile@1']
};
const minimumSnapshotCounts: Partial<SnapshotCounts> = {
  expansions: 6,
  jobs: 21,
  rulesets: 1,
  evaluatorProfiles: 21,
  items: 200,
  materia: 6,
  foods: 4,
  curatedSets: 50
};
const policy: SnapshotUpdatePolicy = {
  manifestUrl: config.manifestUrl,
  allowedOrigins: config.allowedOrigins,
  trustedEd25519Keys: config.trustedEd25519Keys,
  minimumSnapshotCounts
};

const hosted = process.argv.includes('--hosted');
let fetcher: typeof fetch = fetch;
if (!hosted) {
  const manifestBytes = await readFile(resolve(workspace, 'docs', 'channel', 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as { snapshot: { id: string; url: string } };
  const snapshotFileName = new URL(manifest.snapshot.url).pathname.split('/').at(-1)!;
  const snapshotBytes = await readFile(resolve(workspace, 'docs', 'channel', 'releases', manifest.snapshot.id, snapshotFileName));
  fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === config.manifestUrl) {
      return new Response(manifestBytes, { status: 200, headers: { 'content-length': String(manifestBytes.byteLength) } });
    }
    if (url === manifest.snapshot.url) {
      return new Response(snapshotBytes, { status: 200, headers: { 'content-length': String(snapshotBytes.byteLength) } });
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
}

const candidate = await downloadSnapshotCandidate(policy, runtime, fetcher);
process.stdout.write(`${JSON.stringify({
  status: 'passed',
  mode: hosted ? 'hosted' : 'staged-local',
  snapshotId: candidate.snapshot.manifest.id,
  sha256: candidate.sha256,
  keyId: candidate.updateManifest.keyId,
  counts: candidate.updateManifest.snapshot.counts
}, null, 2)}\n`);
