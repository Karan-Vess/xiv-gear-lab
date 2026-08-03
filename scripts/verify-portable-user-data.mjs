import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('The portable user-data audit requires Windows.');

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktopPackage = JSON.parse(await readFile(resolve(repositoryRoot, 'apps/desktop/package.json'), 'utf8'));
const executableName = `XIV-Gear-Lab-${desktopPackage.version}-portable.exe`;
const sourceExecutable = resolve(repositoryRoot, 'release', executableName);
await stat(sourceExecutable);

const auditRoot = await mkdtemp(join(tmpdir(), 'xiv-gear-lab-portable-profile-'));
const auditExecutable = resolve(auditRoot, basename(sourceExecutable));
const screenshotPath = resolve(auditRoot, 'portable-profile-smoke.png');
const resultPath = `${screenshotPath}.result.json`;
const expectedUserData = resolve(auditRoot, 'XIV Gear Lab Data');

try {
  await copyFile(sourceExecutable, auditExecutable);
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(auditExecutable, [], {
      cwd: auditRoot,
      env: {
        ...process.env,
        XIV_GEAR_LAB_SMOKE_SCREENSHOT: screenshotPath,
        XIV_GEAR_LAB_PORTABLE_DATA_AUDIT: '1'
      },
      stdio: 'inherit',
      windowsHide: true
    });
    child.once('error', rejectRun);
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`Portable executable exited with code ${code}.`)));
  });

  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  const actualUserData = result.userDataAudit?.actualUserData;
  const indexedDb = resolve(expectedUserData, 'IndexedDB');
  await stat(indexedDb);
  if (
    result.status !== 'passed' ||
    result.userDataAudit?.requested !== true ||
    actualUserData?.toLowerCase() !== expectedUserData.toLowerCase()
  ) {
    throw new Error(`Portable user-data audit failed: ${JSON.stringify(result.userDataAudit)}`);
  }
  console.log(JSON.stringify({
    status: 'passed',
    executable: auditExecutable,
    userData: actualUserData,
    indexedDbCreated: true
  }, null, 2));
} finally {
  await rm(auditRoot, { recursive: true, force: true });
}
