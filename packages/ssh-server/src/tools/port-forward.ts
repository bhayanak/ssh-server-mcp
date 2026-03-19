import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { PortForwardManager } from '../ssh/port-forward.js';
import type { EventLogger } from '../logging/event-logger.js';

export function registerPortForwardTools(
  server: McpServer,
  sessionManager: SessionManager,
  portForwardManager: PortForwardManager,
  logger: EventLogger,
) {
  server.tool(
    'ssh_port_forward_local',
    'Create a local port forward (SSH -L). Binds a local port and tunnels traffic to a remote host:port through the SSH connection.',
    {
      sessionId: z.string().describe('Active session ID'),
      localPort: z.number().int().min(1).max(65535).describe('Local port to bind'),
      remoteHost: z.string().describe('Remote host to forward to (default: 127.0.0.1)').optional(),
      remotePort: z.number().int().min(1).max(65535).describe('Remote port to forward to'),
      localHost: z.string().describe('Local address to bind (default: 127.0.0.1)').optional(),
    },
    async ({ sessionId, localPort, remoteHost, remotePort, localHost }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const forward = await portForwardManager.createLocal(
          session,
          localPort,
          remoteHost || '127.0.0.1',
          remotePort,
          localHost || '127.0.0.1',
        );

        logger.log({
          kind: 'port_forward_create',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: {
            type: 'local',
            localPort,
            remotePort,
            remoteHost: remoteHost || '127.0.0.1',
          },
        });

        const text = [
          `Local port forward created`,
          `  ID: ${forward.id}`,
          `  Local: ${forward.localAddress}:${forward.localPort}`,
          `  Remote: ${forward.remoteHost}:${forward.remotePort}`,
          `  Status: active`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Local forward failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_port_forward_remote',
    'Create a remote port forward (SSH -R). Binds a port on the remote host and tunnels traffic back to a local host:port.',
    {
      sessionId: z.string().describe('Active session ID'),
      remotePort: z.number().int().min(1).max(65535).describe('Remote port to bind'),
      localPort: z.number().int().min(1).max(65535).describe('Local port to forward to'),
      localHost: z.string().describe('Local address to forward to (default: 127.0.0.1)').optional(),
      remoteHost: z.string().describe('Remote bind address (default: 127.0.0.1)').optional(),
    },
    async ({ sessionId, remotePort, localPort, localHost, remoteHost }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const forward = await portForwardManager.createRemote(
          session,
          remotePort,
          localHost || '127.0.0.1',
          localPort,
          remoteHost || '127.0.0.1',
        );

        logger.log({
          kind: 'port_forward_create',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: {
            type: 'remote',
            remotePort,
            localPort,
            localHost: localHost || '127.0.0.1',
          },
        });

        const text = [
          `Remote port forward created`,
          `  ID: ${forward.id}`,
          `  Remote: ${forward.remoteHost}:${forward.remotePort}`,
          `  Local: ${forward.localAddress}:${forward.localPort}`,
          `  Status: active`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Remote forward failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_port_forward_list',
    'List all active port forwards across all sessions or for a specific session',
    {
      sessionId: z.string().optional().describe('Filter by session ID (omit for all)'),
    },
    async ({ sessionId }) => {
      try {
        if (!sessionId) {
          return {
            content: [
              { type: 'text' as const, text: 'sessionId is required to list port forwards' },
            ],
            isError: true,
          };
        }
        const forwards = portForwardManager.list(sessionId);

        if (forwards.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No active port forwards' }],
          };
        }

        const lines = forwards.map((f) => {
          const dir = f.type === 'local' ? '→' : '←';
          return `[${f.id}] ${f.type.toUpperCase()}: ${f.localAddress}:${f.localPort} ${dir} ${f.remoteHost}:${f.remotePort} (session: ${f.sessionId.slice(0, 8)}…)`;
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Active port forwards (${forwards.length}):\n\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `List forwards failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'ssh_port_forward_remove',
    'Remove (close) an active port forward by its ID',
    {
      forwardId: z.string().describe('Port forward ID to remove'),
    },
    async ({ forwardId }) => {
      try {
        await portForwardManager.remove(forwardId);

        return {
          content: [{ type: 'text' as const, text: `Port forward ${forwardId} removed` }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Remove forward failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
