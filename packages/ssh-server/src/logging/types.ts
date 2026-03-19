export interface LogEvent {
  timestamp: string;
  kind: string;
  sessionId?: string;
  host?: string;
  username?: string;
  command?: string;
  path?: string;
  exitCode?: number;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilter {
  kind?: string;
  sessionId?: string;
  host?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}
