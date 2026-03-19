// ANSI escape code regex pattern
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

export function truncateOutput(
  output: string,
  maxBytes: number = 50000,
): { text: string; truncated: boolean } {
  if (output.length <= maxBytes) {
    return { text: output, truncated: false };
  }
  return {
    text: output.slice(0, maxBytes) + `\n... (truncated, ${output.length} bytes total)`,
    truncated: true,
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function parseRelativeTime(input: string): Date | null {
  const match = input.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = Date.now();
  switch (unit) {
    case 's':
      return new Date(now - value * 1000);
    case 'm':
      return new Date(now - value * 60 * 1000);
    case 'h':
      return new Date(now - value * 60 * 60 * 1000);
    case 'd':
      return new Date(now - value * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}
