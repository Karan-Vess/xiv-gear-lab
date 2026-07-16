import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_DATA_');
  const allowInsecureLocalhost = environment.VITE_DATA_ALLOW_INSECURE_LOCALHOST === 'true';
  const updateOrigins = new Set<string>();
  for (const value of [
    environment.VITE_DATA_MANIFEST_URL,
    ...(environment.VITE_DATA_ALLOWED_ORIGINS ?? '').split(',')
  ]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim());
      const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol === 'https:' || (allowInsecureLocalhost && url.protocol === 'http:' && isLocalhost)) {
        updateOrigins.add(url.origin);
      }
    } catch {
      // Runtime configuration reports malformed values; they never enter CSP.
    }
  }
  return {
    plugins: [
      react(),
      {
        name: 'runtime-data-csp',
        transformIndexHtml(html) {
          return html.replace('__UPDATE_CONNECT_SOURCES__', [...updateOrigins].join(' '));
        }
      }
    ],
    base: './',
    server: {
      port: 5173,
      strictPort: true
    },
    build: {
      target: 'es2022',
      sourcemap: true
    }
  };
});
