import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { EventLogger } from '../logging/event-logger.js';

const SYSTEM_COMMANDS: Record<string, string> = {
  os: 'uname -a',
  uptime: 'uptime',
  memory: 'free -h 2>/dev/null || vm_stat 2>/dev/null',
  disk: 'df -h',
  cpu: 'nproc 2>/dev/null && cat /proc/cpuinfo 2>/dev/null | head -30 || sysctl -n hw.ncpu 2>/dev/null',
  network: 'ip addr 2>/dev/null || ifconfig 2>/dev/null',
  hostname: 'hostname -f 2>/dev/null || hostname',
  load: 'cat /proc/loadavg 2>/dev/null || sysctl -n vm.loadavg 2>/dev/null',
  users: 'who',
  processes: 'ps aux --sort=-%cpu 2>/dev/null | head -20 || ps aux | head -20',
};

export function registerSystemInfoTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
) {
  server.tool(
    'ssh_system_info',
    'Gather system information from the remote host. Returns OS, uptime, memory, disk, CPU, network, and other details.',
    {
      sessionId: z.string().describe('Active session ID'),
      categories: z
        .array(
          z.enum([
            'os',
            'uptime',
            'memory',
            'disk',
            'cpu',
            'network',
            'hostname',
            'load',
            'users',
            'processes',
          ]),
        )
        .optional()
        .describe('Info categories to collect (default: all)'),
    },
    async ({ sessionId, categories }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const selectedCategories = categories || Object.keys(SYSTEM_COMMANDS);
        const sections: string[] = [];

        for (const cat of selectedCategories) {
          const cmd = SYSTEM_COMMANDS[cat];
          if (!cmd) continue;

          try {
            const output = await new Promise<string>((resolve, reject) => {
              session.connection.exec(cmd, (err, stream) => {
                if (err) {
                  reject(err);
                  return;
                }
                let data = '';
                stream.on('data', (chunk: Buffer) => {
                  data += chunk.toString();
                });
                stream.stderr.on('data', () => {
                  // ignore stderr for system info commands
                });
                stream.on('close', () => resolve(data.trim()));
                stream.on('error', reject);
              });
            });

            if (output) {
              sections.push(`=== ${cat.toUpperCase()} ===\n${output}`);
            }
          } catch {
            sections.push(`=== ${cat.toUpperCase()} ===\n[command failed]`);
          }
        }

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_system_info', categories: selectedCategories },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `System information for ${session.config.host}\n\n${sections.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `System info failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
