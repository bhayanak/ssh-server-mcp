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

export function registerServerMgmtTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
) {
  // ─── ssh_service ───
  server.tool(
    'ssh_service',
    'Manage systemd services on the remote host: start, stop, restart, reload, enable, disable, status, or list all.',
    {
      sessionId: z.string().describe('Active session ID'),
      action: z
        .enum(['start', 'stop', 'restart', 'reload', 'status', 'enable', 'disable', 'list'])
        .describe('Service action to perform'),
      serviceName: z
        .string()
        .optional()
        .describe("Service name (required for all actions except 'list')"),
      password: z
        .string()
        .optional()
        .describe('Sudo password (required for start/stop/restart/reload/enable/disable)'),
    },
    async ({ sessionId, action, serviceName, password }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);

        if (action !== 'list' && !serviceName) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: serviceName is required for this action' },
            ],
            isError: true,
          };
        }

        let cmd: string;
        if (action === 'list') {
          cmd = 'systemctl list-units --type=service --no-pager --no-legend 2>/dev/null | head -50';
        } else if (action === 'status') {
          cmd = `systemctl status ${serviceName} --no-pager 2>&1`;
        } else {
          // Actions that need sudo
          const sudoPrefix = password ? `echo ${JSON.stringify(password)} | sudo -S` : 'sudo';
          cmd = `${sudoPrefix} systemctl ${action} ${serviceName} 2>&1 && systemctl status ${serviceName} --no-pager --lines=5 2>&1`;
        }

        const result = await execRemote(session, cmd, 15000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_service', action, serviceName },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        const text =
          action === 'list'
            ? `Services on ${session.config.host}\n\n${output.text}`
            : `Service: ${serviceName} (${action})\n\n${output.text}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Service command failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_process ───
  server.tool(
    'ssh_process',
    'List, filter, or kill processes on the remote host. Find what is listening on a specific port.',
    {
      sessionId: z.string().describe('Active session ID'),
      action: z.enum(['list', 'kill', 'info']).describe('Action to perform'),
      pid: z.number().optional().describe('Process ID (required for kill/info)'),
      signal: z
        .enum(['SIGTERM', 'SIGKILL', 'SIGHUP', 'SIGUSR1', 'SIGUSR2'])
        .optional()
        .default('SIGTERM')
        .describe('Signal to send (for kill)'),
      filterUser: z.string().optional().describe('Filter processes by user'),
      filterName: z.string().optional().describe('Filter processes by command name'),
      filterPort: z.number().optional().describe('Find process listening on this port'),
      sortBy: z
        .enum(['cpu', 'memory', 'pid', 'time'])
        .optional()
        .default('memory')
        .describe('Sort order for list'),
      limit: z.number().optional().default(20).describe('Max results for list'),
      password: z
        .string()
        .optional()
        .describe("Sudo password (required for killing other users' processes)"),
    },
    async ({
      sessionId,
      action,
      pid,
      signal,
      filterUser,
      filterName,
      filterPort,
      sortBy,
      limit,
      password,
    }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        let cmd: string;

        if (action === 'kill') {
          if (!pid)
            return {
              content: [{ type: 'text' as const, text: 'Error: pid is required for kill action' }],
              isError: true,
            };
          const sig = signal || 'SIGTERM';
          const sudoPrefix = password ? `echo ${JSON.stringify(password)} | sudo -S` : '';
          cmd = `${sudoPrefix} kill -s ${sig} ${pid} 2>&1 && echo "Signal ${sig} sent to PID ${pid}"`;
        } else if (action === 'info') {
          if (!pid)
            return {
              content: [{ type: 'text' as const, text: 'Error: pid is required for info action' }],
              isError: true,
            };
          cmd = `ps -p ${pid} -o pid,user,%cpu,%mem,vsz,rss,tty,stat,start,etime,command --no-headers 2>/dev/null && echo "---" && ls -la /proc/${pid}/fd 2>/dev/null | wc -l | xargs -I{} echo "Open FDs: {}"`;
        } else if (filterPort) {
          cmd = `ss -tlnp 2>/dev/null | grep ':${filterPort} ' || netstat -tlnp 2>/dev/null | grep ':${filterPort} '`;
        } else {
          const sortMap: Record<string, string> = {
            cpu: '-%cpu',
            memory: '-%mem',
            pid: 'pid',
            time: '-etime',
          };
          const sort = sortMap[sortBy || 'memory'];
          let psCmd = `ps aux --sort=${sort} 2>/dev/null | head -${(limit || 20) + 1}`;
          if (filterUser)
            psCmd = `ps -u ${filterUser} aux --sort=${sort} 2>/dev/null | head -${(limit || 20) + 1}`;
          if (filterName)
            psCmd += ` | grep -i ${JSON.stringify(filterName)} | head -${limit || 20}`;
          cmd = psCmd;
        }

        const result = await execRemote(session, cmd, 15000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_process', action, pid, filterPort },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        let header: string;
        if (action === 'kill') header = `Kill Process (PID ${pid})`;
        else if (action === 'info') header = `Process Info (PID ${pid})`;
        else if (filterPort) header = `Process on port ${filterPort}`;
        else header = `Processes on ${session.config.host}`;

        return {
          content: [
            { type: 'text' as const, text: `${header}\n\n${output.text || '(no output)'}` },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Process command failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_cron ───
  server.tool(
    'ssh_cron',
    'View, add, or remove scheduled cron jobs on the remote host.',
    {
      sessionId: z.string().describe('Active session ID'),
      action: z.enum(['list', 'add', 'remove']).describe('Cron action'),
      user: z.string().optional().describe('Crontab owner (default: current user)'),
      schedule: z
        .string()
        .optional()
        .describe("Cron schedule expression (e.g. '0 2 * * *') — required for add"),
      command: z.string().optional().describe('Command to schedule — required for add'),
      jobIndex: z
        .number()
        .optional()
        .describe('Job index to remove (1-based, from list output) — required for remove'),
      password: z
        .string()
        .optional()
        .describe("Sudo password (required for other users' crontabs)"),
    },
    async ({ sessionId, action, user, schedule, command, jobIndex, password }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const sudoPrefix = password && user ? `echo ${JSON.stringify(password)} | sudo -S` : '';
        const userFlag = user ? `-u ${user}` : '';

        let cmd: string;
        if (action === 'list') {
          cmd = `${sudoPrefix} crontab ${userFlag} -l 2>&1 || echo '(no crontab)'`;
        } else if (action === 'add') {
          if (!schedule || !command) {
            return {
              content: [
                { type: 'text' as const, text: 'Error: schedule and command are required for add' },
              ],
              isError: true,
            };
          }
          cmd = `(${sudoPrefix} crontab ${userFlag} -l 2>/dev/null; echo ${JSON.stringify(`${schedule} ${command}`)}) | ${sudoPrefix} crontab ${userFlag} - 2>&1 && echo "Cron job added: ${schedule} ${command}"`;
        } else {
          if (!jobIndex) {
            return {
              content: [{ type: 'text' as const, text: 'Error: jobIndex is required for remove' }],
              isError: true,
            };
          }
          cmd = `${sudoPrefix} crontab ${userFlag} -l 2>/dev/null | sed '${jobIndex}d' | ${sudoPrefix} crontab ${userFlag} - 2>&1 && echo "Cron job ${jobIndex} removed"`;
        }

        const result = await execRemote(session, cmd, 15000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_cron', action, user },
        });

        const output = result.stdout.trim();
        const text = `Cron (${action})${user ? ` for ${user}` : ''}\n\n${output || '(no output)'}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Cron command failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_network ───
  server.tool(
    'ssh_network',
    'Network diagnostics on the remote host: listening ports, active connections, ping, DNS lookup, routes, interfaces.',
    {
      sessionId: z.string().describe('Active session ID'),
      action: z
        .enum(['ports', 'connections', 'ping', 'dns', 'route', 'interfaces'])
        .describe('Network diagnostic action'),
      target: z
        .string()
        .optional()
        .describe('Target host for ping/dns (required for those actions)'),
      port: z.number().optional().describe('Filter connections by port'),
      state: z
        .enum(['listening', 'established', 'all'])
        .optional()
        .default('all')
        .describe('Filter connections by state'),
      count: z.number().optional().default(4).describe('Ping count'),
    },
    async ({ sessionId, action, target, port, state, count }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        let cmd: string;

        switch (action) {
          case 'ports':
            cmd = 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null';
            break;
          case 'connections': {
            const stateFilter =
              state === 'listening'
                ? 'state listening'
                : state === 'established'
                  ? 'state established'
                  : '';
            cmd = `ss -tnp ${stateFilter} 2>/dev/null || netstat -tnp 2>/dev/null`;
            if (port) cmd += ` | grep ':${port}'`;
            break;
          }
          case 'ping':
            if (!target)
              return {
                content: [{ type: 'text' as const, text: 'Error: target is required for ping' }],
                isError: true,
              };
            cmd = `ping -c ${count || 4} -W 5 ${JSON.stringify(target)} 2>&1`;
            break;
          case 'dns':
            if (!target)
              return {
                content: [{ type: 'text' as const, text: 'Error: target is required for dns' }],
                isError: true,
              };
            cmd = `dig +short ${JSON.stringify(target)} 2>/dev/null || nslookup ${JSON.stringify(target)} 2>/dev/null || host ${JSON.stringify(target)} 2>/dev/null`;
            break;
          case 'route':
            cmd = 'ip route 2>/dev/null || netstat -rn 2>/dev/null || route -n 2>/dev/null';
            break;
          case 'interfaces':
            cmd = 'ip -br addr 2>/dev/null || ifconfig 2>/dev/null';
            break;
        }

        const result = await execRemote(session, cmd, 20000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_network', action, target, port },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        const text = `Network (${action}) on ${session.config.host}${target ? ` → ${target}` : ''}\n\n${output.text || '(no output)'}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Network command failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_user ───
  server.tool(
    'ssh_user',
    'Get user and group info from the remote host: whoami, list users, user details, group memberships.',
    {
      sessionId: z.string().describe('Active session ID'),
      action: z.enum(['whoami', 'list', 'info', 'groups']).describe('User info action'),
      username: z.string().optional().describe('Username for info/groups (default: current user)'),
      includeSystem: z.boolean().optional().default(false).describe('Include system users in list'),
    },
    async ({ sessionId, action, username, includeSystem }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        let cmd: string;

        switch (action) {
          case 'whoami':
            cmd = 'whoami && id';
            break;
          case 'list':
            cmd = includeSystem
              ? 'cat /etc/passwd | awk -F: \'{printf "%-20s UID:%-6s GID:%-6s %s\\n", $1, $3, $4, $7}\''
              : 'awk -F: \'$3 >= 1000 && $3 < 65534 {printf "%-20s UID:%-6s GID:%-6s %s\\n", $1, $3, $4, $7}\' /etc/passwd';
            break;
          case 'info':
            cmd = username
              ? `id ${username} 2>&1 && echo "---" && getent passwd ${username} 2>/dev/null && echo "---" && chage -l ${username} 2>/dev/null`
              : 'id && echo "---" && getent passwd $(whoami) 2>/dev/null';
            break;
          case 'groups':
            cmd = username ? `groups ${username} 2>&1` : 'groups 2>&1';
            break;
        }

        const result = await execRemote(session, cmd, 10000);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: { tool: 'ssh_user', action, username },
        });

        const text = `User (${action})${username ? ` — ${username}` : ''}\n\n${result.stdout.trim() || '(no output)'}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `User command failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
