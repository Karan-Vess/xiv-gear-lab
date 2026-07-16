import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('xivGearLab', Object.freeze({
  host: 'desktop',
  platform: process.platform
}));
