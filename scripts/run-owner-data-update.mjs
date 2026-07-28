import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { loadProductionChannelConfig, run, runNpm, workspace } from './production-channel.mjs';

const expansionId = String(process.argv[process.argv.indexOf('--expansion') + 1] ?? '').toLowerCase();
const requestedPatch = String(process.argv[process.argv.indexOf('--patch') + 1] ?? '').trim();
const forceSupportingRefresh = process.argv.includes('--force');
const historicalExpansion = {
  hw: {
    name: 'Heavensward',
    level: 60,
    materia: 'Grade III/IV materia',
    jobs: 13,
    confirmation: 'PUBLISH HEAVENSWARD',
    reportName: 'heavensward-owner-update-report.json',
    commitMessage: 'data: publish Heavensward level-cap catalogue'
  },
  arr: {
    name: 'A Realm Reborn',
    level: 50,
    materia: 'Grade I/II materia',
    jobs: 10,
    confirmation: 'PUBLISH A REALM REBORN',
    reportName: 'a-realm-reborn-owner-update-report.json',
    commitMessage: 'data: publish A Realm Reborn level-cap catalogue'
  }
}[expansionId];
const expansion = requestedPatch ? {
  name: `Patch ${requestedPatch}`,
  level: 100,
  materia: 'compatible materia and cap foods',
  jobs: 21,
  confirmation: `PUBLISH PATCH ${requestedPatch}`,
  reportName: `patch-${requestedPatch.replace(/[^a-z0-9.-]+/gi, '-')}-owner-update-report.json`,
  commitMessage: `data: publish patch ${requestedPatch} catalogue`,
  updateArguments: [
    '--mode', 'patch', '--patch', requestedPatch, '--apply',
    ...(forceSupportingRefresh ? ['--force'] : [])
  ]
} : historicalExpansion ? {
  ...historicalExpansion,
  updateArguments: ['--mode', 'backfill', '--expansion', expansionId, '--apply']
} : undefined;
if (!expansion) throw new Error('Use --patch <version>, or --expansion hw/arr for a historical backfill.');

const runCaptured = (command, arguments_) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, arguments_, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', rejectRun);
  child.on('exit', (code) => code === 0
    ? resolveRun(stdout.trim())
    : rejectRun(new Error(`${command} ${arguments_.join(' ')} failed with exit code ${code}.\n${stderr.trim()}`)));
});

const question = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (prompt) => (await question.question(prompt)).trim();
const fail = (message) => { throw new Error(message); };
const generatedCandidatePaths = [
  'packages/data/src/generated/whm-snapshot.json',
  'apps/web/public/icons/assets'
];

const askForPublicationConfirmation = async () => {
  while (true) {
    const confirmation = await ask(
      `Type ${expansion.confirmation} to sign, commit and upload this candidate, or press Enter to cancel: `
    );
    if (confirmation === expansion.confirmation) return true;
    if (!confirmation) return false;
    process.stdout.write(
      `\nThat did not exactly match ${expansion.confirmation}. Nothing was uploaded; please try again.\n\n`
    );
  }
};

const discardGeneratedCandidate = async () => {
  await run('git', ['restore', '--worktree', '--', ...generatedCandidatePaths]);
  const remaining = await runCaptured('git', ['status', '--porcelain']);
  if (remaining) {
    process.stdout.write(
      `\nPublication cancelled and tracked candidate files were restored, but these local changes remain:\n${remaining}\n`
    );
    return;
  }
  process.stdout.write('\nPublication cancelled. Generated candidate files were restored and nothing was uploaded.\n');
};

const appendChangelog = async (itemCount, snapshotId) => {
  const path = resolve(workspace, 'CHANGELOG.md');
  const text = await readFile(path, 'utf8');
  const entry = requestedPatch
    ? `- Published the owner-verified Patch ${requestedPatch} official-data catalogue through the signed data channel with ${itemCount.toLocaleString('en-US')} level-${expansion.level} items (${snapshotId}).`
    : `- Added ${itemCount.toLocaleString('en-US')} preliminary ${expansion.name} level-${expansion.level} items, ${expansion.materia} and ${expansion.jobs} cap-job evaluator profiles through the owner-run signed data channel (${snapshotId}).`;
  if (text.includes(entry)) return;
  const marker = '### Added\n';
  if (!text.includes(marker)) throw new Error('CHANGELOG.md has no Unreleased Added section.');
  await writeFile(path, text.replace(marker, `${marker}\n${entry}\n`), 'utf8');
};

