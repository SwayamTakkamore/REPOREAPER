import { describe, expect, test } from 'vitest';

import {
  AIReportValidationError,
  extractJsonObject,
  parseAIReport,
  parseAIReportOrThrow,
} from '@/lib/ai/schema';
import type { RevivalReportContent } from '@/lib/types';

const action = {
  title: 'Write a README',
  rationale: 'The repository has no onboarding document for new users.',
  expectedBenefit: 'New users can evaluate the project quickly.',
  effort: 'low',
  relatedFindings: ['finding-readme_exists'],
};

export function validReport(): RevivalReportContent {
  return {
    verdict: 'The repository can be revived with focused documentation work.',
    technicalAssessment:
      'The score is low because documentation and testing signals are missing.\n\nThe code itself is small enough to audit in a single session.',
    rootCauses: ['Documentation is absent.', 'Tests are absent.', 'Dependencies are unpinned.'],
    roadmap: {
      immediate: [action],
      shortTerm: [{ ...action, title: 'Add a test harness', relatedFindings: [] }],
      longTerm: [{ ...action, title: 'Set a release cadence', relatedFindings: [] }],
    },
    confidenceNote: 'Most signals were verifiable from repository contents.',
  };
}

describe('extractJsonObject', () => {
  test('returns null for empty or brace-free responses', () => {
    expect(extractJsonObject('')).toBeNull();
    expect(extractJsonObject('no json here')).toBeNull();
  });

  test('strips markdown fences and surrounding prose', () => {
    const raw = 'Here is the report:\n```json\n{"a": 1}\n```\nDone.';
    expect(extractJsonObject(raw)).toBe('{"a": 1}');
  });

  test('extracts the outermost object from nested content', () => {
    expect(extractJsonObject('prefix {"a": {"b": 2}} suffix')).toBe('{"a": {"b": 2}}');
  });
});

describe('parseAIReport', () => {
  test('accepts a schema-valid report', () => {
    const result = parseAIReport(JSON.stringify(validReport()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toContain('revived');
    expect(result.value.roadmap.immediate).toHaveLength(1);
  });

  test('accepts a fenced JSON response', () => {
    const raw = `\`\`\`json\n${JSON.stringify(validReport())}\n\`\`\``;
    expect(parseAIReport(raw).ok).toBe(true);
  });

  test('rejects malformed JSON', () => {
    const result = parseAIReport('{"verdict": }');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('malformed JSON');
  });

  test('rejects a missing JSON object', () => {
    const result = parseAIReport('No output today.');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('did not contain a JSON object');
  });

  test('rejects an invalid effort level', () => {
    const report = validReport();
    report.roadmap.immediate = [{ ...action, effort: 'extreme' as never }];
    const result = parseAIReport(JSON.stringify(report));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('effort');
  });

  test('rejects an empty roadmap phase and a too-short assessment', () => {
    const emptyRoadmap = { ...validReport(), roadmap: { immediate: [], shortTerm: [action], longTerm: [action] } };
    expect(parseAIReport(JSON.stringify(emptyRoadmap)).ok).toBe(false);

    const shortAssessment = { ...validReport(), technicalAssessment: 'too short' };
    expect(parseAIReport(JSON.stringify(shortAssessment)).ok).toBe(false);
  });

  test('rejects extra whitespace-only root causes', () => {
    const report = { ...validReport(), rootCauses: ['   '] };
    expect(parseAIReport(JSON.stringify(report)).ok).toBe(false);
  });
});

describe('parseAIReportOrThrow', () => {
  test('returns the validated content', () => {
    expect(parseAIReportOrThrow(JSON.stringify(validReport())).confidenceNote).toContain(
      'verifiable',
    );
  });

  test('throws an AIReportValidationError with issues', () => {
    expect(() => parseAIReportOrThrow('{}')).toThrow(AIReportValidationError);
  });
});
