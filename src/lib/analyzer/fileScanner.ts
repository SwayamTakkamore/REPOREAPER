import fs from 'node:fs';
import path from 'node:path';

import type { FileScanResult, RepoFs, ScannedFile } from '@/lib/types';

/**
 * Bounded, read-only filesystem scanner.
 *
 * Guarantees:
 *  - Never follows symlinks (prevents escapes out of the sandbox).
 *  - Skips VCS metadata, dependency trees, and build output.
 *  - Hard caps on file count, depth, and total bytes.
 *  - Every read is canonicalised and must remain inside the scan root.
 */

export const SCAN_LIMITS = {
  maxFiles: 1000,
  maxDepth: 6,
  maxFileBytes: 500 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
} as const;

export interface ScanOptions {
  maxFiles: number;
  maxDepth: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'bower_components',
  'jspm_packages',
  'vendor',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  'coverage',
  '.nyc_output',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.gradle',
  '.idea',
  '.vscode',
  '.terragrunt-cache',
  'pods',
  'deriveddata',
]);

const IGNORED_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.json', '.jsonc', '.json5',
  '.md', '.mdx', '.markdown', '.rst', '.txt', '.adoc', '.asciidoc',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.properties',
  '.css', '.scss', '.sass', '.less', '.styl',
  '.html', '.htm', '.xml', '.svg', '.vue', '.svelte', '.astro',
  '.py', '.pyi', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.fs', '.swift', '.m', '.mm',
  '.php', '.pl', '.pm', '.lua', '.r', '.jl', '.dart', '.ex', '.exs',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.proto', '.tf', '.hcl',
  '.env', '.example', '.sample', '.lock', '.gitignore', '.gitattributes',
  '.dockerignore', '.editorconfig', '.npmrc', '.nvmrc', '.prettierrc',
  '.eslintrc', '.eslintignore', '.babelrc', '.browserslistrc',
  '.csv', '.tsv', '.diff', '.patch',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.tiff',
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.m4a', '.wav', '.ogg', '.webm', '.mov', '.avi', '.mkv',
  '.wasm', '.so', '.dylib', '.dll', '.exe', '.bin', '.o', '.a', '.class',
  '.jar', '.war', '.pyc', '.pyo', '.node', '.map',
  '.db', '.sqlite', '.sqlite3', '.parquet', '.avro',
  '.psd', '.ai', '.sketch', '.fig',
]);

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  const base = path.basename(lower);
  if (base.startsWith('.') && !base.slice(1).includes('.')) return base;
  return path.extname(lower);
}

function looksBinary(absPath: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(absPath, 'r');
    const buffer = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    for (let index = 0; index < bytesRead; index += 1) {
      if (buffer[index] === 0) return true;
    }
    return false;
  } catch {
    return true;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close failures
      }
    }
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function addDirectoryChain(directories: Set<string>, relativePath: string): void {
  let current = path.posix.dirname(relativePath);
  while (current && current !== '.' && current !== '/') {
    directories.add(current);
    current = path.posix.dirname(current);
  }
}

/**
 * Resolves a relative path inside `root`, rejecting absolute paths, traversal
 * segments, and symlink escapes. Returns null when the path is unsafe.
 */
export function resolveInsideRoot(root: string, relativePath: string): string | null {
  const normalised = relativePath.replace(/\\/g, '/');
  if (normalised.length === 0 || normalised.startsWith('/')) return null;
  if (normalised.split('/').some((segment) => segment === '..')) return null;

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, normalised);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

