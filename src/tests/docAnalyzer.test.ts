import { describe, expect, test } from 'bun:test';

import { analyzeDocumentation } from '@/lib/analyzer/docAnalyzer';
import { createMemoryRepo, HEALTHY_FILES } from './helpers/repoFixtures';

describe('analyzeDocumentation', () => {
  test('recognises a complete documentation set', () => {
    const info = analyzeDocumentation(createMemoryRepo(HEALTHY_FILES));

    expect(info.readme.exists).toBe(true);
    expect(info.readme.path).toBe('README.md');
    expect(info.readme.hasDescription).toBe(true);
    expect(info.readme.wordCount).toBeGreaterThan(20);
    expect(info.readme.sections.installation).toBe(true);
    expect(info.readme.sections.usage).toBe(true);
    expect(info.readme.sections.configuration).toBe(true);
    expect(info.readme.sections.contributing).toBe(true);
    expect(info.readme.sections.license).toBe(true);

    expect(info.license.type).toBe('MIT');
    expect(info.license.isOpenSource).toBe(true);
    expect(info.contributing).toBe(true);
    expect(info.codeOfConduct).toBe(true);
    expect(info.changelog).toBe(true);
    expect(info.securityPolicy).toBe(true);
    expect(info.envExample).toBe(true);
  });

  test('does not treat headings, badges, or short lines as a description', () => {
    const info = analyzeDocumentation(
      createMemoryRepo({
        'README.md': [
          '# Project',
          '',
          '[![Build](https://example.com/badge.svg)](https://example.com)',
          '',
          'Short tagline.',
          '',
          '| Column | Value |',
          '| --- | --- |',
          '| a | b |',
        ].join('\n'),
      }),
    );

    expect(info.readme.exists).toBe(true);
    expect(info.readme.hasDescription).toBe(false);
    expect(info.readme.sections.installation).toBe(false);
  });

  test('recognises alternative README casing and the first 480 characters as snippet', () => {
    const body = `${'A'.repeat(700)}`;
    const info = analyzeDocumentation(createMemoryRepo({ 'readme.md': body }));
    // `exists` is case-insensitive, so the canonical candidate is reported.
    expect(info.readme.path).toBe('README.md');
    expect(info.readme.snippet).toHaveLength(480);
    expect(info.readme.charCount).toBe(700);
  });

  test('detects an Apache license and rejects unrecognised licenses', () => {
    const apache = analyzeDocumentation(
      createMemoryRepo({
        LICENSE: 'Apache License, Version 2.0\n\nLicensed under the License.',
      }),
    );
    expect(apache.license.type).toBe('Apache-2.0');
    expect(apache.license.isOpenSource).toBe(true);

    const custom = analyzeDocumentation(
      createMemoryRepo({ LICENSE: 'All rights reserved. This is proprietary.' }),
    );
    expect(custom.license.type).toBe('Unrecognized');
    expect(custom.license.isOpenSource).toBe(false);
  });

  test('reports missing documentation explicitly', () => {
    const info = analyzeDocumentation(createMemoryRepo({ 'src/index.ts': 'export {};\n' }));

    expect(info.readme.exists).toBe(false);
    expect(info.readme.path).toBeNull();
    expect(info.readme.sections).toEqual({
      installation: false,
      usage: false,
      configuration: false,
      contributing: false,
      license: false,
    });
    expect(info.license).toEqual({
      exists: false,
      path: null,
      type: null,
      isOpenSource: false,
    });
    expect(info.docsDirectory).toBe(false);
  });

  test('detects a documentation directory', () => {
    const info = analyzeDocumentation(
      createMemoryRepo({ 'docs/guide.md': '# Guide\n' }),
    );
    expect(info.docsDirectory).toBe(true);
  });
});
