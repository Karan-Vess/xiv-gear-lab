export const TRUSTED_EXTERNAL_HOSTS = new Set([
  'www.akhmorning.com',
  'etro.gg',
  'ffxiv.consolegameswiki.com',
  'github.com',
  'na.finalfantasyxiv.com',
  'support.na.square-enix.com',
  'thebalanceffxiv.com',
  'v2.xivapi.com',
  'www.thebalanceffxiv.com',
  'xivgear.app'
]);

export const trustedExternalUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && TRUSTED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase())
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};
