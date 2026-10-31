import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  countLines,
  createRepoFs,
  isPathInside,
  resolveInsideRoot,
  scanRepository,
} from '@/lib/analyzer/fileScanner';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reporeaper-test-'));

function write(relativePath: string, contents: string): void {
  const target = path.join(sandbox, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

write('README.md', '# Fixture\n\nA repository used by the scanner tests.\n');
write('src/app.ts', 'export const app = true;\n');
write('src/lib/util.ts', 'export function add(a: number, b: number) { return a + b; }\n');
write('node_modules/left-pad/index.js', 'module.exports = () => {};\n');
write('.git/config', '[core]\n');
write('assets/logo.png', 'not-a-real-png');

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('scanRepository', () => {
  test('collects files and directories while ignoring dependency and VCS trees', async () => {
    const scan = await scanRepository(sandbox);

    const paths = scan.files.map((file) => file.relativePath);
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('src/lib/util.ts');
    expect(paths).not.toContain('node_modules/left-pad/index.js');
    expect(paths).not.toContain('.git/config');

    expect(scan.directories).toEqual(expect.arrayContaining(['src', 'src/lib', 'assets']));
    expect(scan.fileCount).toBe(scan.files.length);
    expect(scan.truncated).toBe(false);
    expect(scan.totalBytes).toBeGreaterThan(0);
  });

  test('marks known binary extensions as non-text without reading them', async () => {
    const scan = await scanRepository(sandbox);
    const png = scan.files.find((file) => file.relativePath === 'assets/logo.png');
    expect(png?.isText).toBe(false);
    expect(png?.extension).toBe('.png');
  });

  test('enforces the maxFiles cap and reports truncation', async () => {
    const scan = await scanRepository(sandbox, { maxFiles: 2 });
    expect(scan.files).toHaveLength(2);
    expect(scan.truncated).toBe(true);
  });

  test('does not follow symlinks outside the sandbox', async () => {
    const outside = path.join(os.tmpdir(), `reporeaper-outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'secret', 'utf8');

    try {
      fs.symlinkSync(outside, path.join(sandbox, 'escape.txt'));
      const scan = await scanRepository(sandbox);
      expect(scan.files.map((file) => file.relativePath)).not.toContain('escape.txt');
    } finally {
      fs.rmSync(outside, { force: true });
      fs.rmSync(path.join(sandbox, 'escape.txt'), { force: true });
    }
  });
});

describe('createRepoFs', () => {
  test('reads text within the sandbox and rejects traversal', async () => {
    const scan = await scanRepository(sandbox);
    const repoFs = createRepoFs(sandbox, scan);

    expect(repoFs.exists('README.md')).toBe(true);
    expect(repoFs.exists('./README.md')).toBe(true);
    expect(repoFs.exists('README.md.bak')).toBe(false);
    expect(repoFs.hasDirectory('src')).toBe(true);
    expect(repoFs.hasDirectory('src/lib')).toBe(true);
    expect(repoFs.hasDirectory('missing')).toBe(false);

    const text = repoFs.readText('src/app.ts');
    expect(text).toContain('export const app');

    expect(repoFs.readText('../outside.txt')).toBeNull();
    expect(repoFs.readText('/etc/passwd')).toBeNull();
    expect(repoFs.readText('does/not/exist.ts')).toBeNull();
  });

  test('caps reads at maxBytes and returns a valid prefix', async () => {
    const scan = await scanRepository(sandbox);
    const repoFs = createRepoFs(sandbox, scan);
    const text = repoFs.readText('README.md', 5);
    expect(text).toBe('# Fix');
  });
});

describe('path helpers', () => {
  test('resolveInsideRoot accepts nested paths and rejects escapes', () => {
    const root = path.resolve('/tmp/repo');
    expect(resolveInsideRoot(root, 'src/index.ts')).toBe(path.join(root, 'src/index.ts'));
    expect(resolveInsideRoot(root, '../etc/passwd')).toBeNull();
    expect(resolveInsideRoot(root, 'src/../../etc/passwd')).toBeNull();
    expect(resolveInsideRoot(root, '/etc/passwd')).toBeNull();
    expect(resolveInsideRoot(root, '')).toBeNull();
  });

  test('isPathInside distinguishes descendants from siblings', () => {
    const root = path.resolve('/tmp/repo');
    expect(isPathInside(root, path.join(root, 'a/b'))).toBe(true);
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(root, '/tmp/repo-other')).toBe(false);
  });
});

describe('countLines', () => {
  test('matches editor line counting semantics', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('one line')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\nb\n')).toBe(3);
    expect(countLines('a\n\nb')).toBe(3);
  });
});
