import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ? resolve(process.argv[2]) : undefined;
const keyId = process.argv[3]?.trim();
if (!outputPath || !keyId) {
  throw new Error('Usage: node scripts/create-production-signing-key.mjs <private-key-output> <key-id>');
}
const relativeToWorkspace = relative(workspace, outputPath);
if (relativeToWorkspace === '' || (!relativeToWorkspace.startsWith('..') && !relativeToWorkspace.includes(':'))) {
  throw new Error('The production private key must be stored outside the project workspace.');
}
if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(keyId)) throw new Error('The signing key ID is invalid.');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicJwk = publicKey.export({ format: 'jwk' });
if (!publicJwk.x) throw new Error('Generated Ed25519 public key did not contain raw key material.');

await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
await writeFile(outputPath, `${privateKeyPkcs8}\n`, { flag: 'wx', mode: 0o600 });
await chmod(outputPath, 0o600).catch(() => undefined);

process.stdout.write(`${JSON.stringify({
  keyId,
  privateKeyPath: outputPath,
  publicKeyRawBase64: Buffer.from(publicJwk.x, 'base64url').toString('base64')
})}\n`);
