import { describe, expect, test } from 'bun:test';

import { analyzeEcosystem } from '@/lib/analyzer/ecosystemDetector';
import { createMemoryRepo, HEALTHY_FILES } from './helpers/repoFixtures';

describe('analyzeEcosystem', () => {
  test('detects a TypeScript Next.js project', () => {
    const info = analyzeEcosystem(createMemoryRepo(HEALTHY_FILES));

    expect(info.primaryLanguage).toBe('TypeScript');
    expect(info.packageManager).toBe('bun');
    expect(info.manifests).toContain('package.json');
    expect(info.frameworks.map((framework) => framework.name)).toEqual(
      expect.arrayContaining(['Next.js', 'React', 'Tailwind CSS']),
    );
    expect(info.frameworks.filter((framework) => framework.name === 'React')).toHaveLength(1);
    expect(info.tooling).toEqual(expect.arrayContaining(['TypeScript', 'Prettier', 'Vitest']));
  });

  test('falls back to JavaScript when package.json has no tsconfig', () => {
    const info = analyzeEcosystem(
      createMemoryRepo({
        'package.json': JSON.stringify({ dependencies: { express: '^4.18.0' } }),
        'index.js': 'module.exports = {};\n',
      }),
    );

    expect(info.primaryLanguage).toBe('JavaScript');
    expect(info.frameworks[0]?.evidence).toContain('express');
    expect(info.packageManager).toBe('npm');
  });

  test('detects Kotlin from build.gradle.kts', () => {
    const info = analyzeEcosystem(
      createMemoryRepo({
        'build.gradle.kts': 'plugins { kotlin("jvm") }\n',
        'gradlew': '#!/bin/sh\n',
        'src/Main.kt': 'fun main() {}\n',
      }),
    );

    expect(info.primaryLanguage).toBe('Kotlin');
    expect(info.packageManager).toBe('gradle');
  });

  test('computes language percentages that sum to 100', () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 7; index += 1) files[`src/file${index}.ts`] = 'export {};\n';
    for (let index = 0; index < 3; index += 1) files[`src/file${index}.py`] = 'pass\n';

    const info = analyzeEcosystem(createMemoryRepo(files));
    const total = info.languages.reduce((sum, language) => sum + language.percentage, 0);

    expect(total).toBe(100);
    expect(info.languages[0]?.name).toBe('TypeScript');
    expect(info.languages[0]?.fileCount).toBe(7);
    expect(info.primaryLanguage).toBe('TypeScript');
  });

  test('returns Unknown for an empty repository', () => {
    const info = analyzeEcosystem(createMemoryRepo({}));
    expect(info.primaryLanguage).toBe('Unknown');
    expect(info.languages).toEqual([]);
    expect(info.packageManager).toBeNull();
    expect(info.manifests).toEqual([]);
  });
});
