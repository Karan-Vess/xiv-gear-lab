import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = resolve(repositoryRoot, 'apps/web/dist/index.html');
const preloadPath = resolve(repositoryRoot, 'apps/desktop/dist/preload.cjs');
const resultPath = resolve(repositoryRoot, 'artifacts/historical-ui-smoke.json');
const errors = [];

app.setPath('userData', mkdtempSync(resolve(tmpdir(), 'xiv-gear-lab-stormblood-smoke-')));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    backgroundColor: '#080c14',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  window.webContents.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') {
      errors.push(`${details.level}: ${details.message} (${details.sourceId}:${details.lineNumber})`);
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    errors.push(`Renderer exited: ${details.reason}`);
  });

  await window.loadFile(pagePath);
  let rendered = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    rendered = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-optimize-build]'))`);
    if (rendered) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!rendered) throw new Error('Application UI did not finish runtime-data bootstrap within 10 seconds.');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));

  await window.webContents.executeJavaScript(`
    (() => {
      window.__stormbloodSmokeErrors = [];
      window.addEventListener('error', (event) => window.__stormbloodSmokeErrors.push(event.error?.stack ?? event.message));
      window.addEventListener('unhandledrejection', (event) => window.__stormbloodSmokeErrors.push(event.reason?.stack ?? String(event.reason)));
      const expansion = [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelector('select');
      if (!(expansion instanceof HTMLSelectElement)) throw new Error('Expansion selector was not rendered.');
      const option = [...expansion.options].find((entry) => entry.textContent?.includes('Stormblood'));
      if (!(option instanceof HTMLOptionElement)) throw new Error('Stormblood option was not rendered.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(expansion, option.value);
      expansion.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));

  const stormbloodAudit = await window.webContents.executeJavaScript(`
    (() => ({
      bodyChildren: document.body.children.length,
      bodyText: document.body.textContent?.slice(0, 500) ?? '',
      selectedExpansion: [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelector('select')?.value ?? '',
      expansionOptions: [...([...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelectorAll('option') ?? [])].map((entry) => ({ value: entry.value, label: entry.textContent })),
      selectedJob: document.querySelector('#job-select')?.value ?? '',
      optimizerPresent: Boolean(document.querySelector('[data-optimize-build]')),
      runtimeErrors: window.__stormbloodSmokeErrors ?? []
    }))()
  `);
  await window.webContents.executeJavaScript(`
    (() => {
      const expansion = [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelector('select');
      if (!(expansion instanceof HTMLSelectElement)) throw new Error('Expansion selector was not rendered.');
      const option = [...expansion.options].find((entry) => entry.textContent?.includes('Heavensward'));
      if (!(option instanceof HTMLOptionElement)) throw new Error('Heavensward option was not rendered.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(expansion, option.value);
      expansion.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
  const heavenswardAudit = await window.webContents.executeJavaScript(`
    (() => ({
      selectedExpansion: [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelector('select')?.value ?? '',
      optimizerPresent: Boolean(document.querySelector('[data-optimize-build]')),
      fatalErrorPresent: Boolean(document.querySelector('[data-fatal-error]')),
      incompleteMessagePresent: document.body.textContent?.includes('level-60 item catalogue is incomplete') ?? false,
      runtimeErrors: window.__stormbloodSmokeErrors ?? []
    }))()
  `);
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify({ stormbloodAudit, heavenswardAudit, errors }, null, 2)}\n`);
  if (
    stormbloodAudit.selectedExpansion !== 'sb' ||
    !stormbloodAudit.optimizerPresent ||
    heavenswardAudit.selectedExpansion !== 'hw' ||
    !heavenswardAudit.optimizerPresent ||
    heavenswardAudit.fatalErrorPresent ||
    !heavenswardAudit.incompleteMessagePresent ||
    errors.length > 0
  ) {
    throw new Error(`Historical expansion-switch smoke failed: ${JSON.stringify({ stormbloodAudit, heavenswardAudit, errors })}`);
  }
  app.exit(0);
}).catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify({ status: 'failed', error: message, errors }, null, 2)}\n`);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