try {
  process.stdout.write(`\nXIV Gear Lab - ${expansion.name} catalogue update\n`);
  process.stdout.write('This runs on your PC. Nothing is signed or uploaded until the final confirmation.\n\n');

  const status = await runCaptured('git', ['status', '--porcelain']);
  if (status) fail('The repository has uncommitted changes. Finish or discard them before publishing a data update.');
  const branch = await runCaptured('git', ['branch', '--show-current']);
  if (branch !== 'main') fail(`Data publication must run from main, not ${branch || '(detached HEAD)'}.`);

  const config = await loadProductionChannelConfig();
  const signingKeyFile = resolve(process.env.XIV_GEAR_LAB_DATA_SIGNING_KEY_FILE?.trim() ||
    join(homedir(), '.xiv-gear-lab', 'signing', `${config.signingKeyId}.pkcs8.b64`));
  await access(signingKeyFile).catch(() => fail(`The local signing key is missing: ${signingKeyFile}`));

  process.stdout.write('Checking the currently hosted signed channel...\n');
  await runNpm(['run', 'verify:data-hosted']);

  const reportPath = resolve(workspace, 'artifacts', expansion.reportName);
  await mkdir(dirname(reportPath), { recursive: true });
  process.stdout.write(`\nChecking and building the level-${expansion.level} ${expansion.name} candidate...\n`);
  await runNpm(['run', 'catalogue:update', '--', ...expansion.updateArguments, '--report', reportPath]);

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (requestedPatch && report.outcome === 'already-current') {
    process.stdout.write('\nThe official data version already matches the active catalogue. Nothing was rebuilt, signed or uploaded.\n');
    process.exit(0);
  }
  if (requestedPatch && report.outcome === 'provider-refresh-no-content-change') {
    process.stdout.write('\nThe supporting providers were refreshed, but the validated catalogue content did not change. Nothing was signed or uploaded.\n');
    process.exit(0);
  }
  if (report.patchProbe?.blockers?.length) {
    fail(`${expansion.name} is not compatible with the installed rules and evaluator data:\n${report.patchProbe.blockers.join('\n')}\nReport: ${reportPath}`);
  }
  const coverage = requestedPatch
    ? report.after?.coverage?.find((entry) => entry.levelCap === expansion.level)
    : report.after?.coverage?.[0];
  if (!report.applied || report.outcome !== 'candidate-ready' || !coverage?.ready) {
    fail(`${expansion.name} candidate is not complete. Report: ${reportPath}`);
  }
  if (requestedPatch && report.after.coverage.some((entry) => !entry.ready)) {
    fail(`${expansion.name} candidate has an incomplete historical or current expansion boundary. Report: ${reportPath}`);
  }
  if (Object.values(report.budgets ?? {}).some((budget) => budget?.withinBudget === false)) {
    fail(`${expansion.name} candidate exceeded a configured data or icon budget. Report: ${reportPath}`);
  }

  process.stdout.write('\nRunning local validation...\n');
  await runNpm(['run', 'typecheck']);
  await runNpm(['test', '--', 'packages/data/src/reference.test.ts', 'packages/data/src/runtime-updates.test.ts', 'scripts/catalogue-update/core.test.ts', 'scripts/providers/provider-contracts.test.ts']);
  await runNpm(['run', 'build']);

  process.stdout.write('\nValidated candidate\n');
  process.stdout.write(`  Snapshot: ${report.after.id}\n`);
  process.stdout.write(`  ${expansion.name} items: ${coverage.items.toLocaleString('en-US')}\n`);
  process.stdout.write(`  Jobs covered: ${coverage.coveredJobs}/${coverage.jobs}\n`);
  process.stdout.write(`  Missing job/slots: ${coverage.missingJobSlots.length}\n`);
  process.stdout.write(`  Source catalogue: ${(report.after.bytes / 1024 / 1024).toFixed(2)} MiB before signed-release compression\n\n`);

  const publicationConfirmed = await askForPublicationConfirmation();
  if (!publicationConfirmed) {
    await discardGeneratedCandidate();
    process.exitCode = 2;
  } else {
    await appendChangelog(coverage.items, report.after.id);
    process.stdout.write('\nSigning and staging the production channel...\n');
    await runNpm(['run', 'stage:data-production']);
    await runNpm(['run', 'verify:data-production']);

    await run('git', ['add', '--',
      'packages/data/src/generated/whm-snapshot.json',
      'apps/web/public/icons/assets',
      'docs/channel',
      'CHANGELOG.md'
    ]);
    const staged = await runCaptured('git', ['diff', '--cached', '--name-only']);
    if (!staged) fail('The candidate produced no publishable changes.');
    const remaining = await runCaptured('git', ['status', '--porcelain']);
    const unexpected = remaining.split(/\r?\n/).filter(Boolean).filter((line) => !line.startsWith('M ') && !line.startsWith('A '));
    if (unexpected.length > 0) fail(`Unexpected working-tree changes remain:\n${unexpected.join('\n')}`);

    await run('git', ['commit', '-m', expansion.commitMessage]);
    await run('git', ['push', 'origin', 'main']);

    process.stdout.write('\nWaiting for the live data channel to deploy...\n');
    let hosted = false;
    for (let attempt = 1; attempt <= 24; attempt += 1) {
      try {
        await runNpm(['run', 'verify:data-hosted']);
        hosted = true;
        break;
      } catch {
        if (attempt === 24) break;
        process.stdout.write(`Channel not updated yet (${attempt}/24); checking again in 10 seconds...\n`);
        await delay(10_000);
      }
    }
    if (!hosted) fail('The push succeeded, but the hosted channel did not verify within four minutes. Do not use Check data yet; inspect the Pages deployment first.');
    process.stdout.write(`\n${expansion.name} is live and cryptographically verified. Return to the incomplete client and click Check data.\n`);
  }
} finally {
  question.close();
}
