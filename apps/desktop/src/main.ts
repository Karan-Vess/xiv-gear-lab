import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const updateDrillModuleStartedAt = Date.now();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.XIV_GEAR_LAB_DEV_SERVER_URL;
const smokeScreenshot = process.env.XIV_GEAR_LAB_SMOKE_SCREENSHOT;
const smokeResultPath = smokeScreenshot ? `${smokeScreenshot}.result.json` : undefined;
const updateDrillResultPath = process.env.XIV_GEAR_LAB_UPDATE_DRILL_RESULT;
const updateDrillMode = process.env.XIV_GEAR_LAB_UPDATE_DRILL_MODE;
const updateDrillUserData = process.env.XIV_GEAR_LAB_UPDATE_DRILL_USER_DATA;
const updateDrillStartedAt = Number(process.env.XIV_GEAR_LAB_UPDATE_DRILL_STARTED_AT);
const automationResultPath = smokeResultPath ?? updateDrillResultPath;
const trustedExternalHosts = new Set([
  'etro.gg',
  'github.com',
  'na.finalfantasyxiv.com',
  'support.na.square-enix.com',
  'thebalanceffxiv.com',
  'v2.xivapi.com',
  'www.thebalanceffxiv.com',
  'xivgear.app'
]);

const trustedExternalUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && trustedExternalHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

