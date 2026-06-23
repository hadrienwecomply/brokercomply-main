import { describe, expect, it } from 'vitest';
import {
  brokerFolderFromItemPath,
  drivePathFromParentRef,
  encodeDrivePath,
  joinPath,
  sanitizeFolderName,
  trimSlashes,
} from '../../src/sharepoint/paths.js';

describe('path helpers', () => {
  it('trims and joins segments', () => {
    expect(trimSlashes('/a/b/')).toBe('a/b');
    expect(joinPath('/a/', '', 'b', undefined, '/c')).toBe('a/b/c');
  });

  it('percent-encodes each segment but keeps the slash separators', () => {
    expect(encodeDrivePath('01 - Clients & Prospects/01 - Clients')).toBe(
      '01%20-%20Clients%20%26%20Prospects/01%20-%20Clients',
    );
    // Slashes between segments stay literal so Graph path addressing works.
    expect(encodeDrivePath('a/b').includes('/')).toBe(true);
  });

  it('extracts the drive-relative path from a parentReference.path', () => {
    expect(drivePathFromParentRef('/drives/abc/root:/01 - Clients/Acme')).toBe('01 - Clients/Acme');
    expect(drivePathFromParentRef('/drive/root:')).toBe('');
    expect(drivePathFromParentRef(undefined)).toBeNull();
    expect(drivePathFromParentRef('no-marker-here')).toBeNull();
  });

  it('finds the broker folder segment under the configured root', () => {
    const root = '01 - Clients';
    expect(brokerFolderFromItemPath(root, '/drives/x/root:/01 - Clients/Acme')).toBe('Acme');
    expect(brokerFolderFromItemPath(root, '/drives/x/root:/01 - Clients/Acme/2026')).toBe('Acme');
    // The root folder itself is not a broker folder.
    expect(brokerFolderFromItemPath(root, '/drives/x/root:/01 - Clients')).toBeNull();
    // Items outside the root are ignored.
    expect(brokerFolderFromItemPath(root, '/drives/x/root:/Other/Acme')).toBeNull();
  });

  it('sanitizes a company name into a valid folder name', () => {
    expect(sanitizeFolderName('Élite Broker')).toBe('Élite Broker'); // already valid, unchanged
    expect(sanitizeFolderName('A/B : C* "X"')).toBe('A B C X');
    expect(sanitizeFolderName('Trailing dots...')).toBe('Trailing dots');
    expect(sanitizeFolderName('  spaced  out  ')).toBe('spaced out');
    expect(sanitizeFolderName('***')).toBe('broker'); // nothing usable left
  });

  it('handles a nested root path with spaces and ampersands', () => {
    const root = '01 - Verticales/01 - Brokercomply/01 - Clients & Prospects/01 - Clients';
    const parent = `/drives/x/root:/${root}/Elite Broker`;
    expect(brokerFolderFromItemPath(root, parent)).toBe('Elite Broker');
  });
});
