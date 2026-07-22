import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = resolve(repositoryRoot, 'apps/web/dist/index.html');
const preloadPath = resolve(repositoryRoot, 'apps/desktop/dist/preload.cjs');
const screenshotPath = resolve(repositoryRoot, 'artifacts/xiv-gear-lab-smoke.png');
const relicScreenshotPath = resolve(repositoryRoot, 'artifacts/xiv-gear-lab-endwalker-relic-smoke.png');
const shadowbringersScreenshotPath = resolve(repositoryRoot, 'artifacts/xiv-gear-lab-shadowbringers-smoke.png');
const errors = [];
const optimizerWaitAttempts = 450;
app.setPath('userData', mkdtempSync(resolve(tmpdir(), 'xiv-gear-lab-smoke-')));

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
  const bootstrapStartedAt = Date.now();
  let rendered = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    rendered = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-optimize-build]'))`
    );
    if (rendered) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!rendered) throw new Error('Application UI did not finish runtime-data bootstrap within 10 seconds.');
  console.log(`Runtime-data bootstrap: ${Date.now() - bootstrapStartedAt}ms`);
  await window.webContents.executeJavaScript(`
    (() => {
      const settings = [...document.querySelectorAll('nav button')].find((button) => button.textContent?.includes('Settings'));
      if (!(settings instanceof HTMLButtonElement)) throw new Error('Settings navigation was not rendered.');
      settings.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const scale = document.querySelector('[data-ui-scale]');
      if (!(scale instanceof HTMLSelectElement)) throw new Error('UI scale control was not rendered.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(scale, '125');
      scale.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  const uiScaleAudit = await window.webContents.executeJavaScript(`
    (() => ({
      stored: localStorage.getItem('xiv-gear-lab:ui-scale'),
      selected: document.querySelector('[data-ui-scale]')?.value ?? '',
      desktopFactor: window.xivGearLab?.getUiScale?.(),
      settingsVisible: Boolean(document.querySelector('[data-settings-view]'))
    }))()
  `);
  if (uiScaleAudit.stored !== '125' || uiScaleAudit.selected !== '125' || uiScaleAudit.desktopFactor !== 1.25 || !uiScaleAudit.settingsVisible) {
    errors.push(`UI scale audit failed: ${JSON.stringify(uiScaleAudit)}`);
  }
  console.log(`UI scale audit: ${JSON.stringify(uiScaleAudit)}`);
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('nav button')].find((button) => button.textContent?.includes('Optimise'))?.click()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-optimize-build]');
      if (!button) throw new Error('Optimise button was not rendered.');
      button.click();
    })()
  `);

  let completed = false;
  for (let attempt = 0; attempt < optimizerWaitAttempts; attempt += 1) {
    completed = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('.run-message.done') && document.body.textContent?.includes('Searched'))`
    );
    if (completed) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!completed) errors.push('Production optimiser worker did not complete within 45 seconds.');
  await window.webContents.executeJavaScript(`document.querySelectorAll('img').forEach((image) => { image.loading = 'eager'; })`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));

  const initialAudit = await window.webContents.executeJavaScript(`
    (() => {
      const itemIcons = [...document.querySelectorAll('.item-icon-wrap img')];
      const materiaIcons = [...document.querySelectorAll('.meld-icon img')];
      const materiaKeys = [...document.querySelectorAll('.materia-chip > .materia-key')].map((entry) => entry.textContent ?? '');
      const text = document.body.textContent ?? '';
      return {
        itemIconCount: itemIcons.length,
        brokenItemIcons: itemIcons.filter((image) => image.naturalWidth === 0).length,
        materiaIconCount: materiaIcons.length,
        brokenMateriaIcons: materiaIcons.filter((image) => image.naturalWidth === 0).length,
        materiaKeys,
        hasGcdInput: document.querySelector('#gcd-target') instanceof HTMLInputElement,
        recommendedGcdTargets: [...document.querySelectorAll('.gcd-suggestions button')].map((entry) => entry.textContent ?? ''),
        hasAugmentedCraftedToggle: document.querySelector('[data-use-augmented-crafted]') instanceof HTMLInputElement,
        changedRowsFromCuratedSet: document.querySelectorAll('.equipment-row.changed').length,
        previousItemLabels: document.querySelectorAll('.previous-item, .previous-melds').length,
        hasCurrentSourceCategories: ['Alliance raids (24-player)', 'Normal raids', 'Dungeons', 'Crafted gear', 'Trials', 'Relic equipment'].every((label) => text.includes(label)),
        unavailableCount: document.querySelectorAll('[data-source-group].unavailable input:disabled').length
      };
    })()
  `);
  if (initialAudit.itemIconCount < 12 || initialAudit.brokenItemIcons > 0) errors.push(`Item icon audit failed: ${JSON.stringify(initialAudit)}`);
  if (initialAudit.materiaIconCount === 0 || initialAudit.brokenMateriaIcons > 0) errors.push(`Materia icon audit failed: ${JSON.stringify(initialAudit)}`);
  if (initialAudit.materiaKeys.length !== initialAudit.materiaIconCount || initialAudit.materiaKeys.some((key) => !/^(HE|SA|SM|QT)12$/.test(key))) {
    errors.push(`Materia shorthand audit failed: ${JSON.stringify(initialAudit)}`);
  }
  if (!initialAudit.hasGcdInput || !['2.29s', '2.41s', '2.43s'].every((target) => initialAudit.recommendedGcdTargets.includes(target))) {
    errors.push(`Editable GCD target audit failed: ${JSON.stringify(initialAudit)}`);
  }
  if (!initialAudit.hasAugmentedCraftedToggle) errors.push(`Augmented crafted toggle audit failed: ${JSON.stringify(initialAudit)}`);
  if (initialAudit.changedRowsFromCuratedSet === 0 || initialAudit.previousItemLabels === 0) {
    errors.push(`Curated-to-optimised change highlight audit failed: ${JSON.stringify(initialAudit)}`);
  }
  if (!initialAudit.hasCurrentSourceCategories || initialAudit.unavailableCount !== 2) errors.push(`Acquisition scope audit failed: ${JSON.stringify(initialAudit)}`);

  await window.webContents.executeJavaScript(`
    (() => {
      const savageRow = [...document.querySelectorAll('.check-row')].find((entry) => entry.textContent?.includes('Savage raid'));
      const savageInput = savageRow?.querySelector('input');
      if (!(savageInput instanceof HTMLInputElement) || !savageInput.checked) throw new Error('Savage source control was not available.');
      savageInput.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-optimize-build]');
      if (!button) throw new Error('Optimise button was not rendered for the second run.');
      button.click();
    })()
  `);
  let compared = false;
  for (let attempt = 0; attempt < optimizerWaitAttempts; attempt += 1) {
    compared = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('.equipment-row.changed') && document.querySelector('.previous-item') && document.querySelector('.run-message.done'))`
    );
    if (compared) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!compared) errors.push('Tomestone-only rerun or inline comparison did not complete within 45 seconds.');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));

  const finalAudit = await window.webContents.executeJavaScript(`
    (() => {
      const sourceLines = [...document.querySelectorAll('.equipment-row .item-copy > span')].map((entry) => entry.textContent ?? '');
      return {
        message: document.querySelector('.run-message p')?.textContent ?? '',
        sourceLines,
        changedRows: document.querySelectorAll('.equipment-row.changed').length,
        previousItems: [...document.querySelectorAll('.previous-item')].map((entry) => entry.textContent ?? ''),
        hasRemovedSummary: !document.querySelector('.change-summary')
      };
    })()
  `);
  console.log(`Final UI audit: ${JSON.stringify(finalAudit)}`);
  if (finalAudit.sourceLines.some((line) => line.includes('Savage'))) {
    errors.push(`Tomestone-only result still contains Savage gear: ${JSON.stringify(finalAudit)}`);
  }
  if (finalAudit.changedRows === 0 || finalAudit.previousItems.length === 0 || !finalAudit.hasRemovedSummary) {
    errors.push(`Inline comparison audit failed: ${JSON.stringify(finalAudit)}`);
  }

  await window.webContents.executeJavaScript(`
    (() => {
      const speedInput = document.querySelector('#gcd-target');
      if (!(speedInput instanceof HTMLInputElement)) throw new Error('GCD target input was not available.');
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(speedInput, '2.29');
      speedInput.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-optimize-build]');
      if (!button) throw new Error('Optimise button was not rendered for the speed fallback run.');
      button.click();
    })()
  `);
  let fallbackCompleted = false;
  for (let attempt = 0; attempt < optimizerWaitAttempts; attempt += 1) {
    fallbackCompleted = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('.run-message.done p')?.textContent?.includes('Exact speed unavailable') && document.querySelector('#set-heading')?.textContent?.includes('Closest attainable'))`
    );
    if (fallbackCompleted) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!fallbackCompleted) errors.push('Fast Tomestone speed fallback did not complete or label itself within 45 seconds.');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));

  await window.webContents.executeJavaScript(`
    (() => {
      const jobSelect = document.querySelector('#job-select');
      if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Job selector was not available.');
      const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      selectSetter?.call(jobSelect, 'SGE');
      jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  const sageControlAudit = await window.webContents.executeJavaScript(`
    (() => ({
      selectedJob: document.querySelector('#job-select')?.value,
      targets: [...document.querySelectorAll('.gcd-suggestions button')].map((entry) => entry.textContent ?? ''),
      weapon: document.querySelector('.equipment-row .item-copy strong')?.textContent ?? ''
    }))()
  `);
  if (sageControlAudit.selectedJob !== 'SGE' || !['2.39s', '2.44s', '2.45s'].every((target) => sageControlAudit.targets.includes(target)) || !/Pendulums|Syrinxi/.test(sageControlAudit.weapon)) {
    errors.push(`Sage selector audit failed: ${JSON.stringify(sageControlAudit)}`);
  }

  await window.webContents.executeJavaScript(`
    (() => {
      const speedInput = document.querySelector('#gcd-target');
      if (!(speedInput instanceof HTMLInputElement)) throw new Error('GCD target input was not available for Sage.');
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      inputSetter?.call(speedInput, '2.44');
      speedInput.dispatchEvent(new Event('input', { bubbles: true }));
      const savageRow = [...document.querySelectorAll('.check-row')].find((entry) => entry.textContent?.includes('Savage raid'));
      const savageInput = savageRow?.querySelector('input');
      if (savageInput instanceof HTMLInputElement && !savageInput.checked) savageInput.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-optimize-build]');
      if (!button) throw new Error('Optimise button was not rendered for Sage.');
      button.click();
    })()
  `);
  let sageCompleted = false;
  for (let attempt = 0; attempt < optimizerWaitAttempts; attempt += 1) {
    sageCompleted = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('.run-message.done') && document.querySelector('.set-heading-row .eyebrow')?.textContent?.includes('generated set') && /Pendulums|Syrinxi/.test(document.querySelector('.equipment-row .item-copy strong')?.textContent ?? ''))`
    );
    if (sageCompleted) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!sageCompleted) errors.push('Sage optimisation did not complete with a Sage weapon within 45 seconds.');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));

  for (const jobAudit of [
    { job: 'SCH', targets: ['2.40s'], weaponPattern: /Codex/ },
    { job: 'AST', targets: ['2.31s', '2.43s'], weaponPattern: /Astrometer|Star Globe/ },
    { job: 'SGE', targets: ['2.39s', '2.44s', '2.45s'], weaponPattern: /Pendulums|Syrinxi/ }
  ]) {
    await window.webContents.executeJavaScript(`
      (() => {
        const jobSelect = document.querySelector('#job-select');
        if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Job selector disappeared during healer expansion audit.');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(jobSelect, '${jobAudit.job}');
        jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
    const expandedJobAudit = await window.webContents.executeJavaScript(`
      (() => ({
        selectedJob: document.querySelector('#job-select')?.value,
        targets: [...document.querySelectorAll('.gcd-suggestions button')].map((entry) => entry.textContent ?? ''),
        weapon: document.querySelector('.equipment-row .item-copy strong')?.textContent ?? '',
        evaluator: document.querySelector('.evaluation-note')?.textContent ?? ''
      }))()
    `);
    if (
      expandedJobAudit.selectedJob !== jobAudit.job ||
      !jobAudit.targets.every((target) => expandedJobAudit.targets.includes(target)) ||
      !jobAudit.weaponPattern.test(expandedJobAudit.weapon) ||
      !expandedJobAudit.evaluator.includes(`${jobAudit.job.toLowerCase()}-healer-damage-proxy@1`)
    ) {
      errors.push(`Expanded healer UI audit failed for ${jobAudit.job}: ${JSON.stringify(expandedJobAudit)}`);
    }
  }

  await window.webContents.executeJavaScript(`
    (() => {
      const jobSelect = document.querySelector('#job-select');
      if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Job selector disappeared before source audit.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(jobSelect, 'SCH');
      jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const community = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Community'));
      if (!(community instanceof HTMLButtonElement)) throw new Error('Community navigation was not rendered.');
      setTimeout(() => community.click(), 80);
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  const balanceSourceAudit = await window.webContents.executeJavaScript(`
    (() => ({
      names: [...document.querySelectorAll('.set-card h2')].map((entry) => entry.textContent ?? ''),
      providers: [...document.querySelectorAll('[data-curated-providers]')].map((entry) => entry.getAttribute('data-curated-providers') ?? '')
    }))()
  `);
  if (
    balanceSourceAudit.names.length !== 2 ||
    !balanceSourceAudit.names.includes('2.31 Max Damage') ||
    !balanceSourceAudit.providers.includes('Etro + The Balance') ||
    !balanceSourceAudit.providers.includes('The Balance · XivGear')
  ) {
    errors.push(`Balance community-card audit failed: ${JSON.stringify(balanceSourceAudit)}`);
  }
  await window.webContents.executeJavaScript(`
    (() => {
      const card = [...document.querySelectorAll('.set-card')].find((entry) => entry.querySelector('h2')?.textContent === '2.31 Max Damage');
      if (!(card instanceof HTMLButtonElement)) throw new Error('Balance-only Scholar card was not rendered.');
      card.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  const balanceLinkAudit = await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('.curated-sources a')].map((entry) => entry.textContent?.trim() ?? '')
  `);
  if (!balanceLinkAudit.some((entry) => entry.startsWith('The Balance')) || !balanceLinkAudit.some((entry) => entry.startsWith('XivGear'))) {
    errors.push(`Balance source-link audit failed: ${JSON.stringify(balanceLinkAudit)}`);
  }
  console.log('Checkpoint: core optimisation flows complete.');

  await window.webContents.executeJavaScript(`
    (() => {
      const saveButton = document.querySelector('[data-save-active-build]');
      if (!saveButton) throw new Error('Active-build save button was not rendered.');
      saveButton.click();
      const savedNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Saved locally'));
      if (!savedNav) throw new Error('Saved sets navigation was not rendered.');
      setTimeout(() => savedNav.click(), 100);
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
  const savedCountBeforeDelete = await window.webContents.executeJavaScript(`document.querySelectorAll('[data-saved-set-delete]').length`);
  if (savedCountBeforeDelete < 1) errors.push('Saving a set did not create a manageable saved-set card.');
  await window.webContents.executeJavaScript(`
    (() => {
      const deleteButton = document.querySelector('[data-saved-set-delete]');
      if (!(deleteButton instanceof HTMLButtonElement)) throw new Error('Saved-set delete button was not rendered.');
      deleteButton.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const savedConfirmationAudit = await window.webContents.executeJavaScript(`
    (() => ({
      hasDialog: Boolean(document.querySelector('[data-confirm-dialog]')),
      title: document.querySelector('[data-confirm-dialog] h2')?.textContent ?? '',
      confirmText: document.querySelector('[data-confirm-accept]')?.textContent ?? ''
    }))()
  `);
  if (!savedConfirmationAudit.hasDialog || !savedConfirmationAudit.title.includes('Delete saved set') || !savedConfirmationAudit.confirmText.includes('Delete saved set')) {
    errors.push(`Saved-set in-app confirmation audit failed: ${JSON.stringify(savedConfirmationAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-confirm-accept]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  const savedCountAfterDelete = await window.webContents.executeJavaScript(`document.querySelectorAll('[data-saved-set-delete]').length`);
  if (savedCountAfterDelete !== savedCountBeforeDelete - 1) errors.push('Deleting a saved set did not remove exactly one saved card.');
  await window.webContents.executeJavaScript(`
    (() => {
      const optimizeNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Optimise'));
      if (!optimizeNav) throw new Error('Optimise navigation was not rendered.');
      optimizeNav.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));

  await window.webContents.executeJavaScript(`
    (() => {
      const managerButton = document.querySelector('[data-custom-library-open]');
      if (!managerButton) throw new Error('Hypothetical item manager button was not rendered.');
      managerButton.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  const customLibraryAudit = await window.webContents.executeJavaScript(`
    (() => ({
      hasLibrary: Boolean(document.querySelector('[data-custom-library]')),
      hasCreate: Boolean(document.querySelector('[data-custom-new]'))
    }))()
  `);
  if (!customLibraryAudit.hasLibrary || !customLibraryAudit.hasCreate) {
    errors.push(`Custom item library audit failed: ${JSON.stringify(customLibraryAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-new]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));

  const slotInteractionAudit = await window.webContents.executeJavaScript(`
    (() => {
      const slot = document.querySelector('[data-custom-slot]');
      if (!(slot instanceof HTMLSelectElement) || slot.disabled) throw new Error('Interactive custom item slot selector was not rendered.');
      slot.focus();
      const style = getComputedStyle(slot);
      return { focused: document.activeElement === slot, pointerEvents: style.pointerEvents, disabled: slot.disabled };
    })()
  `);
  if (!slotInteractionAudit.focused || slotInteractionAudit.pointerEvents === 'none' || slotInteractionAudit.disabled) {
    errors.push(`Custom slot interaction audit failed: ${JSON.stringify(slotInteractionAudit)}`);
  }
  await window.webContents.executeJavaScript(`
    (() => {
      const slot = document.querySelector('[data-custom-slot]');
      if (!(slot instanceof HTMLSelectElement)) throw new Error('Custom item slot selector disappeared.');
      const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      selectSetter?.call(slot, 'body');
      slot.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));

  await window.webContents.executeJavaScript(`
    (() => {
      const form = document.querySelector('[data-custom-editor]');
      const name = form?.querySelector('input[name="name"]');
      if (!(form instanceof HTMLFormElement) || !(name instanceof HTMLInputElement)) throw new Error('Dedicated custom item editor was not rendered.');
      name.focus();
      name.select();
    })()
  `);
  window.webContents.insertText('Smoke Sage Body');
  await window.webContents.executeJavaScript(`
    (() => {
      const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
      if (!(mainStat instanceof HTMLInputElement)) throw new Error('Custom stat field was not rendered.');
      mainStat.focus();
      mainStat.select();
    })()
  `);
  window.webContents.insertText('999999');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const standardLimitAudit = await window.webContents.executeJavaScript(`
    (() => {
      const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
      const toggle = document.querySelector('[data-custom-unrealistic-toggle]');
      return {
        value: mainStat?.value,
        maximum: mainStat?.max,
        hasToggle: toggle instanceof HTMLInputElement && !toggle.checked,
        hasWarning: document.querySelector('.custom-limit-toggle')?.textContent?.includes('may break the UI') ?? false,
        limitCaption: mainStat?.closest('label')?.querySelector('small')?.textContent ?? ''
      };
    })()
  `);
  if (
    !standardLimitAudit.maximum ||
    standardLimitAudit.value !== standardLimitAudit.maximum ||
    !standardLimitAudit.hasToggle ||
    !standardLimitAudit.hasWarning ||
    !standardLimitAudit.limitCaption.includes('Highest recorded') ||
    !standardLimitAudit.limitCaption.includes('maximum')
  ) {
    errors.push(`Standard custom stat limit audit failed: ${JSON.stringify(standardLimitAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-unrealistic-toggle]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  await window.webContents.executeJavaScript(`
    (() => {
      const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
      if (!(mainStat instanceof HTMLInputElement)) throw new Error('Custom stat field disappeared.');
      mainStat.focus();
      mainStat.select();
    })()
  `);
  window.webContents.insertText('999999');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  const unrealisticLimitAudit = await window.webContents.executeJavaScript(`
    (() => {
      const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
      const toggle = document.querySelector('[data-custom-unrealistic-toggle]');
      return { value: mainStat?.value, maximum: mainStat?.max, enabled: toggle instanceof HTMLInputElement && toggle.checked };
    })()
  `);
  if (unrealisticLimitAudit.value !== '999999' || unrealisticLimitAudit.maximum !== '' || !unrealisticLimitAudit.enabled) {
    errors.push(`Unrealistic custom stat override audit failed: ${JSON.stringify(unrealisticLimitAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-unrealistic-toggle]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  await window.webContents.executeJavaScript(`
    (() => {
      const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
      if (!(mainStat instanceof HTMLInputElement)) throw new Error('Custom stat field disappeared after re-enabling limits.');
      mainStat.focus();
      mainStat.select();
    })()
  `);
  window.webContents.insertText('555');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  const creatorKeyboardAudit = await window.webContents.executeJavaScript(`
    (() => ({
      slot: document.querySelector('[data-custom-slot]')?.value,
      name: document.querySelector('[data-custom-editor] input[name="name"]')?.value,
      mainStat: document.querySelector('[data-custom-editor] [data-custom-main-stat]')?.value
    }))()
  `);
  if (creatorKeyboardAudit.slot !== 'body' || creatorKeyboardAudit.name !== 'Smoke Sage Body' || creatorKeyboardAudit.mainStat !== '555') {
    errors.push(`Custom creator keyboard/dropdown audit failed: ${JSON.stringify(creatorKeyboardAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-editor]')?.requestSubmit()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));

  const inlineActionAudit = await window.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll('.equipment-row')].find((entry) => entry.textContent?.includes('Smoke Sage Body'));
      return {
        hasItem: Boolean(row),
        hasEdit: Boolean(row?.querySelector('[data-equipped-custom-edit]')),
        hasUnequip: Boolean(row?.querySelector('[data-equipped-custom-unequip]')),
        hasPermanentDelete: Boolean(row?.querySelector('[data-equipped-custom-delete]'))
      };
    })()
  `);
  if (!inlineActionAudit.hasItem || !inlineActionAudit.hasEdit || !inlineActionAudit.hasUnequip || inlineActionAudit.hasPermanentDelete) {
    errors.push(`Inline custom item actions audit failed: ${JSON.stringify(inlineActionAudit)}`);
  }
  await window.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll('.equipment-row')].find((entry) => entry.textContent?.includes('Smoke Sage Body'));
      const edit = row?.querySelector('[data-equipped-custom-edit]');
      if (!(edit instanceof HTMLButtonElement)) throw new Error('Inline custom-item edit control was not rendered.');
      edit.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const form = document.querySelector('[data-custom-editor]');
      const name = form?.querySelector('input[name="name"]');
      if (!(form instanceof HTMLFormElement) || !(name instanceof HTMLInputElement)) throw new Error('Custom item edit form was not rendered.');
      name.focus();
      name.select();
    })()
  `);
  window.webContents.insertText('Edited Sage Body');
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-editor]')?.requestSubmit()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));

  await window.webContents.executeJavaScript(`
    (() => {
      const communityNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Community sets'));
      if (!communityNav) throw new Error('Community navigation was not rendered.');
      communityNav.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const set = document.querySelector('.set-card');
      if (!(set instanceof HTMLButtonElement)) throw new Error('Community set card was not rendered.');
      set.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));
  await window.webContents.executeJavaScript(`
    (() => {
      const managerButton = document.querySelector('[data-custom-library-open]');
      if (!managerButton) throw new Error('Hypothetical item manager button disappeared.');
      managerButton.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  const libraryApplyAudit = await window.webContents.executeJavaScript(`
    (() => {
      const library = document.querySelector('[data-custom-library]');
      const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Edited Sage Body'));
      const apply = item?.querySelector('[data-custom-apply]');
      return {
        hasLibrary: Boolean(library),
        hasItem: Boolean(item),
        applyEnabled: apply instanceof HTMLButtonElement && !apply.disabled,
        hasEdit: Boolean(item?.querySelector('[data-library-custom-edit]')),
        hasDelete: Boolean(item?.querySelector('[data-library-custom-delete]'))
      };
    })()
  `);
  if (!libraryApplyAudit.hasLibrary || !libraryApplyAudit.hasItem || !libraryApplyAudit.applyEnabled || !libraryApplyAudit.hasEdit || !libraryApplyAudit.hasDelete) {
    errors.push(`Custom library management audit failed: ${JSON.stringify(libraryApplyAudit)}`);
  }
  await window.webContents.executeJavaScript(`
    (() => {
      const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Edited Sage Body'));
      const edit = item?.querySelector('[data-library-custom-edit]');
      if (!(edit instanceof HTMLButtonElement)) throw new Error('Inactive custom item edit button was not rendered.');
      edit.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const name = document.querySelector('[data-custom-editor] input[name="name"]');
      if (!(name instanceof HTMLInputElement)) throw new Error('Inactive custom item editor was not rendered.');
      name.focus();
      name.select();
    })()
  `);
  window.webContents.insertText('Library Edited Sage Body');
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-editor]')?.requestSubmit()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library-open]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`
    (() => {
      const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Library Edited Sage Body'));
      const apply = item?.querySelector('[data-custom-apply]');
      if (!(apply instanceof HTMLButtonElement) || apply.disabled) throw new Error('Edited inactive custom item could not be applied.');
      apply.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));

  await window.webContents.executeJavaScript(`
    (() => {
      const managerButton = document.querySelector('[data-custom-library-open]');
      managerButton?.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-new]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`
    (() => {
      const name = document.querySelector('[data-custom-editor] input[name="name"]');
      if (!(name instanceof HTMLInputElement)) throw new Error('Second custom item editor was not rendered.');
      name.focus();
      name.select();
    })()
  `);
  window.webContents.insertText('Smoke Sage Head');
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-editor]')?.requestSubmit()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));

  await window.webContents.executeJavaScript(`
    (() => {
      const optimize = document.querySelector('[data-optimize-build]');
      if (!optimize) throw new Error('Optimise button was not rendered after custom item creation.');
      optimize.click();
    })()
  `);
  let customSearchStarted = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    customSearchStarted = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.run-message.running'))`);
    if (customSearchStarted) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  if (!customSearchStarted) errors.push('Custom-item recalculation did not enter the running state.');
  let customItemsPreserved = false;
  for (let attempt = 0; attempt < optimizerWaitAttempts; attempt += 1) {
    customItemsPreserved = await window.webContents.executeJavaScript(`
      Boolean(
        document.querySelector('.run-message.done') &&
        document.querySelector('.set-heading-row .eyebrow')?.textContent?.includes('generated set') &&
        document.body.textContent?.includes('Library Edited Sage Body') &&
        document.body.textContent?.includes('Smoke Sage Head')
      )
    `);
    if (customItemsPreserved) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!customItemsPreserved) errors.push('Constraint recalculation did not preserve both active custom items.');
  console.log('Checkpoint: custom item create/edit/recalculate flows complete.');

  await window.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll('.equipment-row')].find((entry) => entry.textContent?.includes('Smoke Sage Head'));
      const unequip = row?.querySelector('[data-equipped-custom-unequip]');
      if (!(unequip instanceof HTMLButtonElement)) throw new Error('Inline custom-item unequip control was not rendered.');
      unequip.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  const customUnequipAudit = await window.webContents.executeJavaScript(`
    (() => {
      const equipmentNames = [...document.querySelectorAll('.equipment-row .item-copy strong')].map((entry) => entry.textContent ?? '');
      const managerButtonText = document.querySelector('[data-custom-library-open]')?.textContent ?? '';
      return {
        stillHasBody: equipmentNames.includes('Library Edited Sage Body'),
        headUnequipped: !equipmentNames.includes('Smoke Sage Head'),
        managerButtonText
      };
    })()
  `);
  if (!customUnequipAudit.stillHasBody || !customUnequipAudit.headUnequipped || !customUnequipAudit.managerButtonText.includes('2')) {
    errors.push(`Custom-item unequip audit failed: ${JSON.stringify(customUnequipAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library-open]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`
    (() => {
      const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Smoke Sage Head'));
      const remove = item?.querySelector('[data-library-custom-delete]');
      if (!(remove instanceof HTMLButtonElement)) throw new Error('Unequipped custom item delete control was not rendered in the library.');
      remove.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const customDeleteConfirmationAudit = await window.webContents.executeJavaScript(`
    (() => ({
      hasDialog: Boolean(document.querySelector('[data-confirm-dialog]')),
      libraryStillVisible: Boolean(document.querySelector('[data-custom-library]')),
      confirmText: document.querySelector('[data-confirm-accept]')?.textContent ?? ''
    }))()
  `);
  if (!customDeleteConfirmationAudit.hasDialog || !customDeleteConfirmationAudit.libraryStillVisible || !customDeleteConfirmationAudit.confirmText.includes('Delete custom item')) {
    errors.push(`Custom-item in-app confirmation audit failed: ${JSON.stringify(customDeleteConfirmationAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-confirm-accept]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  const permanentCustomDeleteAudit = await window.webContents.executeJavaScript(`
    (() => ({
      removedFromLibrary: ![...document.querySelectorAll('[data-custom-item]')].some((entry) => entry.textContent?.includes('Smoke Sage Head')),
      managerButtonText: document.querySelector('[data-custom-library-open]')?.textContent ?? ''
    }))()
  `);
  if (!permanentCustomDeleteAudit.removedFromLibrary || !permanentCustomDeleteAudit.managerButtonText.includes('1')) {
    errors.push(`Permanent custom-item library deletion audit failed: ${JSON.stringify(permanentCustomDeleteAudit)}`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library] .modal-actions button')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`
    (() => {
      const save = document.querySelector('[data-save-active-build]');
      if (!(save instanceof HTMLButtonElement)) throw new Error('Active-build save button disappeared before persistence test.');
      save.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  console.log('Checkpoint: saved custom set; reloading app.');
  await window.webContents.reload();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
  console.log('Checkpoint: app reload complete.');
  const restoredUiScaleAudit = await window.webContents.executeJavaScript(`
    (() => ({
      stored: localStorage.getItem('xiv-gear-lab:ui-scale'),
      desktopFactor: window.xivGearLab?.getUiScale?.()
    }))()
  `);
  if (restoredUiScaleAudit.stored !== '125' || restoredUiScaleAudit.desktopFactor !== 1.25) {
    errors.push(`Persisted UI scale audit failed: ${JSON.stringify(restoredUiScaleAudit)}`);
  }
  let restoredNavigationReady = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    restoredNavigationReady = await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('nav button')].some((entry) => entry.textContent?.includes('Saved locally'))
    `);
    if (restoredNavigationReady) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!restoredNavigationReady) throw new Error('Saved sets navigation was not rendered after reload.');
  await window.webContents.executeJavaScript(`
    (() => {
      const savedNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Saved locally'));
      if (savedNav instanceof HTMLButtonElement) savedNav.click();
    })()
  `);
  let restoredCardReady = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    restoredCardReady = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.saved-set-card'))`);
    if (restoredCardReady) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!restoredCardReady) throw new Error('Saved custom set card was not rendered after reload.');
  const restoredCardOpenAudit = await window.webContents.executeJavaScript(`
    (() => {
      const cards = [...document.querySelectorAll('.saved-set-card')];
      const card = cards.find((entry) => entry.textContent?.includes('Library Edited Sage Body') || entry.textContent?.includes('hypothetical')) ?? cards.at(-1);
      const open = card?.querySelector('.saved-set-summary');
      if (open instanceof HTMLButtonElement) open.click();
      return {
        opened: open instanceof HTMLButtonElement,
        cards: cards.map((entry) => entry.textContent ?? '')
      };
    })()
  `);
  if (!restoredCardOpenAudit.opened) {
    throw new Error(`Saved custom set was not restored after reload: ${JSON.stringify(restoredCardOpenAudit)}`);
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));
  const persistedCustomAudit = await window.webContents.executeJavaScript(`
    (() => {
      const names = [...document.querySelectorAll('.equipment-row .item-copy strong')].map((entry) => entry.textContent ?? '');
      return {
        hasCustomItem: names.includes('Library Edited Sage Body'),
        hasMissingItem: names.includes('Missing item'),
        libraryCount: document.querySelector('[data-custom-library-open]')?.textContent ?? ''
      };
    })()
  `);
  if (!persistedCustomAudit.hasCustomItem || persistedCustomAudit.hasMissingItem || !persistedCustomAudit.libraryCount.includes('1')) {
    errors.push(`Custom item session persistence audit failed: ${JSON.stringify(persistedCustomAudit)}`);
  }
  console.log(`Persistence audit: ${JSON.stringify(persistedCustomAudit)}`);

  await window.webContents.executeJavaScript(`
    (() => {
      const communityNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Community sets'));
      if (!(communityNav instanceof HTMLButtonElement)) throw new Error('Community navigation disappeared after reload.');
      communityNav.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`document.querySelector('.set-card')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library-open]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Library Edited Sage Body'));
      const remove = item?.querySelector('[data-library-custom-delete]');
      if (!(remove instanceof HTMLButtonElement)) throw new Error('Inactive persisted custom item delete button was not rendered.');
      remove.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const referencedDeleteGuardAudit = await window.webContents.executeJavaScript(`
    (() => ({
      remainingItems: document.querySelectorAll('[data-custom-item]').length,
      libraryButton: document.querySelector('[data-custom-library-open]')?.textContent ?? '',
      hasDialog: Boolean(document.querySelector('[data-confirm-dialog]')),
      hasReferenceWarning: (document.body.textContent ?? '').includes('retained because a saved set references it')
    }))()
  `);
  if (referencedDeleteGuardAudit.remainingItems !== 1 || !referencedDeleteGuardAudit.libraryButton.includes('1') || referencedDeleteGuardAudit.hasDialog || !referencedDeleteGuardAudit.hasReferenceWarning) {
    errors.push(`Saved-set custom-item reference guard audit failed: ${JSON.stringify(referencedDeleteGuardAudit)}`);
  }
  console.log(`Saved-set reference guard audit: ${JSON.stringify(referencedDeleteGuardAudit)}`);
  await window.webContents.executeJavaScript(`
    (() => {
      const close = document.querySelector('[data-custom-library] .modal-actions button');
      close?.click();
      const savedNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Saved locally'));
      savedNav?.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`document.querySelector('[data-saved-set-delete]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await window.webContents.executeJavaScript(`document.querySelector('[data-confirm-accept]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));

  await window.webContents.executeJavaScript(`
    (() => {
      const communityNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Community sets'));
      if (!(communityNav instanceof HTMLButtonElement)) throw new Error('Community navigation disappeared after saved-set deletion.');
      communityNav.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`document.querySelector('.set-card')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library-open]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  await window.webContents.executeJavaScript(`
    (() => {
      const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Library Edited Sage Body'));
      const remove = item?.querySelector('[data-library-custom-delete]');
      if (!(remove instanceof HTMLButtonElement)) throw new Error('Unreferenced persisted custom item delete button was not rendered.');
      remove.click();
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const finalDeleteConfirmationAudit = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-confirm-dialog]'))`);
  if (!finalDeleteConfirmationAudit) errors.push('Unreferenced custom item did not open its permanent-deletion confirmation.');
  await window.webContents.executeJavaScript(`document.querySelector('[data-confirm-accept]')?.click()`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  const inactiveDeleteAudit = await window.webContents.executeJavaScript(`
    (() => ({
      remainingItems: document.querySelectorAll('[data-custom-item]').length,
      libraryButton: document.querySelector('[data-custom-library-open]')?.textContent ?? ''
    }))()
  `);
  if (inactiveDeleteAudit.remainingItems !== 0 || inactiveDeleteAudit.libraryButton.includes('1')) {
    errors.push(`Inactive custom item deletion audit failed: ${JSON.stringify(inactiveDeleteAudit)}`);
  }
  console.log(`Inactive deletion audit: ${JSON.stringify(inactiveDeleteAudit)}`);

  await window.webContents.executeJavaScript(`
    (() => {
      const close = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Close');
      close?.click();
      const expansion = [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelector('select');
      if (!(expansion instanceof HTMLSelectElement)) throw new Error('Expansion selector was not rendered.');
      expansion.value = 'ew';
      expansion.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  await window.webContents.executeJavaScript(`
    (() => {
      const relic = document.querySelector('[data-source-group="relic"] input');
      if (!(relic instanceof HTMLInputElement) || relic.disabled) throw new Error('Endwalker relic source was not available.');
      if (!relic.checked) relic.click();
      const button = document.querySelector('[data-optimize-build]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Endwalker optimise button was not rendered.');
      button.click();
    })()
  `);
  let relicCompleted = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    relicCompleted = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('.run-message.done') && document.body.textContent?.includes('Searched'))`
    );
    if (relicCompleted) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  const relicAudit = await window.webContents.executeJavaScript(`
    (() => ({
      bodyChildren: document.body.children.length,
      renderedRows: document.querySelectorAll('.equipment-row').length,
      relicRows: [...document.querySelectorAll('.equipment-row')].filter((row) => row.textContent?.includes('Mandervillous')).length,
      relicStatChips: document.querySelectorAll('[data-relic-stat]').length,
      relicStatLabels: [...document.querySelectorAll('[data-relic-stat]')].map((chip) => chip.textContent?.trim()),
      message: document.querySelector('.run-message')?.textContent ?? ''
    }))()
  `);
  if (!relicCompleted || relicAudit.bodyChildren === 0 || relicAudit.renderedRows === 0 || relicAudit.relicStatChips !== 3) {
    errors.push(`Endwalker relic optimisation audit failed: ${JSON.stringify(relicAudit)}`);
  }
  console.log(`Endwalker relic audit: ${JSON.stringify(relicAudit)}`);

  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('.equipment-row')]
      .find((row) => row.textContent?.includes('Mandervillous'))
      ?.scrollIntoView({ block: 'center' })
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  const relicImage = await window.webContents.capturePage();
  await mkdir(dirname(relicScreenshotPath), { recursive: true });
  await writeFile(relicScreenshotPath, relicImage.toPNG());
  console.log(`Captured ${relicScreenshotPath}`);

  await window.webContents.executeJavaScript(`
    (() => {
      const job = document.querySelector('#job-select');
      if (!(job instanceof HTMLSelectElement)) throw new Error('Job selector disappeared before historical-switch audit.');
      const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      selectSetter?.call(job, 'WHM');
      job.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  await window.webContents.executeJavaScript(`
    (() => {
      for (const label of document.querySelectorAll('[aria-label="Allowed materia grades"] label')) {
        const input = label.querySelector('input');
        if (!(input instanceof HTMLInputElement)) continue;
        const shouldBeChecked = label.textContent?.includes('Grade 10') ?? false;
        if (input.checked !== shouldBeChecked) input.click();
      }
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  await window.webContents.executeJavaScript(`
    (() => {
      const expansion = [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Expansion access'))
        ?.querySelector('select');
      if (!(expansion instanceof HTMLSelectElement)) throw new Error('Expansion selector disappeared before Shadowbringers audit.');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(expansion, 'shb');
      expansion.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  await window.webContents.executeJavaScript(`
    (() => {
      const allowed = new Set(['savage', 'tomestone']);
      for (const group of document.querySelectorAll('[data-source-group]')) {
        const input = group.querySelector('input');
        if (!(input instanceof HTMLInputElement) || input.disabled) continue;
        const shouldBeChecked = allowed.has(group.getAttribute('data-source-group') ?? '');
        if (input.checked !== shouldBeChecked) input.click();
      }
      const upgradedTomestone = document.querySelector('[data-use-upgraded-tomestone]');
      if (upgradedTomestone instanceof HTMLInputElement && !upgradedTomestone.checked) upgradedTomestone.click();
      const itemLevelMode = document.querySelector('[data-item-level-mode]');
      if (itemLevelMode instanceof HTMLSelectElement) {
        const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        selectSetter?.call(itemLevelMode, 'any');
        itemLevelMode.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const speed = document.querySelector('#gcd-target');
      if (speed instanceof HTMLInputElement) {
        const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        inputSetter?.call(speed, '2.50');
        speed.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  await window.webContents.executeJavaScript(`
    (() => {
      const optimize = document.querySelector('[data-optimize-build]');
      if (!(optimize instanceof HTMLButtonElement)) throw new Error('Optimise button disappeared before Shadowbringers audit.');
      optimize.click();
    })()
  `);
  let shadowbringersCompleted = false;
  for (let attempt = 0; attempt < optimizerWaitAttempts; attempt += 1) {
    shadowbringersCompleted = await window.webContents.executeJavaScript(`
      Boolean(
        document.querySelector('.run-message.done') &&
        document.body.textContent?.includes('whm-healer-damage-proxy-shb80@1')
      )
    `);
    if (shadowbringersCompleted) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  await window.webContents.executeJavaScript(`document.querySelectorAll('img').forEach((image) => { image.loading = 'eager'; })`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
  const shadowbringersAudit = await window.webContents.executeJavaScript(`
    (() => {
      const itemRows = [...document.querySelectorAll('.equipment-row')];
      const text = document.body.textContent ?? '';
      const images = [...document.querySelectorAll('.equipment-row img')];
      return {
        selectedExpansion: [...document.querySelectorAll('label')]
          .find((label) => label.textContent?.includes('Expansion access'))
          ?.querySelector('select')?.value ?? '',
        selectedJob: document.querySelector('#job-select')?.value ?? '',
        minimumPiety: [...document.querySelectorAll('label')]
          .find((label) => label.textContent?.includes('Minimum Piety'))
          ?.querySelector('input')?.value ?? '',
        selectedMateriaGrades: [...document.querySelectorAll('[aria-label="Allowed materia grades"] label')]
          .filter((label) => label.querySelector('input')?.checked)
          .map((label) => label.textContent?.trim() ?? ''),
        renderedRows: itemRows.length,
        level80Rows: itemRows.filter((row) => row.textContent?.includes('level 80')).length,
        evaluatorVisible: text.includes('whm-healer-damage-proxy-shb80@1'),
        preliminaryVisible: text.toLowerCase().includes('preliminary'),
        brokenImages: images.filter((image) => image.naturalWidth === 0).length,
        message: document.querySelector('.run-message')?.textContent ?? ''
      };
    })()
  `);
  if (
    !shadowbringersCompleted ||
    shadowbringersAudit.selectedExpansion !== 'shb' ||
    shadowbringersAudit.selectedJob !== 'WHM' ||
    shadowbringersAudit.minimumPiety !== '340' ||
    !['Grade 8', 'Grade 7'].every((grade) => shadowbringersAudit.selectedMateriaGrades.includes(grade)) ||
    shadowbringersAudit.renderedRows < 11 ||
    shadowbringersAudit.level80Rows < 11 ||
    !shadowbringersAudit.evaluatorVisible ||
    !shadowbringersAudit.preliminaryVisible ||
    shadowbringersAudit.brokenImages > 0
  ) {
    errors.push(`Shadowbringers desktop optimisation audit failed: ${JSON.stringify(shadowbringersAudit)}`);
  }
  console.log(`Shadowbringers audit: ${JSON.stringify(shadowbringersAudit)}`);

  const shadowbringersImage = await window.webContents.capturePage();
  await writeFile(shadowbringersScreenshotPath, shadowbringersImage.toPNG());
  console.log(`Captured ${shadowbringersScreenshotPath}`);

  const image = await window.webContents.capturePage();
  await mkdir(dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, image.toPNG());

  console.log(`Captured ${screenshotPath}`);
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
