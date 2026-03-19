import { randomUUID } from 'crypto';
import type { SSHSession, ShellChannel, ShellInfo, ShellDefaults } from './types.js';
import { stripAnsi } from '../utils/formatter.js';

export class ShellManager {
  private shells: Map<string, ShellChannel> = new Map();
  private defaults: ShellDefaults;

  constructor(defaults: ShellDefaults) {
    this.defaults = defaults;
  }

  async open(
    session: SSHSession,
    options?: { term?: string; cols?: number; rows?: number; initialCommand?: string },
  ): Promise<ShellChannel> {
    const term = options?.term || this.defaults.term;
    const cols = options?.cols || this.defaults.cols;
    const rows = options?.rows || this.defaults.rows;

    return new Promise<ShellChannel>((resolve, reject) => {
      session.connection.shell({ term, cols, rows }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        const shellId = randomUUID();
        const shell: ShellChannel = {
          id: shellId,
          sessionId: session.id,
          term,
          cols,
          rows,
          createdAt: new Date(),
          channel: stream,
          buffer: '',
        };

        stream.on('data', (data: Buffer) => {
          shell.buffer += data.toString('utf-8');
        });

        stream.stderr?.on('data', (data: Buffer) => {
          shell.buffer += data.toString('utf-8');
        });

        stream.on('close', () => {
          this.shells.delete(shellId);
        });

        this.shells.set(shellId, shell);

        if (options?.initialCommand) {
          stream.write(options.initialCommand + '\n');
        }

        resolve(shell);
      });
    });
  }

  async write(shellId: string, data: string): Promise<void> {
    const shell = this.getOrThrow(shellId);
    return new Promise<void>((resolve, reject) => {
      shell.channel.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async read(shellId: string, timeoutMs?: number, maxBytes?: number): Promise<string> {
    const shell = this.getOrThrow(shellId);
    const timeout = timeoutMs || 5000;
    const max = maxBytes || 50000;

    // If buffer already has content, return immediately
    if (shell.buffer.length > 0) {
      const output = shell.buffer.slice(0, max);
      shell.buffer = shell.buffer.slice(max);
      return stripAnsi(output);
    }

    // Wait for data up to timeout
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        const output = shell.buffer.slice(0, max);
        shell.buffer = shell.buffer.slice(max);
        resolve(stripAnsi(output));
      }, timeout);

      const checkInterval = setInterval(() => {
        if (shell.buffer.length > 0) {
          clearTimeout(timer);
          clearInterval(checkInterval);
          // Wait a small amount for more data to arrive
          setTimeout(() => {
            const output = shell.buffer.slice(0, max);
            shell.buffer = shell.buffer.slice(max);
            resolve(stripAnsi(output));
          }, 100);
        }
      }, 50);

      // Cleanup on timeout
      setTimeout(() => clearInterval(checkInterval), timeout + 100);
    });
  }

  async resize(shellId: string, cols: number, rows: number): Promise<void> {
    const shell = this.getOrThrow(shellId);
    shell.channel.setWindow(rows, cols, 0, 0);
    shell.cols = cols;
    shell.rows = rows;
  }

  async close(shellId: string): Promise<void> {
    const shell = this.shells.get(shellId);
    if (shell) {
      shell.channel.end();
      this.shells.delete(shellId);
    }
  }

  list(sessionId: string): ShellInfo[] {
    return Array.from(this.shells.values())
      .filter((s) => s.sessionId === sessionId)
      .map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        term: s.term,
        cols: s.cols,
        rows: s.rows,
        createdAt: s.createdAt,
        bufferSize: s.buffer.length,
      }));
  }

  countForSession(sessionId: string): number {
    return Array.from(this.shells.values()).filter((s) => s.sessionId === sessionId).length;
  }

  closeAllForSession(sessionId: string): void {
    for (const [id, shell] of this.shells) {
      if (shell.sessionId === sessionId) {
        shell.channel.end();
        this.shells.delete(id);
      }
    }
  }

  private getOrThrow(shellId: string): ShellChannel {
    const shell = this.shells.get(shellId);
    if (!shell) {
      throw new Error(`Shell not found: ${shellId}. Use ssh_shell_open to create a shell.`);
    }
    return shell;
  }
}
