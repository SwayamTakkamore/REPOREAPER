import { describe, expect, test } from 'vitest';

import { buildMarkdownReport, exportFileName } from '@/lib/report/markdown';
import { HEALTHY_REPORT, payloadFor, createMemoryRepo, SPARSE_FILES } from './helpers/repoFixtures';
import { reportFor } from './helpers/repoFixtures';

describe('buildMarkdownReport', () => {
  test('renders all major report sections', () => {
    const markdown = buildMarkdownReport(HEALTHY_REPORT);

    expect(markdown.startsWith('# REPOREAPER — Revival Assessment')).toBe(true);
    expect(markdown).toContain('**fixture/demo**');
    expect(markdown).toContain('## Repository');
    expect(markdown).toContain('## Revival score');
    expect(markdown).toContain('## Signal detail');
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('## Technical assessment');
    expect(markdown).toContain('## Revival roadmap');
    expect(markdown).toContain('## Methodology');
    expect(markdown).toContain('static analysis only');
    expect(markdown).toContain('analysis id `test-analysis-id`');
  });

  test('reports the deterministic engine when the AI layer is degraded', () => {
    const markdown = buildMarkdownReport(HEALTHY_REPORT);
    expect(markdown).toContain('deterministic fallback engine');
    expect(markdown).toContain(HEALTHY_REPORT.ai.degradationReason as string);
  });

  test('escapes table cells and preserves multi-line findings', () => {
    const payload = payloadFor(createMemoryRepo(SPARSE_FILES));
    const report = reportFor(payload);
    report.score.dimensions[0]!.label = 'Documentation | Pipes';
    report.findings = [
      {
        id: 'finding-test',
        dimension: 'documentation',
        severity: 'high',
        title: 'Missing | README',
        description: 'Line one\nLine two',
        recommendation: 'Write a README.',
        evidence: {
          filePath: 'README.md',
          lineNumber: 3,
          snippet: '```\ncode\n```',
          note: 'Evidence note',
        },
      },
    ];

    const markdown = buildMarkdownReport(report);
    expect(markdown).toContain('Documentation \\| Pipes');
    expect(markdown).toContain('[HIGH] Missing | README');
    expect(markdown).toContain('README.md:3');
    expect(markdown).toContain('````');
    expect(markdown).toContain('> Evidence note');
  });

  test('has a "no findings" message', () => {
    const markdown = buildMarkdownReport(HEALTHY_REPORT);
    expect(markdown).toContain('No deterministic defects were detected.');
  });
});

describe('exportFileName', () => {
  test('builds a stable, filesystem-safe filename', () => {
    expect(exportFileName(HEALTHY_REPORT, 'md')).toBe('reporeaper-fixture-demo.md');
    expect(exportFileName(HEALTHY_REPORT, 'json')).toBe('reporeaper-fixture-demo.json');
  });

  test('sanitises unsafe owner and repository characters', () => {
    const report = {
      ...HEALTHY_REPORT,
      repository: {
        ...HEALTHY_REPORT.repository,
        owner: '../evil owner',
        repo: 'repo/name',
      },
    };
    const name = exportFileName(report, 'md');
    expect(name).toBe('reporeaper-..-evil-owner-repo-name.md');
    expect(name).not.toContain('/');
    expect(name).not.toContain(' ');
  });
});
