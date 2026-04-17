import type { Client as SSH2Client, SFTPWrapper, ClientChannel } from 'ssh2';

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  label?: string;
  keepaliveInterval?: number;
  keepaliveCountMax?: number;
}

export interface SSHSession {
  id: string;
  config: Omit<SSHConnectionConfig, 'password' | 'privateKey' | 'passphrase'>;
  connection: SSH2Client;
  createdAt: Date;
  lastActivity: Date;
  label?: string;
  serverBanner?: string;
  authMethod: 'password' | 'publickey';
}

export interface SessionInfo {
  id: string;
  host: string;
  port: number;
  username: string;
  label?: string;
  createdAt: Date;
  lastActivity: Date;
  authMethod: 'password' | 'publickey';
  shellCount: number;
  jobCount: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  durationMs: number;
  truncated: boolean;
}

export interface BackgroundJob {
  id: string;
  sessionId: string;
  command: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
  signal?: string;
  stdout: string;
  stderr: string;
  channel?: ClientChannel;
}

export interface JobInfo {
  id: string;
  sessionId: string;
  command: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
}

export interface ShellChannel {
  id: string;
  sessionId: string;
  term: string;
  cols: number;
  rows: number;
  createdAt: Date;
  channel: ClientChannel;
  buffer: string;
}

export interface ShellInfo {
  id: string;
  sessionId: string;
  term: string;
  cols: number;
  rows: number;
  createdAt: Date;
  bufferSize: number;
}

export interface ShellDefaults {
  term: string;
  cols: number;
  rows: number;
}

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  permissions: string;
  owner: string;
  group: string;
  modified: Date;
}

export interface FileStats {
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  permissions: string;
  permissionsOctal: string;
  uid: number;
  gid: number;
  modified: Date;
  accessed: Date;
}

export interface ReadOptions {
  encoding?: BufferEncoding;
  maxBytes?: number;
  offset?: number;
}

export interface WriteOptions {
  mode?: string;
  overwrite?: boolean;
  append?: boolean;
}

export interface TransferResult {
  bytesTransferred: number;
  durationMs: number;
  remotePath: string;
  localPath: string;
}

export interface PortForward {
  id: string;
  sessionId: string;
  type: 'local' | 'remote';
  localPort: number;
  localAddress: string;
  remoteHost: string;
  remotePort: number;
  createdAt: Date;
  server?: import('net').Server;
}

export interface PortForwardInfo {
  id: string;
  sessionId: string;
  type: 'local' | 'remote';
  localPort: number;
  localAddress: string;
  remoteHost: string;
  remotePort: number;
  createdAt: Date;
}

export interface PingResult {
  alive: boolean;
  latencyMs: number;
  sessionId: string;
}

export interface KeepaliveConfig {
  interval: number;
  retries: number;
}

export type SFTPWrapperType = SFTPWrapper;

// --- Phase 12: Snapshot types ---

export interface SystemSnapshot {
  id: string;
  sessionId: string;
  label?: string;
  createdAt: Date;
  sections: Record<string, string>;
}

// --- Phase 12: Bookmark types ---

export interface ConnectionBookmark {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  label?: string;
  createdAt: Date;
}
