import { describe, it, expect } from 'vitest';
import { sanitizePath, validatePathWithinBase } from '../src/utils/sanitizer.js';

describe('sanitizePath', () => {
  it('normalizes basic paths', () => {
    expect(sanitizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
  });

  it('normalizes redundant slashes', () => {
    expect(sanitizePath('/home//user///file.txt')).toBe('/home/user/file.txt');
  });

  it('normalizes dot segments', () => {
    expect(sanitizePath('/home/user/./file.txt')).toBe('/home/user/file.txt');
  });

  it('normalizes parent directory references', () => {
    expect(sanitizePath('/home/user/../other/file.txt')).toBe('/home/other/file.txt');
  });

  it('rejects paths with null bytes', () => {
    expect(() => sanitizePath('/home/user\0/file.txt')).toThrow('null bytes');
  });

  it('allows relative paths', () => {
    expect(sanitizePath('file.txt')).toBe('file.txt');
  });
});

describe('validatePathWithinBase', () => {
  it('allows paths within base directory', () => {
    const result = validatePathWithinBase('subdir/file.txt', '/home/user');
    expect(result).toBe('/home/user/subdir/file.txt');
  });

  it('allows absolute paths within base', () => {
    const result = validatePathWithinBase('/home/user/file.txt', '/home/user');
    expect(result).toBe('/home/user/file.txt');
  });

  it('rejects paths that escape base directory', () => {
    expect(() => validatePathWithinBase('../../etc/passwd', '/home/user')).toThrow(
      'Path traversal detected',
    );
  });

  it('rejects absolute paths outside base', () => {
    expect(() => validatePathWithinBase('/etc/passwd', '/home/user')).toThrow(
      'Path traversal detected',
    );
  });
});
