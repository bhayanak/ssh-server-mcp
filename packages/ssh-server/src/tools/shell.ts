import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { ShellManager } from '../ssh/shell-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import type { ServerConfig } from '../config.js';

export function registerShellTools(
  server: McpServer,
  sessionManager: SessionManager,
  shellManager: ShellManager,
  logger: EventLogger,
  config: ServerConfig,
) {
  server.tool(
    'ssh_shell_open',
    'Open an interactive PTY terminal for programs like mysql, python, or top. For simple one-off commands use ssh_exec instead.',
    {
      sessionId: z.string().describe('Active session ID'),
      term: z.string().optional().describe('Terminal type (default: xterm-256color)'),
      cols: z.number().optional().describe('Terminal width in columns (default: 220)'),
      rows: z.number().optional().describe('Terminal height in rows (default: 50)'),
      initialCommand: z
        .string()
        .optional()
        .describe('Command to run immediately after shell opens'),
    },
    async ({ sessionId, term, cols, rows, initialCommand }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const shell = await shellManager.open(session, {
          term: term || config.defaultTerm,
          cols: cols || config.defaultCols,
          rows: rows || config.defaultRows,
          initialCommand,
        });

        logger.log({
          kind: 'shell_open',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { shellId: shell.id, term: shell.term, cols: shell.cols, rows: shell.rows },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Shell opened\n  Shell ID: ${shell.id}\n  Terminal: ${shell.term} (${shell.cols}x${shell.rows})\n  Session: ${sessionId.slice(0, 8)}...\n\nUse ssh_shell_write to send commands and ssh_shell_read to get output.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Shell open failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_shell_write',
    'Type text into an open interactive PTY terminal. Requires shellId from ssh_shell_open.',
    {
      sessionId: z.string().describe('Active session ID'),
      shellId: z.string().describe('Shell channel ID'),
      data: z.string().describe('Data to write to shell stdin (include \\n for Enter)'),
    },
    async ({ sessionId, shellId, data }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        await shellManager.write(shellId, data);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Written ${data.length} bytes to shell ${shellId.slice(0, 8)}...`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Shell write failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_shell_read',
    'Read output from an open interactive PTY terminal. Requires shellId from ssh_shell_open.',
    {
      sessionId: z.string().describe('Active session ID'),
      shellId: z.string().describe('Shell channel ID'),
      timeoutMs: z.number().optional().describe('Max time to wait for output (default: 5000ms)'),
      maxBytes: z.number().optional().describe('Max bytes to return (default: 50000)'),
    },
    async ({ sessionId, shellId, timeoutMs, maxBytes }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        const output = await shellManager.read(
          shellId,
          timeoutMs || config.shellReadTimeoutMs,
          maxBytes,
        );

        if (!output) {
          return {
            content: [{ type: 'text' as const, text: '(no output)' }],
          };
        }

        return { content: [{ type: 'text' as const, text: output }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Shell read failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_shell_resize',
    'Change dimensions of an open PTY terminal window. Requires shellId from ssh_shell_open.',
    {
      sessionId: z.string().describe('Active session ID'),
      shellId: z.string().describe('Shell channel ID'),
      cols: z.number().describe('New width in columns'),
      rows: z.number().describe('New height in rows'),
    },
    async ({ sessionId, shellId, cols, rows }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        await shellManager.resize(shellId, cols, rows);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Shell ${shellId.slice(0, 8)}... resized to ${cols}x${rows}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Shell resize failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_shell_close',
    'Close an interactive PTY terminal. Requires shellId from ssh_shell_open.',
    {
      sessionId: z.string().describe('Active session ID'),
      shellId: z.string().describe('Shell channel ID to close'),
    },
    async ({ sessionId, shellId }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        await shellManager.close(shellId);

        logger.log({
          kind: 'shell_close',
          sessionId,
          metadata: { shellId },
        });

        return {
          content: [{ type: 'text' as const, text: `Shell closed: ${shellId}` }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Shell close failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_shell_list',
    'List open PTY terminals for a specific session.',
    {
      sessionId: z.string().describe('Active session ID'),
    },
    async ({ sessionId }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        const shells = shellManager.list(sessionId);

        if (shells.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No open shells for this session.' }],
          };
        }

        const lines = shells.map(
          (s, i) =>
            `[${i + 1}] ${s.id.slice(0, 8)}... | ${s.term} (${s.cols}x${s.rows}) | buffer: ${s.bufferSize} bytes`,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: `Open Shells (${shells.length})\n\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Shell list failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