/** True when `child` is the same as, or nested below, `parent`. */
export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function scanRepository(
  rootDir: string,
  overrides: Partial<ScanOptions> = {},
): Promise<FileScanResult> {
  const limits: ScanOptions = { ...SCAN_LIMITS, ...overrides };
  const root = path.resolve(rootDir);
  const files: ScannedFile[] = [];
  const directories = new Set<string>();
  let totalBytes = 0;
  let truncated = false;

  interface QueueEntry {
    absolutePath: string;
    relativePath: string;
    depth: number;
  }

  const queue: QueueEntry[] = [{ absolutePath: root, relativePath: '', depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift() as QueueEntry;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.absolutePath, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= limits.maxFiles) {
        truncated = true;
        break;
      }

      const name = entry.name;
      const lowercaseName = name.toLowerCase();
      const relativePath = current.relativePath
        ? `${current.relativePath}/${name}`
        : name;

      // Never traverse symlinks: a symlink could point outside the sandbox.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(lowercaseName)) continue;
        if (current.depth + 1 > limits.maxDepth) {
          truncated = true;
          continue;
        }
        directories.add(toPosix(relativePath));
        queue.push({
          absolutePath: path.join(current.absolutePath, name),
          relativePath: toPosix(relativePath),
          depth: current.depth + 1,
        });
        continue;
      }

      if (!entry.isFile()) continue;
      if (IGNORED_FILES.has(lowercaseName)) continue;
      if (IGNORED_DIRECTORIES.has(lowercaseName)) continue;

      const absolutePath = path.join(current.absolutePath, name);
      let sizeBytes = 0;
      try {
        const stat = fs.lstatSync(absolutePath);
        if (!stat.isFile()) continue;
        sizeBytes = stat.size;
      } catch {
        continue;
      }

      if (totalBytes + sizeBytes > limits.maxTotalBytes) {
        truncated = true;
        break;
      }

      const extension = extensionOf(name);
      const isText = TEXT_EXTENSIONS.has(extension)
        ? true
        : BINARY_EXTENSIONS.has(extension)
          ? false
          : !looksBinary(absolutePath);

      files.push({
        relativePath: toPosix(relativePath),
        sizeBytes,
        extension,
        isText,
        lineCount: null,
      });

      totalBytes += sizeBytes;
      addDirectoryChain(directories, toPosix(relativePath));
    }

    if (files.length >= limits.maxFiles || totalBytes >= limits.maxTotalBytes) {
      truncated = true;
      break;
    }
  }

  return {
    files,
    directories: [...directories].sort(),
    totalBytes,
    truncated,
    fileCount: files.length,
  };
}

/**
 * Creates a sandboxed, read-only view over a scanned repository. Reads are
 * synchronous, size-capped, and rejected when they escape the root.
 */
export function createRepoFs(rootDir: string, scan: FileScanResult): RepoFs {
  const root = path.resolve(rootDir);
  const fileIndex = new Map<string, ScannedFile>();
  for (const file of scan.files) {
    fileIndex.set(file.relativePath.toLowerCase(), file);
  }
  const directorySet = new Set(scan.directories.map((dir) => dir.toLowerCase()));

  return {
    files: scan.files,
    directories: scan.directories,

    exists(relativePath: string): boolean {
      return fileIndex.has(relativePath.replace(/^\.\//, '').toLowerCase());
    },

    hasDirectory(directory: string): boolean {
      const needle = directory.replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
      if (needle.length === 0) return false;
      if (directorySet.has(needle)) return true;
      for (const dir of directorySet) {
        if (dir.startsWith(`${needle}/`)) return true;
      }
      return false;
    },

    readText(relativePath: string, maxBytes = SCAN_LIMITS.maxFileBytes): string | null {
      const absolutePath = resolveInsideRoot(root, relativePath);
      if (!absolutePath) return null;

      try {
        const realRoot = fs.realpathSync(root);
        const realFile = fs.realpathSync(absolutePath);
        if (!isPathInside(realRoot, realFile)) return null;

        const stat = fs.statSync(realFile);
        if (!stat.isFile()) return null;
        if (stat.size > maxBytes) {
          // Read a bounded prefix so callers still get useful signal.
          const fd = fs.openSync(realFile, 'r');
          try {
            const buffer = Buffer.alloc(maxBytes);
            const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
            return buffer.subarray(0, bytesRead).toString('utf8');
          } finally {
            fs.closeSync(fd);
          }
        }
        return fs.readFileSync(realFile, 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Counts lines exactly the way a text editor would. */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1;
  }
  return lines;
}
