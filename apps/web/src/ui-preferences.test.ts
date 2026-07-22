import { describe, expect, it, vi } from 'vitest';
import { normalizeUiScale, readUiScale, UI_SCALE_STORAGE_KEY, writeUiScale } from './ui-preferences';

describe('UI scale preferences', () => {
  it('accepts supported sizes and safely falls back for damaged storage', () => {
    expect(normalizeUiScale('125')).toBe(125);
    expect(normalizeUiScale(175)).toBe(175);
    expect(normalizeUiScale('potato')).toBe(100);
    expect(readUiScale({ getItem: () => '150' })).toBe(150);
    expect(readUiScale({ getItem: () => '999' })).toBe(100);
  });

  it('persists the selected percentage without failing closed storage', () => {
    const setItem = vi.fn();
    writeUiScale({ setItem }, 125);
    expect(setItem).toHaveBeenCalledWith(UI_SCALE_STORAGE_KEY, '125');
    expect(() => writeUiScale({ setItem: () => { throw new Error('blocked'); } }, 150)).not.toThrow();
  });
});
