import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { ShellManager } from '../ssh/shell-manager.js';
import type { JobManager } from '../ssh/job-manager.js';
import type { PortForwardManager } from '../ssh/port-forward.js';
import type { EventLogger } from '../logging/event-logger.js';
import { formatRelativeTime } from '../utils/formatter.js';

export function registerSessionTools(
  server: McpServer,
  sessionManager: SessionManager,
  shellManager: ShellManager,
  jobManager: JobManager,
  portForwardManager: PortForwardManager,
  _logger: EventLogger,
) {
  server.tool(
    'ssh_connect',
    'REQUIRED FIRST STEP: Connect to a remote server via SSH using host, username, and password or key. Must be called before any other ssh_ tool.',
    {
      host: z.string().describe('Hostname or IP address of the remote server'),
      port: z.number().optional().default(22).describe('SSH port number'),
      username: z.string().describe('SSH username'),
      password: z
        .string()
        .optional()
        .describe('Password for authentication (use privateKey for key-based auth)'),
      privateKey: z
        .string()
        .optional()
        .describe('Private key content (PEM format) for key-based authentication'),
      privateKeyPath: z
        .string()
        .optional()
        .describe('Path to private key file on local machine (e.g. ~/.ssh/id_rsa)'),
      passphrase: z.string().optional().describe('Passphrase for encrypted private key'),
      label: z
        .string()
        .optional()
        .describe("Human-readable label for this session (e.g. 'prod-web-1')"),
    },
    async ({ host, port, username, password, privateKey, privateKeyPath, passphrase, label }) => {
      try {
        if (!password && !privateKey && !privateKeyPath) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: At least one auth method required (password, privateKey, or privateKeyPath)',
              },
            ],
            isError: true,
          };
        }

        const config = {
          host,
          port: port || 22,
          username,
          password,
          privateKey,
          privateKeyPath,
          passphrase,
          label,
        };

        const session = await sessionManager.create(config);

        const text = [
          'Session Connected',
          `  Session ID: ${session.id}`,
          `  Host: ${session.config.host}:${session.config.port}`,
          `  Username: ${session.config.username}`,
          session.label ? `  Label: ${session.label}` : null,
          session.serverBanner ? `  Server Banner: ${session.serverBanner}` : null,
          `  Auth Method: ${session.authMethod}`,
          `  Active Sessions: ${sessionManager.sessionCount} / ${sessionManager.maxSessions}`,
        ]
          .filter(Boolean)
          .join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Connection failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_disconnect',
    'Close and disconnect an active SSH session by its sessionId.',
    {
      sessionId: z.string().describe('Session ID to disconnect'),
    },
    async ({ sessionId }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        shellManager.closeAllForSession(sessionId);
        jobManager.cleanup(sessionId);
        portForwardManager.closeAllForSession(sessionId);
        await sessionManager.remove(sessionId);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Session disconnected: ${sessionId}\n  Host: ${session.config.host}\n  Active Sessions: ${sessionManager.sessionCount} / ${sessionManager.maxSessions}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Disconnect failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_list_sessions',
    'Show all active SSH connections with their host, user, and resource details.',
    {},
    async () => {
      const sessions = sessionManager.list();

      if (sessions.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Active SSH Sessions (0 / ${sessionManager.maxSessions} slots)\n\nNo active sessions. Use ssh_connect to create one.`,
            },
          ],
        };
      }

      const lines = sessions.map((s, i) => {
        const shellCount = shellManager.countForSession(s.id);
        const jobCount = jobManager.countForSession(s.id);
        const label = s.label ? ` | ${s.label}` : '';
        return `[${i + 1}] ${s.id.slice(0, 8)}...${label} | ${s.username}@${s.host}:${s.port} | connected ${formatRelativeTime(s.createdAt)} | ${shellCount} shells, ${jobCount} bg jobs`;
      });

      const text = `Active SSH Sessions (${sessions.length} / ${sessionManager.maxSessions} slots)\n\n${lines.join('\n')}`;
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'ssh_session_ping',
    'Test if an SSH session is alive and measure its round-trip latency.',
    {
      sessionId: z.string().describe('Session ID to ping'),
    },
    async ({ sessionId }) => {
      try {
        const result = await sessionManager.ping(sessionId);
        const status = result.alive ? 'ALIVE' : 'DEAD';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Session ${sessionId.slice(0, 8)}...: ${status}\n  Latency: ${result.latencyMs}ms`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Ping failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
