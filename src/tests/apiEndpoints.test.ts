import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { GET as analyzeStatus, POST as analyzePost } from '@/app/api/analyze/route';
import { POST as exportPost } from '@/app/api/export/route';
import { DELETE as deleteModelRoute, GET as getModels } from '@/app/api/models/route';
import { POST as setActiveModelRoute } from '@/app/api/models/active/route';
import {
  DELETE as cancelDownloadRoute,
  GET as getDownload,
  POST as startDownloadRoute,
} from '@/app/api/models/download/route';
import { GET as downloadStream } from '@/app/api/models/download/stream/route';
import {
  clearFinishedDownload,
  getActiveModel,
  setActiveModel,
  startModelDownload,
} from '@/lib/models/modelManager';
import { runAnalysis } from '@/lib/analyzer/orchestrator';
import { STAGE_ORDER, type RevivalAnalysisResponse, type StageEvent } from '@/lib/types';

import { HEALTHY_REPORT } from './helpers/repoFixtures';

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

vi.mock('@/lib/analyzer/orchestrator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analyzer/orchestrator')>();
  return { ...actual, runAnalysis: vi.fn() };
});

const MOCK_REPORT = {
  id: 'mock-report',
  repository: { owner: 'mock', repo: 'demo' },
  score: { total: 87 },
  findings: [],
  ai: { roadmap: { immediate: [], shortTerm: [], longTerm: [] } },
} as unknown as RevivalAnalysisResponse;

const MOCK_STAGE: StageEvent = {
  stage: 'VALIDATING_URL',
  stageIndex: 1,
  totalStages: STAGE_ORDER.length,
  status: 'complete',
  message: 'URL validated.',
  timestamp: 0,
};

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn(() => true);
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

let modelsDir: string;
let originalModelsDir: string | undefined;
let originalHfHome: string | undefined;
let originalHubCache: string | undefined;
let originalFetch: typeof globalThis.fetch;
let initialActiveModel: string;

beforeAll(() => {
  modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporeaper-api-models-'));

  originalModelsDir = process.env.REPOREAPER_MODELS_DIR;
  originalHfHome = process.env.HF_HOME;
  originalHubCache = process.env.HUGGINGFACE_HUB_CACHE;

  // Isolate model discovery from the developer's real Hugging Face cache.
  delete process.env.HF_HOME;
  delete process.env.HUGGINGFACE_HUB_CACHE;
  process.env.REPOREAPER_MODELS_DIR = modelsDir;

  // setActiveModel probes a local inference server; keep the suite offline.
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

  initialActiveModel = getActiveModel();
});

