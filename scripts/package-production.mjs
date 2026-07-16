import { loadProductionChannelConfig, runNpm } from './production-channel.mjs';

const config = await loadProductionChannelConfig();
const buildEnvironment = {
  ...process.env,
  VITE_DATA_MANIFEST_URL: config.manifestUrl,
  VITE_DATA_ALLOWED_ORIGINS: config.allowedOrigins.join(','),
  VITE_DATA_TRUSTED_KEYS: JSON.stringify(config.trustedEd25519Keys)
};
await runNpm(['run', 'build'], buildEnvironment);
await runNpm(['run', 'package:windows', '-w', '@xiv-gear-lab/desktop'], buildEnvironment);
