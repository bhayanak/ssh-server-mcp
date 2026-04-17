import { Client as SSH2Client } from 'ssh2';
import { readFileSync, fstatSync, openSync, closeSync } from 'fs';
import { randomUUID } from 'crypto';
import type {
  SSHConnectionConfig,
  SSHSession,
  SessionInfo,
  PingResult,
  KeepaliveConfig,
} from './types.js';
import type { EventLogger } from '../logging/event-logger.js';

export class SessionManager {
  private sessions: Map<string, SSHSession> = new Map();
  private maxConnections: number;
  private keepaliveConfig: KeepaliveConfig;
  private hostKeyMode: 'accept' | 'strict' | 'ask';
  private logger: EventLogger;

  constructor(
    maxConnections: number,
    keepaliveConfig: KeepaliveConfig,
    hostKeyMode: 'accept' | 'strict' | 'ask',
    logger: EventLogger,
  ) {
    this.maxConnections = maxConnections;
    this.keepaliveConfig = keepaliveConfig;
    this.hostKeyMode = hostKeyMode;
    this.logger = logger;
  }

  async create(config: SSHConnectionConfig): Promise<SSHSession> {
    if (this.sessions.size >= this.maxConnections) {
      throw new Error(
        `Maximum connections reached (${this.maxConnections}). Disconnect a session first.`,
      );
    }

    // Resolve private key from path if provided
    let privateKey = config.privateKey;
    if (
      !privateKey &&
      (config as SSHConnectionConfig & { privateKeyPath?: string }).privateKeyPath
    ) {
      const keyPath = (config as SSHConnectionConfig & { privateKeyPath?: string }).privateKeyPath!;
      // Open fd first, then stat+read on the same handle to avoid TOCTOU race (CodeQL js/file-system-race)
      const fd = openSync(keyPath, 'r');
      try {
        const stat = fstatSync(fd);
        const mode = stat.mode & 0o777;
        if (mode & 0o077) {
          process.stderr.write(
            `[ssh-mcp] WARNING: Private key file ${keyPath} has permissive permissions (${mode.toString(8)}). Consider chmod 600.\n`,
          );
        }
        privateKey = readFileSync(fd, 'utf-8');
      } finally {
        closeSync(fd);
      }
    }

    const client = new SSH2Client();
    const sessionId = randomUUID();

    return new Promise<SSHSession>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH connection timed out after 30 seconds'));
      }, 30000);

      client.on('ready', () => {
        clearTimeout(timeout);
        const session: SSHSession = {
          id: sessionId,
          config: {
            host: config.host,
            port: config.port,
            username: config.username,
            label: config.label,
            keepaliveInterval: config.keepaliveInterval,
            keepaliveCountMax: config.keepaliveCountMax,
          },
          connection: client,
          createdAt: new Date(),
          lastActivity: new Date(),
          label: config.label,
          serverBanner: (client as unknown as { _remoteVer?: string })._remoteVer,
          authMethod: privateKey || config.privateKey ? 'publickey' : 'password',
        };

        this.sessions.set(sessionId, session);

        this.logger.log({
          kind: 'connect',
          sessionId,
          host: config.host,
          username: config.username,
          metadata: {
            port: config.port,
            label: config.label,
            authMethod: session.authMethod,
          },
        });

        resolve(session);
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        this.logger.log({
          kind: 'error',
          host: config.host,
          username: config.username,
          error: err.message,
        });
        reject(err);
      });

      client.on('close', () => {
        this.sessions.delete(sessionId);
      });

      client.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        privateKey: privateKey,
        passphrase: config.passphrase,
        keepaliveInterval: this.keepaliveConfig.interval,
        keepaliveCountMax: this.keepaliveConfig.retries,
        hostVerifier: (_hashedKey: Buffer) => {
          if (this.hostKeyMode === 'accept') {
            process.stderr.write(
              `[ssh-mcp] WARNING: Auto-accepting host key for ${config.host}:${config.port || 22} (SSH_MCP_HOST_KEY_MODE=accept)\n`,
            );
            return true;
          }
          if (this.hostKeyMode === 'strict') {
            // In strict mode, ssh2 will handle known_hosts checking
            // For now, reject unknown keys
            return false;
          }
          // 'ask' mode - accept with warning (can't interactively ask in MCP context)
          process.stderr.write(
            `[ssh-mcp] WARNING: Unknown host key for ${config.host}:${config.port || 22} (SSH_MCP_HOST_KEY_MODE=ask, auto-accepting)\n`,
          );
          return true;
        },
      });
    });
  }

  get(sessionId: string): SSHSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  getOrThrow(sessionId: string): SSHSession {
    const session = this.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}. Use ssh_connect to create a session.`);
    }
    return session;
  }

  async remove(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.logger.log({
        kind: 'disconnect',
        sessionId,
        host: session.config.host,
        username: session.config.username,
      });
      session.connection.end();
      this.sessions.delete(sessionId);
    }
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      host: s.config.host,
      port: s.config.port,
      username: s.config.username,
      label: s.label,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      authMethod: s.authMethod,
      shellCount: 0, // Updated by shell manager
      jobCount: 0, // Updated by job manager
    }));
  }

  async ping(sessionId: string): Promise<PingResult> {
    const session = this.getOrThrow(sessionId);
    const start = Date.now();

    return new Promise<PingResult>((resolve, _reject) => {
      // Use exec to run a simple command to test connectivity
      session.connection.exec('echo pong', (err, stream) => {
        if (err) {
          resolve({ alive: false, latencyMs: Date.now() - start, sessionId });
          return;
        }
        stream.on('close', () => {
          resolve({ alive: true, latencyMs: Date.now() - start, sessionId });
        });
        stream.on('error', () => {
          resolve({ alive: false, latencyMs: Date.now() - start, sessionId });
        });
      });
    });
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.remove(id);
    }
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  get maxSessions(): number {
    return this.maxConnections;
  }

  /**
   * Register an externally-created session (e.g. from a jump/proxy connection).
   */
  addSession(session: SSHSession): void {
    if (this.sessions.size >= this.maxConnections) {
      throw new Error(
        `Maximum connections reached (${this.maxConnections}). Disconnect a session first.`,
      );
    }
    this.sessions.set(session.id, session);
  }
}
