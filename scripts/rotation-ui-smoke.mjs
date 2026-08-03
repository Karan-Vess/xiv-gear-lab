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
const pilotJob = process.env.SMOKE_JOB ?? 'SAM';
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

  await window.webContents.executeJavaScript(`
    (() => {
      const job = document.querySelector('#job-select');
      if (!(job instanceof HTMLSelectElement)) throw new Error('Job selector is missing.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(job, 'SMN');
      job.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  if (!await waitFor(window, `document.querySelector('#job-select')?.value === 'SMN'`, 100)) {
    throw new Error('Summoner selection did not apply.');
  }
  const magicalAudit = await window.webContents.executeJavaScript(`
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
      setter?.call(job, '${pilotJob}');
      job.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  if (!await waitFor(window, `document.querySelector('#job-select')?.value === '${pilotJob}'`, 100)) {
    throw new Error(`${pilotJob} selection did not apply.`);
  }

  let effectiveLevelAudit = { skipped: true };
  if (pilotJob === 'SAM') {
    const enterLevelDraft = async (value) => {
      await window.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('[aria-label="Effective level"]');
          if (!(input instanceof HTMLInputElement)) throw new Error('Effective-level input is missing.');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          input.focus();
          setter?.call(input, '${value}');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      if (!await waitFor(window, `document.querySelector('[aria-label="Effective level"]')?.value === '${value}'`, 100)) {
        throw new Error(`Effective-level draft ${value} did not apply.`);
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    };

    await enterLevelDraft('9');
    const transientAudit = await window.webContents.executeJavaScript(`({
      value: document.querySelector('[aria-label="Effective level"]')?.value ?? '',
      appliedStill100: document.body.textContent?.includes('Applied: 100.') ?? false,
      fatalErrorPresent: Boolean(document.querySelector('[data-fatal-error]'))
    })`);
    await enterLevelDraft('90');
    await window.webContents.executeJavaScript(`
      document.querySelector('[aria-label="Effective level"]')
        ?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    `);
    if (!await waitFor(window, `document.body.textContent?.includes('Applied: 90.')`, 100)) {
      throw new Error('Effective level 90 did not commit after blur.');
    }
    await window.webContents.executeJavaScript(`
      (() => {
        const effort = document.querySelector('[aria-label="Search effort"]');
        if (!(effort instanceof HTMLSelectElement)) throw new Error('Search-effort selector is missing.');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(effort, 'quick');
        effort.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('[data-optimize-build]')?.click();
      })()
    `);
    if (!await waitFor(window, `document.querySelector('.run-message.done')`, 300)) {
      throw new Error('Level-90 Samurai optimisation did not finish within 30 seconds.');
    }
    const level90OptimizationAudit = await window.webContents.executeJavaScript(`({
      resultFinished: Boolean(document.querySelector('.run-message.done')),
      resultHeading: document.querySelector('#set-heading')?.textContent ?? '',
      level90ItemVisible: [...document.querySelectorAll('[data-item-stats]')]
        .some((entry) => entry.parentElement?.textContent?.includes('level 90')),
      fatalErrorPresent: Boolean(document.querySelector('[data-fatal-error]'))
    })`);

    await enterLevelDraft('99');
    await window.webContents.executeJavaScript(`
      document.querySelector('[aria-label="Effective level"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    `);
    if (!await waitFor(window, `document.querySelector('[aria-label="Effective level"]')?.value === '90' && document.body.textContent?.includes('previous applied level was kept')`, 100)) {
      throw new Error('Unsupported level 99 did not fail safely and retain level 90.');
    }
    const unsupportedAudit = await window.webContents.executeJavaScript(`({
      value: document.querySelector('[aria-label="Effective level"]')?.value ?? '',
      appliedStill90: document.body.textContent?.includes('Applied: 90.') ?? false,
      message: document.querySelector('.run-message')?.textContent ?? '',
      fatalErrorPresent: Boolean(document.querySelector('[data-fatal-error]'))
    })`);

    await enterLevelDraft('100');
    await window.webContents.executeJavaScript(`
      document.querySelector('[aria-label="Effective level"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    `);
    if (!await waitFor(window, `document.body.textContent?.includes('Applied: 100.')`, 100)) {
      throw new Error('Effective level 100 did not restore after the historical-level check.');
    }
    await window.webContents.executeJavaScript(`
      (() => {
        const effort = document.querySelector('[aria-label="Search effort"]');
        if (!(effort instanceof HTMLSelectElement)) throw new Error('Search-effort selector is missing.');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(effort, 'thorough');
        effort.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    effectiveLevelAudit = {
      skipped: false,
      transientAudit,
      level90OptimizationAudit,
      unsupportedAudit,
      restoredLevel: await window.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Effective level"]')?.value ?? ''`
      )
    };
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
      const job = document.querySelector('#job-select');
      if (!(job instanceof HTMLSelectElement)) throw new Error('Job selector is missing.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(job, 'WHM');
      job.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  if (!await waitFor(window, `document.querySelector('#job-select')?.value === 'WHM'`, 100)) {
    throw new Error('White Mage selection did not apply.');
  }
  const healerAudit = await window.webContents.executeJavaScript(`
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
      const job = document.querySelector('#job-select');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(job, '${pilotJob}');
      job.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  if (!await waitFor(window, `document.querySelector('#job-select')?.value === '${pilotJob}'`, 100)) {
    throw new Error(`${pilotJob} reselection did not apply.`);
  }
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
        jobMode: document.querySelector('[aria-label="Ruleset mode"]')?.value ?? '',
        mode: document.querySelector('[aria-label="Evaluation mode"]')?.value ?? '',
        searchMode: document.querySelector('[aria-label="Search effort"]')?.value ?? '',
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
        optimalityVisible: text.includes('Best found') && text.includes('not proven'),
        capabilityLabels: document.querySelector('[data-evaluator-capabilities]')?.textContent ?? '',
        methodReferencesVisible: text.includes('Generic-hit method references') && text.includes('hosted by xivgear.app'),
        traceAuditVisible: text.includes('Trace audit') && text.includes('independently cross checked'),
        calculationModePinned: text.includes('standard mode') && text.includes('generic-hit'),
        activeTabSummary: document.querySelector('[data-workspace-tab="build-1"] span')?.textContent ?? '',
        message
      };
    })()
  `);

  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-evaluate-equipped-set]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        throw new Error('Equipped-set evaluation control is missing or disabled for ${pilotJob}.');
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
    magicalAudit.openerDisabled ||
    magicalAudit.dummyDisabled ||
    pilotAudit.openerDisabled ||
    pilotAudit.dummyDisabled ||
    healerAudit.openerDisabled ||
    healerAudit.dummyDisabled ||
    (!effectiveLevelAudit.skipped && (
      effectiveLevelAudit.transientAudit.value !== '9' ||
      !effectiveLevelAudit.transientAudit.appliedStill100 ||
      effectiveLevelAudit.transientAudit.fatalErrorPresent ||
      !effectiveLevelAudit.level90OptimizationAudit.resultFinished ||
      !effectiveLevelAudit.level90OptimizationAudit.level90ItemVisible ||
      effectiveLevelAudit.level90OptimizationAudit.fatalErrorPresent ||
      effectiveLevelAudit.unsupportedAudit.value !== '90' ||
      !effectiveLevelAudit.unsupportedAudit.appliedStill90 ||
      effectiveLevelAudit.unsupportedAudit.fatalErrorPresent ||
      effectiveLevelAudit.restoredLevel !== '100'
    )) ||
    audit.job !== pilotJob ||
    audit.jobMode !== 'standard' ||
    audit.mode !== 'dummy-300' ||
    audit.searchMode !== 'thorough' ||
    !audit.potionControlVisible ||
    !audit.sawProgress ||
    !audit.resultFinished ||
    !audit.rotationLabelVisible ||
    !audit.rotationMethodVisible ||
    !audit.totalDamageVisible ||
    !audit.cacheReuseVisible ||
    audit.resultHeading !== 'Best five-minute dummy rotation result found (thorough)' ||
    !audit.rotationBadgeVisible ||
    !audit.rotationScoreVisible ||
    !audit.optimalityVisible ||
    !audit.capabilityLabels.includes('Catalogue') ||
    !audit.capabilityLabels.includes('100p hit') ||
    !audit.capabilityLabels.includes('30s burst') ||
    !audit.capabilityLabels.includes('300s dummy') ||
    !audit.methodReferencesVisible ||
    !audit.traceAuditVisible ||
    !audit.calculationModePinned ||
    !audit.activeTabSummary.includes('100p') ||
    !audit.activeTabSummary.includes('DPS') ||
    !equippedAudit.resultVisible ||
    !equippedAudit.potencyVisible ||
    !equippedAudit.burstVisible ||
    !equippedAudit.dummyVisible ||
    equippedAudit.dpsValues.length !== 2 ||
    !equippedAudit.message.includes('without changing any gear')
  ) {
    errors.push(`M12E UI audit failed: ${JSON.stringify({ magicalAudit, pilotAudit, healerAudit, effectiveLevelAudit, audit, equippedAudit })}`);
  }

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({ magicalAudit, pilotAudit, healerAudit, effectiveLevelAudit, audit, equippedAudit, errors }, null, 2)}\n`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  await writeFile(screenshotPath, (await window.webContents.capturePage()).toPNG());
  console.log(`M12E rotation UI audit: ${JSON.stringify(audit)}`);
  console.log(`Effective-level audit: ${JSON.stringify(effectiveLevelAudit)}`);
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
