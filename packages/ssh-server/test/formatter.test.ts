import { describe, it, expect } from 'vitest';
import {
  stripAnsi,
  truncateOutput,
  formatDuration,
  formatBytes,
  formatRelativeTime,
  parseRelativeTime,
} from '../src/utils/formatter.js';

describe('stripAnsi', () => {
  it('removes ANSI color codes', () => {
    expect(stripAnsi('\x1B[31mred\x1B[0m')).toBe('red');
  });

  it('removes cursor movement sequences', () => {
    expect(stripAnsi('\x1B[2Jhello\x1B[H')).toBe('hello');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('truncateOutput', () => {
  it('returns text unchanged when within limit', () => {
    const result = truncateOutput('hello', 100);
    expect(result.text).toBe('hello');
    expect(result.truncated).toBe(false);
  });

  it('truncates text exceeding limit', () => {
    const result = truncateOutput('abcdef', 3);
    expect(result.text).toContain('abc');
    expect(result.text).toContain('truncated');
    expect(result.truncated).toBe(true);
  });

  it('uses default limit of 50000', () => {
    const short = 'a'.repeat(100);
    expect(truncateOutput(short).truncated).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(42)).toBe('42ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });
});

describe('formatRelativeTime', () => {
  it('formats seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe('30s ago');
  });

  it('formats minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('5m ago');
  });

  it('formats hours ago', () => {
    const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2h ago');
  });

  it('formats days ago', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('3d ago');
  });
});

describe('parseRelativeTime', () => {
  it('parses seconds', () => {
    const result = parseRelativeTime('30s');
    expect(result).toBeInstanceOf(Date);
    const diff = Date.now() - result!.getTime();
    expect(diff).toBeGreaterThanOrEqual(29000);
    expect(diff).toBeLessThanOrEqual(31000);
  });

  it('parses minutes', () => {
    const result = parseRelativeTime('5m');
    expect(result).toBeInstanceOf(Date);
  });

  it('parses hours', () => {
    const result = parseRelativeTime('2h');
    expect(result).toBeInstanceOf(Date);
  });

  it('parses days', () => {
    const result = parseRelativeTime('7d');
    expect(result).toBeInstanceOf(Date);
  });

  it('returns null for invalid input', () => {
    expect(parseRelativeTime('abc')).toBeNull();
    expect(parseRelativeTime('5x')).toBeNull();
    expect(parseRelativeTime('')).toBeNull();
  });
});
