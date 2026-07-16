import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repositoryRoot, 'apps/desktop/build/icon.svg');
const output = resolve(repositoryRoot, 'apps/desktop/build/icon.png');

await sharp(source, { density: 384 })
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Rendered ${output}`);
