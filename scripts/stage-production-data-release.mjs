import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadProductionChannelConfig, runNpm, workspace } from './production-channel.mjs';

const config = await loadProductionChannelConfig();
const generatedSnapshot = JSON.parse(await readFile(resolve(workspace, 'packages', 'data', 'src', 'generated', 'whm-snapshot.json'), 'utf8'));
const snapshotId = String(generatedSnapshot.manifest.id);
const safeSnapshotId = snapshotId.replace(/[^a-zA-Z0-9._-]/g, '-');
const snapshotFileName = `snapshot-${safeSnapshotId}.json`;
const releaseUrl = `${config.snapshotBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(safeSnapshotId)}/${snapshotFileName}`;
const signingKeyFile = resolve(process.env.XIV_GEAR_LAB_DATA_SIGNING_KEY_FILE?.trim() ||
  join(homedir(), '.xiv-gear-lab', 'signing', `${config.signingKeyId}.pkcs8.b64`));

const encodedPrivateKey = (await readFile(signingKeyFile, 'utf8')).trim();
const privateKey = createPrivateKey({ key: Buffer.from(encodedPrivateKey, 'base64'), format: 'der', type: 'pkcs8' });
const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' });
if (!publicJwk.x) throw new Error('Production signing key did not contain an Ed25519 public key.');
const derivedPublicKey = Buffer.from(publicJwk.x, 'base64url').toString('base64');
if (derivedPublicKey !== config.trustedEd25519Keys[config.signingKeyId]) {
  throw new Error(`Private key ${signingKeyFile} does not match trusted key ${config.signingKeyId}.`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const buildDirectory = resolve(workspace, 'artifacts', `production-data-release-${stamp}`);
await runNpm(['run', 'build:data-release', '--', buildDirectory], {
  ...process.env,
  XIV_GEAR_LAB_DATA_SIGNING_KEY_ID: config.signingKeyId,
  XIV_GEAR_LAB_DATA_SIGNING_KEY_FILE: signingKeyFile,
  XIV_GEAR_LAB_DATA_SNAPSHOT_URL: releaseUrl,
  XIV_GEAR_LAB_DATA_CHANNEL: config.channel
});

const channelDirectory = resolve(workspace, 'docs', 'channel');
const releaseDirectory = resolve(channelDirectory, 'releases', safeSnapshotId);
await mkdir(releaseDirectory, { recursive: true });
const builtSnapshotPath = resolve(buildDirectory, snapshotFileName);
const stagedSnapshotPath = resolve(releaseDirectory, snapshotFileName);
const builtSnapshot = await readFile(builtSnapshotPath);
let stagedSnapshot;
try {
  stagedSnapshot = await readFile(stagedSnapshotPath);
} catch {
  stagedSnapshot = undefined;
}
if (stagedSnapshot) {
  const checksum = (value) => createHash('sha256').update(value).digest('hex');
  if (checksum(stagedSnapshot) !== checksum(builtSnapshot)) {
    throw new Error(`Published snapshot ID ${snapshotId} already exists with different bytes.`);
  }
} else {
  await copyFile(builtSnapshotPath, stagedSnapshotPath);
}

const builtManifest = await readFile(resolve(buildDirectory, 'manifest.json'));
await writeFile(resolve(channelDirectory, 'manifest.json'), builtManifest);
await writeFile(resolve(channelDirectory, 'status.json'), `${JSON.stringify({
  status: config.status,
  channel: config.channel,
  snapshotId,
  signingKeyId: config.signingKeyId,
  stagedAt: new Date().toISOString(),
  warning: 'Unfinished preview. Not a supported public release.'
}, null, 2)}\n`);

process.stdout.write(`Production data channel staged in ${channelDirectory}\n`);
process.stdout.write(`Manifest URL: ${config.manifestUrl}\n`);
process.stdout.write(`Snapshot URL: ${releaseUrl}\n`);
