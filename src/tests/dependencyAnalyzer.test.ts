import { describe, expect, test } from 'vitest';

import {
  analyzeDependencies,
  primaryManifestPath,
} from '@/lib/analyzer/dependencyAnalyzer';
import { createMemoryRepo } from './helpers/repoFixtures';

describe('analyzeDependencies', () => {
  test('collects unique Node.js dependencies and detects wildcards', () => {
    const fs = createMemoryRepo({
      'package.json': JSON.stringify({
        dependencies: { react: '*', express: '^4.18.0' },
        devDependencies: { react: 'latest', vitest: '^3.0.0' },
      }),
      'package-lock.json': '{}',
    });

    const info = analyzeDependencies(fs);

    expect(info.totalDependencies).toBe(3);
    expect(info.declaredDependencies).toEqual(['express', 'react', 'vitest']);
    expect(info.wildcardDependencies).toEqual(['react']);
    expect(info.hasLockfile).toBe(true);
    expect(info.missingLockfilesFor).toEqual([]);
    expect(primaryManifestPath(info)).toBe('package.json');
  });

  test('reports a missing lockfile for an ecosystem with candidates', () => {
    const fs = createMemoryRepo({
      'package.json': JSON.stringify({ dependencies: { react: '^19.0.0' } }),
    });

    const info = analyzeDependencies(fs);
    expect(info.hasLockfile).toBe(false);
    expect(info.missingLockfilesFor).toContain('Node.js');
  });

  test('does not require a lockfile for Maven or Gradle', () => {
    const fs = createMemoryRepo({
      'pom.xml': '<project></project>',
      'build.gradle': 'plugins { id "java" }',
    });

    const info = analyzeDependencies(fs);
    expect(info.manifests).toHaveLength(2);
    expect(info.missingLockfilesFor).toEqual([]);
  });

  test('flags unpinned Python requirements', () => {
    const fs = createMemoryRepo({
      'requirements.txt': ['flask', 'requests>=2.31.0', '# comment', 'django==4.2.0'].join('\n'),
      'requirements.lock': 'generated\n',
    });

    const info = analyzeDependencies(fs);
    expect(info.declaredDependencies).toEqual(['django', 'flask', 'requests']);
    expect(info.wildcardDependencies).toEqual(['flask']);
    expect(info.hasLockfile).toBe(true);
  });

  test('parses pyproject dependencies in both Poetry and PEP 621 styles', () => {
    const fs = createMemoryRepo({
      'pyproject.toml': [
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'httpx = "*"',
        '',
        '[tool.poetry.dev-dependencies]',
        'pytest = "^8.0.0"',
      ].join('\n'),
    });

    const info = analyzeDependencies(fs);
    expect(info.declaredDependencies).toContain('httpx');
    expect(info.declaredDependencies).toContain('pytest');
    expect(info.wildcardDependencies).toContain('httpx');
  });

  test('parses Cargo dependencies and detects bare versions', () => {
    const fs = createMemoryRepo({
      'Cargo.toml': [
        '[package]',
        'name = "demo"',
        '',
        '[dependencies]',
        'serde = "1.0"',
        'tokio = "*"',
        '',
        '[dev-dependencies]',
        'criterion = { version = "0.5" }',
      ].join('\n'),
      'Cargo.lock': 'version = 3\n',
    });

    const info = analyzeDependencies(fs);
    expect(info.declaredDependencies).toEqual(['criterion', 'serde', 'tokio']);
    expect(info.wildcardDependencies).toEqual(['tokio']);
    expect(info.lockfiles[0]?.ecosystem).toBe('Rust');
  });

  test('detects legacy build tools from files and script references', () => {
    const fs = createMemoryRepo({
      'package.json': JSON.stringify({
        scripts: { build: 'gulp build' },
      }),
      'bower.json': '{}',
      'Gruntfile.js': 'module.exports = {};\n',
    });

    const info = analyzeDependencies(fs);
    expect(info.legacyBuildTools).toEqual(['Bower', 'Grunt', 'Gulp']);
  });

  test('marks malformed JSON manifests as unparsed without throwing', () => {
    const fs = createMemoryRepo({ 'package.json': '{ "dependencies": ' });

    const info = analyzeDependencies(fs);
    expect(info.manifests[0]?.parsed).toBe(false);
    expect(info.totalDependencies).toBe(0);
  });

  test('returns an empty report for a repository without manifests', () => {
    const info = analyzeDependencies(createMemoryRepo({ 'src/index.ts': 'export {};\n' }));
    expect(info.manifests).toEqual([]);
    expect(info.totalDependencies).toBe(0);
    expect(info.hasLockfile).toBe(false);
    expect(primaryManifestPath(info)).toBeNull();
  });
});
