import { generateKeyPairSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDirectory = resolve(process.argv[2] ?? join(root, 'artifacts', `installed-update-drill-${stamp}`));
const releaseDirectory = join(artifactDirectory, 'channel');
const userDataDirectory = join(artifactDirectory, 'user-data');
const onlineResultPath = join(artifactDirectory, 'online.result.json');
const offlineResultPath = join(artifactDirectory, 'offline.result.json');
const summaryPath = join(artifactDirectory, 'summary.json');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('The installed update drill must be launched through npm.');

const run = (command, arguments_, environment = process.env) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, arguments_, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  });
  child.on('error', rejectRun);
  child.on('exit', (code, signal) => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`${command} ${arguments_.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
  });
});

const runNpm = (arguments_, environment = process.env) => run(process.execPath, [npmCli, ...arguments_], environment);

await mkdir(artifactDirectory, { recursive: true });
await mkdir(userDataDirectory, { recursive: true });

const generatedSnapshot = JSON.parse(await readFile(join(root, 'packages', 'data', 'src', 'generated', 'whm-snapshot.json'), 'utf8'));
const safeSnapshotId = String(generatedSnapshot.manifest.id).replace(/[^a-zA-Z0-9._-]/g, '-');
const snapshotFileName = `snapshot-${safeSnapshotId}.json`;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicJwk = publicKey.export({ format: 'jwk' });
if (!publicJwk.x) throw new Error('Generated Ed25519 public key did not contain raw key material.');
const publicKeyRaw = Buffer.from(publicJwk.x, 'base64url').toString('base64');

let serverOpen = true;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const filePath = resolve(releaseDirectory, pathname.replace(/^\/+/, ''));
    if (filePath !== releaseDirectory && !filePath.startsWith(`${releaseDirectory}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-length': String(body.byteLength),
      'content-type': 'application/json; charset=utf-8'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'access-control-allow-origin': '*' }).end('Not found');
  }
});
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Local drill server did not expose a TCP port.');
const origin = `http://127.0.0.1:${address.port}`;
const manifestUrl = `${origin}/manifest.json`;
const snapshotUrl = `${origin}/${snapshotFileName}`;

const closeServer = async () => {
  if (!serverOpen) return;
  serverOpen = false;
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
};

try {
  await runNpm(['run', 'build:data-release', '--', releaseDirectory], {
    ...process.env,
    XIV_GEAR_LAB_DATA_SIGNING_KEY_ID: 'installed-drill-key',
    XIV_GEAR_LAB_DATA_SIGNING_KEY_PKCS8: privateKeyPkcs8,
    XIV_GEAR_LAB_DATA_SNAPSHOT_URL: snapshotUrl,
    XIV_GEAR_LAB_DATA_CHANNEL: 'installed-drill',
    XIV_GEAR_LAB_DATA_ALLOW_INSECURE_LOCALHOST: 'true'
  });
  await runNpm(['run', 'build'], {
    ...process.env,
    VITE_DATA_MANIFEST_URL: manifestUrl,
    VITE_DATA_ALLOWED_ORIGINS: origin,
    VITE_DATA_TRUSTED_KEYS: JSON.stringify({ 'installed-drill-key': publicKeyRaw }),
    VITE_DATA_ALLOW_INSECURE_LOCALHOST: 'true'
  });
  await runNpm(['run', 'package:windows', '-w', '@xiv-gear-lab/desktop']);

  const desktopPackage = JSON.parse(await readFile(join(root, 'apps', 'desktop', 'package.json'), 'utf8'));
  const executable = join(root, 'release', `XIV-Gear-Lab-${desktopPackage.version}-portable.exe`);
  await run(executable, [], {
    ...process.env,
    XIV_GEAR_LAB_UPDATE_DRILL_RESULT: onlineResultPath,
    XIV_GEAR_LAB_UPDATE_DRILL_MODE: 'online',
    XIV_GEAR_LAB_UPDATE_DRILL_USER_DATA: userDataDirectory
  });

  await closeServer();
  await run(executable, [], {
    ...process.env,
    XIV_GEAR_LAB_UPDATE_DRILL_RESULT: offlineResultPath,
    XIV_GEAR_LAB_UPDATE_DRILL_MODE: 'offline',
    XIV_GEAR_LAB_UPDATE_DRILL_USER_DATA: userDataDirectory
  });

  const online = JSON.parse(await readFile(onlineResultPath, 'utf8'));
  const offline = JSON.parse(await readFile(offlineResultPath, 'utf8'));
  if (online.status !== 'passed' || offline.status !== 'passed') throw new Error('One or more installed update drill phases failed.');
  const summary = {
    status: 'passed',
    executable,
    channel: { manifestUrl, snapshotFileName },
    persistedUserData: userDataDirectory,
    online,
    offline
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`Installed online/offline update drill passed. Evidence: ${summaryPath}\n`);
} finally {
  await closeServer();
}
