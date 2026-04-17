import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { SFTPManager } from '../ssh/sftp-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import type { ServerConfig } from '../config.js';
import { formatBytes, formatDuration } from '../utils/formatter.js';

export function registerSftpTools(
  server: McpServer,
  sessionManager: SessionManager,
  sftpManager: SFTPManager,
  logger: EventLogger,
  config: ServerConfig,
) {
  server.tool(
    'ssh_sftp_list',
    'List directory contents on the remote server (like ls -la). Shows names, sizes, permissions.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Remote directory path to list'),
      showHidden: z.boolean().optional().describe('Include hidden files (default: false)'),
    },
    async ({ sessionId, remotePath, showHidden }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        const entries = await sftpManager.list(sftp, remotePath, showHidden);

        logger.log({
          kind: 'sftp_list',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          path: remotePath,
        });

        const lines = entries.map((e) => {
          const typeChar = e.type === 'directory' ? 'd' : e.type === 'symlink' ? 'l' : '-';
          const suffix = e.type === 'directory' ? '/' : '';
          const date = e.modified.toISOString().slice(0, 16).replace('T', ' ');
          return `${typeChar}${e.permissions}  ${e.owner.padEnd(6)}  ${e.group.padEnd(6)}  ${formatBytes(e.size).padStart(10)}  ${date}  ${e.name}${suffix}`;
        });

        const text = `Directory: ${remotePath}\nTotal: ${entries.length} items\n\n${lines.join('\n')}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `SFTP list failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sftp_upload',
    'Upload a local file to the remote server via SFTP. Validates file size limits.',
    {
      sessionId: z.string().describe('Active session ID'),
      localPath: z.string().describe('Path to file on local machine'),
      remotePath: z.string().describe('Destination path on remote host'),
      overwrite: z.boolean().optional().describe('Overwrite if file exists (default: false)'),
    },
    async ({ sessionId, localPath, remotePath, overwrite }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        const result = await sftpManager.upload(
          sftp,
          localPath,
          remotePath,
          config.maxUploadSizeMb,
          overwrite,
        );

        logger.log({
          kind: 'sftp_upload',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          path: remotePath,
          durationMs: result.durationMs,
          metadata: { bytes: result.bytesTransferred, localPath },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Upload complete\n  Local: ${localPath}\n  Remote: ${remotePath}\n  Size: ${formatBytes(result.bytesTransferred)}\n  Duration: ${formatDuration(result.durationMs)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Upload failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sftp_download',
    'Download a file from the remote server to the local machine via SFTP.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Path to file on remote host'),
      localPath: z.string().describe('Destination path on local machine'),
      overwrite: z.boolean().optional().describe('Overwrite if local file exists (default: false)'),
    },
    async ({ sessionId, remotePath, localPath, overwrite }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        const result = await sftpManager.download(
          sftp,
          remotePath,
          localPath,
          config.maxDownloadSizeMb,
          overwrite,
        );

        logger.log({
          kind: 'sftp_download',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          path: remotePath,
          durationMs: result.durationMs,
          metadata: { bytes: result.bytesTransferred, localPath },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Download complete\n  Remote: ${remotePath}\n  Local: ${localPath}\n  Size: ${formatBytes(result.bytesTransferred)}\n  Duration: ${formatDuration(result.durationMs)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Download failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sftp_read',
    'Read a remote file text content in-place without downloading. Good for configs and logs.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Path to file on remote host'),
      encoding: z.string().optional().describe('Text encoding (default: utf-8)'),
      maxBytes: z.number().optional().describe('Max bytes to read (default: 50000)'),
      offset: z.number().optional().describe('Byte offset to start reading from (default: 0)'),
    },
    async ({ sessionId, remotePath, encoding, maxBytes, offset }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        const content = await sftpManager.read(sftp, remotePath, {
          encoding: (encoding as BufferEncoding) || 'utf-8',
          maxBytes,
          offset,
        });

        logger.log({
          kind: 'sftp_read',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          path: remotePath,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `File: ${remotePath}\nSize: ${content.length} bytes read\n\n${content}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `SFTP read failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sftp_write',
    'Create or overwrite a remote file with text content. Good for configs and scripts.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Path to file on remote host'),
      content: z.string().describe('Content to write to the file'),
      mode: z.string().optional().describe("File permissions (e.g. '0644'). Default: '0644'"),
      overwrite: z.boolean().optional().describe('Overwrite if file exists (default: false)'),
      append: z
        .boolean()
        .optional()
        .describe('Append to file instead of overwriting (default: false)'),
    },
    async ({ sessionId, remotePath, content, mode, overwrite, append }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        await sftpManager.write(sftp, remotePath, content, { mode, overwrite, append });

        logger.log({
          kind: 'sftp_write',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          path: remotePath,
          metadata: { bytes: content.length, append },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `File written: ${remotePath}\n  Size: ${formatBytes(content.length)}\n  Mode: ${append ? 'append' : 'write'}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `SFTP write failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sftp_delete',
    'Delete a file or directory on the remote server. Recursive delete requires explicit opt-in.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Path to file or directory on remote host'),
      recursive: z
        .boolean()
        .optional()
        .describe('Recursively delete directory contents (default: false)'),
    },
    async ({ sessionId, remotePath, recursive }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        await sftpManager.delete(sftp, remotePath, recursive);

        logger.log({
          kind: 'sftp_delete',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          path: remotePath,
          metadata: { recursive },
        });

        return {
          content: [{ type: 'text' as const, text: `Deleted: ${remotePath}` }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `SFTP delete failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sftp_stat',
    'Get file metadata: size, permissions, owner, timestamps of a remote file or directory.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Path to file or directory'),
    },
    async ({ sessionId, remotePath }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sftp = await sftpManager.getSftp(session.connection);
        const stats = await sftpManager.stat(sftp, remotePath);

        const text = [
          `Path: ${stats.path}`,
          `Type: ${stats.type}`,
          `Size: ${formatBytes(stats.size)}`,
          `Permissions: ${stats.permissions} (${stats.permissionsOctal})`,
          `Owner: uid ${stats.uid}`,
          `Group: gid ${stats.gid}`,
          `Modified: ${stats.modified.toISOString()}`,
          `Accessed: ${stats.accessed.toISOString()}`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `SFTP stat failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
