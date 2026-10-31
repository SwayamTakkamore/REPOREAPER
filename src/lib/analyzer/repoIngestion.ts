import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RepoCoordinates } from '@/lib/types';

/**
 * Safe repository ingestion.
 *
 * `git` is always invoked through `execFile` with an explicit argument vector —
 * there is no shell, therefore no command interpolation. The clone target is a
 * fresh, random directory under the scan root and is deleted by the caller in a
 * `finally` block (and by this module on failure).
 */

const DEFAULT_SCAN_ROOT = path.join(os.tmpdir(), 'reporeaper-scans');
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_ERROR_LENGTH = 320;

export type IngestionErrorCode =
  | 'GIT_UNAVAILABLE'
  | 'CLONE_TIMEOUT'
  | 'CLONE_ABORTED'
  | 'REPO_NOT_FOUND'
  | 'REPO_PRIVATE'
  | 'REPO_TOO_LARGE'
  | 'CLONE_FAILED';

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode, message: string) {
    super(message);
    this.name = 'IngestionError';
    this.code = code;
  }
}

export interface IngestionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  scanRoot?: string;
}

export interface IngestedRepository {
  directory: string;
  sizeBytes: number;
  cleanup: () => Promise<void>;
}

function scanRootFor(options: IngestionOptions): string {
  return (
    options.scanRoot ??
    process.env.REPOREAPER_SCAN_ROOT ??
    DEFAULT_SCAN_ROOT
  );
}

function sanitiseGitStderr(stderr: string): string {
  const singleLine = stderr
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return singleLine.slice(0, MAX_ERROR_LENGTH);
}

function runGitClone(
  coords: RepoCoordinates,
  targetDirectory: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--no-tags',
      '--config',
      'core.symlinks=false',
      '--',
      coords.cloneUrl,
      targetDirectory,
    ];

    execFile(
      'git',
      args,
      {
        timeout: timeoutMs,
        signal,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        // CI-safe environment: never wait for credentials, never fetch LFS blobs.
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_LFS_SKIP_SMUDGE: '1',
        },
      },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }

        const killed = (error as NodeJS.ErrnoException).code === 'ABORT_ERR';
        const timedOut =
          (error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ||
          (error as { killed?: boolean }).killed === true;

        if (killed) {
          reject(new IngestionError('CLONE_ABORTED', 'Repository ingestion was cancelled.'));
          return;
        }
        if (timedOut) {
          reject(
            new IngestionError(
              'CLONE_TIMEOUT',
              `Repository clone exceeded the ${Math.round(timeoutMs / 1000)}s limit. ` +
                'The repository may be too large to analyze.',
            ),
          );
          return;
        }

        const details = sanitiseGitStderr(stderr ?? '');
        if (/repository not found|does not appear to be a git repository/i.test(details)) {
          reject(
            new IngestionError(
              'REPO_NOT_FOUND',
              'Repository not found. Confirm the URL points to a public GitHub repository.',
            ),
          );
          return;
        }
        if (/authentication failed|could not read username|terminal prompts disabled/i.test(details)) {
          reject(
            new IngestionError(
              'REPO_PRIVATE',
              'This repository is private or requires authentication. Only public repositories can be analyzed.',
            ),
          );
          return;
        }
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new IngestionError(
              'GIT_UNAVAILABLE',
              'The git executable is not available on this host.',
            ),
          );
          return;
        }

        reject(
          new IngestionError(
            'CLONE_FAILED',
            details.length > 0
              ? `git clone failed: ${details}`
              : 'git clone failed for an unknown reason.',
          ),
        );
      },
    );
  });
}

/** Bounded recursive disk-usage measurement (never follows symlinks). */
async function measureDirectory(root: string, limitBytes: number): Promise<number> {
  let total = 0;
  const queue: string[] = [root];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      try {
        const stat = await fs.promises.lstat(absolute);
        total += stat.size;
      } catch {
        // File vanished mid-walk; ignore.
      }
      if (total > limitBytes) return total;
    }
  }

  return total;
}

export async function removeScanDirectory(directory: string): Promise<void> {
  try {
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Cleanup is best-effort; a leaked temp directory must never fail a request.
  }
}

/**
 * Clones a validated repository into an isolated temp directory.
 *
 * The caller owns cleanup for successful ingests:
 *
 * ```ts
 * const repo = await ingestRepository(coords);
 * try { ... } finally { await repo.cleanup(); }
 * ```
 *
 * Failed clones are cleaned up automatically before the error is rethrown.
 */
export async function ingestRepository(
  coords: RepoCoordinates,
  options: IngestionOptions = {},
): Promise<IngestedRepository> {
  const scanRoot = path.resolve(scanRootFor(options));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (options.signal?.aborted) {
    throw new IngestionError('CLONE_ABORTED', 'Repository ingestion was cancelled.');
  }

  await fs.promises.mkdir(scanRoot, { recursive: true, mode: 0o700 });

  const directory = path.join(scanRoot, randomUUID());

  try {
    await fs.promises.mkdir(directory, { recursive: false, mode: 0o700 });
    await runGitClone(coords, directory, timeoutMs, options.signal);

    const sizeBytes = await measureDirectory(directory, maxBytes);
    if (sizeBytes > maxBytes) {
      throw new IngestionError(
        'REPO_TOO_LARGE',
        `Repository exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB analysis limit.`,
      );
    }

    let cleaned = false;
    return {
      directory,
      sizeBytes,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await removeScanDirectory(directory);
      },
    };
  } catch (error) {
    await removeScanDirectory(directory);
    if (error instanceof IngestionError) throw error;
    throw new IngestionError(
      'CLONE_FAILED',
      error instanceof Error ? `Repository ingestion failed: ${error.message}` : 'Repository ingestion failed.',
    );
  }
}

/** Removes orphaned scan directories left behind by a hard process crash. */
export async function cleanupStaleScans(
  options: { scanRoot?: string; olderThanMs?: number } = {},
): Promise<number> {
  const scanRoot = path.resolve(options.scanRoot ?? scanRootFor({}));
  const olderThanMs = options.olderThanMs ?? 2 * 60 * 60 * 1000;
  const cutoff = Date.now() - olderThanMs;
  let removed = 0;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(scanRoot, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const absolute = path.join(scanRoot, entry.name);
    try {
      const stat = await fs.promises.stat(absolute);
      if (stat.mtimeMs < cutoff) {
        await removeScanDirectory(absolute);
        removed += 1;
      }
    } catch {
      // ignore
    }
  }

  return removed;
}
