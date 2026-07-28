import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = resolve(repositoryRoot, 'apps/web/dist/index.html');
const preloadPath = resolve(repositoryRoot, 'apps/desktop/dist/preload.cjs');
const artifactPath = resolve(repositoryRoot, 'artifacts/m12e-rotation-ui-smoke.json');
const screenshotPath = resolve(repositoryRoot, 'artifacts/m12e-rotation-ui-smoke.png');
const errors = [];

app.setPath('userData', mkdtempSync(resolve(tmpdir(), 'xiv-gear-lab-m12e-smoke-')));

const waitFor = async (window, expression, attempts = 600, intervalMs = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
  return false;
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
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
  window.webContents.on('render-process-gone', (_event, details) => {
    errors.push(`Renderer exited: ${details.reason}`);
  });

  await window.loadFile(pagePath);
  if (!await waitFor(window, `document.querySelector('[data-optimize-build]')`, 150)) {
    throw new Error('Application UI did not finish data bootstrap.');
  }
  // Workspace persistence hydrates independently from catalogue bootstrap.
  // Let that one-time replacement settle before manipulating controlled fields.
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));

  const unsupportedAudit = await window.webContents.executeJavaScript(`
    (() => {
      const control = document.querySelector('[aria-label="Evaluation mode"]');
      return {
        openerDisabled: control?.querySelector('option[value="opener-30"]')?.disabled ?? false,
        dummyDisabled: control?.querySelector('option[value="dummy-300"]')?.disabled ?? false
      };
    })()
  `);

  await window.webContents.executeJavaScript(`
    (() => {
      const job = document.querySelector('#job-select');
      if (!(job instanceof HTMLSelectElement)) throw new Error('Job selector is missing.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(job, 'SAM');
      job.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  if (!await waitFor(window, `document.querySelector('#job-select')?.value === 'SAM'`, 100)) {
    throw new Error('Samurai selection did not apply.');
  }

  const pilotAudit = await window.webContents.executeJavaScript(`
    (() => {
      const control = document.querySelector('[aria-label="Evaluation mode"]');
      return {
        openerDisabled: control?.querySelector('option[value="opener-30"]')?.disabled ?? true,
        dummyDisabled: control?.querySelector('option[value="dummy-300"]')?.disabled ?? true
      };
    })()
  `);
  await window.webContents.executeJavaScript(`
    (() => {
      const control = document.querySelector('[aria-label="Evaluation mode"]');
      if (!(control instanceof HTMLSelectElement)) throw new Error('Evaluation selector is missing.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(control, 'dummy-300');
      control.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  if (!await waitFor(window, `document.querySelector('[aria-label="Evaluation mode"]')?.value === 'dummy-300'`, 100)) {
    throw new Error('Five-minute dummy mode did not apply.');
  }

  await window.webContents.executeJavaScript(`document.querySelector('[data-optimize-build]')?.click()`);
  if (!await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Cancel search'))`, 100, 25)) {
    throw new Error('Optimiser did not expose its cancellation control.');
  }
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Cancel search'))?.click()
  `);
  if (!await waitFor(window, `document.body.textContent?.includes('Search cancelled')`, 100)) {
    throw new Error('Cancelling the worker did not return the build to an idle state.');
  }
  if (!await waitFor(window, `document.querySelector('[data-optimize-build]')`, 100)) {
    throw new Error('Optimise control did not return after cancellation.');
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));

  await window.webContents.executeJavaScript(`
    (() => {
      window.__m12eProgress = false;
      const observer = new MutationObserver(() => {
        const message = document.querySelector('.run-message')?.textContent ?? '';
        if (/\\d+%/.test(message)) window.__m12eProgress = true;
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      window.__m12eObserver = observer;
      document.querySelector('[data-optimize-build]')?.click();
    })()
  `);
  if (!await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Cancel search'))`, 100, 25)) {
    throw new Error('Second optimiser run did not enter its running state.');
  }
  if (!await waitFor(window, `document.querySelector('.run-message.done')`, 900)) {
    throw new Error('Five-minute dummy optimisation did not finish within 90 seconds.');
  }

  const audit = await window.webContents.executeJavaScript(`
    (() => {
      window.__m12eObserver?.disconnect();
      const text = document.body.textContent ?? '';
      const message = document.querySelector('.run-message')?.textContent ?? '';
      return {
        job: document.querySelector('#job-select')?.value ?? '',
        mode: document.querySelector('[aria-label="Evaluation mode"]')?.value ?? '',
        potionControlVisible: Boolean(document.querySelector('[aria-label="Rotation potion assumption"]')),
        sawProgress: Boolean(window.__m12eProgress),
        resultFinished: Boolean(document.querySelector('.run-message.done')),
        rotationLabelVisible: text.includes('Five-minute dummy rotation'),
        rotationMethodVisible: text.includes('Rotation method'),
        totalDamageVisible: text.includes('total damage'),
        cacheReuseVisible: text.includes('identical timing timeline'),
        resultHeading: document.querySelector('#set-heading')?.textContent ?? '',
        rotationBadgeVisible: Boolean(document.querySelector('[data-rotation-evaluation]')),
        rotationScoreVisible: document.querySelector('.score-block span')?.textContent?.includes('Five-minute dummy rotation total damage') ?? false,
        activeTabSummary: document.querySelector('[data-workspace-tab="build-1"] span')?.textContent ?? '',
        message
      };
    })()
  `);

  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-evaluate-equipped-set]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        throw new Error('Equipped-set evaluation control is missing or disabled for Samurai.');
      }
      button.click();
    })()
  `);
  if (!await waitFor(window, `document.querySelector('[data-equipped-evaluation-mode="dummy-300"]')`, 900)) {
    throw new Error('Equipped-set 30-second and 300-second evaluation did not finish within 90 seconds.');
  }
  const equippedAudit = await window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('[data-equipped-evaluation-results]');
      const text = panel?.textContent ?? '';
      return {
        resultVisible: Boolean(panel),
        potencyVisible: text.includes('100p hit'),
        burstVisible: text.includes('30 s burst'),
        dummyVisible: text.includes('300 s dummy'),
        dpsValues: [...(panel?.querySelectorAll('small') ?? [])]
          .filter((entry) => entry.textContent?.includes('DPS'))
          .map((entry) => entry.textContent?.trim() ?? ''),
        message: document.querySelector('.run-message')?.textContent ?? ''
      };
    })()
  `);

  if (
    !unsupportedAudit.openerDisabled ||
    !unsupportedAudit.dummyDisabled ||
    pilotAudit.openerDisabled ||
    pilotAudit.dummyDisabled ||
    audit.job !== 'SAM' ||
    audit.mode !== 'dummy-300' ||
    !audit.potionControlVisible ||
    !audit.sawProgress ||
    !audit.resultFinished ||
    !audit.rotationLabelVisible ||
    !audit.rotationMethodVisible ||
    !audit.totalDamageVisible ||
    !audit.cacheReuseVisible ||
    audit.resultHeading !== 'Best five-minute dummy rotation result' ||
    !audit.rotationBadgeVisible ||
    !audit.rotationScoreVisible ||
    !audit.activeTabSummary.includes('100p') ||
    !audit.activeTabSummary.includes('DPS') ||
    !equippedAudit.resultVisible ||
    !equippedAudit.potencyVisible ||
    !equippedAudit.burstVisible ||
    !equippedAudit.dummyVisible ||
    equippedAudit.dpsValues.length !== 2 ||
    !equippedAudit.message.includes('without changing any gear')
  ) {
    errors.push(`M12E UI audit failed: ${JSON.stringify({ unsupportedAudit, pilotAudit, audit, equippedAudit })}`);
  }

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({ unsupportedAudit, pilotAudit, audit, equippedAudit, errors }, null, 2)}\n`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  await writeFile(screenshotPath, (await window.webContents.capturePage()).toPNG());
  console.log(`M12E rotation UI audit: ${JSON.stringify(audit)}`);
  console.log(`Equipped-set evaluation audit: ${JSON.stringify(equippedAudit)}`);
  console.log(`Evidence: ${artifactPath}`);

  if (errors.length > 0) {
    console.error(errors.join('\n'));
    app.exit(1);
    return;
  }
  app.exit(0);
}).catch((error) => {
  if (errors.length > 0) console.error(errors.join('\n'));
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  app.exit(1);
});
