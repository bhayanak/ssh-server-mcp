import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { JobManager } from '../src/ssh/job-manager.js';
import type { SSHSession } from '../src/ssh/types.js';

function createMockSession(sessionId = 'test-session'): SSHSession {
  const mockStream = new EventEmitter();
  Object.assign(mockStream, {
    signal: vi.fn(),
    stderr: new EventEmitter(),
  });

  const connection = {
    exec: vi
      .fn()
      .mockImplementation((_cmd: string, cb: (err: Error | null, stream: EventEmitter) => void) => {
        cb(null, mockStream as unknown as EventEmitter);
        return true;
      }),
  };

  return {
    id: sessionId,
    config: { host: 'localhost', port: 22, username: 'user' },
    connection: connection as unknown as SSHSession['connection'],
    createdAt: new Date(),
    lastActivity: new Date(),
    authMethod: 'password',
  } as SSHSession;
}

describe('JobManager', () => {
  let manager: JobManager;

  beforeEach(() => {
    manager = new JobManager(5);
  });

  it('starts a background job', async () => {
    const session = createMockSession();
    const job = await manager.start(session, 'tail -f /var/log/syslog');

    expect(job.id).toBeDefined();
    expect(job.sessionId).toBe('test-session');
    expect(job.command).toBe('tail -f /var/log/syslog');
    expect(job.status).toBe('running');
  });

  it('enforces max jobs per session', async () => {
    const session = createMockSession();
    for (let i = 0; i < 5; i++) {
      await manager.start(session, `cmd-${i}`);
    }

    await expect(manager.start(session, 'one-too-many')).rejects.toThrow(
      'Maximum background jobs reached',
    );
  });

  it('polls a job for status', async () => {
    const session = createMockSession();
    const job = await manager.start(session, 'echo hello');

    const polled = manager.poll(job.id);
    expect(polled.id).toBe(job.id);
    expect(polled.status).toBe('running');
    expect(polled.channel).toBeUndefined(); // channel stripped from poll result
  });

  it('throws when polling unknown job', () => {
    expect(() => manager.poll('nonexistent')).toThrow('Job not found');
  });

  it('cancels a running job', async () => {
    const session = createMockSession();
    const job = await manager.start(session, 'long-running');

    await manager.cancel(job.id);
    expect(job.status).toBe('cancelled');
    expect(job.endedAt).toBeDefined();
  });

  it('throws when cancelling unknown job', async () => {
    await expect(manager.cancel('nonexistent')).rejects.toThrow('Job not found');
  });

  it('lists jobs for a session', async () => {
    const session = createMockSession();
    await manager.start(session, 'cmd1');
    await manager.start(session, 'cmd2');

    const list = manager.list('test-session');
    expect(list.length).toBe(2);
    expect(list[0].command).toBe('cmd1');
    expect(list[1].command).toBe('cmd2');
  });

  it('returns empty list for unknown session', () => {
    expect(manager.list('unknown')).toEqual([]);
  });

  it('cleanup removes all jobs for a session', async () => {
    const session = createMockSession();
    await manager.start(session, 'cmd1');
    await manager.start(session, 'cmd2');

    manager.cleanup('test-session');
    expect(manager.list('test-session')).toEqual([]);
  });

  it('countForSession counts running jobs', async () => {
    const session = createMockSession();
    await manager.start(session, 'cmd1');
    await manager.start(session, 'cmd2');

    expect(manager.countForSession('test-session')).toBe(2);
    expect(manager.countForSession('other')).toBe(0);
  });
});
