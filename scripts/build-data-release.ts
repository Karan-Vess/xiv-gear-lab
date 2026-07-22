import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { gearSnapshot } from '../packages/data/src/index.ts';
import {
  canonicalUpdateManifestPayload,
  type DataProviderFreshness,
  type DataUpdateManifest,
  type SnapshotCounts
} from '../packages/data/src/runtime-updates.ts';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to publish a signed data release.`);
  return value;
};

const signingKeyId = requiredEnvironment('XIV_GEAR_LAB_DATA_SIGNING_KEY_ID');
const signingKeyFile = process.env.XIV_GEAR_LAB_DATA_SIGNING_KEY_FILE?.trim();
const inlineSigningKey = process.env.XIV_GEAR_LAB_DATA_SIGNING_KEY_PKCS8?.trim();
if (signingKeyFile && inlineSigningKey) {
  throw new Error('Configure either XIV_GEAR_LAB_DATA_SIGNING_KEY_FILE or XIV_GEAR_LAB_DATA_SIGNING_KEY_PKCS8, not both.');
}
const encodedSigningKey = signingKeyFile
  ? (await readFile(resolve(signingKeyFile), 'utf8')).trim()
  : inlineSigningKey ?? requiredEnvironment('XIV_GEAR_LAB_DATA_SIGNING_KEY_PKCS8');
const signingKey = createPrivateKey({
  key: Buffer.from(encodedSigningKey, 'base64'),
  format: 'der',
  type: 'pkcs8'
});
const snapshotUrl = new URL(requiredEnvironment('XIV_GEAR_LAB_DATA_SNAPSHOT_URL'));
const allowInsecureLocalhost = process.env.XIV_GEAR_LAB_DATA_ALLOW_INSECURE_LOCALHOST === 'true' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(snapshotUrl.hostname);
if (snapshotUrl.protocol !== 'https:' && !allowInsecureLocalhost) {
  throw new Error('XIV_GEAR_LAB_DATA_SNAPSHOT_URL must use HTTPS. HTTP is permitted only for an explicitly enabled localhost test drill.');
}

const outputDirectory = resolve(process.argv[2] ?? 'artifacts/data-release');
const publishedSnapshot = structuredClone(gearSnapshot);
const publicDirectory = resolve('apps/web/public');
const embeddedIcons = new Map<string, string>();
const embedIcon = async (iconUrl?: string): Promise<string | undefined> => {
  if (!iconUrl || iconUrl.startsWith('data:')) return iconUrl;
  if (!iconUrl.startsWith('./')) throw new Error(`Data release cannot embed non-local icon URL ${iconUrl}.`);
  const iconPath = resolve(publicDirectory, iconUrl.slice(2));
  if (iconPath !== publicDirectory && !iconPath.startsWith(`${publicDirectory}${sep}`)) {
    throw new Error(`Icon path escapes the public asset directory: ${iconUrl}.`);
  }
  const cached = embeddedIcons.get(iconPath);
  if (cached) return cached;
  const dataUrl = `data:image/png;base64,${(await readFile(iconPath)).toString('base64')}`;
  embeddedIcons.set(iconPath, dataUrl);
  return dataUrl;
};

for (const entity of [...publishedSnapshot.items, ...publishedSnapshot.materia, ...publishedSnapshot.foods]) {
  entity.iconUrl = await embedIcon(entity.iconUrl);
}

const safeSnapshotId = publishedSnapshot.manifest.id.replace(/[^a-zA-Z0-9._-]/g, '-');
const snapshotFileName = `snapshot-${safeSnapshotId}.json.gz`;
if (!snapshotUrl.pathname.endsWith(`/${snapshotFileName}`)) {
  throw new Error(`XIV_GEAR_LAB_DATA_SNAPSHOT_URL must end with /${snapshotFileName}.`);
}

const snapshotJson = JSON.stringify(publishedSnapshot);
const uncompressedSnapshotBytes = Buffer.from(snapshotJson, 'utf8');
const snapshotBytes = gzipSync(uncompressedSnapshotBytes, { level: 9 });
const counts: SnapshotCounts = {
  expansions: publishedSnapshot.registry.expansions.length,
  jobs: publishedSnapshot.registry.jobs.length,
  rulesets: publishedSnapshot.rulesets.length,
  evaluatorProfiles: publishedSnapshot.evaluatorProfiles.length,
  items: publishedSnapshot.items.length,
  materia: publishedSnapshot.materia.length,
  foods: publishedSnapshot.foods.length,
  curatedSets: publishedSnapshot.curatedSets.length
};

const providerStatus = (providers: string[], id: string): DataProviderFreshness => {
  const provenance = [
    ...gearSnapshot.items.flatMap((item) => item.provenance),
    ...gearSnapshot.foods.flatMap((food) => food.provenance),
    ...gearSnapshot.curatedSets.flatMap((set) => set.provenance)
  ].filter((entry) => providers.includes(entry.provider));
  const status = provenance.some((entry) => entry.status === 'stale')
    ? 'stale'
    : provenance.some((entry) => entry.status === 'partial' || entry.status === 'unverified') ? 'partial' : 'current';
  return {
    id,
    status,
    retrievedAt: provenance.map((entry) => entry.retrievedAt).sort().at(-1) ?? gearSnapshot.manifest.generatedAt
  };
};

const providers: DataProviderFreshness[] = publishedSnapshot.manifest.providerFreshness?.map((provider) => ({ ...provider })) ?? [
  providerStatus(['XIVAPI v2'], 'official-data'),
  providerStatus(['XIV Gear Lab'], 'acquisition-data'),
  providerStatus(['Etro', 'The Balance', 'XivGear'], 'curated-data')
];

const manifest: DataUpdateManifest = {
  schemaVersion: 'data-update-manifest@1',
  channel: process.env.XIV_GEAR_LAB_DATA_CHANNEL?.trim() || 'stable',
  publishedAt: new Date().toISOString(),
  keyId: signingKeyId,
  snapshot: {
    id: publishedSnapshot.manifest.id,
    url: snapshotUrl.href,
    sha256: createHash('sha256').update(snapshotBytes).digest('hex'),
    byteLength: snapshotBytes.byteLength,
    counts
  },
  providers,
  signature: ''
};

manifest.signature = sign(
  null,
  Buffer.from(canonicalUpdateManifestPayload(manifest), 'utf8'),
  signingKey
).toString('base64');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, snapshotFileName), snapshotBytes, { flag: 'wx' }),
  writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
]);

process.stdout.write(`Signed data release written to ${outputDirectory}\n`);
process.stdout.write(`${snapshotFileName}: ${snapshotBytes.byteLength.toLocaleString()} compressed bytes (${uncompressedSnapshotBytes.byteLength.toLocaleString()} expanded), ${manifest.snapshot.sha256}\n`);
process.stdout.write(`${embeddedIcons.size.toLocaleString()} unique icons embedded for offline use.\n`);
