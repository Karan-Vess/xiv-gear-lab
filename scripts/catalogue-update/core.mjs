import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { catalogueProfile } from './profiles.mjs';

export const UPDATE_REPORT_SCHEMA = 'catalogue-update-report@1';
export const DEFAULT_SIZE_BUDGETS = Object.freeze({
  catalogueBytes: 32 * 1024 * 1024,
  uniqueIconBytes: 64 * 1024 * 1024,
  retainedSnapshotBytes: 64 * 1024 * 1024
});

const valueAfter = (arguments_, index, flag) => {
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
};

export const parseCatalogueUpdateArgs = (arguments_) => {
  const options = { mode: 'check', apply: false, force: false, json: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--mode') options.mode = valueAfter(arguments_, index++, '--mode');
    else if (argument === '--expansion') options.expansionId = valueAfter(arguments_, index++, '--expansion').toLowerCase();
    else if (argument === '--report') options.reportPath = valueAfter(arguments_, index++, '--report');
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--force') options.force = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown catalogue-update option ${argument}.`);
  }
  if (!['check', 'backfill', 'patch'].includes(options.mode)) throw new Error(`Unsupported catalogue-update mode ${options.mode}.`);
  if (options.mode === 'backfill' && !options.expansionId) throw new Error('Backfill mode requires --expansion.');
  if (options.expansionId) catalogueProfile(options.expansionId);
  if (options.mode !== 'backfill' && options.expansionId) throw new Error('--expansion is only valid in backfill mode.');
  if (options.force && !options.apply) throw new Error('--force requires --apply.');
  return options;
};

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  }));
  return nested.flat();
};

export const inspectIconDirectory = async (directory) => {
  const files = (await walkFiles(directory)).filter((path) => ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(path).toLowerCase()));
  const payloads = new Map();
  let totalBytes = 0;
  for (const path of files) {
    const bytes = await readFile(path);
    const hash = sha256(bytes);
    totalBytes += bytes.byteLength;
    const current = payloads.get(hash) ?? { hash, bytes: bytes.byteLength, paths: [] };
    current.paths.push(path);
    payloads.set(hash, current);
  }
  const uniqueBytes = [...payloads.values()].reduce((total, entry) => total + entry.bytes, 0);
  return {
    files: files.length,
    uniquePayloads: payloads.size,
    redundantFiles: files.length - payloads.size,
    totalBytes,
    uniqueBytes,
    avoidableBytes: totalBytes - uniqueBytes,
    duplicateGroups: [...payloads.values()].filter((entry) => entry.paths.length > 1)
  };
};

const jobsAtCap = (snapshot, expansionId) => {
  const expansionOrder = new Map(snapshot.registry.expansions.map((entry) => [entry.id, entry.order]));
  const targetOrder = expansionOrder.get(expansionId);
  return snapshot.registry.jobs.filter((job) => expansionOrder.get(job.introducedIn) <= targetOrder).map((job) => job.id);
};

export const inspectExpansionCoverage = (snapshot, expansionId) => {
  const profile = catalogueProfile(expansionId);
  const items = snapshot.items.filter((item) => item.expansionId === expansionId && item.level === profile.levelCap);
  const requiredJobs = jobsAtCap(snapshot, expansionId);
  const requiredSlots = ['weapon', 'head', 'body', 'hands', 'legs', 'feet', 'ears', 'neck', 'wrists', 'ring'];
  const gaps = [];
  for (const job of requiredJobs) {
    for (const slot of requiredSlots) {
      if (!items.some((item) => item.jobs.includes(job) && item.slot === slot)) gaps.push(`${job}:${slot}`);
    }
  }
  const ruleset = snapshot.rulesets.find((entry) => entry.expansionId === expansionId && entry.minimumLevel <= profile.levelCap && entry.maximumLevel >= profile.levelCap);
  const profiles = snapshot.evaluatorProfiles.filter((entry) => entry.rulesetId === ruleset?.id && requiredJobs.includes(entry.job));
  return {
    expansionId,
    levelCap: profile.levelCap,
    items: items.length,
    jobs: requiredJobs.length,
    coveredJobs: new Set(items.flatMap((item) => item.jobs)).size,
    missingJobSlots: gaps,
    rulesetId: ruleset?.id,
    evaluatorProfiles: profiles.length,
    ready: items.length > 0 && gaps.length === 0 && Boolean(ruleset) && profiles.length === requiredJobs.length
  };
};

export const inspectSnapshot = (snapshot, bytes, requestedExpansionId) => {
  const expansionIds = requestedExpansionId
    ? [requestedExpansionId]
    : snapshot.registry.expansions.map((entry) => entry.id);
  return {
    id: snapshot.manifest.id,
    gamePatch: snapshot.manifest.gamePatch,
    generatedAt: snapshot.manifest.generatedAt,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    counts: {
      expansions: snapshot.registry.expansions.length,
      jobs: snapshot.registry.jobs.length,
      rulesets: snapshot.rulesets.length,
      evaluatorProfiles: snapshot.evaluatorProfiles.length,
      items: snapshot.items.length,
      materia: snapshot.materia.length,
      foods: snapshot.foods.length,
      curatedSets: snapshot.curatedSets.length
    },
    coverage: expansionIds.map((expansionId) => inspectExpansionCoverage(snapshot, expansionId))
  };
};

export const sizeBudgetReport = ({ snapshotBytes, iconBytes }, budgets = DEFAULT_SIZE_BUDGETS) => ({
  catalogue: { bytes: snapshotBytes, budget: budgets.catalogueBytes, withinBudget: snapshotBytes <= budgets.catalogueBytes },
  uniqueIcons: { bytes: iconBytes, budget: budgets.uniqueIconBytes, withinBudget: iconBytes <= budgets.uniqueIconBytes },
  retainedPair: { bytes: snapshotBytes * 2, budget: budgets.retainedSnapshotBytes, withinBudget: snapshotBytes * 2 <= budgets.retainedSnapshotBytes }
});

export const readJsonFile = async (path) => {
  const bytes = await readFile(path);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
};

export const fileExists = async (path) => stat(path).then(() => true).catch(() => false);
