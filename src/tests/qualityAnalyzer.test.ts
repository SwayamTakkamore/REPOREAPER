import { describe, expect, test } from 'bun:test';

import { analyzeQuality, QUALITY_LIMITS } from '@/lib/analyzer/qualityAnalyzer';
import { createMemoryRepo, HEALTHY_FILES } from './helpers/repoFixtures';

describe('analyzeQuality', () => {
  test('detects layout, tests, CI, formatting, and test scripts', () => {
    const info = analyzeQuality(createMemoryRepo(HEALTHY_FILES));

    expect(info.sourceFileCount).toBe(2);
    expect(info.totalSourceLines).toBeGreaterThan(0);
    expect(info.standardLayoutDirs).toContain('src');
    expect(info.testDirectories).toContain('src');
    expect(info.ciConfigurations).toEqual(['.github/workflows/ci.yml']);
    expect(info.formattingConfigs).toContain('.prettierrc');
    expect(info.hasTestScript).toBe(true);
    expect(info.testScriptNames).toContain('npm test');
    expect(info.largestFile?.path).toBe('src/index.test.ts');
  });

  test('flags files above the oversized line threshold', () => {
    const oversized = Array.from({ length: QUALITY_LIMITS.oversizedLineThreshold + 5 }, (_, index) =>
      `const line${index} = ${index};`,
    ).join('\n');

    const info = analyzeQuality(
      createMemoryRepo({ 'src/huge.ts': oversized, 'src/small.ts': 'export {};\n' }),
    );

    expect(info.oversizedFiles).toHaveLength(1);
    expect(info.oversizedFiles[0]?.path).toBe('src/huge.ts');
    expect(info.oversizedFiles[0]?.lineCount).toBe(
      QUALITY_LIMITS.oversizedLineThreshold + 5,
    );
  });

  test('collects empty text files for hygiene reporting', () => {
    const info = analyzeQuality(
      createMemoryRepo({ 'src/empty.ts': '', 'README.md': '', 'src/index.ts': 'export {};\n' }),
    );
    expect(info.emptyFiles).toEqual(expect.arrayContaining(['src/empty.ts', 'README.md']));
  });

  test('detects ecosystem-specific test runners', () => {
    const python = analyzeQuality(
      createMemoryRepo({ 'pytest.ini': '[pytest]\n', 'app.py': 'print(1)\n' }),
    );
    expect(python.testScriptNames).toContain('pytest');

    const rust = analyzeQuality(
      createMemoryRepo({ 'Cargo.toml': '[dev-dependencies]\n', 'src/lib.rs': 'pub fn x() {}\n' }),
    );
    expect(rust.testScriptNames).toContain('cargo test');

    const go = analyzeQuality(
      createMemoryRepo({ 'go.mod': 'module demo\n', 'demo_test.go': 'package demo\n' }),
    );
    expect(go.testScriptNames).toContain('go test');

    const ruby = analyzeQuality(
      createMemoryRepo({ Gemfile: 'gem "rspec"\n', 'lib/demo.rb': 'module Demo; end\n' }),
    );
    expect(ruby.testScriptNames).toContain('rspec');
  });

  test('ignores the placeholder npm test script', () => {
    const info = analyzeQuality(
      createMemoryRepo({
        'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
      }),
    );
    expect(info.hasTestScript).toBe(false);
  });

  test('returns a safe empty report for a repository with no source files', () => {
    const info = analyzeQuality(createMemoryRepo({ 'notes.txt': 'hello\n' }));
    expect(info.sourceFileCount).toBe(0);
    expect(info.totalSourceLines).toBe(0);
    expect(info.largestFile).toBeNull();
    expect(info.oversizedFiles).toEqual([]);
    expect(info.testDirectories).toEqual([]);
    expect(info.standardLayoutDirs).toEqual([]);
  });
});
