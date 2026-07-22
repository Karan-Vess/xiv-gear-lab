import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentAddressIconRecords } from './icon-assets.mjs';

describe('content-addressed catalogue icons', () => {
  it('stores identical payloads once while preserving separate record identities', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'xiv-gear-icons-'));
    const itemDirectory = resolve(root, 'icons/items');
    await mkdir(itemDirectory, { recursive: true });
    await writeFile(resolve(itemDirectory, '1.png'), Buffer.from([1, 2, 3]));
    await writeFile(resolve(itemDirectory, '2.png'), Buffer.from([1, 2, 3]));
    await writeFile(resolve(itemDirectory, '3.png'), Buffer.from([4, 5, 6]));
    const records = [1, 2, 3].map((id) => ({ id, iconUrl: `./icons/items/${id}.png` }));

    const report = await contentAddressIconRecords(records, { publicDirectory: root });

    expect(report).toMatchObject({ records: 3, uniqueAssets: 2, reusedReferences: 1 });
    expect(records[0]!.iconUrl).toBe(records[1]!.iconUrl);
    expect(records[2]!.iconUrl).not.toBe(records[0]!.iconUrl);
    expect(await readFile(resolve(root, records[0]!.iconUrl.slice(2)))).toEqual(Buffer.from([1, 2, 3]));
  });
});
