import { resolve } from 'node:path';

export const PORTABLE_USER_DATA_DIRECTORY_NAME = 'XIV Gear Lab Data';

export const portableUserDataDirectory = (portableExecutableDirectory?: string): string | undefined =>
  portableExecutableDirectory?.trim()
    ? resolve(portableExecutableDirectory, PORTABLE_USER_DATA_DIRECTORY_NAME)
    : undefined;
