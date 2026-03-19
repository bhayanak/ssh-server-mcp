import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PortForwardManager } from '../src/ssh/port-forward.js';
import type { SSHSession } from '../src/ssh/types.js';

function createMockSession(sessionId = 'test-session'): SSHSession {
  const connection = new EventEmitter();
  Object.assign(connection, {
    forwardOut: vi.fn(),
    forwardIn: vi
      .fn()
      .mockImplementation((_addr: string, _port: number, cb: (err: Error | null) => void) => {
        cb(null);
      }),
  });

  return {
    id: sessionId,
    config: { host: 'localhost', port: 22, username: 'user' },
    connection: connection as unknown as SSHSession['connection'],
    createdAt: new Date(),
    lastActivity: new Date(),
    authMethod: 'password',
  } as SSHSession;
}

describe('PortForwardManager', () => {
  let manager: PortForwardManager;

  beforeEach(() => {
    manager = new PortForwardManager();
  });

  it('can be instantiated', () => {
    expect(manager).toBeDefined();
  });

  it('lists returns empty initially', () => {
    expect(manager.list('test-session')).toEqual([]);
  });

  describe('createRemote', () => {
    it('creates a remote port forward', async () => {
      const session = createMockSession();
      const forward = await manager.createRemote(session, 8080, '127.0.0.1', 3000);

      expect(forward.id).toBeDefined();
      expect(forward.type).toBe('remote');
      expect(forward.remotePort).toBe(8080);
      expect(forward.localPort).toBe(3000);
    });

    it('rejects when forwardIn fails', async () => {
      const session = createMockSession();
      (
        session.connection as unknown as { forwardIn: ReturnType<typeof vi.fn> }
      ).forwardIn.mockImplementation(
        (_addr: string, _port: number, cb: (err: Error | null) => void) => {
          cb(new Error('Permission denied'));
        },
      );

      await expect(manager.createRemote(session, 8080, '127.0.0.1', 3000)).rejects.toThrow(
        'Permission denied',
      );
    });

    it('lists remote forwards', async () => {
      const session = createMockSession();
      await manager.createRemote(session, 8080, '127.0.0.1', 3000);

      const list = manager.list('test-session');
      expect(list.length).toBe(1);
      expect(list[0].type).toBe('remote');
    });
  });

  describe('remove', () => {
    it('removes a port forward', async () => {
      const session = createMockSession();
      const forward = await manager.createRemote(session, 8080, '127.0.0.1', 3000);

      await manager.remove(forward.id);
      expect(manager.list('test-session')).toEqual([]);
    });

    it('throws when removing unknown forward', async () => {
      await expect(manager.remove('nonexistent')).rejects.toThrow('Port forward not found');
    });
  });

  describe('closeAllForSession', () => {
    it('closes all forwards for a session', async () => {
      const session = createMockSession();
      await manager.createRemote(session, 8080, '127.0.0.1', 3000);
      await manager.createRemote(session, 8081, '127.0.0.1', 3001);

      manager.closeAllForSession('test-session');
      expect(manager.list('test-session')).toEqual([]);
    });

    it('does not affect other sessions', async () => {
      const session1 = createMockSession('session-1');
      const session2 = createMockSession('session-2');
      await manager.createRemote(session1, 8080, '127.0.0.1', 3000);
      await manager.createRemote(session2, 8081, '127.0.0.1', 3001);

      manager.closeAllForSession('session-1');
      expect(manager.list('session-1')).toEqual([]);
      expect(manager.list('session-2').length).toBe(1);
    });
  });
});
