import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { analyzeLocalDirectory } from '@/lib/analyzer/orchestrator';
import { STAGE_ORDER, type StageEvent, type StageId } from '@/lib/types';

// Keep the suite offline and deterministic: never probe a live Ollama server.
process.env.AI_PROVIDER = 'fallback';

import { HEALTHY_FILES } from './helpers/repoFixtures';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reporeaper-e2e-'));

beforeAll(() => {
  for (const [relativePath, contents] of Object.entries(HEALTHY_FILES)) {
    const target = path.join(sandbox, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
});

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('analyzeLocalDirectory end-to-end', () => {
  test('runs the full static pipeline and degrades gracefully without a model', async () => {
    const events: StageEvent[] = [];
    const report = await analyzeLocalDirectory(sandbox, {
      repoUrl: 'https://github.com/fixture/e2e',
      now: new Date('2026-01-20T00:00:00.000Z'),
      onStage: (event) => events.push(event),
    });

    expect(report.repository.owner).toBe('fixture');
    expect(report.repository.repo).toBe('e2e');
    expect(report.repository.fileCount).toBeGreaterThan(5);
    expect(report.repository.analyzedAt).toBe('2026-01-20T00:00:00.000Z');

    expect(report.ecosystem.primaryLanguage).toBe('TypeScript');
    expect(report.ecosystem.packageManager).toBe('bun');
    expect(report.dependencies.totalDependencies).toBeGreaterThan(0);
    expect(report.documentation.readme.exists).toBe(true);
    expect(report.documentation.license.type).toBe('MIT');
    expect(report.quality.testDirectories.length).toBeGreaterThan(0);

    // The temporary directory is not a git checkout, so maintenance must be
    // scored neutrally rather than treated as a defect.
    expect(report.maintenance.available).toBe(false);
    expect(report.score.confidence).toBeLessThan(100);
    expect(report.score.total).toBeGreaterThanOrEqual(70);

    expect(report.ai.provider).toBe('deterministic-fallback');
    expect(report.ai.degraded).toBe(true);
    expect(report.ai.degradationReason).toContain('disabled by configuration');
    expect(report.ai.verdict.length).toBeGreaterThan(10);
    expect(report.ai.roadmap.immediate.length).toBeGreaterThan(0);

    // Every emitted stage is a known stage, reported in order, ending complete.
    const seen = new Set<StageId>();
    for (const event of events) {
      expect(STAGE_ORDER).toContain(event.stage);
      seen.add(event.stage);
      expect(event.totalStages).toBe(STAGE_ORDER.length);
    }
    expect(seen.has('VALIDATING_URL')).toBe(true);
    expect(seen.has('INSPECTING_STRUCTURE')).toBe(true);
    expect(seen.has('GENERATING_AI_ASSESSMENT')).toBe(true);
    expect(events.at(-1)?.status).toBe('complete');
  });

  test('honours a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      analyzeLocalDirectory(sandbox, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });

  test('throws a typed analysis error for an invalid URL override', async () => {
    await expect(
      analyzeLocalDirectory(sandbox, { repoUrl: 'http://github.com/owner/repo' }),
    ).rejects.toMatchObject({ code: 'INVALID_PROTOCOL' });
  });
});
