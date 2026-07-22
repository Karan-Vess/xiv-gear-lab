import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gearSnapshot } from '@xiv-gear-lab/data';
import {
  UPDATE_REPORT_SCHEMA,
  inspectIconDirectory,
  inspectSnapshot,
  parseCatalogueUpdateArgs,
  readJsonFile,
  sizeBudgetReport
} from './catalogue-update/core.mjs';
import { catalogueProfile } from './catalogue-update/profiles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = parseCatalogueUpdateArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`XIV Gear Lab local catalogue-update assistant\n\n` +
    `  npm run catalogue:update\n` +
    `  npm run catalogue:update -- --mode backfill --expansion shb\n` +
    `  npm run catalogue:update -- --mode backfill --expansion shb --apply\n\n` +
    `The default is a read-only report. --apply permits candidate generation but never signs or publishes it.\n`);
  process.exit(0);
}

const snapshotPath = resolve(root, 'packages/data/src/generated/whm-snapshot.json');
const iconDirectory = resolve(root, 'apps/web/public/icons/items');
const { bytes: snapshotBytes } = await readJsonFile(snapshotPath);
const before = inspectSnapshot(gearSnapshot, snapshotBytes, options.expansionId);
const icons = await inspectIconDirectory(iconDirectory);
const requestedProfile = options.expansionId ? catalogueProfile(options.expansionId) : undefined;
const defaultReportPath = resolve(root, 'artifacts/catalogue-update-report.json');
const reportPath = resolve(root, options.reportPath ?? defaultReportPath);

const report = {
  schemaVersion: UPDATE_REPORT_SCHEMA,
  createdAt: new Date().toISOString(),
  mode: options.mode,
  applied: false,
  requestedProfile,
  before,
  icons: {
    files: icons.files,
    uniquePayloads: icons.uniquePayloads,
    redundantFiles: icons.redundantFiles,
    totalBytes: icons.totalBytes,
    uniqueBytes: icons.uniqueBytes,
    avoidableBytes: icons.avoidableBytes
  },
  budgets: sizeBudgetReport({ snapshotBytes: before.bytes, iconBytes: icons.uniqueBytes }),
  outcome: options.mode === 'backfill'
    ? (before.coverage[0]?.ready && !options.force ? 'already-ready' : options.apply ? 'candidate-generation-requested' : 'backfill-planned')
    : 'inspection-complete',
  publication: 'not-requested'
};

const run = (command, arguments_, environment) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, arguments_, { cwd: root, env: environment, shell: false, stdio: 'inherit' });
  child.on('error', rejectRun);
  child.on('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with code ${code}.`)));
});

if (options.mode === 'patch' && options.apply) {
  throw new Error('Patch publication is deliberately unavailable until patch detection and owner confirmation are implemented.');
}

if (options.mode === 'backfill' && options.apply && (!before.coverage[0]?.ready || options.force)) {
  await run('node', ['scripts/sync-whm-data.mjs'], {
    ...process.env,
    XIV_GEAR_LAB_BACKFILL_EXPANSIONS: options.expansionId
  });
  const { bytes: afterBytes, value: afterRawSnapshot } = await readJsonFile(snapshotPath);
  const afterSnapshot = {
    ...gearSnapshot,
    ...afterRawSnapshot,
    manifest: { ...gearSnapshot.manifest, ...afterRawSnapshot.manifest }
  };
  report.after = inspectSnapshot(afterSnapshot, afterBytes, options.expansionId);
  const afterIcons = await inspectIconDirectory(iconDirectory);
  report.icons = {
    files: afterIcons.files,
    uniquePayloads: afterIcons.uniquePayloads,
    redundantFiles: afterIcons.redundantFiles,
    totalBytes: afterIcons.totalBytes,
    uniqueBytes: afterIcons.uniqueBytes,
    avoidableBytes: afterIcons.avoidableBytes
  };
  report.applied = true;
  report.outcome = report.after.coverage[0]?.ready ? 'candidate-ready' : 'candidate-incomplete';
  report.budgets = sizeBudgetReport({ snapshotBytes: report.after.bytes, iconBytes: afterIcons.uniqueBytes });
}

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  process.stdout.write(`Catalogue update report: ${reportPath}\n`);
  process.stdout.write(`Mode: ${report.mode}${requestedProfile ? ` (${requestedProfile.name}, level ${requestedProfile.levelCap})` : ''}\n`);
  process.stdout.write(`Snapshot: ${before.id} · ${before.counts.items} items · ${(before.bytes / 1024 / 1024).toFixed(2)} MiB\n`);
  process.stdout.write(`Icons: ${icons.files} files · ${icons.uniquePayloads} unique · ${(icons.avoidableBytes / 1024 / 1024).toFixed(2)} MiB avoidable duplication\n`);
  process.stdout.write(`Outcome: ${report.outcome}\n`);
  process.stdout.write('No signing or publication was performed.\n');
}
