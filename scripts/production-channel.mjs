import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const workspace = resolve(import.meta.dirname, '..');
export const productionChannelConfigPath = resolve(workspace, 'config', 'data-channel.production.json');

export const loadProductionChannelConfig = async () => {
  const config = JSON.parse(await readFile(productionChannelConfigPath, 'utf8'));
  if (
    config.schemaVersion !== 'data-channel-config@1' ||
    config.status !== 'unfinished-preview' ||
    typeof config.repository !== 'string' ||
    typeof config.channel !== 'string' ||
    typeof config.manifestUrl !== 'string' ||
    typeof config.snapshotBaseUrl !== 'string' ||
    !Array.isArray(config.allowedOrigins) ||
    typeof config.signingKeyId !== 'string' ||
    typeof config.trustedEd25519Keys !== 'object' ||
    typeof config.trustedEd25519Keys?.[config.signingKeyId] !== 'string'
  ) {
    throw new Error('Production data-channel configuration is malformed.');
  }
  const manifestUrl = new URL(config.manifestUrl);
  const snapshotBaseUrl = new URL(config.snapshotBaseUrl);
  if (manifestUrl.protocol !== 'https:' || snapshotBaseUrl.protocol !== 'https:') {
    throw new Error('Production data-channel URLs must use HTTPS.');
  }
  if (!config.allowedOrigins.includes(manifestUrl.origin) || !config.allowedOrigins.includes(snapshotBaseUrl.origin)) {
    throw new Error('Production data-channel origins must be explicitly allowlisted.');
  }
  return config;
};

export const run = (command, arguments_, environment = process.env) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, arguments_, {
    cwd: workspace,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  });
  child.on('error', rejectRun);
  child.on('exit', (code, signal) => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`${command} ${arguments_.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
  });
});

export const runNpm = (arguments_, environment = process.env) => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('This command must be launched through npm.');
  return run(process.execPath, [npmCli, ...arguments_], environment);
};
