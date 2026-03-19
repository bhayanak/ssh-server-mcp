import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SessionManager } from '../src/ssh/session-manager.js';
import type { EventLogger } from '../src/logging/event-logger.js';

// Mock logger
function createMockLogger(): EventLogger {
  return {
    log: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
  } as unknown as EventLogger;
}

// Mock SSH2 Client
function createMockClient() {
  const emitter = new EventEmitter();
  const mock = Object.assign(emitter, {
    connect: vi.fn().mockImplementation(function (this: EventEmitter) {
      setImmediate(() => this.emit('ready'));
    }),
    end: vi.fn(),
    exec: vi.fn(),
  });
  return mock;
}

vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(() => createMockClient()),
}));

describe('SessionManager', () => {
  let manager: SessionManager;
  let logger: EventLogger;

  beforeEach(() => {
    logger = createMockLogger();
    manager = new SessionManager(
      3, // maxConnections
      { interval: 15000, retries: 3 },
      'accept',
      logger,
    );
  });

  it('starts with zero sessions', () => {
    expect(manager.sessionCount).toBe(0);
    expect(manager.list()).toEqual([]);
  });

  it('creates a session', async () => {
    const session = await manager.create({
      host: 'localhost',
      port: 22,
      username: 'user',
      password: 'pass',
    });

    expect(session.id).toBeDefined();
    expect(session.config.host).toBe('localhost');
    expect(session.config.username).toBe('user');
    expect(session.authMethod).toBe('password');
    expect(manager.sessionCount).toBe(1);
  });

  it('records auth method as publickey when privateKey is provided', async () => {
    const session = await manager.create({
      host: 'localhost',
      port: 22,
      username: 'user',
      privateKey: 'fake-key-content',
    });

    expect(session.authMethod).toBe('publickey');
  });

  it('retrieves a session by ID', async () => {
    const session = await manager.create({
      host: 'localhost',
      port: 22,
      username: 'user',
      password: 'pass',
    });

    const found = manager.get(session.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(session.id);
  });

  it('getOrThrow throws for unknown sessionId', () => {
    expect(() => manager.getOrThrow('nonexistent')).toThrow('Session not found');
  });

  it('returns undefined for unknown sessionId via get', () => {
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('enforces max connections', async () => {
    for (let i = 0; i < 3; i++) {
      await manager.create({
        host: `host-${i}`,
        port: 22,
        username: 'user',
        password: 'pass',
      });
    }

    await expect(
      manager.create({
        host: 'host-4',
        port: 22,
        username: 'user',
        password: 'pass',
      }),
    ).rejects.toThrow('Maximum connections reached');
  });

  it('removes a session', async () => {
    const session = await manager.create({
      host: 'localhost',
      port: 22,
      username: 'user',
      password: 'pass',
    });

    await manager.remove(session.id);
    expect(manager.sessionCount).toBe(0);
    expect(manager.get(session.id)).toBeUndefined();
  });

  it('disconnectAll removes all sessions', async () => {
    await manager.create({ host: 'h1', port: 22, username: 'u', password: 'p' });
    await manager.create({ host: 'h2', port: 22, username: 'u', password: 'p' });

    expect(manager.sessionCount).toBe(2);
    await manager.disconnectAll();
    expect(manager.sessionCount).toBe(0);
  });

  it('lists sessions with correct info', async () => {
    await manager.create({
      host: 'web-1',
      port: 22,
      username: 'deploy',
      password: 'pass',
      label: 'prod',
    });

    const list = manager.list();
    expect(list.length).toBe(1);
    expect(list[0].host).toBe('web-1');
    expect(list[0].username).toBe('deploy');
    expect(list[0].label).toBe('prod');
  });

  it('logs connection events', async () => {
    await manager.create({
      host: 'localhost',
      port: 22,
      username: 'user',
      password: 'pass',
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'connect',
        host: 'localhost',
        username: 'user',
      }),
    );
  });

  it('logs disconnect events', async () => {
    const session = await manager.create({
      host: 'localhost',
      port: 22,
      username: 'user',
      password: 'pass',
    });

    await manager.remove(session.id);

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'disconnect',
        sessionId: session.id,
      }),
    );
  });
});
