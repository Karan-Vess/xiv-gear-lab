export const UI_SCALE_STORAGE_KEY = 'xiv-gear-lab:ui-scale';
export const UI_SCALE_OPTIONS = [90, 100, 110, 125, 150, 175] as const;
export type UiScale = (typeof UI_SCALE_OPTIONS)[number];

export const normalizeUiScale = (value: unknown): UiScale => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return UI_SCALE_OPTIONS.includes(numeric as UiScale) ? numeric as UiScale : 100;
};

export const readUiScale = (storage?: Pick<Storage, 'getItem'>): UiScale => {
  if (!storage) return 100;
  try {
    return normalizeUiScale(storage.getItem(UI_SCALE_STORAGE_KEY));
  } catch {
    return 100;
  }
};

export const writeUiScale = (storage: Pick<Storage, 'setItem'> | undefined, scale: UiScale): void => {
  try {
    storage?.setItem(UI_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // The live setting still works when browser storage is unavailable.
  }
};
