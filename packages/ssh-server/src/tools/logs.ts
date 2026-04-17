import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EventLogger } from '../logging/event-logger.js';
import { parseRelativeTime } from '../utils/formatter.js';

export function registerLogTools(server: McpServer, logger: EventLogger) {
  server.tool(
    'ssh_get_logs',
    'Query the SSH MCP server internal audit logs. Filter by event type, session, host, or time range.',
    {
      kind: z
        .string()
        .optional()
        .describe('Filter by event kind (e.g., command, sftp_upload, connection)'),
      sessionId: z.string().optional().describe('Filter by session ID'),
      host: z.string().optional().describe('Filter by hostname'),
      since: z
        .string()
        .optional()
        .describe("Time range start - ISO date or relative (e.g., '1h', '30m', '7d')"),
      until: z.string().optional().describe('Time range end - ISO date or relative'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Maximum entries to return (default: 100)'),
    },
    async ({ kind, sessionId, host, since, until, limit }) => {
      try {
        let sinceDate: Date | undefined;
        let untilDate: Date | undefined;

        if (since) {
          const relDate = parseRelativeTime(since);
          sinceDate = relDate || new Date(since);
        }
        if (until) {
          const relDate = parseRelativeTime(until);
          untilDate = relDate || new Date(until);
        }

        const entries = await logger.query({
          kind,
          sessionId,
          host,
          since: sinceDate,
          until: untilDate,
          limit: limit || 100,
        });

        if (entries.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No matching log entries found' }],
          };
        }

        const lines = entries.map((e) => {
          const ts = new Date(e.timestamp).toISOString().slice(0, 19).replace('T', ' ');
          const details = e.host ? `${e.username}@${e.host}` : '';
          const meta = e.metadata ? ` ${JSON.stringify(e.metadata)}` : '';
          return `[${ts}] ${e.kind} ${details}${meta}`;
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Log entries (${entries.length}):\n\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Log query failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
