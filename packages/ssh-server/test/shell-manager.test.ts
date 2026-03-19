import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { ShellManager } from '../src/ssh/shell-manager.js';
import type { SSHSession } from '../src/ssh/types.js';

function createMockSession(): SSHSession {
  const mockStream = new EventEmitter();
  Object.assign(mockStream, {
    write: vi.fn().mockImplementation((_data: string, cb?: (err?: Error) => void) => {
      if (cb) cb();
      return true;
    }),
    end: vi.fn(),
    setWindow: vi.fn(),
    stderr: new EventEmitter(),
  });

  const connection = {
    shell: vi
      .fn()
      .mockImplementation(
        (_opts: unknown, cb: (err: Error | null, stream: EventEmitter) => void) => {
          cb(null, mockStream as unknown as EventEmitter);
        },
      ),
  };

  return {
    id: 'test-session-id',
    config: { host: 'localhost', port: 22, username: 'user' },
    connection: connection as unknown as SSHSession['connection'],
    createdAt: new Date(),
    lastActivity: new Date(),
    authMethod: 'password',
  } as SSHSession;
}

describe('ShellManager', () => {
  let manager: ShellManager;

  beforeEach(() => {
    manager = new ShellManager({ term: 'xterm-256color', cols: 80, rows: 24 });
  });

  it('opens a shell and returns shellId', async () => {
    const session = createMockSession();
    const shell = await manager.open(session);

    expect(shell.id).toBeDefined();
    expect(shell.sessionId).toBe('test-session-id');
    expect(shell.term).toBe('xterm-256color');
    expect(shell.cols).toBe(80);
    expect(shell.rows).toBe(24);
  });

  it('opens a shell with custom options', async () => {
    const session = createMockSession();
    const shell = await manager.open(session, { term: 'vt100', cols: 120, rows: 40 });

    expect(shell.term).toBe('vt100');
    expect(shell.cols).toBe(120);
    expect(shell.rows).toBe(40);
  });

  it('lists shells for a session', async () => {
    const session = createMockSession();
    await manager.open(session);
    await manager.open(session);

    const list = manager.list('test-session-id');
    expect(list.length).toBe(2);
    expect(list[0].sessionId).toBe('test-session-id');
  });

  it('returns empty list for unknown session', () => {
    expect(manager.list('unknown')).toEqual([]);
  });

  it('writes data to a shell', async () => {
    const session = createMockSession();
    const shell = await manager.open(session);

    await manager.write(shell.id, 'ls -la\n');
    expect(shell.channel.write).toHaveBeenCalledWith('ls -la\n', expect.any(Function));
  });

  it('throws when writing to unknown shell', async () => {
    await expect(manager.write('nonexistent', 'data')).rejects.toThrow();
  });

  it('closes a shell', async () => {
    const session = createMockSession();
    const shell = await manager.open(session);

    await manager.close(shell.id);
    expect(manager.list('test-session-id').length).toBe(0);
  });

  it('closing unknown shell is a no-op', async () => {
    await expect(manager.close('nonexistent')).resolves.toBeUndefined();
  });

  it('counts shells for a session', async () => {
    const session = createMockSession();
    await manager.open(session);
    await manager.open(session);

    expect(manager.countForSession('test-session-id')).toBe(2);
    expect(manager.countForSession('other')).toBe(0);
  });

  it('resizes a shell', async () => {
    const session = createMockSession();
    const shell = await manager.open(session);

    await manager.resize(shell.id, 200, 60);
    expect(shell.cols).toBe(200);
    expect(shell.rows).toBe(60);
    expect(shell.channel.setWindow).toHaveBeenCalledWith(60, 200, 0, 0);
  });
});
