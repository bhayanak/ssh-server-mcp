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

export function registerContainerTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
) {
  // ─── ssh_container_list ───
  server.tool(
    'ssh_container_list',
    'List Docker or Podman containers on the remote host with status, ports, and resource usage.',
    {
      sessionId: z.string().describe('Active session ID'),
      all: z.boolean().optional().default(false).describe('Include stopped containers'),
      filterName: z.string().optional().describe('Filter by container name'),
      filterImage: z.string().optional().describe('Filter by image name'),
      filterStatus: z
        .enum(['running', 'exited', 'paused', 'restarting'])
        .optional()
        .describe('Filter by container status'),
      runtime: z
        .enum(['docker', 'podman', 'auto'])
        .optional()
        .default('auto')
        .describe('Container runtime'),
    },
    async ({ sessionId, all, filterName, filterImage, filterStatus, runtime }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);

        // Auto-detect runtime
        let rt = runtime || 'auto';
        if (rt === 'auto') {
          const detect = await execRemote(
            session,
            'which docker 2>/dev/null && echo docker || (which podman 2>/dev/null && echo podman) || echo none',
            5000,
          );
          rt = detect.stdout.trim().split('\n').pop() === 'podman' ? 'podman' : 'docker';
        }

        const flags: string[] = [];
        if (all) flags.push('-a');
        if (filterName) flags.push(`--filter name=${filterName}`);
        if (filterStatus) flags.push(`--filter status=${filterStatus}`);

        let cmd = `${rt} ps ${flags.join(' ')} --format "table {{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}" 2>&1`;
        if (filterImage) cmd += ` | grep -i ${JSON.stringify(filterImage)}`;

        // Also get resource usage for running containers
        const statsCmd = `${rt} stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}" 2>/dev/null | tail -n +2`;

        const [listResult, statsResult] = await Promise.all([
          execRemote(session, cmd, 15000),
          execRemote(session, statsCmd, 15000),
        ]);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_container_list', runtime: rt, all },
        });

        const output = truncateOutput(listResult.stdout.trim(), 50000);
        const stats = statsResult.stdout.trim();
        let text = `Containers on ${session.config.host} (${rt})\n\n${output.text || '(no containers)'}`;
        if (stats) text += `\n\n--- Resource Usage ---\n${stats}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Container list failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_container_logs ───
  server.tool(
    'ssh_container_logs',
    'View Docker or Podman container logs with tail, time filtering, and pattern matching options.',
    {
      sessionId: z.string().describe('Active session ID'),
      container: z.string().describe('Container name or ID'),
      tail: z.number().optional().default(100).describe('Number of trailing log lines'),
      since: z
        .string()
        .optional()
        .describe("Show logs since (e.g. '1h', '30m', '2026-04-17T08:00:00')"),
      filterPattern: z.string().optional().describe('Filter log lines by this pattern (grep)'),
      timestamps: z.boolean().optional().default(true).describe('Show timestamps'),
      runtime: z
        .enum(['docker', 'podman', 'auto'])
        .optional()
        .default('auto')
        .describe('Container runtime'),
    },
    async ({ sessionId, container, tail, since, filterPattern, timestamps, runtime }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);

        let rt = runtime || 'auto';
        if (rt === 'auto') {
          const detect = await execRemote(
            session,
            'which docker 2>/dev/null && echo docker || (which podman 2>/dev/null && echo podman) || echo none',
            5000,
          );
          rt = detect.stdout.trim().split('\n').pop() === 'podman' ? 'podman' : 'docker';
        }

        const parts = [`${rt} logs`];
        if (tail) parts.push(`--tail ${tail}`);
        if (timestamps) parts.push('--timestamps');
        if (since) parts.push(`--since ${JSON.stringify(since)}`);
        parts.push(JSON.stringify(container));

        let cmd = parts.join(' ') + ' 2>&1';
        if (filterPattern) cmd += ` | grep --color=never -E ${JSON.stringify(filterPattern)}`;

        const result = await execRemote(session, cmd, 30000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_container_logs', container, tail, since },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        const text = `Container Logs: ${container} (${rt}, last ${tail} lines${filterPattern ? `, filter: ${filterPattern}` : ''})\n\n${output.text || '(no output)'}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Container logs failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_container_exec ───
  server.tool(
    'ssh_container_exec',
    'Run a command inside a running Docker or Podman container on the remote host.',
    {
      sessionId: z.string().describe('Active session ID'),
      container: z.string().describe('Container name or ID'),
      command: z.string().describe('Command to execute inside the container'),
      user: z.string().optional().describe('Run as this user inside the container'),
      workdir: z.string().optional().describe('Working directory inside the container'),
      env: z.record(z.string()).optional().describe('Environment variables to set'),
      runtime: z
        .enum(['docker', 'podman', 'auto'])
        .optional()
        .default('auto')
        .describe('Container runtime'),
    },
    async ({ sessionId, container, command, user, workdir, env, runtime }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);

        let rt = runtime || 'auto';
        if (rt === 'auto') {
          const detect = await execRemote(
            session,
            'which docker 2>/dev/null && echo docker || (which podman 2>/dev/null && echo podman) || echo none',
            5000,
          );
          rt = detect.stdout.trim().split('\n').pop() === 'podman' ? 'podman' : 'docker';
        }

        const parts = [`${rt} exec`];
        if (user) parts.push(`-u ${JSON.stringify(user)}`);
        if (workdir) parts.push(`-w ${JSON.stringify(workdir)}`);
        if (env) {
          for (const [k, v] of Object.entries(env)) {
            parts.push(`-e ${k}=${JSON.stringify(v)}`);
          }
        }
        parts.push(JSON.stringify(container));
        parts.push(command);

        const result = await execRemote(session, parts.join(' ') + ' 2>&1', 30000);

        logger.log({
          kind: 'exec',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          command: `[container:${container}] ${command}`,
          exitCode: result.exitCode,
          metadata: { tool: 'ssh_container_exec', container, runtime: rt },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        const text = [
          `Container Exec: ${container} (${rt})`,
          `Command: ${command}`,
          `Exit Code: ${result.exitCode}`,
          '',
          output.text || '(no output)',
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Container exec failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
