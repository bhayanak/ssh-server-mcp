import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import type { ServerConfig } from '../config.js';
import { stripAnsi, truncateOutput, formatDuration } from '../utils/formatter.js';

export function registerExecTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
  config: ServerConfig,
) {
  server.tool(
    'ssh_exec',
    'Execute a command on the remote host and wait for it to complete. Returns stdout, stderr, and exit code.',
    {
      sessionId: z.string().describe('Active session ID'),
      command: z.string().describe('Command to execute on the remote host'),
      cwd: z.string().optional().describe('Working directory for command execution'),
      env: z.record(z.string()).optional().describe('Additional environment variables'),
      timeoutMs: z.number().optional().describe('Command timeout in ms (default: 30000)'),
      maxOutputBytes: z
        .number()
        .optional()
        .describe('Truncate output after this many bytes (default: 50000)'),
    },
    async ({ sessionId, command, cwd, env, timeoutMs, maxOutputBytes }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const timeout = timeoutMs || config.execTimeoutMs;
        const maxBytes = maxOutputBytes || 50000;

        const fullCommand = cwd ? `cd ${cwd} && ${command}` : command;
        const envStr = env
          ? Object.entries(env)
              .map(([k, v]) => `${k}=${v}`)
              .join(' ') + ' '
          : '';

        const start = Date.now();

        const result = await new Promise<{
          stdout: string;
          stderr: string;
          exitCode: number;
          signal?: string;
        }>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Command timed out after ${timeout}ms`));
          }, timeout);

          session.connection.exec(`${envStr}${fullCommand}`, (err, stream) => {
            if (err) {
              clearTimeout(timer);
              reject(err);
              return;
            }

            let stdout = '';
            let stderr = '';

            stream.on('data', (data: Buffer) => {
              stdout += data.toString('utf-8');
            });

            stream.stderr?.on('data', (data: Buffer) => {
              stderr += data.toString('utf-8');
            });

            stream.on('close', (code: number | null, signal?: string) => {
              clearTimeout(timer);
              resolve({
                stdout: stripAnsi(stdout),
                stderr: stripAnsi(stderr),
                exitCode: code ?? -1,
                signal,
              });
            });
          });
        });

        const durationMs = Date.now() - start;
        const stdoutResult = truncateOutput(result.stdout, maxBytes);
        const stderrResult = truncateOutput(result.stderr, maxBytes);

        logger.log({
          kind: 'exec',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          command,
          exitCode: result.exitCode,
          durationMs,
        });

        const text = [
          `Command: ${command}`,
          `Exit Code: ${result.exitCode}`,
          result.signal ? `Signal: ${result.signal}` : null,
          `Duration: ${formatDuration(durationMs)}`,
          '',
          '--- stdout ---',
          stdoutResult.text || '(empty)',
          '',
          '--- stderr ---',
          stderrResult.text || '(empty)',
        ]
          .filter((line) => line !== null)
          .join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Exec failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_sudo_exec',
    'Execute a command with sudo privileges. Password is injected via stdin and never logged.',
    {
      sessionId: z.string().describe('Active session ID'),
      command: z.string().describe('Command to execute with sudo privileges'),
      password: z.string().describe('Sudo password (injected via stdin, never logged)'),
      cwd: z.string().optional().describe('Working directory'),
      timeoutMs: z.number().optional().describe('Command timeout in ms'),
    },
    async ({ sessionId, command, password, cwd, timeoutMs }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const timeout = timeoutMs || config.execTimeoutMs;

        const sudoCommand = cwd ? `cd ${cwd} && sudo -S ${command}` : `sudo -S ${command}`;

        const start = Date.now();

        const result = await new Promise<{
          stdout: string;
          stderr: string;
          exitCode: number;
        }>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Sudo command timed out after ${timeout}ms`));
          }, timeout);

          session.connection.exec(sudoCommand, (err, stream) => {
            if (err) {
              clearTimeout(timer);
              reject(err);
              return;
            }

            // Inject password via stdin
            stream.write(password + '\n');

            let stdout = '';
            let stderr = '';

            stream.on('data', (data: Buffer) => {
              stdout += data.toString('utf-8');
            });

            stream.stderr?.on('data', (data: Buffer) => {
              const text = data.toString('utf-8');
              // Filter out the sudo password prompt
              if (!text.includes('[sudo] password') && !text.includes('Password:')) {
                stderr += text;
              }
            });

            stream.on('close', (code: number | null) => {
              clearTimeout(timer);
              resolve({
                stdout: stripAnsi(stdout),
                stderr: stripAnsi(stderr),
                exitCode: code ?? -1,
              });
            });
          });
        });

        const durationMs = Date.now() - start;

        logger.log({
          kind: 'sudo_exec',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          command, // Log command but NEVER log password
          exitCode: result.exitCode,
          durationMs,
        });

        const text = [
          `Sudo Command: ${command}`,
          `Exit Code: ${result.exitCode}`,
          `Duration: ${formatDuration(durationMs)}`,
          '',
          '--- stdout ---',
          result.stdout || '(empty)',
          '',
          '--- stderr ---',
          result.stderr || '(empty)',
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Sudo exec failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
