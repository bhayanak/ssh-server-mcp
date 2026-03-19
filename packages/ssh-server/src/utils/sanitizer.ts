import { posix } from 'path';

/**
 * Sanitize a remote file path to prevent path traversal attacks.
 * Normalizes the path and rejects patterns that attempt directory escape.
 */
export function sanitizePath(remotePath: string): string {
  // Normalize the path
  const normalized = posix.normalize(remotePath);

  // Check for null bytes (used in some path traversal attacks)
  if (normalized.includes('\0')) {
    throw new Error(`Invalid path: contains null bytes`);
  }

  // For absolute paths, ensure normalization didn't escape the root
  if (remotePath.startsWith('/')) {
    if (!normalized.startsWith('/')) {
      throw new Error(`Path traversal detected: ${remotePath}`);
    }
  }

  return normalized;
}

/**
 * Validate that a path does not attempt to escape a given base directory.
 */
export function validatePathWithinBase(remotePath: string, basePath: string): string {
  const normalized = sanitizePath(remotePath);
  const resolvedPath = posix.resolve(basePath, normalized);

  if (!resolvedPath.startsWith(basePath)) {
    throw new Error(`Path traversal detected: ${remotePath} escapes base ${basePath}`);
  }

  return resolvedPath;
}
