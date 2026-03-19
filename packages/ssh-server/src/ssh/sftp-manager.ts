import { createReadStream, createWriteStream, statSync, existsSync } from 'fs';
import type { SFTPWrapper } from 'ssh2';
import type {
  DirectoryEntry,
  FileStats,
  TransferResult,
  ReadOptions,
  WriteOptions,
} from './types.js';
import { sanitizePath } from '../utils/sanitizer.js';

export class SFTPManager {
  async getSftp(connection: import('ssh2').Client): Promise<SFTPWrapper> {
    return new Promise<SFTPWrapper>((resolve, reject) => {
      connection.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }

  async list(
    sftp: SFTPWrapper,
    remotePath: string,
    showHidden?: boolean,
  ): Promise<DirectoryEntry[]> {
    const safePath = sanitizePath(remotePath);
    return new Promise<DirectoryEntry[]>((resolve, reject) => {
      sftp.readdir(safePath, (err, list) => {
        if (err) {
          reject(err);
          return;
        }
        const entries: DirectoryEntry[] = list
          .filter((item) => showHidden || !item.filename.startsWith('.'))
          .map((item) => {
            const attrs = item.attrs;
            let type: DirectoryEntry['type'] = 'other';
            if (attrs.isDirectory()) type = 'directory';
            else if (attrs.isFile()) type = 'file';
            else if (attrs.isSymbolicLink()) type = 'symlink';

            return {
              name: item.filename,
              type,
              size: attrs.size,
              permissions: formatPermissions(attrs.mode),
              owner: String(attrs.uid),
              group: String(attrs.gid),
              modified: new Date(attrs.mtime * 1000),
            };
          })
          .sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });

        resolve(entries);
      });
    });
  }

