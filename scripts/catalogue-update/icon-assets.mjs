import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const CONTENT_ADDRESSED_ICON_SCHEMA = 'content-addressed-icons@1';

const sha256FileName = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const safeLocalIconPath = (publicDirectory, iconUrl) => {
  if (!iconUrl?.startsWith('./')) throw new Error(`Cannot content-address non-local icon URL ${iconUrl ?? '(missing)'}.`);
  const path = resolve(publicDirectory, iconUrl.slice(2));
  if (path !== publicDirectory && !path.startsWith(`${publicDirectory}${sep}`)) {
    throw new Error(`Icon URL escapes the public directory: ${iconUrl}.`);
  }
  return path;
};

export const contentAddressIconRecords = async (records, {
  publicDirectory,
  outputDirectory = resolve(publicDirectory, 'icons/assets')
}) => {
  await mkdir(outputDirectory, { recursive: true });
  const assets = new Map();
  for (const record of records) {
    const sourcePath = safeLocalIconPath(publicDirectory, record.iconUrl);
    const extension = extname(sourcePath).toLowerCase() || '.png';
    const hash = await sha256FileName(sourcePath);
    const fileName = `${hash}${extension}`;
    const targetPath = resolve(outputDirectory, fileName);
    if (!assets.has(hash)) {
      await copyFile(sourcePath, targetPath);
      assets.set(hash, { hash, fileName, bytes: (await stat(targetPath)).size });
    }
    record.iconUrl = `./icons/assets/${fileName}`;
  }

  const activeFiles = new Set([...assets.values()].map((entry) => entry.fileName));
  for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
    if (entry.isFile() && !activeFiles.has(entry.name)) await rm(resolve(outputDirectory, entry.name));
  }
  const resolvedAssets = [...assets.values()];
  return {
    schemaVersion: CONTENT_ADDRESSED_ICON_SCHEMA,
    records: records.length,
    uniqueAssets: resolvedAssets.length,
    reusedReferences: records.length - resolvedAssets.length,
    uniqueBytes: resolvedAssets.reduce((total, entry) => total + entry.bytes, 0),
    assets: resolvedAssets.sort((left, right) => left.fileName.localeCompare(right.fileName))
  };
};
