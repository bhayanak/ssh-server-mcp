import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SFTPManager } from '../src/ssh/sftp-manager.js';

// Mock SFTPWrapper
function createMockSftp() {
  return {
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
    rmdir: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    open: vi.fn(),
    read: vi.fn(),
    close: vi.fn(),
    write: vi.fn(),
  };
}

describe('SFTPManager', () => {
  let manager: SFTPManager;

  beforeEach(() => {
    manager = new SFTPManager();
  });

  it('can be instantiated', () => {
    expect(manager).toBeDefined();
  });

  describe('list', () => {
    it('lists directory contents', async () => {
      const sftp = createMockSftp();
      sftp.readdir.mockImplementation(
        (_path: string, cb: (err: Error | null, list: unknown[]) => void) => {
          cb(null, [
            {
              filename: 'file.txt',
              attrs: {
                size: 1234,
                uid: 1000,
                gid: 1000,
                mode: 0o100644,
                mtime: Math.floor(Date.now() / 1000),
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            },
            {
              filename: 'dir',
              attrs: {
                size: 4096,
                uid: 0,
                gid: 0,
                mode: 0o040755,
                mtime: Math.floor(Date.now() / 1000),
                isDirectory: () => true,
                isFile: () => false,
                isSymbolicLink: () => false,
              },
            },
          ]);
        },
      );

      const entries = await manager.list(sftp as unknown as import('ssh2').SFTPWrapper, '/home');
      expect(entries.length).toBe(2);
      // Directories should come first
      expect(entries[0].name).toBe('dir');
      expect(entries[0].type).toBe('directory');
      expect(entries[1].name).toBe('file.txt');
      expect(entries[1].type).toBe('file');
    });

    it('filters hidden files by default', async () => {
      const sftp = createMockSftp();
      sftp.readdir.mockImplementation(
        (_path: string, cb: (err: Error | null, list: unknown[]) => void) => {
          cb(null, [
            {
              filename: '.hidden',
              attrs: {
                size: 100,
                uid: 1000,
                gid: 1000,
                mode: 0o100644,
                mtime: Math.floor(Date.now() / 1000),
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            },
            {
              filename: 'visible.txt',
              attrs: {
                size: 200,
                uid: 1000,
                gid: 1000,
                mode: 0o100644,
                mtime: Math.floor(Date.now() / 1000),
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            },
          ]);
        },
      );

      const entries = await manager.list(
        sftp as unknown as import('ssh2').SFTPWrapper,
        '/home',
        false,
      );
      expect(entries.length).toBe(1);
      expect(entries[0].name).toBe('visible.txt');
    });

    it('shows hidden files when requested', async () => {
      const sftp = createMockSftp();
      sftp.readdir.mockImplementation(
        (_path: string, cb: (err: Error | null, list: unknown[]) => void) => {
          cb(null, [
            {
              filename: '.hidden',
              attrs: {
                size: 100,
                uid: 1000,
                gid: 1000,
                mode: 0o100644,
                mtime: Math.floor(Date.now() / 1000),
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            },
            {
              filename: 'visible.txt',
              attrs: {
                size: 200,
                uid: 1000,
                gid: 1000,
                mode: 0o100644,
                mtime: Math.floor(Date.now() / 1000),
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            },
          ]);
        },
      );

      const entries = await manager.list(
        sftp as unknown as import('ssh2').SFTPWrapper,
        '/home',
        true,
      );
      expect(entries.length).toBe(2);
    });

    it('rejects on readdir error', async () => {
      const sftp = createMockSftp();
      sftp.readdir.mockImplementation((_path: string, cb: (err: Error | null) => void) => {
        cb(new Error('Permission denied'));
      });

      await expect(
        manager.list(sftp as unknown as import('ssh2').SFTPWrapper, '/root'),
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getSftp', () => {
    it('resolves with sftp wrapper', async () => {
      const mockSftp = createMockSftp();
      const connection = {
        sftp: vi.fn().mockImplementation((cb: (err: Error | null, sftp: unknown) => void) => {
          cb(null, mockSftp);
        }),
      };

      const result = await manager.getSftp(connection as unknown as import('ssh2').Client);
      expect(result).toBe(mockSftp);
    });

    it('rejects on sftp error', async () => {
      const connection = {
        sftp: vi.fn().mockImplementation((cb: (err: Error | null) => void) => {
          cb(new Error('SFTP subsystem denied'));
        }),
      };

      await expect(manager.getSftp(connection as unknown as import('ssh2').Client)).rejects.toThrow(
        'SFTP subsystem denied',
      );
    });
  });
});
