import { describe, expect, it } from 'vitest';
import { portableUserDataDirectory, PORTABLE_USER_DATA_DIRECTORY_NAME } from './portable-user-data.js';

describe('portable desktop user-data location', () => {
  it('places the complete Chromium profile beside the distributed executable', () => {
    expect(portableUserDataDirectory('E:\\Tools\\XIV Gear Lab')).toBe(
      `E:\\Tools\\XIV Gear Lab\\${PORTABLE_USER_DATA_DIRECTORY_NAME}`
    );
  });

  it('leaves development and unpacked hosts on their isolated default profile', () => {
    expect(portableUserDataDirectory(undefined)).toBeUndefined();
    expect(portableUserDataDirectory('   ')).toBeUndefined();
  });
});
