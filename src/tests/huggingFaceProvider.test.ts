import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createPrimaryProvider, HuggingFaceProvider } from '@/lib/ai';
import { AIProviderError } from '@/lib/ai/provider';
import { scoreRepository } from '@/lib/scoring/scoringEngine';
import { HEALTHY_PAYLOAD } from './helpers/repoFixtures';

const VALID_SAMPLE_JSON = JSON.stringify({
  verdict: 'The repository is in good health with solid foundations.',
  technicalAssessment:
    'Full static analysis shows clean source layout, active test suite, and up-to-date dependencies.\n\nKey components are well-maintained with clear modular boundaries.\n\nRecommended for ongoing active development.',
  rootCauses: ['Minor documentation gaps in configuration instructions.'],
  roadmap: {
    immediate: [
      {
        title: 'Document environment variables',
        rationale: 'Clarify configuration flags in README.md',
        expectedBenefit: 'Improves onboarding time for new contributors',
        effort: 'low',
        relatedFindings: ['DOC_README_CONFIG'],
      },
    ],
    shortTerm: [
      {
        title: 'Add integration tests for API routes',
        rationale: 'Verify HTTP status and headers under simulated loads',
        expectedBenefit: 'Catches edge cases early',
        effort: 'medium',
        relatedFindings: [],
      },
    ],
    longTerm: [
      {
        title: 'Upgrade major dependencies',
        rationale: 'Prepare for next framework cycle',
        expectedBenefit: 'Maintains long-term compatibility',
        effort: 'high',
        relatedFindings: [],
      },
    ],
  },
  confidenceNote: 'Assessment conducted with high confidence across all 18 signals.',
});

describe('HuggingFaceProvider', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test('configures defaults from environment or fallback constants', () => {
    delete process.env.AI_MODEL;
    delete process.env.HF_BASE_URL;
    delete process.env.HF_TOKEN;

    const provider = new HuggingFaceProvider();
    expect(provider.name).toBe('huggingface');
    expect(provider.model).toBe('google/gemma-3-1b-it');
    expect(provider.baseUrl).toBe('http://localhost:8080');
    expect(provider.apiKey).toBeUndefined();
  });

  test('respects explicit constructor options', () => {
    const provider = new HuggingFaceProvider({
      model: 'meta-llama/Llama-3.2-3B-Instruct',
      baseUrl: 'http://127.0.0.1:9090/',
      apiKey: 'test-token',
      timeoutMs: 45000,
    });

    expect(provider.model).toBe('meta-llama/Llama-3.2-3B-Instruct');
    expect(provider.baseUrl).toBe('http://127.0.0.1:9090');
    expect(provider.apiKey).toBe('test-token');
    expect(provider.timeoutMs).toBe(45000);
  });

  test('checkHealth returns true when /health responds 200 OK', async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', model: 'google/gemma-3-1b-it' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const provider = new HuggingFaceProvider({ baseUrl: 'http://localhost:8080' });
    const healthy = await provider.checkHealth();
    expect(healthy).toBe(true);
  });

  test('checkHealth returns false when server is down or error', async () => {
    globalThis.fetch = (async () => {
      throw new Error('Connection refused');
    }) as typeof fetch;

    const provider = new HuggingFaceProvider({ baseUrl: 'http://localhost:8080' });
    const healthy = await provider.checkHealth();
    expect(healthy).toBe(false);
  });

  test('generateRevivalReport parses standard /v1/chat/completions response', async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      expect(urlStr).toBe('http://localhost:8080/v1/chat/completions');

      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('google/gemma-3-1b-it');
      expect(Array.isArray(body.messages)).toBe(true);

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          choices: [
            {
              message: {
                role: 'assistant',
                content: VALID_SAMPLE_JSON,
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const provider = new HuggingFaceProvider();
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);
    const report = await provider.generateRevivalReport({
      payload: HEALTHY_PAYLOAD,
      score,
      findings,
    });

    expect(report.verdict).toBe('The repository is in good health with solid foundations.');
    expect(report.roadmap.immediate.length).toBe(1);
    expect(report.roadmap.shortTerm.length).toBe(1);
    expect(report.roadmap.longTerm.length).toBe(1);
  });

  test('generateRevivalReport falls back to /generate when /v1/chat/completions is 404', async () => {
    let calledGenerate = false;

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/chat/completions')) {
        return new Response('Not found', { status: 404 });
      }
      if (urlStr.includes('/generate')) {
        calledGenerate = true;
        return new Response(
          JSON.stringify({
            generated_text: VALID_SAMPLE_JSON,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Error', { status: 500 });
    }) as typeof fetch;

    const provider = new HuggingFaceProvider();
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);
    const report = await provider.generateRevivalReport({
      payload: HEALTHY_PAYLOAD,
      score,
      findings,
    });

    expect(calledGenerate).toBe(true);
    expect(report.verdict).toBe('The repository is in good health with solid foundations.');
  });

  test('generateRevivalReport throws AIProviderError on connection failure', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8080');
    }) as typeof fetch;

    const provider = new HuggingFaceProvider();
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);

    expect(
      provider.generateRevivalReport({
        payload: HEALTHY_PAYLOAD,
        score,
        findings,
      }),
    ).rejects.toThrow(AIProviderError);
  });

  test('generateRevivalReport throws when completion fails schema validation', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"random": "not a report"}',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const provider = new HuggingFaceProvider();
    const { score, findings } = scoreRepository(HEALTHY_PAYLOAD);

    expect(
      provider.generateRevivalReport({
        payload: HEALTHY_PAYLOAD,
        score,
        findings,
      }),
    ).rejects.toThrow(AIProviderError);
  });
});

describe('createPrimaryProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('defaults to HuggingFaceProvider when AI_PROVIDER is unset', () => {
    delete process.env.AI_PROVIDER;
    const provider = createPrimaryProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe('huggingface');
  });

  test('returns HuggingFaceProvider when AI_PROVIDER is "huggingface" or "hf"', () => {
    process.env.AI_PROVIDER = 'huggingface';
    expect(createPrimaryProvider()?.name).toBe('huggingface');

    process.env.AI_PROVIDER = 'hf';
    expect(createPrimaryProvider()?.name).toBe('huggingface');
  });

  test('returns OllamaProvider when AI_PROVIDER is "ollama"', () => {
    process.env.AI_PROVIDER = 'ollama';
    expect(createPrimaryProvider()?.name).toBe('ollama');
  });

  test('returns null when AI_PROVIDER is "fallback" or "disabled"', () => {
    process.env.AI_PROVIDER = 'fallback';
    expect(createPrimaryProvider()).toBeNull();

    process.env.AI_PROVIDER = 'disabled';
    expect(createPrimaryProvider()).toBeNull();
  });
});
