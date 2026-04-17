import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { JobManager } from '../ssh/job-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import { truncateOutput, formatDuration } from '../utils/formatter.js';

export function registerExecBackgroundTools(
  server: McpServer,
  sessionManager: SessionManager,
  jobManager: JobManager,
  logger: EventLogger,
) {
  server.tool(
    'ssh_exec_background',
    'Start a long-running command in the background for async polling. Returns a jobId. Only use when user explicitly wants background/async execution.',
    {
      sessionId: z.string().describe('Active session ID'),
      command: z.string().describe('Command to run in the background'),
      cwd: z.string().optional().describe('Working directory'),
      env: z.record(z.string()).optional().describe('Additional environment variables'),
    },
    async ({ sessionId, command, cwd, env }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const job = await jobManager.start(session, command, { cwd, env });

        logger.log({
          kind: 'exec_background',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          command,
          metadata: { jobId: job.id },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Background job started\n  Job ID: ${job.id}\n  Command: ${command}\n  Status: running\n\nUse ssh_exec_poll to check progress.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Background exec failed: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_exec_poll',
    'Fetch output from a background job previously started with ssh_exec_background. Requires jobId.',
    {
      sessionId: z.string().describe('Active session ID'),
      jobId: z.string().describe('Background job ID'),
      maxOutputBytes: z.number().optional().describe('Max bytes to return (default: 50000)'),
    },
    async ({ sessionId, jobId, maxOutputBytes }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        const job = jobManager.poll(jobId, maxOutputBytes);
        const stdoutResult = truncateOutput(job.stdout, maxOutputBytes || 50000);
        const stderrResult = truncateOutput(job.stderr, maxOutputBytes || 50000);

        const duration = job.endedAt
          ? formatDuration(job.endedAt.getTime() - job.startedAt.getTime())
          : formatDuration(Date.now() - job.startedAt.getTime());

        const text = [
          `Job: ${job.id}`,
          `Command: ${job.command}`,
          `Status: ${job.status}`,
          job.exitCode !== undefined ? `Exit Code: ${job.exitCode}` : null,
          `Duration: ${duration}`,
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
          content: [{ type: 'text' as const, text: `Poll failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_exec_poll_list',
    'List all active background jobs and their status for a specific session.',
    {
      sessionId: z.string().describe('Active session ID'),
    },
    async ({ sessionId }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        const jobs = jobManager.list(sessionId);

        if (jobs.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No background jobs for this session.' }],
          };
        }

        const lines = jobs.map((j, i) => {
          const duration = j.endedAt
            ? formatDuration(j.endedAt.getTime() - j.startedAt.getTime())
            : formatDuration(Date.now() - j.startedAt.getTime());
          const exit = j.exitCode !== undefined ? ` | exit: ${j.exitCode}` : '';
          return `[${i + 1}] ${j.id.slice(0, 8)}... | ${j.status} | ${j.command.slice(0, 60)} | ${duration}${exit}`;
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Background Jobs (${jobs.length})\n\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `List failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_exec_cancel',
    'Stop/kill a background job previously started with ssh_exec_background. Requires a valid jobId — do NOT use for anything else.',
    {
      sessionId: z.string().describe('Active session ID'),
      jobId: z.string().describe('Background job ID to cancel'),
    },
    async ({ sessionId, jobId }) => {
      try {
        sessionManager.getOrThrow(sessionId);
        await jobManager.cancel(jobId);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Job cancelled: ${jobId}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Cancel failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