  async upload(
    sftp: SFTPWrapper,
    localPath: string,
    remotePath: string,
    maxSizeMb: number,
    overwrite?: boolean,
  ): Promise<TransferResult> {
    const safePath = sanitizePath(remotePath);

    if (!existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    const localStat = statSync(localPath);
    const sizeMb = localStat.size / (1024 * 1024);
    if (sizeMb > maxSizeMb) {
      throw new Error(
        `File size (${sizeMb.toFixed(1)} MB) exceeds maximum upload size (${maxSizeMb} MB)`,
      );
    }

    if (!overwrite) {
      const exists = await this.exists(sftp, safePath);
      if (exists) {
        throw new Error(`Remote file already exists: ${safePath}. Set overwrite: true to replace.`);
      }
    }

    const start = Date.now();
    return new Promise<TransferResult>((resolve, reject) => {
      const readStream = createReadStream(localPath);
      const writeStream = sftp.createWriteStream(safePath);

      writeStream.on('close', () => {
        resolve({
          bytesTransferred: localStat.size,
          durationMs: Date.now() - start,
          remotePath: safePath,
          localPath,
        });
      });

      writeStream.on('error', reject);
      readStream.on('error', reject);
      readStream.pipe(writeStream);
    });
  }

  async download(
    sftp: SFTPWrapper,
    remotePath: string,
    localPath: string,
    maxSizeMb: number,
    overwrite?: boolean,
  ): Promise<TransferResult> {
    const safePath = sanitizePath(remotePath);

    if (!overwrite && existsSync(localPath)) {
      throw new Error(`Local file already exists: ${localPath}. Set overwrite: true to replace.`);
    }

    const remoteStat = await this.stat(sftp, safePath);
    const sizeMb = remoteStat.size / (1024 * 1024);
    if (sizeMb > maxSizeMb) {
      throw new Error(
        `File size (${sizeMb.toFixed(1)} MB) exceeds maximum download size (${maxSizeMb} MB)`,
      );
    }

    const start = Date.now();
    return new Promise<TransferResult>((resolve, reject) => {
      const readStream = sftp.createReadStream(safePath);
      const writeStream = createWriteStream(localPath);

      writeStream.on('close', () => {
        resolve({
          bytesTransferred: remoteStat.size,
          durationMs: Date.now() - start,
          remotePath: safePath,
          localPath,
        });
      });

      writeStream.on('error', reject);
      readStream.on('error', reject);
      readStream.pipe(writeStream);
    });
  }

  async read(sftp: SFTPWrapper, remotePath: string, options?: ReadOptions): Promise<string> {
    const safePath = sanitizePath(remotePath);
    const maxBytes = options?.maxBytes || 50000;
    const encoding = options?.encoding || 'utf-8';
    const offset = options?.offset || 0;

    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      const stream = sftp.createReadStream(safePath, {
        start: offset,
        encoding: undefined,
      });

      stream.on('data', (chunk: Buffer) => {
        if (totalBytes < maxBytes) {
          const remaining = maxBytes - totalBytes;
          chunks.push(chunk.slice(0, remaining));
          totalBytes += chunk.length;
          if (totalBytes >= maxBytes) {
            stream.destroy();
          }
        }
      });

      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString(encoding));
      });

      stream.on('close', () => {
        resolve(Buffer.concat(chunks).toString(encoding));
      });

      stream.on('error', reject);
    });
  }

  async write(
    sftp: SFTPWrapper,
    remotePath: string,
    content: string,
    options?: WriteOptions,
  ): Promise<void> {
    const safePath = sanitizePath(remotePath);

    if (!options?.overwrite && !options?.append) {
      const exists = await this.exists(sftp, safePath);
      if (exists) {
        throw new Error(
          `Remote file already exists: ${safePath}. Set overwrite: true or append: true.`,
        );
      }
    }

    return new Promise<void>((resolve, reject) => {
      const flags = options?.append ? 'a' : 'w';
      const mode = options?.mode ? parseInt(options.mode, 8) : 0o644;

      const stream = sftp.createWriteStream(safePath, { flags, mode });
      stream.on('close', () => resolve());
      stream.on('error', reject);
      stream.end(content, 'utf-8');
    });
  }

  async delete(sftp: SFTPWrapper, remotePath: string, recursive?: boolean): Promise<void> {
    const safePath = sanitizePath(remotePath);

    const stats = await this.stat(sftp, safePath);

    if (stats.type === 'directory') {
      if (!recursive) {
        throw new Error(`Cannot delete directory without recursive: true. Path: ${safePath}`);
      }
      await this.deleteRecursive(sftp, safePath);
    } else {
      return new Promise<void>((resolve, reject) => {
        sftp.unlink(safePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  private async deleteRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
    const entries = await this.list(sftp, dirPath, true);

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.type === 'directory') {
        await this.deleteRecursive(sftp, fullPath);
      } else {
        await new Promise<void>((resolve, reject) => {
          sftp.unlink(fullPath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }

    return new Promise<void>((resolve, reject) => {
      sftp.rmdir(dirPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async stat(sftp: SFTPWrapper, remotePath: string): Promise<FileStats> {
    const safePath = sanitizePath(remotePath);

    return new Promise<FileStats>((resolve, reject) => {
      sftp.stat(safePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        let type: FileStats['type'] = 'file';
        if (stats.isDirectory()) type = 'directory';
        else if (stats.isSymbolicLink()) type = 'symlink';

        resolve({
          path: safePath,
          type,
          size: stats.size,
          permissions: formatPermissions(stats.mode),
          permissionsOctal: (stats.mode & 0o7777).toString(8).padStart(4, '0'),
          uid: stats.uid,
          gid: stats.gid,
          modified: new Date(stats.mtime * 1000),
          accessed: new Date(stats.atime * 1000),
        });
      });
    });
  }

  async mkdir(sftp: SFTPWrapper, remotePath: string, recursive?: boolean): Promise<void> {
    const safePath = sanitizePath(remotePath);

    if (recursive) {
      const parts = safePath.split('/').filter(Boolean);
      let currentPath = safePath.startsWith('/') ? '' : '.';
      for (const part of parts) {
        currentPath = currentPath + '/' + part;
        const exists = await this.exists(sftp, currentPath);
        if (!exists) {
          await new Promise<void>((resolve, reject) => {
            sftp.mkdir(currentPath, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      }
    } else {
      return new Promise<void>((resolve, reject) => {
        sftp.mkdir(safePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async rename(sftp: SFTPWrapper, oldPath: string, newPath: string): Promise<void> {
    const safeOld = sanitizePath(oldPath);
    const safeNew = sanitizePath(newPath);

    return new Promise<void>((resolve, reject) => {
      sftp.rename(safeOld, safeNew, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async exists(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      sftp.stat(remotePath, (err) => {
        resolve(!err);
      });
    });
  }
}

function formatPermissions(mode: number): string {
  const perms = mode & 0o7777;
  const chars = [
    perms & 0o400 ? 'r' : '-',
    perms & 0o200 ? 'w' : '-',
    perms & 0o100 ? 'x' : '-',
    perms & 0o040 ? 'r' : '-',
    perms & 0o020 ? 'w' : '-',
    perms & 0o010 ? 'x' : '-',
    perms & 0o004 ? 'r' : '-',
    perms & 0o002 ? 'w' : '-',
    perms & 0o001 ? 'x' : '-',
  ];
  return chars.join('');
}
