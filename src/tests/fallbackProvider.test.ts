import { describe, expect, test } from 'bun:test';

import {
  buildFallbackReport,
  FallbackDeterministicProvider,
} from '@/lib/ai/fallbackProvider';
import { scoreRepository } from '@/lib/scoring/scoringEngine';
import {
  HEALTHY_PAYLOAD,
  HEALTHY_REPORT,
  payloadFor,
  SPARSE_FILES,
  createMemoryRepo,
  UNAVAILABLE_GIT,
} from './helpers/repoFixtures';

describe('buildFallbackReport', () => {
  test('always produces a complete, schema-shaped report', () => {
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);
    const report = buildFallbackReport(HEALTHY_PAYLOAD, score, findings);

    expect(report.verdict).toContain('100/100');
    expect(report.verdict).toContain('Healthy');
    expect(report.technicalAssessment.split('\n\n').length).toBeGreaterThanOrEqual(3);
    expect(report.technicalAssessment).toContain('fixture/demo');
    expect(report.rootCauses.length).toBeGreaterThan(0);
    expect(report.confidenceNote).toContain('100%');

    for (const phase of ['immediate', 'shortTerm', 'longTerm'] as const) {
      expect(report.roadmap[phase].length).toBeGreaterThan(0);
      for (const action of report.roadmap[phase]) {
        expect(action.title.length).toBeGreaterThanOrEqual(3);
        expect(action.rationale.length).toBeGreaterThanOrEqual(10);
        expect(action.expectedBenefit.length).toBeGreaterThan(0);
        expect(['low', 'medium', 'high']).toContain(action.effort);
      }
    }
  });

  test('derives roadmap actions from deterministic findings', () => {
    const payload = payloadFor(createMemoryRepo(SPARSE_FILES));
    const { score, findings } = scoreRepository(payload);
    const report = buildFallbackReport(payload, score, findings);

    const related = [
      ...report.roadmap.immediate,
      ...report.roadmap.shortTerm,
      ...report.roadmap.longTerm,
    ].flatMap((action) => action.relatedFindings);

    expect(findings.length).toBeGreaterThan(0);
    expect(related.length).toBeGreaterThan(0);
    for (const id of related) {
      expect(findings.some((finding) => finding.id === id)).toBe(true);
    }
  });

  test('explains low-confidence and unavailable-git cases honestly', () => {
    const payload = payloadFor(createMemoryRepo(SPARSE_FILES), UNAVAILABLE_GIT);
    const { score, findings } = scoreRepository(payload);
    const report = buildFallbackReport(payload, score, findings);

    expect(report.verdict).toMatch(/At Risk|Critical|Needs Attention/);
    expect(report.technicalAssessment).toContain('Git history was unavailable');
    expect(report.confidenceNote).toContain(`Confidence is ${score.confidence}%`);
  });

  test('never emits empty roadmap phases even with zero findings', () => {
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);
    const report = buildFallbackReport(HEALTHY_PAYLOAD, score, []);
    expect(report.roadmap.immediate.length).toBeGreaterThan(0);
    expect(report.roadmap.shortTerm.length).toBeGreaterThan(0);
    expect(report.roadmap.longTerm.length).toBeGreaterThan(0);
  });

  test('provider wrapper delegates to the same deterministic builder', async () => {
    const provider = new FallbackDeterministicProvider();
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);

    expect(provider.name).toBe('deterministic-fallback');
    expect(provider.model).toBeNull();
    expect(await provider.checkHealth()).toBe(true);

    const report = await provider.generateRevivalReport({
      payload: HEALTHY_PAYLOAD,
      score,
      findings,
    });
    expect(report).toEqual({
      verdict: HEALTHY_REPORT.ai.verdict,
      technicalAssessment: HEALTHY_REPORT.ai.technicalAssessment,
      rootCauses: HEALTHY_REPORT.ai.rootCauses,
      roadmap: HEALTHY_REPORT.ai.roadmap,
      confidenceNote: HEALTHY_REPORT.ai.confidenceNote,
    });
  });
});