afterAll(async () => {
  await setActiveModel(initialActiveModel).catch(() => undefined);

  globalThis.fetch = originalFetch;

  if (originalModelsDir === undefined) delete process.env.REPOREAPER_MODELS_DIR;
  else process.env.REPOREAPER_MODELS_DIR = originalModelsDir;

  if (originalHfHome === undefined) delete process.env.HF_HOME;
  else process.env.HF_HOME = originalHfHome;

  if (originalHubCache === undefined) delete process.env.HUGGINGFACE_HUB_CACHE;
  else process.env.HUGGINGFACE_HUB_CACHE = originalHubCache;

  fs.rmSync(modelsDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.mocked(runAnalysis).mockImplementation(async (_repoUrl, options) => {
    options?.onStage?.(MOCK_STAGE);
    return MOCK_REPORT;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  clearFinishedDownload();
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/* -------------------------------------------------------------------------- */
/* /api/analyze                                                               */
/* -------------------------------------------------------------------------- */

describe('GET /api/analyze', () => {
  test('returns status ok and the ordered stage list', async () => {
    const response = analyzeStatus();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.stages).toEqual([...STAGE_ORDER]);
    expect(typeof body.description).toBe('string');
  });
});

describe('POST /api/analyze', () => {
  test('starts an SSE stream for a repoUrl payload', async () => {
    const response = await analyzePost(
      jsonRequest('http://localhost/api/analyze', 'POST', {
        repoUrl: 'https://github.com/mock/demo',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const text = await response.text();
    expect(text).toContain('event: stage');
    expect(text).toContain('event: complete');
    expect(text).toContain('mock-report');
    expect(runAnalysis).toHaveBeenCalledWith(
      'https://github.com/mock/demo',
      expect.objectContaining({ onStage: expect.any(Function) }),
    );
  });

  test('accepts the legacy url alias and streams the analysis', async () => {
    const response = await analyzePost(
      jsonRequest('http://localhost/api/analyze', 'POST', {
        url: 'https://github.com/mock/legacy',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const text = await response.text();
    expect(text).toContain('event: complete');
    expect(runAnalysis).toHaveBeenCalledWith(
      'https://github.com/mock/legacy',
      expect.objectContaining({ onStage: expect.any(Function) }),
    );
  });

  test('rejects an empty repoUrl with a 400 error payload', async () => {
    const response = await analyzePost(
      jsonRequest('http://localhost/api/analyze', 'POST', { repoUrl: '' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('repoUrl');
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  test('rejects a payload with no URL field', async () => {
    const response = await analyzePost(
      jsonRequest('http://localhost/api/analyze', 'POST', { owner: 'mock' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('repoUrl');
  });

  test('rejects malformed JSON with a 400 error payload', async () => {
    const response = await analyzePost(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not-json',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('valid JSON');
  });
});

/* -------------------------------------------------------------------------- */
/* /api/export                                                                */
/* -------------------------------------------------------------------------- */

describe('POST /api/export', () => {
  test('exports a valid report as a Markdown attachment', async () => {
    const response = await exportPost(
      jsonRequest('http://localhost/api/export', 'POST', {
        report: HEALTHY_REPORT,
        format: 'md',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="reporeaper-fixture-demo.md"',
    );

    const text = await response.text();
    expect(text.startsWith('# REPOREAPER — Revival Assessment')).toBe(true);
    expect(text).toContain('**fixture/demo**');
  });

  test('exports a valid report as a JSON attachment', async () => {
    const response = await exportPost(
      jsonRequest('http://localhost/api/export', 'POST', {
        report: HEALTHY_REPORT,
        format: 'json',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="reporeaper-fixture-demo.json"',
    );

    const body = JSON.parse(await response.text()) as RevivalAnalysisResponse;
    expect(body.repository.owner).toBe('fixture');
    expect(body.repository.repo).toBe('demo');
    expect(body.score.total).toBe(HEALTHY_REPORT.score.total);
  });

  test('rejects a payload without a report', async () => {
    const response = await exportPost(
      jsonRequest('http://localhost/api/export', 'POST', { format: 'md' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('report');
  });

  test('rejects an incomplete report', async () => {
    const response = await exportPost(
      jsonRequest('http://localhost/api/export', 'POST', {
        report: { repository: { owner: 'fixture' } },
        format: 'md',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('report');
  });

  test('rejects malformed JSON with a 400 error payload', async () => {
    const response = await exportPost(
      new Request('http://localhost/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json at all',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('valid JSON');
  });
});

/* -------------------------------------------------------------------------- */
/* /api/models                                                                */
/* -------------------------------------------------------------------------- */

describe('GET /api/models', () => {
  test('returns the complete model library state', async () => {
    const response = await getModels();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');

    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.activeModel).toBe('string');
    expect(Array.isArray(body.installed)).toBe(true);
    expect(Array.isArray(body.catalog)).toBe(true);
    expect(Array.isArray(body.all)).toBe(true);
    expect(body.diskStats).toBeTypeOf('object');
    expect(body).toHaveProperty('activeDownload');

    const diskStats = body.diskStats as Record<string, unknown>;
    expect(typeof diskStats.totalDiskBytes).toBe('number');
    expect(typeof diskStats.freeDiskBytes).toBe('number');
    expect(typeof diskStats.usagePercent).toBe('number');
  });
});

describe('DELETE /api/models', () => {
  test('returns 400 when the model directory does not exist (query parameter)', async () => {
    const response = await deleteModelRoute(
      new Request('http://localhost/api/models?modelId=non-existent/model', { method: 'DELETE' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('not found');
  });

  test('accepts the model query alias', async () => {
    const response = await deleteModelRoute(
      new Request('http://localhost/api/models?model=non-existent/model', { method: 'DELETE' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('not found');
  });

  test('returns 400 when the model id is supplied in a JSON body', async () => {
    const response = await deleteModelRoute(
      jsonRequest('http://localhost/api/models', 'DELETE', { modelId: 'non-existent/model' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('not found');
  });

  test('returns 400 when no model id is supplied', async () => {
    const response = await deleteModelRoute(
      new Request('http://localhost/api/models', { method: 'DELETE' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('Missing required');
  });

  test('returns 400 when the supplied model id is blank', async () => {
    const response = await deleteModelRoute(
      jsonRequest('http://localhost/api/models', 'DELETE', { modelId: '   ' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('Missing required');
  });
});

/* -------------------------------------------------------------------------- */
/* /api/models/active                                                         */
/* -------------------------------------------------------------------------- */

describe('POST /api/models/active', () => {
  test('switches the active model from a modelId payload', async () => {
    const response = await setActiveModelRoute(
      jsonRequest('http://localhost/api/models/active', 'POST', {
        modelId: 'google/gemma-2-2b-it',
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.activeModel).toBe('google/gemma-2-2b-it');
  });

  test('switches the active model from a model alias payload', async () => {
    const response = await setActiveModelRoute(
      jsonRequest('http://localhost/api/models/active', 'POST', {
        model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.activeModel).toBe('Qwen/Qwen2.5-Coder-1.5B-Instruct');
  });

  test('rejects a payload with no model identifier', async () => {
    const response = await setActiveModelRoute(
      jsonRequest('http://localhost/api/models/active', 'POST', {}),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('modelId');
  });

  test('rejects a blank model identifier', async () => {
    const response = await setActiveModelRoute(
      jsonRequest('http://localhost/api/models/active', 'POST', { modelId: '   ' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('modelId');
  });
});

/* -------------------------------------------------------------------------- */
/* /api/models/download                                                       */
/* -------------------------------------------------------------------------- */

describe('GET /api/models/download', () => {
  test('returns the current download state', async () => {
    const response = await getDownload();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('activeDownload');
  });
});

describe('POST /api/models/download', () => {
  test('rejects an empty modelId', async () => {
    const response = await startDownloadRoute(
      jsonRequest('http://localhost/api/models/download', 'POST', { modelId: '' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('modelId');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test('rejects a payload with no model identifier', async () => {
    const response = await startDownloadRoute(
      jsonRequest('http://localhost/api/models/download', 'POST', {}),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('modelId');
  });

  test('accepts the model alias and validates the identifier', async () => {
    const response = await startDownloadRoute(
      jsonRequest('http://localhost/api/models/download', 'POST', { model: 'invalid' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toContain('Invalid model identifier');
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/models/download', () => {
  test('cancels an active download and reports success', async () => {
    spawnMock.mockImplementation(() => new FakeChildProcess());

    const started = await startModelDownload('acme/active-model');
    expect(started.modelId).toBe('acme/active-model');

    const response = await cancelDownloadRoute();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, cancelled: true });

    const state = (await (await getDownload()).json()) as {
      activeDownload: { status: string } | null;
    };
    expect(state.activeDownload?.status).toBe('cancelled');
  });

  test('reports success when there is nothing to cancel', async () => {
    const response = await cancelDownloadRoute();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, cancelled: false });
  });
});

/* -------------------------------------------------------------------------- */
/* /api/models/download/stream                                                */
/* -------------------------------------------------------------------------- */

describe('GET /api/models/download/stream', () => {
  test('returns an SSE response and establishes the connection', async () => {
    const abortController = new AbortController();
    const response = await downloadStream(
      new Request('http://localhost/api/models/download/stream', {
        signal: abortController.signal,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-cache');
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const firstChunk = await reader.read();
    expect(firstChunk.done).toBe(false);

    const text = new TextDecoder().decode(firstChunk.value);
    expect(text).toContain(': connected');

    // Aborting the request tears down the keepalive interval and closes the stream.
    abortController.abort();
    await reader.cancel().catch(() => undefined);
  });
});
