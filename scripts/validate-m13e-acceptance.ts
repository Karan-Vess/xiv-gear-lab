import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CURRENT_ROTATION_PROFILES, gearSnapshot } from '@xiv-gear-lab/data';

const deep = process.argv.includes('--deep');
const summarizeOnly = process.argv.includes('--summarize-only');
const npmExecPath = process.env.npm_execpath;

const validationCommands = [
  [
    'exec',
    '--',
    'vitest',
    'run',
    'packages/simulator/src/timing-engine.test.ts',
    'packages/simulator/src/pilot-evaluators.test.ts',
    'packages/simulator/src/rerank-gearsets.test.ts',
    'apps/web/src/optimizer-rotation.integration.test.ts',
    'apps/web/src/storage.test.ts',
    'apps/web/src/workspace.test.ts',
    'apps/web/src/data-runtime.test.ts',
    'packages/domain/src/index.test.ts',
    'packages/data/src/runtime-updates.test.ts'
  ],
  ['run', 'validate:m13e:samurai'],
  ['run', 'validate:m13e:healers'],
  ['run', deep ? 'validate:m13b:deep' : 'validate:m13b'],
  ['run', deep ? 'validate:m13c:healers:deep' : 'validate:m13c:healers'],
  ['run', deep ? 'validate:m13c:tanks:deep' : 'validate:m13c:tanks'],
  ['run', deep ? 'validate:m13c:melee:deep' : 'validate:m13c:melee'],
  ['run', deep ? 'validate:m13c:ranged:deep' : 'validate:m13c:ranged'],
  ['run', deep ? 'validate:m13c:casters:deep' : 'validate:m13c:casters']
];

if (!summarizeOnly) {
  for (const args of validationCommands) {
    const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
    const result = spawnSync(command, commandArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: !npmExecPath && process.platform === 'win32'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`M13E validation command failed: npm ${args.join(' ')}`);
    }
  }
}

const reportFiles = [
  'artifacts/m13b-pilot-validation.json',
  'artifacts/m13c-healer-validation.json',
  'artifacts/m13c-tank-validation.json',
  'artifacts/m13c-melee-validation.json',
  'artifacts/m13c-physical-ranged-validation.json',
  'artifacts/m13c-magical-ranged-validation.json'
];
const reports = await Promise.all(reportFiles.map(async (file) => ({
  file,
  value: JSON.parse(await readFile(resolve(file), 'utf8')) as {
    mode?: string;
    rows?: Array<{ job?: string }>;
  }
})));
const reportedJobs = [...new Set(
  reports.flatMap(({ value }) => value.rows?.map((row) => row.job).filter(Boolean) ?? [])
)].sort();
const expectedJobs = [...new Set(CURRENT_ROTATION_PROFILES.map((profile) => profile.job))].sort();
const missingJobs = expectedJobs.filter((job) => !reportedJobs.includes(job));
const unexpectedJobs = reportedJobs.filter((job) => !expectedJobs.includes(job));
if (missingJobs.length > 0 || unexpectedJobs.length > 0) {
  throw new Error(
    `M13E job coverage mismatch. Missing: ${missingJobs.join(', ') || 'none'}. ` +
    `Unexpected: ${unexpectedJobs.join(', ') || 'none'}.`
  );
}

const summary = {
  schemaVersion: 'm13e-acceptance-summary@1',
  generatedAt: new Date().toISOString(),
  snapshotId: gearSnapshot.manifest.id,
  snapshotPatch: gearSnapshot.manifest.gamePatch,
  mode: deep ? 'deep' : 'routine',
  jobCount: expectedJobs.length,
  jobs: expectedJobs,
  reportFiles,
  checks: [
    'Cast, queue, lock, weave and speed-scaling timing regressions',
    'Twenty-one-job mechanical and deterministic evaluator fixtures',
    'Broad-range versus exact-GCD rotation-aware optimizer regressions',
    'Samurai 2.08, 2.11, 2.14 and 2.17 cadence plus 300-versus-510-second stability audit',
    'Healer spell costs, natural Piety regeneration, Lucid Dreaming and job-owned MP restoration',
    'Curated-free equipment, meld, proxy and rotation comparisons',
    'Cross-mode workspace persistence and pre-M13 migration',
    'Downloaded evaluator overlay and signed-data runtime compatibility'
  ]
};
const output = resolve('artifacts/m13e-acceptance-summary.json');
await mkdir(resolve('artifacts'), { recursive: true });
await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`M13E ${summary.mode} acceptance covers ${summary.jobCount} standard jobs.`);
console.log(`Wrote ${output}`);
