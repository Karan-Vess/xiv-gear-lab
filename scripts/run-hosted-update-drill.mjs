import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadProductionChannelConfig, run, workspace } from './production-channel.mjs';

const config = await loadProductionChannelConfig();
const desktopPackage = JSON.parse(await readFile(resolve(workspace, 'apps', 'desktop', 'package.json'), 'utf8'));
const executable = resolve(workspace, 'release', `XIV-Gear-Lab-${desktopPackage.version}-portable.exe`);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDirectory = resolve(process.argv[2] ?? join(workspace, 'artifacts', `hosted-update-drill-${stamp}`));
const userDataDirectory = join(artifactDirectory, 'user-data');
const onlineResultPath = join(artifactDirectory, 'online.result.json');
const offlineResultPath = join(artifactDirectory, 'offline.result.json');
await mkdir(userDataDirectory, { recursive: true });

await run(executable, [], {
  ...process.env,
  XIV_GEAR_LAB_UPDATE_DRILL_RESULT: onlineResultPath,
  XIV_GEAR_LAB_UPDATE_DRILL_MODE: 'online',
  XIV_GEAR_LAB_UPDATE_DRILL_USER_DATA: userDataDirectory
});
await run(executable, [], {
  ...process.env,
  XIV_GEAR_LAB_UPDATE_DRILL_RESULT: offlineResultPath,
  XIV_GEAR_LAB_UPDATE_DRILL_MODE: 'offline',
  XIV_GEAR_LAB_UPDATE_DRILL_USER_DATA: userDataDirectory
});

const online = JSON.parse(await readFile(onlineResultPath, 'utf8'));
const offline = JSON.parse(await readFile(offlineResultPath, 'utf8'));
if (online.status !== 'passed' || offline.status !== 'passed') throw new Error('Hosted update drill failed.');
const summary = {
  status: 'passed',
  manifestUrl: config.manifestUrl,
  executable,
  online,
  offline
};
const summaryPath = join(artifactDirectory, 'summary.json');
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`Hosted update/offline drill passed. Evidence: ${summaryPath}\n`);