if (smokeScreenshot) app.setPath('userData', mkdtempSync(resolve(tmpdir(), 'xiv-gear-lab-packaged-smoke-')));
if (updateDrillResultPath) {
  if (!['online', 'offline'].includes(updateDrillMode ?? '')) throw new Error('Update drill mode must be online or offline.');
  if (!updateDrillUserData) throw new Error('Update drill requires a persistent user-data directory.');
  app.setPath('userData', resolve(updateDrillUserData));
}

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#080c14',
    autoHideMenuBar: true,
    show: false,
    title: 'XIV Gear Lab',
    webPreferences: {
      preload: join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (trustedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = developmentUrl ? url.startsWith(developmentUrl) : url.startsWith('file:');
    if (!allowed) event.preventDefault();
  });
  window.once('ready-to-show', () => {
    if (!smokeScreenshot && !updateDrillResultPath) window.show();
  });

  let blockedNetworkRequests = 0;
  if (updateDrillMode === 'offline') {
    window.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (_details, callback) => {
        blockedNetworkRequests += 1;
        callback({ cancel: true });
      }
    );
  }

  if (developmentUrl) await window.loadURL(developmentUrl);
  else if (app.isPackaged) await window.loadFile(join(process.resourcesPath, 'web/index.html'));
  else await window.loadFile(join(currentDirectory, '../../web/dist/index.html'));

  if (updateDrillResultPath) {
    let rendered = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      rendered = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-runtime-source]') && document.querySelector('[data-data-update-check]'))`);
      if (rendered) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!rendered) throw new Error('Installed update drill could not reach the application UI.');
    const uiReadyMs = Number.isFinite(updateDrillStartedAt) && updateDrillStartedAt > 0
      ? Date.now() - updateDrillStartedAt
      : undefined;
    const portableBootstrapMs = Number.isFinite(updateDrillStartedAt) && updateDrillStartedAt > 0
      ? updateDrillModuleStartedAt - updateDrillStartedAt
      : undefined;
    const appUiReadyMs = Date.now() - updateDrillModuleStartedAt;

    const initialSource = await window.webContents.executeJavaScript(`document.querySelector('[data-runtime-source]')?.getAttribute('data-runtime-source')`) as string | null;
    let rendererResponsiveDuringUpdate: boolean | undefined;
    let rendererProbeMs: number | undefined;
    if (updateDrillMode === 'online') {
      if (initialSource !== 'bundled') throw new Error(`Online update drill expected a fresh bundled start, received ${initialSource ?? 'no source'}.`);
      await window.webContents.executeJavaScript(`
        (() => {
          const button = document.querySelector('[data-data-update-check]');
          if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Data update button is unavailable.');
          button.click();
        })()
      `);
      const rendererProbeStartedAt = Date.now();
      rendererResponsiveDuringUpdate = await window.webContents.executeJavaScript(`
        (() => {
          const job = document.querySelector('#job-select');
          const status = document.querySelector('[data-runtime-source]');
          return job instanceof HTMLSelectElement && !job.disabled && Boolean(status);
        })()
      `) as boolean;
      rendererProbeMs = Date.now() - rendererProbeStartedAt;
      if (!rendererResponsiveDuringUpdate) throw new Error('The catalogue controls became unavailable while checking for an update.');
      let downloaded = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
          downloaded = await window.webContents.executeJavaScript(`document.querySelector('[data-runtime-source]')?.getAttribute('data-runtime-source') === 'downloaded'`);
        } catch {
          downloaded = false;
        }
        if (downloaded) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      if (!downloaded) throw new Error('Installed update drill did not activate and reload the downloaded snapshot.');
    } else if (initialSource !== 'downloaded') {
      throw new Error(`Offline update drill did not restore the downloaded cache; received ${initialSource ?? 'no source'}.`);
    }

    await window.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Optimise this brief'));
        if (!(button instanceof HTMLButtonElement)) throw new Error('Optimise button was not rendered during update drill.');
        button.click();
      })()
    `);
    let optimized = false;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      optimized = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.alternative-tabs') && document.body.textContent?.includes('Searched'))`);
      if (optimized) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!optimized) throw new Error('Installed update drill could not optimise from the retained snapshot.');

    const audit = await window.webContents.executeJavaScript(`
      (() => {
        const equipmentImages = [...document.querySelectorAll('.equipment-row img')];
        const materiaImages = [...document.querySelectorAll('.materia-chip img')];
        const images = [...equipmentImages, ...materiaImages];
        return {
          source: document.querySelector('[data-runtime-source]')?.getAttribute('data-runtime-source'),
          snapshotId: document.querySelector('[data-runtime-source]')?.getAttribute('data-snapshot-id'),
          equipmentImages: equipmentImages.length,
          materiaImages: materiaImages.length,
          brokenImages: images.filter((entry) => !entry.complete || entry.naturalWidth === 0).length,
          nonEmbeddedImages: images.filter((entry) => !entry.getAttribute('src')?.startsWith('data:')).length,
          missingItems: [...document.querySelectorAll('.equipment-row')].filter((entry) => entry.textContent?.includes('Missing item')).length
        };
      })()
    `) as {
      source?: string;
      snapshotId?: string;
      equipmentImages: number;
      materiaImages: number;
      brokenImages: number;
      nonEmbeddedImages: number;
      missingItems: number;
    };
    if (
      audit.source !== 'downloaded' ||
      audit.equipmentImages < 10 ||
      audit.materiaImages < 1 ||
      audit.brokenImages > 0 ||
      audit.nonEmbeddedImages > 0 ||
      audit.missingItems > 0
    ) {
      throw new Error(`Installed update/offline icon audit failed: ${JSON.stringify(audit)}`);
    }
    await mkdir(dirname(updateDrillResultPath), { recursive: true });
    await writeFile(updateDrillResultPath, JSON.stringify({
      status: 'passed',
      mode: updateDrillMode,
      initialSource,
      uiReadyMs,
      portableBootstrapMs,
      appUiReadyMs,
      blockedNetworkRequests,
      rendererResponsiveDuringUpdate,
      rendererProbeMs,
      optimized,
      audit
    }, null, 2));
    app.exit(0);
    return;
  }

  if (smokeScreenshot) {
    let rendered = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      rendered = await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-workspace-tab="build-1"]') && [...document.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Optimise Build 1')))`
      );
      if (rendered) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!rendered) throw new Error('Application UI did not finish runtime-data bootstrap within 10 seconds.');
    await window.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Optimise Build 1'));
        if (!button) throw new Error('Optimise button was not rendered.');
        button.click();
      })()
    `);
    let completed = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      completed = await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('.workspace-tabs') && document.body.textContent?.includes('Searched'))`
      );
      if (completed) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!completed) throw new Error('Packaged optimiser smoke test timed out.');

    const expandedJobAudits: Array<{
      selectedJob?: string;
      targets: string[];
      weapon: string;
      offHand: string;
      statLabels: string[];
      itemStats: string;
      materiaSlots: string;
      derivedStats: string;
      gcdStateNote: string;
      targetState: string;
      roleGroups: string[];
      evaluator: string;
      hasResourceControl: boolean;
    }> = [];
    for (const jobAudit of [
      { job: 'SCH', targets: ['2.40s'], weaponPattern: /Codex/, evaluator: 'sch-healer-damage-proxy@1' },
      { job: 'AST', targets: ['2.31s', '2.43s'], weaponPattern: /Astrometer|Star Globe/, evaluator: 'ast-healer-damage-proxy@1' },
      { job: 'SGE', targets: ['2.39s', '2.44s', '2.45s'], weaponPattern: /Pendulums|Syrinxi/, evaluator: 'sge-healer-damage-proxy@1' },
      { job: 'PLD', targets: ['2.50s'], weaponPattern: /Falchion|Sword/, evaluator: 'pld-tank-damage-proxy@1', tank: true, offHandPattern: /Shield/ },
      { job: 'WAR', targets: ['2.40s', '2.45s', '2.50s'], weaponPattern: /War Axe/, evaluator: 'war-tank-damage-proxy@1', tank: true },
      { job: 'DRK', targets: ['2.46s', '2.50s'], weaponPattern: /Guillotine/, evaluator: 'drk-tank-damage-proxy@1', tank: true },
      { job: 'GNB', targets: ['2.40s', '2.45s', '2.50s'], weaponPattern: /Sawback/, evaluator: 'gnb-tank-damage-proxy@1', tank: true },
      { job: 'MNK', targets: ['1.93s', '1.94s', '2.00s'], weaponPattern: /Baghnakhs/, evaluator: 'mnk-dps-damage-proxy@1', dps: true, labels: ['STR', 'DHT', 'SKS'], timing: ['Greased Lightning', 'optimiser target: Greased Lightning'], targetState: 'Target state: Greased Lightning' },
      { job: 'DRG', targets: ['2.50s'], weaponPattern: /Spear/, evaluator: 'drg-dps-damage-proxy@1', dps: true, labels: ['STR', 'DHT', 'SKS'] },
      { job: 'NIN', targets: ['2.12s'], weaponPattern: /Knives/, evaluator: 'nin-dps-damage-proxy@1', dps: true, labels: ['DEX', 'DHT', 'SKS'], timing: ['Ninja speed trait', 'optimiser target: Ninja speed trait'], targetState: 'Target state: Ninja speed trait' },
      { job: 'SAM', targets: ['2.08s', '2.14s'], weaponPattern: /Blade/, evaluator: 'sam-dps-damage-proxy@1', dps: true, labels: ['STR', 'DHT', 'SKS'], timing: ['Fuka', 'maintained', 'optimiser target: Fuka'], targetState: 'Target state: Fuka' },
      { job: 'RPR', targets: ['2.49s'], weaponPattern: /War Scythe/, evaluator: 'rpr-dps-damage-proxy@1', dps: true, labels: ['STR', 'DHT', 'SKS'] },
      { job: 'VPR', targets: ['2.10s', '2.11s', '2.12s'], weaponPattern: /Twinfangs/, evaluator: 'vpr-dps-damage-proxy@1', dps: true, labels: ['DEX', 'DHT', 'SKS'], timing: ['Swiftscaled', 'maintained', 'optimiser target: Swiftscaled'], targetState: 'Target state: Swiftscaled' },
      { job: 'BRD', targets: ['2.48s', '2.49s', '2.50s'], weaponPattern: /Longbow/, evaluator: 'brd-dps-damage-proxy@1', dps: true, labels: ['DEX', 'DHT', 'SKS'] },
      { job: 'MCH', targets: ['2.50s'], weaponPattern: /Pistol/, evaluator: 'mch-dps-damage-proxy@1', dps: true, labels: ['DEX', 'DHT', 'SKS'] },
      { job: 'DNC', targets: ['2.50s'], weaponPattern: /War Quoits/, evaluator: 'dnc-dps-damage-proxy@1', dps: true, labels: ['DEX', 'DHT', 'SKS'] },
      { job: 'BLM', targets: ['2.15s', '2.20s', '2.32s', '2.37s', '2.41s', '2.45s'], weaponPattern: /Rod/, evaluator: 'blm-dps-damage-proxy@1', dps: true, labels: ['INT', 'DHT', 'SPS'], timing: ['Ley Lines', 'temporary', 'optimiser target: Base GCD'], targetState: 'Target state: Base GCD' },
      { job: 'SMN', targets: ['2.46s', '2.47s', '2.48s'], weaponPattern: /Index/, evaluator: 'smn-dps-damage-proxy@1', dps: true, labels: ['INT', 'DHT', 'SPS'] },
      { job: 'RDM', targets: ['2.48s', '2.49s', '2.50s'], weaponPattern: /Foil/, evaluator: 'rdm-dps-damage-proxy@1', dps: true, labels: ['INT', 'DHT', 'SPS'] },
      { job: 'PCT', targets: ['2.48s', '2.49s', '2.50s'], weaponPattern: /Flat Brush/, evaluator: 'pct-dps-damage-proxy@1', dps: true, labels: ['INT', 'DHT', 'SPS'] }
    ]) {
      await window.webContents.executeJavaScript(`
        (() => {
          const jobSelect = document.querySelector('#job-select');
          if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Job selector disappeared during packaged combat-job audit.');
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          setter?.call(jobSelect, '${jobAudit.job}');
          jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
      const result = await window.webContents.executeJavaScript(`
        (() => ({
          selectedJob: document.querySelector('#job-select')?.value,
          targets: [...document.querySelectorAll('.gcd-suggestions button')].map((entry) => entry.textContent ?? ''),
          weapon: document.querySelector('.equipment-row .item-copy strong')?.textContent ?? '',
          offHand: [...document.querySelectorAll('.equipment-row')].find((entry) => entry.querySelector('.slot-name')?.textContent === 'Off-hand')?.querySelector('.item-copy strong')?.textContent ?? '',
          statLabels: [...(document.querySelector('.set-detail .stat-strip')?.querySelectorAll('.stat-cell span') ?? [])].map((entry) => entry.textContent ?? ''),
          itemStats: document.querySelector('.equipment-row [data-item-stats]')?.textContent ?? '',
          materiaSlots: document.querySelector('.equipment-row .meld-stack')?.textContent ?? '',
          derivedStats: document.querySelector('.derived-stat-strip')?.textContent ?? '',
          gcdStateNote: document.querySelector('.gcd-state-note')?.textContent ?? '',
          targetState: document.querySelector('.gcd-control > small')?.textContent ?? '',
          roleGroups: [...(document.querySelector('#job-select')?.querySelectorAll('optgroup') ?? [])].map((entry) => entry.label),
          evaluator: document.querySelector('.evaluation-note')?.textContent ?? '',
          hasResourceControl: [...document.querySelectorAll('.control-panel > label')].some((entry) => entry.textContent?.trim().startsWith('Minimum '))
        }))()
      `) as { selectedJob?: string; targets: string[]; weapon: string; offHand: string; statLabels: string[]; itemStats: string; materiaSlots: string; derivedStats: string; gcdStateNote: string; targetState: string; roleGroups: string[]; evaluator: string; hasResourceControl: boolean };
      expandedJobAudits.push(result);
      if (
        result.selectedJob !== jobAudit.job ||
        !jobAudit.targets.every((target) => result.targets.includes(target)) ||
        !jobAudit.weaponPattern.test(result.weapon) ||
        !result.itemStats.includes('WD') ||
        !result.itemStats.includes('VIT') ||
        !result.itemStats.toUpperCase().includes('FINAL ITEM STATS') ||
        !result.materiaSlots.toUpperCase().includes('MATERIA SLOTS') ||
        !result.materiaSlots.includes('+') ||
        !result.derivedStats.includes('chance') ||
        !result.derivedStats.includes('damage') ||
        JSON.stringify(result.roleGroups) !== JSON.stringify(['Tanks', 'Healers', 'DPS']) ||
        !result.evaluator.includes(jobAudit.evaluator) ||
        (jobAudit.tank && !['STR', 'TEN', 'SKS'].every((label) => result.statLabels.includes(label))) ||
        (jobAudit.labels && !jobAudit.labels.every((label) => result.statLabels.includes(label))) ||
        (jobAudit.dps && result.hasResourceControl) ||
        (jobAudit.offHandPattern && !jobAudit.offHandPattern.test(result.offHand)) ||
        (!jobAudit.offHandPattern && result.offHand !== '') ||
        (jobAudit.timing && !jobAudit.timing.every((text) => result.gcdStateNote.includes(text))) ||
        (jobAudit.targetState && !result.targetState.includes(jobAudit.targetState))
      ) {
        throw new Error(`Packaged combat-job audit failed for ${jobAudit.job}: ${JSON.stringify(result)}`);
      }
    }

    await window.webContents.executeJavaScript(`
      (() => {
        const jobSelect = document.querySelector('#job-select');
        if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Job selector disappeared while restoring White Mage.');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(jobSelect, 'WHM');
        jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));

    await window.webContents.executeJavaScript(`
      (() => {
        const jobSelect = document.querySelector('#job-select');
        if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Job selector disappeared before packaged source audit.');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(jobSelect, 'SCH');
        jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    await window.webContents.executeJavaScript(`
      (() => {
        const community = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Community'));
        if (!(community instanceof HTMLButtonElement)) throw new Error('Packaged Community navigation was not rendered.');
        community.click();
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    const balanceSourceAudit = await window.webContents.executeJavaScript(`
      (() => ({
        names: [...document.querySelectorAll('.set-card h2')].map((entry) => entry.textContent ?? ''),
        providers: [...document.querySelectorAll('[data-curated-providers]')].map((entry) => entry.getAttribute('data-curated-providers') ?? '')
      }))()
    `) as { names: string[]; providers: string[]; links?: string[] };
    if (
      balanceSourceAudit.names.length !== 2 ||
      !balanceSourceAudit.names.includes('2.31 Max Damage') ||
      !balanceSourceAudit.providers.includes('Etro + The Balance') ||
      !balanceSourceAudit.providers.includes('The Balance · XivGear')
    ) {
      throw new Error(`Packaged Balance community-card audit failed: ${JSON.stringify(balanceSourceAudit)}`);
    }
    await window.webContents.executeJavaScript(`
      (() => {
        const card = [...document.querySelectorAll('.set-card')].find((entry) => entry.querySelector('h2')?.textContent === '2.31 Max Damage');
        if (!(card instanceof HTMLButtonElement)) throw new Error('Packaged Balance-only Scholar card was not rendered.');
        card.click();
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    balanceSourceAudit.links = await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('.curated-sources a')].map((entry) => entry.textContent?.trim() ?? '')
    `) as string[];
    if (
      !balanceSourceAudit.links.some((entry) => entry.startsWith('The Balance')) ||
      !balanceSourceAudit.links.some((entry) => entry.startsWith('XivGear'))
    ) {
      throw new Error(`Packaged Balance source-link audit failed: ${JSON.stringify(balanceSourceAudit)}`);
    }

    await window.webContents.executeJavaScript(`
      (() => {
        const save = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Save Build 1');
        if (!(save instanceof HTMLButtonElement)) throw new Error('Packaged save-set button was not rendered.');
        save.click();
      })()
    `);
    let savedSetReady = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      savedSetReady = await window.webContents.executeJavaScript(
        `[...document.querySelectorAll('nav button')].some((entry) => entry.textContent?.includes('Saved locally') && entry.textContent?.includes('1'))`
      );
      if (savedSetReady) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!savedSetReady) throw new Error('Packaged saved set was not ready for deletion.');

    await window.webContents.executeJavaScript(`
      (() => {
        const savedNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Saved locally'));
        if (!(savedNav instanceof HTMLButtonElement)) throw new Error('Packaged saved navigation was not rendered.');
        savedNav.click();
      })()
    `);
    let deleteControlReady = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      deleteControlReady = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-saved-set-delete]'))`);
      if (deleteControlReady) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!deleteControlReady) throw new Error('Packaged saved-set delete control was not rendered.');

    await window.webContents.executeJavaScript(`document.querySelector('[data-saved-set-delete]')?.click()`);
    const hasInAppConfirmation = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-confirm-dialog]') && document.querySelector('[data-confirm-accept]'))`
    );
    if (!hasInAppConfirmation) throw new Error('Packaged saved-set deletion did not open the in-app confirmation.');
    await window.webContents.executeJavaScript(`document.querySelector('[data-confirm-accept]')?.click()`);

    let deletionComplete = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      deletionComplete = await window.webContents.executeJavaScript(
        `!document.querySelector('[data-confirm-dialog]') && !document.querySelector('[data-saved-set-delete]')`
      );
      if (deletionComplete) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!deletionComplete) throw new Error('Packaged saved-set deletion did not complete.');

    await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library-open]')?.click()`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-custom-new]')?.click()`);
    const editorReady = await window.webContents.executeJavaScript(`
      Boolean(document.querySelector('[data-custom-editor]') && document.querySelector('[data-custom-slot]'))
    `);
    if (!editorReady) throw new Error('Packaged custom-item editor was not rendered after deletion confirmation.');

    await window.webContents.executeJavaScript(`
      (() => {
        const slot = document.querySelector('[data-custom-slot]');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (!(slot instanceof HTMLSelectElement) || slot.disabled) throw new Error('Packaged slot selector is unavailable.');
        setter?.call(slot, 'body');
        slot.dispatchEvent(new Event('change', { bubbles: true }));
        const name = document.querySelector('[data-custom-editor] input[name="name"]');
        if (!(name instanceof HTMLInputElement) || name.disabled) throw new Error('Packaged name field is unavailable.');
        name.focus();
        name.select();
      })()
    `);
    window.webContents.insertText('Packaged input check');
    await window.webContents.executeJavaScript(`
      (() => {
        const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
        if (!(mainStat instanceof HTMLInputElement) || mainStat.disabled) throw new Error('Packaged stat field is unavailable.');
        mainStat.focus();
        mainStat.select();
      })()
    `);
    window.webContents.insertText('321');

    const postConfirmationInputAudit = await window.webContents.executeJavaScript(`
      (() => {
        const mainStat = document.querySelector('[data-custom-editor] [data-custom-main-stat]');
        return {
          slot: document.querySelector('[data-custom-slot]')?.value,
          name: document.querySelector('[data-custom-editor] input[name="name"]')?.value,
          mainStat: mainStat?.value,
          limit: mainStat?.closest('label')?.querySelector('small')?.textContent ?? ''
        };
      })()
    `) as { slot?: string; name?: string; mainStat?: string; limit?: string };
    if (
      postConfirmationInputAudit.slot !== 'body' ||
      postConfirmationInputAudit.name !== 'Packaged input check' ||
      postConfirmationInputAudit.mainStat !== '321' ||
      !postConfirmationInputAudit.limit?.includes('Highest recorded') ||
      !postConfirmationInputAudit.limit.includes('maximum')
    ) {
      throw new Error(`Packaged post-confirmation input audit failed: ${JSON.stringify(postConfirmationInputAudit)}`);
    }

    await window.webContents.executeJavaScript(`
      (() => {
        const slot = document.querySelector('[data-custom-slot]');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (!(slot instanceof HTMLSelectElement)) throw new Error('Custom slot selector disappeared before weapon-delay audit.');
        setter?.call(slot, 'weapon');
        slot.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    await window.webContents.executeJavaScript(`
      (() => {
        const delay = document.querySelector('[data-custom-weapon-delay]');
        if (!(delay instanceof HTMLInputElement) || delay.disabled) throw new Error('Custom weapon delay input was not rendered.');
        delay.focus();
        delay.select();
      })()
    `);
    window.webContents.insertText('2.64');
    const weaponDelayAudit = await window.webContents.executeJavaScript(`
      (() => {
        const delay = document.querySelector('[data-custom-weapon-delay]');
        return {
          value: delay?.value,
          minimum: delay?.getAttribute('min'),
          maximum: delay?.getAttribute('max'),
          limit: delay?.closest('label')?.querySelector('small')?.textContent ?? ''
        };
      })()
    `) as { value?: string; minimum?: string | null; maximum?: string | null; limit?: string };
    if (
      weaponDelayAudit.value !== '2.64' ||
      !weaponDelayAudit.minimum ||
      !weaponDelayAudit.maximum ||
      !weaponDelayAudit.limit?.includes('Fastest recorded') ||
      !weaponDelayAudit.limit.includes('minimum')
    ) {
      throw new Error(`Packaged custom weapon-delay audit failed: ${JSON.stringify(weaponDelayAudit)}`);
    }
    await window.webContents.executeJavaScript(`
      (() => {
        const slot = document.querySelector('[data-custom-slot]');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (!(slot instanceof HTMLSelectElement)) throw new Error('Custom slot selector disappeared after weapon-delay audit.');
        setter?.call(slot, 'body');
        slot.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);

    window.showInactive();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
    const image = await window.webContents.capturePage();
    await mkdir(dirname(smokeScreenshot), { recursive: true });
    await writeFile(smokeScreenshot, image.toPNG());

    await window.webContents.executeJavaScript(`document.querySelector('[data-custom-editor]')?.requestSubmit()`);
    let customEditorClosed = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      customEditorClosed = await window.webContents.executeJavaScript(`!document.querySelector('[data-custom-editor]')`);
      if (customEditorClosed) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!customEditorClosed) throw new Error('Packaged custom item was not created after submitting the editor.');
    await window.webContents.executeJavaScript(`
      (() => {
        const optimizeNav = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent?.includes('Optimise'));
        if (!(optimizeNav instanceof HTMLButtonElement)) throw new Error('Packaged Optimise navigation was not rendered.');
        optimizeNav.click();
      })()
    `);
    let customEquipped = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      customEquipped = await window.webContents.executeJavaScript(`
        (() => {
          const row = [...document.querySelectorAll('.equipment-row')].find((entry) => entry.textContent?.includes('Packaged input check'));
          return Boolean(row?.querySelector('[data-equipped-custom-unequip]'));
        })()
      `);
      if (customEquipped) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!customEquipped) throw new Error('Packaged custom item was not created with an Unequip action.');

    await window.webContents.executeJavaScript(`
      (() => {
        const row = [...document.querySelectorAll('.equipment-row')].find((entry) => entry.textContent?.includes('Packaged input check'));
        row?.querySelector('[data-equipped-custom-unequip]')?.click();
      })()
    `);
    let unequipComplete = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      unequipComplete = await window.webContents.executeJavaScript(`
        (() => {
          const equipped = [...document.querySelectorAll('.equipment-row')].some((entry) => entry.textContent?.includes('Packaged input check'));
          const libraryButton = document.querySelector('[data-custom-library-open]')?.textContent ?? '';
          return !equipped && libraryButton.includes('1');
        })()
      `);
      if (unequipComplete) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!unequipComplete) throw new Error('Packaged Unequip action removed the item from the library or left it equipped.');

    await window.webContents.executeJavaScript(`document.querySelector('[data-custom-library-open]')?.click()`);
    const unequipAudit = await window.webContents.executeJavaScript(`
      (() => {
        const item = [...document.querySelectorAll('[data-custom-item]')].find((entry) => entry.textContent?.includes('Packaged input check'));
        return {
          keptInLibrary: Boolean(item),
          hasLibraryDelete: Boolean(item?.querySelector('[data-library-custom-delete]')),
          hasEquippedDelete: Boolean(document.querySelector('[data-equipped-custom-delete]'))
        };
      })()
    `) as { keptInLibrary?: boolean; hasLibraryDelete?: boolean; hasEquippedDelete?: boolean };
    if (!unequipAudit.keptInLibrary || !unequipAudit.hasLibraryDelete || unequipAudit.hasEquippedDelete) {
      throw new Error(`Packaged Unequip/library audit failed: ${JSON.stringify(unequipAudit)}`);
    }

    await window.webContents.executeJavaScript(`
      (() => {
        const library = document.querySelector('[data-custom-library]');
        const close = library && [...library.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Close');
        if (!(close instanceof HTMLButtonElement)) throw new Error('Custom-item library could not be closed before workspace audit.');
        close.click();
        document.querySelector('[data-workspace-tab="build-2"]')?.click();
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    await window.webContents.executeJavaScript(`
      (() => {
        const jobSelect = document.querySelector('#job-select');
        if (!(jobSelect instanceof HTMLSelectElement)) throw new Error('Build 2 job selector was not rendered.');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(jobSelect, 'MNK');
        jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    const build2WorkspaceAudit = await window.webContents.executeJavaScript(`
      (() => {
        const build2Role = document.querySelector('#job-select')?.getAttribute('data-job-role') ?? '';
        const build2Text = document.querySelector('.result-column')?.textContent ?? '';
        const statLabels = [...document.querySelectorAll('.result-column .stat-cell span')].map((entry) => entry.textContent?.trim() ?? '');
        return {
          build2Role,
          hasBaseGcd: statLabels.includes('BASE GCD'),
          hasEffectiveGcd: statLabels.includes('GREASED LIGHTNING'),
          hasNamedEffect: build2Text.includes('Greased Lightning')
        };
      })()
    `) as {
      build2Role?: string;
      hasBaseGcd?: boolean;
      hasEffectiveGcd?: boolean;
      hasNamedEffect?: boolean;
    };
    await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-tab="build-1"]')?.click()`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    const build1Job = await window.webContents.executeJavaScript(`document.querySelector('#job-select')?.value ?? ''`) as string;
    await window.webContents.executeJavaScript(`
      (() => {
        const copy = document.querySelector('[data-copy-loadout-target="build-3"]');
        if (!(copy instanceof HTMLButtonElement)) throw new Error('Build 1 copy-to-Build-3 control was not rendered.');
        copy.click();
      })()
    `);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    const copyLoadoutAudit = await window.webContents.executeJavaScript(`
      (() => ({
        build1StillActive: document.querySelector('[data-workspace-tab="build-1"]')?.getAttribute('aria-selected') === 'true',
        build3Summary: document.querySelector('[data-workspace-tab="build-3"]')?.textContent ?? '',
        confirmation: document.querySelector('.run-message')?.textContent ?? ''
      }))()
    `) as { build1StillActive?: boolean; build3Summary?: string; confirmation?: string };
    if (
      !copyLoadoutAudit.build1StillActive ||
      !copyLoadoutAudit.build3Summary?.includes('SCH') ||
      !copyLoadoutAudit.confirmation?.includes('copied to Build 3')
    ) {
      throw new Error(`Packaged loadout-copy audit failed: ${JSON.stringify(copyLoadoutAudit)}`);
    }
    await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-tab="comparison"]')?.click()`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    const comparisonAudit = await window.webContents.executeJavaScript(`
      (() => {
        const comparisonText = document.querySelector('[data-comparison-view]')?.textContent ?? '';
        return {
          hasComparison: Boolean(document.querySelector('[data-comparison-view]')),
          refusesCrossJobWinner: comparisonText.includes('Different jobs') && comparisonText.includes('Not directly comparable'),
          hasComparisonMetrics: comparisonText.includes('Expected single 100-potency hit') && comparisonText.includes('MP regeneration') && comparisonText.includes('Critical Hit outcome') && comparisonText.includes('Determination damage')
        };
      })()
    `) as {
      hasComparison?: boolean;
      refusesCrossJobWinner?: boolean;
      hasComparisonMetrics?: boolean;
    };
    const workspaceAudit = { ...build2WorkspaceAudit, build1Job, copyLoadoutAudit, ...comparisonAudit };
    if (
      workspaceAudit.build2Role !== 'dps' ||
      !workspaceAudit.hasBaseGcd ||
      !workspaceAudit.hasEffectiveGcd ||
      !workspaceAudit.hasNamedEffect ||
      workspaceAudit.build1Job !== 'SCH' ||
      !workspaceAudit.hasComparison ||
      !workspaceAudit.refusesCrossJobWinner ||
      !workspaceAudit.hasComparisonMetrics
    ) {
      throw new Error(`Packaged M9 workspace audit failed: ${JSON.stringify(workspaceAudit)}`);
    }

    const comparisonImage = await window.webContents.capturePage();
    await writeFile(smokeScreenshot, comparisonImage.toPNG());

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    await window.webContents.reload();
    let workspaceReloaded = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      workspaceReloaded = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-workspace-tab="comparison"]'))`);
      if (workspaceReloaded) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!workspaceReloaded) throw new Error('Packaged M9 workspace did not return after reload.');
    const workspacePersistenceAudit = await window.webContents.executeJavaScript(`
      (() => ({
        activeComparison: document.querySelector('[data-workspace-tab="comparison"]')?.getAttribute('aria-selected') === 'true',
        build1Summary: document.querySelector('[data-workspace-tab="build-1"]')?.textContent ?? '',
        build2Summary: document.querySelector('[data-workspace-tab="build-2"]')?.textContent ?? '',
        build3Summary: document.querySelector('[data-workspace-tab="build-3"]')?.textContent ?? '',
        customItemCount: document.querySelector('[data-custom-library-open]')?.textContent ?? ''
      }))()
    `) as { activeComparison?: boolean; build1Summary?: string; build2Summary?: string; build3Summary?: string; customItemCount?: string };
    if (
      !workspacePersistenceAudit.activeComparison ||
      !workspacePersistenceAudit.build1Summary?.includes('SCH') ||
      !workspacePersistenceAudit.build2Summary?.includes('MNK') ||
      !workspacePersistenceAudit.build3Summary?.includes('SCH') ||
      !workspacePersistenceAudit.customItemCount?.includes('1')
    ) {
      throw new Error(`Packaged M9 persistence audit failed: ${JSON.stringify(workspacePersistenceAudit)}`);
    }

    if (smokeResultPath) {
      await writeFile(smokeResultPath, JSON.stringify({
        status: 'passed',
        expandedJobAudits,
        balanceSourceAudit,
        postConfirmationInputAudit,
        weaponDelayAudit,
        unequipAudit,
        workspaceAudit,
        workspacePersistenceAudit
      }, null, 2));
    }
    app.exit(0);
  }
};

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  if (automationResultPath) {
    try {
      await mkdir(dirname(automationResultPath), { recursive: true });
      await writeFile(automationResultPath, JSON.stringify({ status: 'failed', error: message }, null, 2));
    } catch (writeError) {
      console.error(writeError);
    }
  }
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
