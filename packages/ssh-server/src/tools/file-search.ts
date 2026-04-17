import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import type { SSHSession } from '../ssh/types.js';
import { stripAnsi, truncateOutput } from '../utils/formatter.js';

function execRemote(
  session: Pick<SSHSession, 'connection' | 'config'>,
  command: string,
  timeoutMs: number = 15000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Command timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    session.connection.exec(
      command,
      (
        err: Error | undefined,
        stream: NodeJS.ReadableStream & { stderr?: NodeJS.ReadableStream },
      ) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }
        let stdout = '';
        let stderr = '';
        stream.on('data', (d: Buffer) => {
          stdout += d.toString();
        });
        stream.stderr?.on('data', (d: Buffer) => {
          stderr += d.toString();
        });
        stream.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({ stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), exitCode: code ?? -1 });
        });
      },
    );
  });
}

export function registerFileSearchTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
) {
  // ─── ssh_find ───
  server.tool(
    'ssh_find',
    'Locate files on the remote server by name pattern (like Linux find). Use when asked to find, locate, or search for a file by name or path.',
    {
      sessionId: z.string().describe('Active session ID'),
      path: z.string().describe('Starting directory for search'),
      name: z.string().optional().describe("Filename pattern (glob, e.g. '*.conf', '*.log')"),
      type: z
        .enum(['file', 'directory', 'symlink', 'any'])
        .optional()
        .default('any')
        .describe('Filter by entry type'),
      maxDepth: z.number().optional().describe('Max directory depth (default: unlimited)'),
      modifiedWithin: z
        .string()
        .optional()
        .describe("Files modified within this duration (e.g. '24h', '7d', '30m')"),
      sizeRange: z.string().optional().describe("Size filter (e.g. '+10M', '-1K')"),
      limit: z.number().optional().default(100).describe('Max results to return'),
    },
    async ({ sessionId, path, name, type, maxDepth, modifiedWithin, sizeRange, limit }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);

        const parts = ['find', JSON.stringify(path)];

        if (maxDepth !== undefined) parts.push(`-maxdepth ${maxDepth}`);
        if (type && type !== 'any') {
          const typeMap: Record<string, string> = { file: 'f', directory: 'd', symlink: 'l' };
          parts.push(`-type ${typeMap[type]}`);
        }
        if (name) parts.push(`-name ${JSON.stringify(name)}`);
        if (modifiedWithin) {
          const match = modifiedWithin.match(/^(\d+)(m|h|d)$/);
          if (match) {
            const val = parseInt(match[1], 10);
            const unit = match[2];
            const minutes = unit === 'd' ? val * 1440 : unit === 'h' ? val * 60 : val;
            parts.push(`-mmin -${minutes}`);
          }
        }
        if (sizeRange) parts.push(`-size ${sizeRange}`);

        // Use -printf for structured output, with fallback for macOS
        const cmd = `${parts.join(' ')} -printf '%M %8s %TY-%Tm-%Td %TH:%TM %p\\n' 2>/dev/null | head -${limit || 100} || ${parts.join(' ')} -exec ls -ld {} \\; 2>/dev/null | head -${limit || 100}`;

        const result = await execRemote(session, cmd, 30000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_find', path, name, type },
        });

        const lines = result.stdout.trim().split('\n').filter(Boolean);
        const text =
          lines.length > 0
            ? `Found ${lines.length} result(s) in ${path}\n\n${lines.join('\n')}`
            : `No results found in ${path}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Find failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_grep ───
  server.tool(
    'ssh_grep',
    'Search text patterns inside remote files using grep. Returns file paths, line numbers, and matching lines.',
    {
      sessionId: z.string().describe('Active session ID'),
      pattern: z.string().describe('Search pattern (regex or literal)'),
      path: z.string().describe('File or directory to search in'),
      recursive: z.boolean().optional().default(true).describe('Search recursively in directories'),
      caseSensitive: z.boolean().optional().default(true).describe('Case-sensitive search'),
      contextLines: z.number().optional().default(2).describe('Lines of context around each match'),
      includePattern: z
        .string()
        .optional()
        .describe("Only search files matching this glob (e.g. '*.log')"),
      excludePattern: z
        .string()
        .optional()
        .describe("Skip files matching this glob (e.g. '*.min.js')"),
      maxMatches: z.number().optional().default(50).describe('Maximum number of matches to return'),
    },
    async ({
      sessionId,
      pattern,
      path,
      recursive,
      caseSensitive,
      contextLines,
      includePattern,
      excludePattern,
      maxMatches,
    }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);

        const parts = ['grep', '-n', '--color=never'];
        if (!caseSensitive) parts.push('-i');
        if (recursive) parts.push('-r');
        if (contextLines && contextLines > 0) parts.push(`-C ${contextLines}`);
        if (includePattern) parts.push(`--include=${JSON.stringify(includePattern)}`);
        if (excludePattern) parts.push(`--exclude=${JSON.stringify(excludePattern)}`);
        parts.push('-m', String(maxMatches || 50));
        parts.push('--', JSON.stringify(pattern), JSON.stringify(path));

        const cmd = parts.join(' ');
        const result = await execRemote(session, cmd, 30000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_grep', pattern, path },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        const lines = output.text.split('\n').filter(Boolean);
        const text =
          lines.length > 0
            ? `Found ${lines.length} match line(s) for "${pattern}" in ${path}\n\n${output.text}`
            : `No matches found for "${pattern}" in ${path}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Grep failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_diff ───
  server.tool(
    'ssh_diff',
    'Show differences between two remote files as a unified diff.',
    {
      sessionId: z.string().describe('Active session ID'),
      pathA: z.string().describe('First file path'),
      pathB: z.string().describe('Second file path'),
      contextLines: z.number().optional().default(3).describe('Lines of context around changes'),
    },
    async ({ sessionId, pathA, pathB, contextLines }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const ctx = contextLines ?? 3;
        const cmd = `diff -u --label ${JSON.stringify(pathA)} --label ${JSON.stringify(pathB)} -U ${ctx} ${JSON.stringify(pathA)} ${JSON.stringify(pathB)} 2>&1; echo "EXIT:$?"`;
        const result = await execRemote(session, cmd, 15000);

        // diff returns exit code 1 when files differ — that's normal
        const output = result.stdout;
        const exitMatch = output.match(/EXIT:(\d+)$/);
        const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : result.exitCode;
        const diffOutput = output.replace(/EXIT:\d+$/, '').trim();

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_diff', pathA, pathB },
        });

        let text: string;
        if (exitCode === 0) {
          text = `Files are identical:\n  ${pathA}\n  ${pathB}`;
        } else if (exitCode === 1) {
          text = `Diff: ${pathA} vs ${pathB}\n\n${diffOutput}`;
        } else {
          text = `Diff error (exit ${exitCode}):\n${diffOutput}`;
        }

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Diff failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_tail ───
  server.tool(
    'ssh_tail',
    'Show the last N lines of a remote file (tail). Good for quick log inspection.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('File to tail (typically a log file)'),
      lines: z.number().optional().default(50).describe('Number of trailing lines to return'),
      filterPattern: z.string().optional().describe('Only return lines matching this regex/string'),
    },
    async ({ sessionId, remotePath, lines, filterPattern }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const n = lines || 50;
        let cmd = `tail -n ${n} ${JSON.stringify(remotePath)}`;
        if (filterPattern) {
          cmd += ` | grep --color=never -E ${JSON.stringify(filterPattern)}`;
        }

        const result = await execRemote(session, cmd, 15000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_tail', remotePath, lines: n },
        });

        const output = stripAnsi(result.stdout.trim());
        const text = output
          ? `Tail: ${remotePath} (last ${n} lines${filterPattern ? `, filter: ${filterPattern}` : ''})\n\n${output}`
          : `No output from ${remotePath}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Tail failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_checksum ───
  server.tool(
    'ssh_checksum',
    'Compute a hash (md5/sha256/sha512) of a remote file to verify integrity.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePath: z.string().describe('Path to the remote file'),
      algorithm: z
        .enum(['md5', 'sha1', 'sha256', 'sha512'])
        .optional()
        .default('sha256')
        .describe('Hash algorithm'),
    },
    async ({ sessionId, remotePath, algorithm }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const algo = algorithm || 'sha256';
        const cmdMap: Record<string, string> = {
          md5: `md5sum ${JSON.stringify(remotePath)} 2>/dev/null || md5 ${JSON.stringify(remotePath)} 2>/dev/null`,
          sha1: `sha1sum ${JSON.stringify(remotePath)} 2>/dev/null || shasum ${JSON.stringify(remotePath)} 2>/dev/null`,
          sha256: `sha256sum ${JSON.stringify(remotePath)} 2>/dev/null || shasum -a 256 ${JSON.stringify(remotePath)} 2>/dev/null`,
          sha512: `sha512sum ${JSON.stringify(remotePath)} 2>/dev/null || shasum -a 512 ${JSON.stringify(remotePath)} 2>/dev/null`,
        };

        const result = await execRemote(session, cmdMap[algo], 15000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_checksum', remotePath, algorithm: algo },
        });

        const hash = result.stdout.trim().split(/\s+/)[0] || '(unknown)';
        const text = `Checksum (${algo})\n  File: ${remotePath}\n  Hash: ${hash}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Checksum failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
