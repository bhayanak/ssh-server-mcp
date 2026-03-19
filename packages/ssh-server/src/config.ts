import { homedir } from 'os';
import { join } from 'path';

export interface ServerConfig {
  maxConnections: number;
  logDir: string;
  defaultTerm: string;
  defaultCols: number;
  defaultRows: number;
  shellReadTimeoutMs: number;
  execTimeoutMs: number;
  maxBackgroundJobs: number;
  keepaliveIntervalMs: number;
  keepaliveRetries: number;
  maxUploadSizeMb: number;
  maxDownloadSizeMb: number;
  hostKeyMode: 'accept' | 'strict' | 'ask';
  env: 'development' | 'production';
  forwardAgent: boolean;
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): ServerConfig {
  const env = (process.env.SSH_MCP_ENV as 'development' | 'production') || 'development';

  // Host key mode: explicit setting takes precedence, otherwise derived from env
  const explicitHostKeyMode = process.env.SSH_MCP_HOST_KEY_MODE as
    | 'accept'
    | 'strict'
    | 'ask'
    | undefined;
  const hostKeyMode = explicitHostKeyMode || (env === 'production' ? 'strict' : 'accept');

  return {
    maxConnections: parseIntEnv(process.env.SSH_MCP_MAX_CONNECTIONS, 10),
    logDir: process.env.SSH_MCP_LOG_DIR || join(homedir(), '.ssh-mcp', 'logs'),
    defaultTerm: process.env.SSH_MCP_DEFAULT_TERM || 'xterm-256color',
    defaultCols: parseIntEnv(process.env.SSH_MCP_DEFAULT_COLS, 220),
    defaultRows: parseIntEnv(process.env.SSH_MCP_DEFAULT_ROWS, 50),
    shellReadTimeoutMs: parseIntEnv(process.env.SSH_MCP_SHELL_READ_TIMEOUT_MS, 5000),
    execTimeoutMs: parseIntEnv(process.env.SSH_MCP_EXEC_TIMEOUT_MS, 30000),
    maxBackgroundJobs: parseIntEnv(process.env.SSH_MCP_MAX_BACKGROUND_JOBS, 20),
    keepaliveIntervalMs: parseIntEnv(process.env.SSH_MCP_KEEPALIVE_INTERVAL_MS, 15000),
    keepaliveRetries: parseIntEnv(process.env.SSH_MCP_KEEPALIVE_RETRIES, 3),
    maxUploadSizeMb: parseIntEnv(process.env.SSH_MCP_MAX_UPLOAD_SIZE_MB, 100),
    maxDownloadSizeMb: parseIntEnv(process.env.SSH_MCP_MAX_DOWNLOAD_SIZE_MB, 100),
    hostKeyMode,
    env,
    forwardAgent: parseBoolEnv(process.env.SSH_MCP_FORWARD_AGENT, false),
  };
}
