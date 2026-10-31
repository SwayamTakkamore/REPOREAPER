import { execFile } from 'node:child_process';

import type { GitMetadata, MaintenanceInfo, RepoFs } from '@/lib/types';

/**
 * Git maintenance signal extraction.
 *
 * Git is invoked read-only via `execFile` with argument vectors. Only local
 * metadata is read — no remotes are contacted, no hooks run, no refs mutate.
 */

const GIT_TIMEOUT_MS = 5_000;

function runGit(directory: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', directory, ...args],
      {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

function daysBetween(fromIso: string, now: Date): number | null {
  const parsed = Date.parse(fromIso);
  if (Number.isNaN(parsed)) return null;
  const delta = now.getTime() - parsed;
  if (delta < 0) return 0;
  return Math.floor(delta / (24 * 60 * 60 * 1000));
}

/** Reads local git metadata from a cloned repository. Never throws. */
export async function readGitMetadata(directory: string, now = new Date()): Promise<GitMetadata> {
  const unavailable: GitMetadata = {
    available: false,
    lastCommitDate: null,
    lastCommitAgeDays: null,
    commitCount: null,
    contributorCount: null,
    branch: null,
    shallow: false,
  };

  const [branch, lastCommitDate, commitCountRaw, shortlog, shallowRaw] = await Promise.all([
    runGit(directory, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(directory, ['log', '-1', '--format=%cI']),
    runGit(directory, ['rev-list', '--count', 'HEAD']),
    runGit(directory, ['shortlog', '-sne', 'HEAD']),
    runGit(directory, ['rev-parse', '--is-shallow-repository']),
  ]);

  if (!lastCommitDate) return unavailable;

  const ageDays = daysBetween(lastCommitDate, now);
  const commitCount = commitCountRaw ? Number.parseInt(commitCountRaw, 10) : null;
  const contributorCount = shortlog
    ? shortlog.split('\n').filter((line) => line.trim().length > 0).length
    : null;

  return {
    available: true,
    lastCommitDate,
    lastCommitAgeDays: ageDays,
    commitCount: Number.isFinite(commitCount) ? commitCount : null,
    contributorCount,
    branch: branch && branch.length > 0 ? branch : null,
    shallow: shallowRaw === 'true',
  };
}

const TODO_PATTERN = /\bTODO\b/g;
const FIXME_PATTERN = /\bFIXME\b/g;
const HACK_PATTERN = /\bHACK\b/g;

const MAX_SCANNED_FILES = 400;
const MAX_BYTES_PER_FILE = 160 * 1024;

function countMatches(text: string, pattern: RegExp): number {
  // Reset lastIndex because the patterns are shared and stateful with /g.
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  pattern.lastIndex = 0;
  return count;
}

export function analyzeMaintenance(
  fs: RepoFs,
  git: GitMetadata,
  totalSourceLines = 0,
): MaintenanceInfo {
  let todoCount = 0;
  let fixmeCount = 0;
  let hackCount = 0;
  let scanned = 0;

  for (const file of fs.files) {
    if (!file.isText || file.sizeBytes === 0) continue;
    if (scanned >= MAX_SCANNED_FILES) break;

    const text = fs.readText(file.relativePath, MAX_BYTES_PER_FILE);
    if (text === null) continue;
    scanned += 1;

    todoCount += countMatches(text, TODO_PATTERN);
    fixmeCount += countMatches(text, FIXME_PATTERN);
    hackCount += countMatches(text, HACK_PATTERN);
  }

  const markers = todoCount + fixmeCount + hackCount;
  const todoDensity =
    totalSourceLines > 0
      ? Math.round((markers / totalSourceLines) * 1000 * 10) / 10
      : 0;

  return {
    ...git,
    todoCount,
    fixmeCount,
    hackCount,
    todoDensity,
  };
}
