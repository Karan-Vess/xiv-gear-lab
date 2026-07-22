import { contextBridge, webFrame } from 'electron';

const setUiScale = (percentage: unknown): number => {
  const numeric = Number(percentage);
  const safePercentage = Number.isFinite(numeric) ? Math.min(175, Math.max(90, numeric)) : 100;
  const factor = safePercentage / 100;
  webFrame.setZoomFactor(factor);
  return factor;
};

contextBridge.exposeInMainWorld('xivGearLab', Object.freeze({
  host: 'desktop',
  platform: process.platform,
  setUiScale,
  getUiScale: () => webFrame.getZoomFactor()
}));
