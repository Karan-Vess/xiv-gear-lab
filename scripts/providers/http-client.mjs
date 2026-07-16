const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class ProviderRequestError extends Error {
  constructor(provider, message, options = {}) {
    super(`${provider}: ${message}`, options);
    this.name = 'ProviderRequestError';
    this.provider = provider;
  }
}

export const createProviderClient = ({
  provider,
  allowedOrigins,
  timeoutMs = 15_000,
  retries = 2,
  maximumBytes = 32 * 1024 * 1024
}) => {
  const allowed = new Set(allowedOrigins);

  const request = async (input, accept) => {
    const url = new URL(input);
    if (url.protocol !== 'https:') throw new ProviderRequestError(provider, `refused non-HTTPS URL ${url.href}`);
    if (!allowed.has(url.origin)) throw new ProviderRequestError(provider, `refused non-allowlisted origin ${url.origin}`);
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: { Accept: accept },
          signal: controller.signal,
          redirect: 'error',
          credentials: 'omit'
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < retries) {
            await sleep(250 * (attempt + 1));
            continue;
          }
          throw new ProviderRequestError(provider, `${response.status} ${response.statusText}: ${url.href}`);
        }
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
          throw new ProviderRequestError(provider, `response exceeds ${maximumBytes.toLocaleString()} bytes: ${url.href}`);
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > maximumBytes) {
          throw new ProviderRequestError(provider, `response exceeds ${maximumBytes.toLocaleString()} bytes: ${url.href}`);
        }
        return { response, buffer };
      } catch (error) {
        lastError = error instanceof ProviderRequestError
          ? error
          : new ProviderRequestError(provider, error instanceof Error ? error.message : `request failed: ${url.href}`, { cause: error });
        if (attempt < retries && !(error instanceof ProviderRequestError)) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new ProviderRequestError(provider, `request failed: ${url.href}`);
  };

  return {
    async getJson(input) {
      const { response, buffer } = await request(input, 'application/json');
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.includes('json')) {
        throw new ProviderRequestError(provider, `expected JSON, received ${contentType}: ${input}`);
      }
      try {
        return JSON.parse(new TextDecoder().decode(buffer));
      } catch (error) {
        throw new ProviderRequestError(provider, `received invalid JSON: ${input}`, { cause: error });
      }
    },
    async getBytes(input, accept) {
      return request(input, accept);
    }
  };
};
