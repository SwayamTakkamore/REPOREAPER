import { describe, expect, test } from 'bun:test';

import {
  buildFindings,
  computeScore,
  scoreRepository,
  SCORING_MAX_PER_DIMENSION,
} from '@/lib/scoring/scoringEngine';
import { healthLabelFor, severityRank, DIMENSION_KEYS, type HealthScore } from '@/lib/types';
import {
  createMemoryRepo,
  HEALTHY_PAYLOAD,
  payloadFor,
  SPARSE_FILES,
  UNAVAILABLE_GIT,
} from './helpers/repoFixtures';

describe('computeScore', () => {
  test('always produces five dimensions, 18 signals, and a bounded total', () => {
    const score = computeScore(HEALTHY_PAYLOAD);

    expect(score.dimensions).toHaveLength(5);
    expect(score.dimensions.map((dimension) => dimension.key)).toEqual([...DIMENSION_KEYS]);
    expect(score.signalsTotal).toBe(18);
    expect(score.maxTotal).toBe(SCORING_MAX_PER_DIMENSION * 5);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(score.maxTotal);

    for (const dimension of score.dimensions) {
      expect(dimension.signals.length).toBeGreaterThan(0);
      const awarded = dimension.signals.reduce((sum, signal) => sum + signal.awarded, 0);
      expect(dimension.score).toBe(awarded);
      expect(dimension.score).toBeLessThanOrEqual(dimension.maxScore);
      expect(dimension.percentage).toBe(Math.round((dimension.score / dimension.maxScore) * 100));
    }
  });

  test('scores a healthy repository highly with full confidence', () => {
    const score = computeScore(HEALTHY_PAYLOAD);
    expect(score.total).toBe(100);
    expect(score.label).toBe('Healthy');
    expect(score.confidence).toBe(100);
    expect(score.signalsEvaluated).toBe(score.signalsTotal);
  });

  test('scores a sparse repository low and exposes verifiable failures', () => {
    const score = computeScore(payloadFor(createMemoryRepo(SPARSE_FILES)));

    expect(score.total).toBeLessThan(50);
    expect(score.confidence).toBeLessThan(100);
    expect(score.label).toBe(healthLabelFor(Math.round((score.total / score.maxTotal) * 100)));
    expect(score.dimensions.some((dimension) => dimension.status !== 'Healthy')).toBe(true);
  });

  test('treats unavailable git history as an unknown, neutral signal', () => {
    const score = computeScore(payloadFor(createMemoryRepo(SPARSE_FILES), UNAVAILABLE_GIT));
    const maintenance = score.dimensions.find((dimension) => dimension.key === 'maintenance');
    const signal = maintenance?.signals.find((entry) => entry.id === 'commit_recency');

    expect(signal?.status).toBe('unknown');
    expect(signal?.awarded).toBe(10);
    expect(signal?.max).toBe(20);
  });

  test('applies age bands to the maintenance signal', () => {
    const cases: Array<[number, number]> = [
      [30, 20],
      [200, 14],
      [500, 8],
      [1000, 3],
      [2000, 0],
    ];

    for (const [ageDays, expected] of cases) {
      const score = computeScore(
        payloadFor(createMemoryRepo(SPARSE_FILES), {
          ...UNAVAILABLE_GIT,
          available: true,
          lastCommitAgeDays: ageDays,
          lastCommitDate: new Date().toISOString(),
        }),
      );
      const signal = score.dimensions
        .find((dimension) => dimension.key === 'maintenance')
        ?.signals.find((entry) => entry.id === 'commit_recency');
      expect(signal?.awarded).toBe(expected);
      expect(signal?.status).not.toBe('unknown');
    }
  });

  test('marks dependency constraints unknown when nothing is declared', () => {
    const score = computeScore(payloadFor(createMemoryRepo(SPARSE_FILES)));
    const signal = score.dimensions
      .find((dimension) => dimension.key === 'dependencies')
      ?.signals.find((entry) => entry.id === 'version_constraints');

    expect(signal?.status).toBe('unknown');
    expect(signal?.awarded).toBe(0);
  });

  test('is deterministic for identical input', () => {
    const first = computeScore(HEALTHY_PAYLOAD);
    const second = computeScore(HEALTHY_PAYLOAD);
    expect(second).toEqual(first);
  });
});

describe('healthLabelFor', () => {
  test('maps percentages to labels at the documented thresholds', () => {
    expect(healthLabelFor(100)).toBe('Healthy');
    expect(healthLabelFor(80)).toBe('Healthy');
    expect(healthLabelFor(79)).toBe('Needs Attention');
    expect(healthLabelFor(60)).toBe('Needs Attention');
    expect(healthLabelFor(59)).toBe('At Risk');
    expect(healthLabelFor(40)).toBe('At Risk');
    expect(healthLabelFor(39)).toBe('Critical');
    expect(healthLabelFor(0)).toBe('Critical');
  });
});

describe('buildFindings', () => {
  test('creates no findings for a fully healthy repository', () => {
    const score = computeScore(HEALTHY_PAYLOAD);
    expect(buildFindings(HEALTHY_PAYLOAD, score)).toEqual([]);
  });

  test('emits sorted, typed findings for failing signals only', () => {
    const payload = payloadFor(createMemoryRepo(SPARSE_FILES));
    const score = computeScore(payload);
    const findings = buildFindings(payload, score);

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.id).toBe(`finding-${finding.id.replace('finding-', '')}`);
      expect(finding.description).toContain('Signal awarded');
      expect(finding.recommendation.length).toBeGreaterThan(0);
    }

    const ordered = [...findings].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.id.localeCompare(b.id),
    );
    expect(findings).toEqual(ordered);
  });

  test('surfaces unavailable maintenance as an informational finding', () => {
    const payload = payloadFor(createMemoryRepo(SPARSE_FILES), UNAVAILABLE_GIT);
    const score = computeScore(payload);
    const findings = buildFindings(payload, score);
    const maintenance = findings.find((finding) => finding.id === 'finding-commit_recency');

    expect(maintenance).toBeDefined();
    expect(maintenance?.severity).toBe('info');
    expect(maintenance?.title).toBe('Maintenance history unavailable');
    expect(maintenance?.description).toContain('unknown, not a confirmed defect');
  });

  test('scoreRepository bundles score and findings', () => {
    const result = scoreRepository(HEALTHY_PAYLOAD);
    expect(result.score.total).toBe(HEALTHY_PAYLOAD.quality.sourceFileCount > 0 ? 100 : 0);
    expect(result.findings).toEqual([]);
  });
});

describe('HealthScore invariant', () => {
  test('confidence cannot exceed 100', () => {
    const score: HealthScore = computeScore(HEALTHY_PAYLOAD);
    expect(score.confidence).toBeLessThanOrEqual(100);
    expect(score.confidence).toBeGreaterThanOrEqual(0);
  });
});
