import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventLogger } from '../src/logging/event-logger.js';

describe('EventLogger', () => {
  let logDir: string;
  let logger: EventLogger;

  beforeEach(() => {
    logDir = join(tmpdir(), `ssh-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    logger = new EventLogger(logDir);
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('creates log directory on construction', () => {
    expect(existsSync(logDir)).toBe(true);
  });

  it('writes log entries as NDJSON', () => {
    logger.log({
      kind: 'command',
      sessionId: 'test-session',
      host: 'localhost',
      username: 'user',
      command: 'ls -la',
    });

    const files = getLogFiles(logDir);
    expect(files.length).toBe(1);

    const content = readFileSync(files[0], 'utf-8').trim();
    const event = JSON.parse(content);
    expect(event.kind).toBe('command');
    expect(event.sessionId).toBe('test-session');
    expect(event.command).toBe('ls -la');
    expect(event.timestamp).toBeDefined();
  });

  it('appends multiple entries', () => {
    logger.log({ kind: 'connect', sessionId: 's1' });
    logger.log({ kind: 'command', sessionId: 's1', command: 'ls' });
    logger.log({ kind: 'disconnect', sessionId: 's1' });

    const files = getLogFiles(logDir);
    const lines = readFileSync(files[0], 'utf-8').trim().split('\n');
    expect(lines.length).toBe(3);
  });

  it('queries all events', async () => {
    logger.log({ kind: 'connect', sessionId: 's1', host: 'host1' });
    logger.log({ kind: 'command', sessionId: 's1', host: 'host1' });
    logger.log({ kind: 'disconnect', sessionId: 's2', host: 'host2' });

    const results = await logger.query({});
    expect(results.length).toBe(3);
  });

  it('queries by kind', async () => {
    logger.log({ kind: 'connect', sessionId: 's1' });
    logger.log({ kind: 'command', sessionId: 's1' });
    logger.log({ kind: 'connect', sessionId: 's2' });

    const results = await logger.query({ kind: 'connect' });
    expect(results.length).toBe(2);
  });

  it('queries by sessionId', async () => {
    logger.log({ kind: 'connect', sessionId: 's1' });
    logger.log({ kind: 'command', sessionId: 's2' });

    const results = await logger.query({ sessionId: 's1' });
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe('s1');
  });

  it('queries by host', async () => {
    logger.log({ kind: 'connect', sessionId: 's1', host: 'host1' });
    logger.log({ kind: 'connect', sessionId: 's2', host: 'host2' });

    const results = await logger.query({ host: 'host1' });
    expect(results.length).toBe(1);
  });

  it('respects limit', async () => {
    for (let i = 0; i < 10; i++) {
      logger.log({ kind: 'command', sessionId: `s${i}` });
    }

    const results = await logger.query({ limit: 3 });
    expect(results.length).toBe(3);
  });

  it('kind=all returns everything', async () => {
    logger.log({ kind: 'connect', sessionId: 's1' });
    logger.log({ kind: 'command', sessionId: 's1' });

    const results = await logger.query({ kind: 'all' });
    expect(results.length).toBe(2);
  });
});

function getLogFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f: string) => f.endsWith('.ndjson'))
    .sort()
    .map((f: string) => join(dir, f));
}
