import { mkdirSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { LogEvent, LogFilter } from './types.js';

export class EventLogger {
  private logDir: string;
  private currentLogFile: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    mkdirSync(logDir, { recursive: true });
    this.currentLogFile = this.getLogFilePath();
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return join(this.logDir, `ssh-mcp-${date}.ndjson`);
  }

  log(event: Omit<LogEvent, 'timestamp'>): void {
    const fullEvent: LogEvent = {
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Rotate log file if date changed
    const expected = this.getLogFilePath();
    if (expected !== this.currentLogFile) {
      this.currentLogFile = expected;
    }

    const line = JSON.stringify(fullEvent) + '\n';
    try {
      appendFileSync(this.currentLogFile, line, 'utf-8');
    } catch {
      // Fallback: log to stderr if file write fails
      process.stderr.write(`[ssh-mcp-log] ${line}`);
    }

    // Also emit to stderr for MCP transport visibility
    process.stderr.write(
      `[ssh-mcp] ${fullEvent.kind}: ${fullEvent.command || fullEvent.path || ''}\n`,
    );
  }

  async query(filter: LogFilter): Promise<LogEvent[]> {
    const results: LogEvent[] = [];
    const limit = filter.limit || 50;

    // Read all log files in directory (sorted by date)
    const files = this.getLogFiles();
    for (const file of files) {
      if (results.length >= limit) break;

      const content = readFileSync(file, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        if (results.length >= limit) break;

        try {
          const event: LogEvent = JSON.parse(line);

          if (filter.kind && filter.kind !== 'all' && event.kind !== filter.kind) continue;
          if (filter.sessionId && event.sessionId !== filter.sessionId) continue;
          if (filter.host && event.host !== filter.host) continue;
          if (filter.since && new Date(event.timestamp) < filter.since) continue;
          if (filter.until && new Date(event.timestamp) > filter.until) continue;

          results.push(event);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return results;
  }

  private getLogFiles(): string[] {
    if (!existsSync(this.logDir)) return [];
    const files: string[] = readdirSync(this.logDir)
      .filter((f: string) => f.startsWith('ssh-mcp-') && f.endsWith('.ndjson'))
      .sort()
      .map((f: string) => join(this.logDir, f));
    return files;
  }
}
