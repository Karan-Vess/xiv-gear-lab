import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gearSnapshot } from '@xiv-gear-lab/data';
import {
  UPDATE_REPORT_SCHEMA,
  assessPatchProbe,
  describePatchAvailability,
  inspectIconDirectory,
  inspectSnapshot,
  parseCatalogueUpdateArgs,
  readJsonFile,
  sizeBudgetReport
} from './catalogue-update/core.mjs';
import { catalogueProfile } from './catalogue-update/profiles.mjs';
import { createEtroAdapter } from './providers/etro.mjs';
import { createProviderClient } from './providers/http-client.mjs';
import { createXivApiAdapter } from './providers/xivapi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = parseCatalogueUpdateArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`XIV Gear Lab local catalogue-update assistant\n\n` +
    `  npm run catalogue:update\n` +
    `  npm run catalogue:update -- --mode backfill --expansion shb\n` +
    `  npm run catalogue:update -- --mode backfill --expansion shb --apply\n` +
    `  npm run catalogue:update -- --mode patch\n` +
    `  npm run catalogue:update -- --mode patch --patch 7.6 --apply\n\n` +
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
let patchProbe;

if (options.mode === 'patch') {
  try {
    const xivApi = createXivApiAdapter({
      client: createProviderClient({ provider: 'XIVAPI v2', allowedOrigins: ['https://v2.xivapi.com'] })
    });
    const etro = createEtroAdapter({
      client: createProviderClient({ provider: 'Etro', allowedOrigins: ['https://etro.gg'] })
    });
    const probeItemId = gearSnapshot.items.find((item) =>
      item.origin === 'official' && Number.isSafeInteger(Number(item.id))
    )?.id;
    if (!probeItemId) throw new Error('The active catalogue has no official item available for the version probe.');
    const latestExpansion = [...gearSnapshot.registry.expansions].sort((left, right) => right.order - left.order)[0];
    const latestProfile = catalogueProfile(latestExpansion.id);
    const [official, providerJobs, latestEquipment] = await Promise.all([
      xivApi.sheetRows('Item', [Number(probeItemId)], 'Name', { language: 'en' }),
      etro.jobs(),
      etro.equipment('WHM', latestProfile.minimumItemLevel, 9999)
    ]);
    const assessment = assessPatchProbe({
      activeVersion: gearSnapshot.manifest.xivapiVersion,
      activeSchema: gearSnapshot.manifest.xivapiSchema,
      probedVersion: official.version,
      probedSchema: official.schema,
      supportedJobs: gearSnapshot.registry.jobs.map((job) => job.id),
      providerJobs,
      maximumSupportedLevel: Math.max(...gearSnapshot.registry.expansions.map((expansion) => expansion.levelCap)),
      discoveredEquipmentLevels: latestEquipment.map((item) => item.level)
    });
    patchProbe = {
      activeVersion: gearSnapshot.manifest.xivapiVersion,
      activeSchema: gearSnapshot.manifest.xivapiSchema,
      probedVersion: official.version,
      probedSchema: official.schema,
      providerJobs: providerJobs
        .filter((job) => !job.isCrafting && !job.isGathering)
        .map((job) => ({ abbrev: job.abbrev, name: job.name })),
      discoveredEquipmentLevels: [...new Set(latestEquipment.map((item) => item.level))].sort((left, right) => left - right),
      ...assessment
    };
  } catch (error) {
    patchProbe = {
      outcome: 'blocked-provider-error',
      blockers: [error instanceof Error ? error.message : String(error)]
    };
  }
}

const report = {
  schemaVersion: UPDATE_REPORT_SCHEMA,
  createdAt: new Date().toISOString(),
  mode: options.mode,
  applied: false,
  requestedProfile,
  ...(patchProbe ? { patchProbe } : {}),
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
    : options.mode === 'patch' ? patchProbe.outcome : 'inspection-complete',
  publication: 'not-requested'
};

const run = (command, arguments_, environment) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, arguments_, { cwd: root, env: environment, shell: false, stdio: 'inherit' });
  child.on('error', rejectRun);
  child.on('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with code ${code}.`)));
});

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

if (
  options.mode === 'patch' &&
  options.apply &&
  patchProbe.blockers?.length === 0 &&
  (patchProbe.officialChanged || options.force)
) {
  await run('node', ['scripts/sync-whm-data.mjs'], {
    ...process.env,
    XIV_GEAR_LAB_PATCH_MODE: '1',
    XIV_GEAR_LAB_TARGET_PATCH: options.patch
  });
  const { bytes: afterBytes, value: afterRawSnapshot } = await readJsonFile(snapshotPath);
  const afterSnapshot = {
    ...gearSnapshot,
    ...afterRawSnapshot,
    manifest: { ...gearSnapshot.manifest, ...afterRawSnapshot.manifest }
  };
  report.after = inspectSnapshot(afterSnapshot, afterBytes);
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
  report.budgets = sizeBudgetReport({ snapshotBytes: report.after.bytes, iconBytes: afterIcons.uniqueBytes });
  const completeCoverage = report.after.coverage.every((coverage) => coverage.ready);
  const withinBudgets = Object.values(report.budgets).every((budget) => budget.withinBudget);
  report.outcome = !completeCoverage ? 'candidate-incomplete'
    : !withinBudgets ? 'candidate-over-budget'
      : report.after.id === report.before.id ? 'provider-refresh-no-content-change'
        : 'candidate-ready';
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
  if (options.mode === 'patch' && !options.apply) {
    process.stdout.write(`${describePatchAvailability(patchProbe)}\n`);
  }
  if (patchProbe?.blockers?.length) process.stdout.write(`Blocked: ${patchProbe.blockers.join('; ')}\n`);
  process.stdout.write('No signing or publication was performed.\n');
}
