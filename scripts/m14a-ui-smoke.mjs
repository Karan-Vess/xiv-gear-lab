import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = resolve(repositoryRoot, 'apps/web/dist/index.html');
const preloadPath = resolve(repositoryRoot, 'apps/desktop/dist/preload.cjs');
const errors = [];

app.setPath('userData', mkdtempSync(resolve(tmpdir(), 'xiv-gear-lab-m14a-smoke-')));

const waitFor = async (window, expression, attempts = 150) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return false;
};

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
    if (details.level === 'error') errors.push(`${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
  window.webContents.on('render-process-gone', (_event, details) => errors.push(`Renderer exited: ${details.reason}`));

  await window.loadFile(pagePath);
  if (!await waitFor(window, `document.querySelector('[data-optimize-build]')`)) {
    throw new Error('Combat workspace did not finish data bootstrap.');
  }
  await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.application-mode-switch button')]
        .find((entry) => entry.textContent?.includes('Craft'));
      if (!(button instanceof HTMLButtonElement)) throw new Error('Craft & gather mode button is missing.');
      button.click();
    })()
  `);
  if (!await waitFor(window, `document.querySelector('[data-noncombat-workspace]')`)) {
    throw new Error('Non-combat workspace did not render.');
  }

  const foundationAudit = await window.webContents.executeJavaScript(`
    (() => ({
      combatTabs: document.querySelectorAll('.workspace-tabs').length,
      crafterPanel: document.querySelectorAll('.crafter-constraints').length,
      jobs: document.querySelectorAll('.crafter-constraints select option').length,
      poolStatus: [...document.querySelectorAll('.pool-readiness strong')].map((entry) => entry.textContent),
      disabledRun: document.querySelector('.crafter-run')?.disabled ?? false
    }))()
  `);
  if (foundationAudit.combatTabs !== 0 || foundationAudit.crafterPanel !== 1 || foundationAudit.jobs < 8 || !foundationAudit.disabledRun) {
    errors.push(`Crafter boundary audit failed: ${JSON.stringify(foundationAudit)}`);
  }

  await window.webContents.executeJavaScript(`
    (() => {
      const labels = [...document.querySelectorAll('.crafter-constraints label')];
      const job = labels.find((label) => label.textContent?.includes('Crafting job'))?.querySelector('select');
      const cp = labels.find((label) => label.textContent?.includes('Minimum CP'))?.querySelector('input');
      if (!(job instanceof HTMLSelectElement) || !(cp instanceof HTMLInputElement)) throw new Error('Crafter persistence controls are missing.');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(job, 'WVR');
      job.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(cp, '700');
      cp.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.reload();
  if (!await waitFor(window, `document.querySelector('[data-noncombat-workspace]')`)) {
    throw new Error('Persisted non-combat mode did not survive reload.');
  }
  const persistenceAudit = await window.webContents.executeJavaScript(`
    (() => {
      const labels = [...document.querySelectorAll('.crafter-constraints label')];
      return {
        job: labels.find((label) => label.textContent?.includes('Crafting job'))?.querySelector('select')?.value,
        cp: labels.find((label) => label.textContent?.includes('Minimum CP'))?.querySelector('input')?.value
      };
    })()
  `);
  if (persistenceAudit.job !== 'WVR' || persistenceAudit.cp !== '700') {
    errors.push(`Crafter persistence audit failed: ${JSON.stringify(persistenceAudit)}`);
  }

  await window.webContents.executeJavaScript(`
    (() => {
      const tab = [...document.querySelectorAll('.discipline-switch button')]
        .find((entry) => entry.textContent?.includes('Gathering'));
      if (!(tab instanceof HTMLButtonElement)) throw new Error('Gathering tab is missing.');
      tab.click();
    })()
  `);
  const gatheringAudit = await window.webContents.executeJavaScript(`
    (() => ({
      placeholder: document.querySelectorAll('.noncombat-placeholder').length,
      crafterPanel: document.querySelectorAll('.crafter-constraints').length,
      combatTabs: document.querySelectorAll('.workspace-tabs').length
    }))()
  `);
  if (gatheringAudit.placeholder !== 1 || gatheringAudit.crafterPanel !== 0 || gatheringAudit.combatTabs !== 0) {
    errors.push(`Gathering boundary audit failed: ${JSON.stringify(gatheringAudit)}`);
  }

  console.log(`M14A foundation audit: ${JSON.stringify(foundationAudit)}`);
  console.log(`M14A persistence audit: ${JSON.stringify(persistenceAudit)}`);
  console.log(`M14A gathering audit: ${JSON.stringify(gatheringAudit)}`);
  await window.close();
  if (errors.length > 0) throw new Error(errors.join('\n'));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
