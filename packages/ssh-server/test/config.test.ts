import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all SSH_MCP_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SSH_MCP_')) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns defaults when no env vars set', () => {
    const config = loadConfig();
    expect(config.maxConnections).toBe(10);
    expect(config.defaultTerm).toBe('xterm-256color');
    expect(config.defaultCols).toBe(220);
    expect(config.defaultRows).toBe(50);
    expect(config.shellReadTimeoutMs).toBe(5000);
    expect(config.execTimeoutMs).toBe(30000);
    expect(config.maxBackgroundJobs).toBe(20);
    expect(config.keepaliveIntervalMs).toBe(15000);
    expect(config.keepaliveRetries).toBe(3);
    expect(config.maxUploadSizeMb).toBe(100);
    expect(config.maxDownloadSizeMb).toBe(100);
    expect(config.hostKeyMode).toBe('accept');
    expect(config.env).toBe('development');
    expect(config.forwardAgent).toBe(false);
  });

  it('reads integer env vars', () => {
    process.env.SSH_MCP_MAX_CONNECTIONS = '5';
    process.env.SSH_MCP_DEFAULT_COLS = '120';
    process.env.SSH_MCP_EXEC_TIMEOUT_MS = '60000';
    const config = loadConfig();
    expect(config.maxConnections).toBe(5);
    expect(config.defaultCols).toBe(120);
    expect(config.execTimeoutMs).toBe(60000);
  });

  it('falls back to default for invalid integers', () => {
    process.env.SSH_MCP_MAX_CONNECTIONS = 'notanumber';
    const config = loadConfig();
    expect(config.maxConnections).toBe(10);
  });

  it('reads string env vars', () => {
    process.env.SSH_MCP_DEFAULT_TERM = 'vt100';
    process.env.SSH_MCP_LOG_DIR = '/tmp/ssh-logs';
    const config = loadConfig();
    expect(config.defaultTerm).toBe('vt100');
    expect(config.logDir).toBe('/tmp/ssh-logs');
  });

  it('reads boolean env vars', () => {
    process.env.SSH_MCP_FORWARD_AGENT = 'true';
    expect(loadConfig().forwardAgent).toBe(true);

    process.env.SSH_MCP_FORWARD_AGENT = '1';
    expect(loadConfig().forwardAgent).toBe(true);

    process.env.SSH_MCP_FORWARD_AGENT = 'false';
    expect(loadConfig().forwardAgent).toBe(false);
  });

  it('defaults hostKeyMode to accept in development', () => {
    process.env.SSH_MCP_ENV = 'development';
    const config = loadConfig();
    expect(config.hostKeyMode).toBe('accept');
  });

  it('defaults hostKeyMode to strict in production', () => {
    process.env.SSH_MCP_ENV = 'production';
    const config = loadConfig();
    expect(config.hostKeyMode).toBe('strict');
  });

  it('explicit hostKeyMode overrides env-based default', () => {
    process.env.SSH_MCP_ENV = 'production';
    process.env.SSH_MCP_HOST_KEY_MODE = 'accept';
    const config = loadConfig();
    expect(config.hostKeyMode).toBe('accept');
  });
});
