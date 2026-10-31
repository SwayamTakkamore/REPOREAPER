import path from 'node:path';

import { analyzeDependencies } from '@/lib/analyzer/dependencyAnalyzer';
import { analyzeDocumentation } from '@/lib/analyzer/docAnalyzer';
import { analyzeEcosystem } from '@/lib/analyzer/ecosystemDetector';
import { analyzeMaintenance } from '@/lib/analyzer/maintenanceAnalyzer';
import { analyzeQuality } from '@/lib/analyzer/qualityAnalyzer';
import { countLines, SCAN_LIMITS } from '@/lib/analyzer/fileScanner';
import { buildFallbackReport } from '@/lib/ai/fallbackProvider';
import { scoreRepository } from '@/lib/scoring/scoringEngine';
import type {
  AnalysisPayload,
  GitMetadata,
  RepoFs,
  RevivalAnalysisResponse,
  ScannedFile,
} from '@/lib/types';

/**
 * In-memory RepoFs used by analyzer tests.
 *
 * Repository fixtures are plain objects of `relativePath -> contents`, which
 * keeps each test readable and avoids touching the real filesystem.
 */

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  const base = path.basename(lower);
  if (base.startsWith('.') && !base.slice(1).includes('.')) return base;
  return path.extname(lower);
}

export function createMemoryRepo(
  files: Record<string, string>,
  extraDirectories: string[] = [],
): RepoFs {
  const directories = new Set<string>(extraDirectories);
  const scannedFiles: ScannedFile[] = [];

  for (const [relativePath, text] of Object.entries(files)) {
    const sizeBytes = Buffer.byteLength(text, 'utf8');
    scannedFiles.push({
      relativePath,
      sizeBytes,
      extension: extensionOf(relativePath),
      isText: true,
      lineCount: countLines(text),
    });

    let directory = path.posix.dirname(relativePath);
    while (directory && directory !== '.') {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }

  const fileIndex = new Map(
    scannedFiles.map((file) => [file.relativePath.toLowerCase(), file]),
  );
  const directoryList = [...directories].sort();

  return {
    files: scannedFiles,
    directories: directoryList,

    exists(relativePath: string): boolean {
      return fileIndex.has(relativePath.replace(/^\.\//, '').toLowerCase());
    },

    hasDirectory(directory: string): boolean {
      const needle = directory.replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
      if (needle.length === 0) return false;
      if (directoryList.some((entry) => entry.toLowerCase() === needle)) return true;
      return directoryList.some((entry) => entry.toLowerCase().startsWith(`${needle}/`));
    },

    readText(relativePath: string, maxBytes = SCAN_LIMITS.maxFileBytes): string | null {
      const file = fileIndex.get(relativePath.replace(/^\.\//, '').toLowerCase());
      if (!file) return null;
      const text = files[file.relativePath] ?? '';
      if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
      return Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
    },
  };
}

export const RECENT_GIT: GitMetadata = {
  available: true,
  lastCommitDate: '2026-01-15T12:00:00.000Z',
  lastCommitAgeDays: 20,
  commitCount: 120,
  contributorCount: 4,
  branch: 'main',
  shallow: true,
};

export const UNAVAILABLE_GIT: GitMetadata = {
  available: false,
  lastCommitDate: null,
  lastCommitAgeDays: null,
  commitCount: null,
  contributorCount: null,
  branch: null,
  shallow: false,
};

export function payloadFor(fs: RepoFs, git: GitMetadata = RECENT_GIT): AnalysisPayload {
  const quality = analyzeQuality(fs);
  return {
    repository: {
      owner: 'fixture',
      repo: 'demo',
      url: 'https://github.com/fixture/demo',
      analyzedAt: '2026-01-20T00:00:00.000Z',
      fileCount: fs.files.length,
      totalBytes: fs.files.reduce((total, file) => total + file.sizeBytes, 0),
      truncated: false,
    },
    ecosystem: analyzeEcosystem(fs),
    dependencies: analyzeDependencies(fs),
    documentation: analyzeDocumentation(fs),
    maintenance: analyzeMaintenance(fs, git, quality.totalSourceLines),
    quality,
  };
}

export function reportFor(payload: AnalysisPayload): RevivalAnalysisResponse {
  const { score, findings } = scoreRepository(payload);
  const content = buildFallbackReport(payload, score, findings);
  return {
    id: 'test-analysis-id',
    repository: payload.repository,
    score,
    ecosystem: payload.ecosystem,
    dependencies: payload.dependencies,
    documentation: payload.documentation,
    maintenance: payload.maintenance,
    quality: payload.quality,
    findings,
    ai: {
      ...content,
      provider: 'deterministic-fallback',
      model: null,
      generatedAt: '2026-01-20T00:00:00.000Z',
      degraded: true,
      degradationReason: 'Model inference is disabled by configuration.',
      durationMs: 12,
    },
    durationMs: 34,
    generatedAt: '2026-01-20T00:00:00.000Z',
  };
}

/** A deliberately healthy repository that should score close to 100. */
export const HEALTHY_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'fixture-demo',
      version: '1.0.0',
      scripts: { test: 'vitest run', build: 'next build' },
      dependencies: { next: '^16.0.10', react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: {
        typescript: '^5.9.3',
        vitest: '^3.0.0',
        prettier: '^3.0.0',
        tailwindcss: '^3.4.0',
      },
    },
    null,
    2,
  ),
  'bun.lock': '# lockfile fixture\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
  'README.md': [
    '# Fixture Demo',
    '',
    'A deliberately complete fixture repository used to verify that REPOREAPER recognises healthy documentation, testing, and dependency signals.',
    '',
    '## Installation',
    '',
    '```bash',
    'bun install',
    '```',
    '',
    '## Usage',
    '',
    '```ts',
    'import { demo } from "fixture-demo";',
    'demo();',
    '```',
    '',
    '## Configuration',
    '',
    'Set `AUTH_TOKEN` through `process.env.AUTH_TOKEN` before starting the server.',
    '',
    '## Contributing',
    '',
    'See CONTRIBUTING.md for the development workflow.',
    '',
    '## License',
    '',
    'MIT',
  ].join('\n'),
  LICENSE: [
    'MIT License',
    '',
    'Copyright (c) 2026 Fixture',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software.',
  ].join('\n'),
  'CONTRIBUTING.md': '# Contributing\n\nOpen a pull request with tests.\n',
  'CODE_OF_CONDUCT.md': '# Code of Conduct\n\nBe kind.\n',
  'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\nInitial release.\n',
  'SECURITY.md': '# Security\n\nReport issues privately.\n',
  '.env.example': 'AUTH_TOKEN=\n',
  '.prettierrc': '{ "singleQuote": true }\n',
  '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n',
  'src/index.ts': 'export function demo(): string {\n  return "demo";\n}\n',
  'src/index.test.ts': 'import { expect, test } from "vitest";\n\ntest("demo", () => {\n  expect(true).toBe(true);\n});\n',
};

export const SPARSE_FILES: Record<string, string> = {
  'README.md': '',
  'src/legacy.js': 'function legacy() {\n  return 1;\n}\nconsole.log(legacy());\n',
};

export const HEALTHY_REPO = createMemoryRepo(HEALTHY_FILES);
export const HEALTHY_PAYLOAD = payloadFor(HEALTHY_REPO);
export const HEALTHY_REPORT = reportFor(HEALTHY_PAYLOAD);
