import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import type { ServerConfig } from '../config.js';
import type { SSHSession } from '../ssh/types.js';
import { stripAnsi, truncateOutput, formatDuration } from '../utils/formatter.js';

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

export function registerMultiHostTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
  config: ServerConfig,
) {
  // ─── ssh_broadcast ───
  server.tool(
    'ssh_broadcast',
    'Execute the same command across multiple connected servers simultaneously. Requires multiple active sessionIds.',
    {
      sessionIds: z.array(z.string()).describe('List of session IDs to execute on'),
      command: z.string().describe('Command to execute on all hosts'),
      cwd: z.string().optional().describe('Working directory'),
      timeoutMs: z.number().optional().default(30000).describe('Per-host timeout in ms'),
      continueOnError: z
        .boolean()
        .optional()
        .default(true)
        .describe('Continue on other hosts if one fails'),
    },
    async ({ sessionIds, command, cwd, timeoutMs, continueOnError }) => {
      try {
        const timeout = timeoutMs || 30000;
        const fullCommand = cwd ? `cd ${cwd} && ${command}` : command;
        const results: string[] = [];
        let successCount = 0;

        for (const sid of sessionIds) {
          try {
            const session = sessionManager.getOrThrow(sid);
            const label = session.label || session.config.host;
            const start = Date.now();
            const result = await execRemote(session, fullCommand, timeout);
            const duration = Date.now() - start;

            const status = result.exitCode === 0 ? '✅' : '❌';
            if (result.exitCode === 0) successCount++;

            const output = truncateOutput(result.stdout.trim(), 10000);
            results.push(
              `[${label}] ${status} Exit ${result.exitCode} (${formatDuration(duration)})\n${output.text || '(no output)'}`,
            );

            logger.log({
              kind: 'exec',
              sessionId: sid,
              host: session.config.host,
              username: session.config.username,
              command,
              exitCode: result.exitCode,
              durationMs: duration,
              metadata: { tool: 'ssh_broadcast' },
            });
          } catch (err) {
            results.push(`[${sid.slice(0, 8)}...] ❌ Error: ${(err as Error).message}`);
            if (!continueOnError) break;
          }
        }

        const text = `Broadcast: ${command}\nExecuted on ${successCount} / ${sessionIds.length} hosts\n\n${results.join('\n\n')}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Broadcast failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_transfer ───
  server.tool(
    'ssh_transfer',
    'Copy a file from one remote server to another through this MCP server. Requires two active sessionIds.',
    {
      sourceSessionId: z.string().describe('Source session ID'),
      sourceRemotePath: z.string().describe('File path on the source host'),
      destSessionId: z.string().describe('Destination session ID'),
      destRemotePath: z.string().describe('File path on the destination host'),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe('Overwrite if destination file exists'),
    },
    async ({ sourceSessionId, sourceRemotePath, destSessionId, destRemotePath, overwrite }) => {
      try {
        const srcSession = sessionManager.getOrThrow(sourceSessionId);
        const dstSession = sessionManager.getOrThrow(destSessionId);
        const start = Date.now();

        // Read from source via cat (streamed through stdout)
        const readResult = await execRemote(
          srcSession,
          `base64 ${JSON.stringify(sourceRemotePath)}`,
          60000,
        );
        if (readResult.exitCode !== 0) {
          return {
            content: [
              { type: 'text' as const, text: `Read failed on source: ${readResult.stderr}` },
            ],
            isError: true,
          };
        }

        const base64Content = readResult.stdout.trim().replace(/\s+/g, '');
        const sizeBytes = Math.floor(base64Content.length * 0.75);

        // Check max size
        const maxBytes = config.maxUploadSizeMb * 1024 * 1024;
        if (sizeBytes > maxBytes) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `File too large: ${sizeBytes} bytes (max: ${maxBytes} bytes)`,
              },
            ],
            isError: true,
          };
        }

        // Check if destination exists
        if (!overwrite) {
          const checkResult = await execRemote(
            dstSession,
            `test -f ${JSON.stringify(destRemotePath)} && echo "EXISTS"`,
            5000,
          );
          if (checkResult.stdout.trim() === 'EXISTS') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Destination file exists: ${destRemotePath}. Set overwrite: true to replace.`,
                },
              ],
              isError: true,
            };
          }
        }

        // Write to destination via base64 decode
        const writeResult = await execRemote(
          dstSession,
          `echo ${JSON.stringify(base64Content)} | base64 -d > ${JSON.stringify(destRemotePath)}`,
          60000,
        );
        if (writeResult.exitCode !== 0) {
          return {
            content: [
              { type: 'text' as const, text: `Write failed on destination: ${writeResult.stderr}` },
            ],
            isError: true,
          };
        }

        const duration = Date.now() - start;

        logger.log({
          kind: 'command',
          sessionId: sourceSessionId,
          host: srcSession.config.host,
          username: srcSession.config.username,
          metadata: {
            tool: 'ssh_transfer',
            sourceRemotePath,
            destHost: dstSession.config.host,
            destRemotePath,
            bytes: sizeBytes,
          },
        });

        const text = [
          'Transfer complete',
          `  From: ${srcSession.config.host}:${sourceRemotePath}`,
          `  To: ${dstSession.config.host}:${destRemotePath}`,
          `  Size: ${sizeBytes} bytes`,
          `  Duration: ${formatDuration(duration)}`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Transfer failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_jump_connect ───
  server.tool(
    'ssh_jump_connect',
    'SSH to a target host through an existing session used as a jump/bastion host. Creates a new session on the target.',
    {
      jumpSessionId: z.string().describe('Session ID of the jump/bastion host'),
      host: z.string().describe('Target host (reachable from the jump host)'),
      port: z.number().optional().default(22).describe('Target SSH port'),
      username: z.string().describe('Username on the target host'),
      password: z.string().optional().describe('Password for target host authentication'),
      privateKey: z.string().optional().describe('Private key content (PEM) for target host'),
      privateKeyPath: z.string().optional().describe('Path to private key on the jump host'),
      passphrase: z.string().optional().describe('Passphrase for encrypted private key'),
      label: z
        .string()
        .optional()
        .describe("Label for this session (e.g. 'internal-db via bastion')"),
    },
    async ({
      jumpSessionId,
      host,
      port,
      username,
      password,
      privateKey,
      privateKeyPath,
      passphrase,
      label,
    }) => {
      try {
        const jumpSession = sessionManager.getOrThrow(jumpSessionId);

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

        const targetPort = port || 22;

        // If privateKeyPath is provided, read the key from the jump host
        let resolvedPrivateKey = privateKey;
        if (!resolvedPrivateKey && privateKeyPath) {
          const keyResult = await execRemote(
            jumpSession,
            `cat ${JSON.stringify(privateKeyPath)}`,
            5000,
          );
          if (keyResult.exitCode !== 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Cannot read key from jump host: ${keyResult.stderr}`,
                },
              ],
              isError: true,
            };
          }
          resolvedPrivateKey = keyResult.stdout;
        }

        // Create a forwarded TCP connection through the jump host
        const stream = await new Promise<any>((resolve, reject) => {
          jumpSession.connection.forwardOut('127.0.0.1', 0, host, targetPort, (err, channel) => {
            if (err) reject(err);
            else resolve(channel);
          });
        });

        // Use the forwarded channel as the transport for a new SSH connection
        const { Client: SSH2Client } = await import('ssh2');
        const client = new SSH2Client();
        const { randomUUID } = await import('crypto');

        const session = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            client.end();
            reject(new Error('Jump connection timed out after 30 seconds'));
          }, 30000);

          client.on('ready', () => {
            clearTimeout(timeout);
            const sessionId = randomUUID();
            const sess = {
              id: sessionId,
              config: { host, port: targetPort, username, label },
              connection: client,
              createdAt: new Date(),
              lastActivity: new Date(),
              label: label || `${host} via ${jumpSession.config.host}`,
              authMethod: (resolvedPrivateKey ? 'publickey' : 'password') as
                | 'publickey'
                | 'password',
            };
            resolve(sess);
          });

          client.on('error', (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          });

          const connectOpts: any = {
            sock: stream,
            username,
            ...(password ? { password } : {}),
            ...(resolvedPrivateKey ? { privateKey: resolvedPrivateKey } : {}),
            ...(passphrase ? { passphrase } : {}),
          };
          client.connect(connectOpts);
        });

        // Register the session in the session manager
        sessionManager.addSession(session);

        logger.log({
          kind: 'connect',
          sessionId: session.id,
          host,
          username,
          metadata: {
            tool: 'ssh_jump_connect',
            jumpHost: jumpSession.config.host,
            port: targetPort,
          },
        });

        const text = [
          'Jump Connection Established',
          `  Session ID: ${session.id}`,
          `  Target: ${username}@${host}:${targetPort}`,
          `  Jump Host: ${jumpSession.config.host}`,
          `  Label: ${session.label}`,
          `  Auth Method: ${session.authMethod}`,
          `  Active Sessions: ${sessionManager.sessionCount} / ${sessionManager.maxSessions}`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Jump connect failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_script ───
  server.tool(
    'ssh_script',
    'Upload and execute a multi-line script (bash/python/etc.) on the remote server in one step.',
    {
      sessionId: z.string().describe('Active session ID'),
      script: z.string().describe('Script content to execute'),
      interpreter: z
        .string()
        .optional()
        .default('/bin/bash')
        .describe('Script interpreter (bash, python3, perl, etc.)'),
      args: z.array(z.string()).optional().describe('Arguments to pass to the script'),
      cwd: z.string().optional().describe('Working directory'),
      timeoutMs: z.number().optional().default(60000).describe('Execution timeout in ms'),
      cleanup: z
        .boolean()
        .optional()
        .default(true)
        .describe('Delete the temp script file after execution'),
      sudo: z.boolean().optional().default(false).describe('Run with sudo'),
      password: z.string().optional().describe('Sudo password (required if sudo: true)'),
    },
    async ({
      sessionId,
      script,
      interpreter,
      args,
      cwd,
      timeoutMs,
      cleanup: doCleanup,
      sudo,
      password,
    }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const timeout = timeoutMs || 60000;
        const interp = interpreter || '/bin/bash';

        // Generate a unique temp file path
        const { randomUUID } = await import('crypto');
        const tmpFile = `/tmp/ssh-mcp-${randomUUID().slice(0, 8)}.sh`;

        // Upload script content
        const writeCmd = `cat > ${tmpFile} << 'SSH_MCP_SCRIPT_EOF'\n${script}\nSSH_MCP_SCRIPT_EOF\nchmod +x ${tmpFile}`;
        const writeResult = await execRemote(session, writeCmd, 10000);
        if (writeResult.exitCode !== 0) {
          return {
            content: [
              { type: 'text' as const, text: `Script upload failed: ${writeResult.stderr}` },
            ],
            isError: true,
          };
        }

        // Build execution command
        const argsStr =
          args && args.length > 0 ? ' ' + args.map((a) => JSON.stringify(a)).join(' ') : '';
        let runCmd = `${interp} ${tmpFile}${argsStr}`;
        if (cwd) runCmd = `cd ${cwd} && ${runCmd}`;
        if (sudo && password) {
          runCmd = `echo ${JSON.stringify(password)} | sudo -S ${runCmd}`;
        } else if (sudo) {
          runCmd = `sudo ${runCmd}`;
        }

        const start = Date.now();
        const result = await execRemote(session, runCmd, timeout);
        const duration = Date.now() - start;

        // Cleanup
        if (doCleanup !== false) {
          await execRemote(session, `rm -f ${tmpFile}`, 5000).catch(() => {});
        }

        logger.log({
          kind: 'exec',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          command: `[script via ${interp}]`,
          exitCode: result.exitCode,
          durationMs: duration,
          metadata: { tool: 'ssh_script', interpreter: interp, sudo },
        });

        const output = truncateOutput(result.stdout.trim(), 50000);
        const text = [
          `Script Execution (${interp})`,
          `Exit Code: ${result.exitCode}`,
          `Duration: ${formatDuration(duration)}`,
          sudo ? 'Mode: sudo' : null,
          '',
          '--- stdout ---',
          output.text || '(empty)',
          result.stderr.trim() ? `\n--- stderr ---\n${result.stderr.trim()}` : null,
        ]
          .filter((l) => l !== null)
          .join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Script failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
