import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../ssh/session-manager.js';
import type { EventLogger } from '../logging/event-logger.js';
import type { SystemSnapshot, ConnectionBookmark, SSHSession } from '../ssh/types.js';
import { stripAnsi } from '../utils/formatter.js';

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

// In-memory stores (persist for server lifetime only)
const snapshots: Map<string, SystemSnapshot> = new Map();
const bookmarks: Map<string, ConnectionBookmark> = new Map();

const SNAPSHOT_COMMANDS: Record<string, string> = {
  packages:
    'dpkg -l 2>/dev/null | tail -n +6 | head -100 || rpm -qa 2>/dev/null | head -100 || apk list --installed 2>/dev/null | head -100',
  services:
    'systemctl list-units --type=service --state=active --no-pager --no-legend 2>/dev/null | head -50',
  ports: 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null',
  processes: 'ps aux --sort=-%mem 2>/dev/null | head -25 || ps aux | head -25',
  cron: "crontab -l 2>/dev/null || echo '(no crontab)'",
  env: 'env | sort | head -50',
  mounts: 'df -h 2>/dev/null',
  users: 'who 2>/dev/null',
};

export function registerSessionIntelTools(
  server: McpServer,
  sessionManager: SessionManager,
  logger: EventLogger,
) {
  // ─── ssh_snapshot ───
  server.tool(
    'ssh_snapshot',
    'Capture a full system state snapshot: packages, services, ports, processes, cron, env, mounts, users. Use before changes to diff later.',
    {
      sessionId: z.string().describe('Active session ID'),
      label: z
        .string()
        .optional()
        .describe("Label for this snapshot (e.g. 'before-deploy', 'baseline')"),
      sections: z
        .array(
          z.enum([
            'packages',
            'services',
            'ports',
            'processes',
            'cron',
            'env',
            'mounts',
            'users',
            'all',
          ]),
        )
        .optional()
        .default(['all'])
        .describe('Sections to capture'),
    },
    async ({ sessionId, label, sections }) => {
      try {
        const session = sessionManager.getOrThrow(sessionId);
        const selectedSections = sections?.includes('all')
          ? Object.keys(SNAPSHOT_COMMANDS)
          : sections || Object.keys(SNAPSHOT_COMMANDS);

        const sectionData: Record<string, string> = {};
        for (const sec of selectedSections) {
          const cmd = SNAPSHOT_COMMANDS[sec];
          if (!cmd) continue;
          try {
            const result = await execRemote(session, cmd, 15000);
            sectionData[sec] = result.stdout.trim();
          } catch {
            sectionData[sec] = '[command failed]';
          }
        }

        const snapshot: SystemSnapshot = {
          id: randomUUID(),
          sessionId,
          label,
          createdAt: new Date(),
          sections: sectionData,
        };
        snapshots.set(snapshot.id, snapshot);

        logger.log({
          kind: 'command',
          sessionId,
          host: session.config.host,
          username: session.config.username,
          metadata: {
            tool: 'ssh_snapshot',
            snapshotId: snapshot.id,
            label,
            sections: selectedSections,
          },
        });

        const sectionSummary = selectedSections
          .map((s) => `  ${s}: ${(sectionData[s] || '').split('\n').length} lines`)
          .join('\n');
        const text = [
          `Snapshot captured`,
          `  Snapshot ID: ${snapshot.id}`,
          `  Host: ${session.config.host}`,
          label ? `  Label: ${label}` : null,
          `  Sections:\n${sectionSummary}`,
          `  Time: ${snapshot.createdAt.toISOString()}`,
          '',
          `Use ssh_snapshot_diff with this snapshot ID to compare with a future state.`,
        ]
          .filter((l) => l !== null)
          .join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Snapshot failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_snapshot_diff ───
  server.tool(
    'ssh_snapshot_diff',
    'Compare two system snapshots to show what changed between them (added/removed packages, services, ports, etc.).',
    {
      snapshotIdA: z.string().describe('Before snapshot ID'),
      snapshotIdB: z.string().describe('After snapshot ID'),
      sections: z
        .array(z.string())
        .optional()
        .describe('Sections to compare (default: all shared sections)'),
    },
    async ({ snapshotIdA, snapshotIdB, sections }) => {
      try {
        const snapA = snapshots.get(snapshotIdA);
        const snapB = snapshots.get(snapshotIdB);

        if (!snapA)
          return {
            content: [{ type: 'text' as const, text: `Snapshot not found: ${snapshotIdA}` }],
            isError: true,
          };
        if (!snapB)
          return {
            content: [{ type: 'text' as const, text: `Snapshot not found: ${snapshotIdB}` }],
            isError: true,
          };

        const compareSections = sections || Object.keys({ ...snapA.sections, ...snapB.sections });
        const diffs: string[] = [];

        for (const sec of compareSections) {
          const linesA = new Set((snapA.sections[sec] || '').split('\n').filter(Boolean));
          const linesB = new Set((snapB.sections[sec] || '').split('\n').filter(Boolean));

          const added = [...linesB].filter((l) => !linesA.has(l));
          const removed = [...linesA].filter((l) => !linesB.has(l));

          if (added.length > 0 || removed.length > 0) {
            const secDiff: string[] = [`--- ${sec.toUpperCase()} ---`];
            for (const line of added.slice(0, 20)) secDiff.push(`  + ${line}`);
            for (const line of removed.slice(0, 20)) secDiff.push(`  - ${line}`);
            if (added.length > 20) secDiff.push(`  ... and ${added.length - 20} more additions`);
            if (removed.length > 20) secDiff.push(`  ... and ${removed.length - 20} more removals`);
            diffs.push(secDiff.join('\n'));
          }
        }

        const labelA = snapA.label || snapA.id.slice(0, 8);
        const labelB = snapB.label || snapB.id.slice(0, 8);
        const text =
          diffs.length > 0
            ? `Snapshot Diff: "${labelA}" → "${labelB}"\n\n${diffs.join('\n\n')}`
            : `Snapshot Diff: "${labelA}" → "${labelB}"\n\nNo differences found across ${compareSections.length} sections.`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Snapshot diff failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── ssh_bookmark ───
  server.tool(
    'ssh_bookmark',
    'Save or manage connection bookmarks. NOT for connecting to servers \u2014 use ssh_connect instead. Only for save/list/delete of saved profiles.',
    {
      action: z.enum(['save', 'list', 'connect', 'delete']).describe('Bookmark action'),
      name: z.string().optional().describe("Bookmark name (e.g. 'prod-web-1', 'staging-db')"),
      config: z
        .object({
          host: z.string(),
          port: z.number().optional().default(22),
          username: z.string(),
          privateKeyPath: z.string().optional(),
          label: z.string().optional(),
        })
        .optional()
        .describe("Connection config to save (for 'save' action)"),
      password: z
        .string()
        .optional()
        .describe("Password for authentication (for 'connect' action — not stored)"),
      privateKey: z
        .string()
        .optional()
        .describe("Private key content (for 'connect' action — not stored)"),
    },
    async ({ action, name, config: bookmarkConfig, password, privateKey }) => {
      try {
        switch (action) {
          case 'save': {
            if (!name || !bookmarkConfig) {
              return {
                content: [
                  { type: 'text' as const, text: 'Error: name and config are required for save' },
                ],
                isError: true,
              };
            }
            const bookmark: ConnectionBookmark = {
              name,
              host: bookmarkConfig.host,
              port: bookmarkConfig.port || 22,
              username: bookmarkConfig.username,
              privateKeyPath: bookmarkConfig.privateKeyPath,
              label: bookmarkConfig.label,
              createdAt: new Date(),
            };
            bookmarks.set(name, bookmark);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Bookmark saved: ${name}\n  ${bookmark.username}@${bookmark.host}:${bookmark.port}`,
                },
              ],
            };
          }

          case 'list': {
            if (bookmarks.size === 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: 'No bookmarks saved. Use action: "save" to create one.',
                  },
                ],
              };
            }
            const lines = [...bookmarks.values()].map(
              (b, i) =>
                `[${i + 1}] ${b.name} — ${b.username}@${b.host}:${b.port}${b.label ? ` (${b.label})` : ''}`,
            );
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Bookmarks (${bookmarks.size})\n\n${lines.join('\n')}`,
                },
              ],
            };
          }

          case 'connect': {
            if (!name)
              return {
                content: [{ type: 'text' as const, text: 'Error: name is required for connect' }],
                isError: true,
              };
            const bm = bookmarks.get(name);
            if (!bm)
              return {
                content: [{ type: 'text' as const, text: `Bookmark not found: ${name}` }],
                isError: true,
              };

            if (!password && !privateKey && !bm.privateKeyPath) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: 'Error: provide password, privateKey, or the bookmark must have privateKeyPath',
                  },
                ],
                isError: true,
              };
            }

            const session = await sessionManager.create({
              host: bm.host,
              port: bm.port,
              username: bm.username,
              password,
              privateKey,
              privateKeyPath: bm.privateKeyPath,
              label: bm.label || bm.name,
            } as Parameters<typeof sessionManager.create>[0]);

            logger.log({
              kind: 'connect',
              sessionId: session.id,
              host: bm.host,
              username: bm.username,
              metadata: { tool: 'ssh_bookmark', bookmark: name },
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Connected via bookmark "${name}"\n  Session ID: ${session.id}\n  Host: ${bm.host}:${bm.port}\n  Username: ${bm.username}`,
                },
              ],
            };
          }

          case 'delete': {
            if (!name)
              return {
                content: [{ type: 'text' as const, text: 'Error: name is required for delete' }],
                isError: true,
              };
            const deleted = bookmarks.delete(name);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: deleted ? `Bookmark deleted: ${name}` : `Bookmark not found: ${name}`,
                },
              ],
            };
          }
        }
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Bookmark operation failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
