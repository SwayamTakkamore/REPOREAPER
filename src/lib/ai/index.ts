import type { AIRevivalReport } from '@/lib/types';
import { FallbackDeterministicProvider } from './fallbackProvider';
import { HuggingFaceProvider } from './huggingFaceProvider';
import { OllamaProvider } from './ollamaProvider';
import { safeErrorMessage, type AIContext, type AIProvider } from './provider';

export type { AIContext, AIProvider } from './provider';
export { AIProviderError } from './provider';
export { FallbackDeterministicProvider } from './fallbackProvider';
export { HuggingFaceProvider } from './huggingFaceProvider';
export { OllamaProvider } from './ollamaProvider';
export { buildAIPrompt } from './promptBuilder';
export { RevivalReportSchema, parseAIReport, parseAIReportOrThrow } from './schema';

/**
 * Creates the configured primary provider.
 *
 * Defaults to `huggingface` (local inference via TGI, vLLM, or local server).
 * Supports `ollama` as alternative local backend.
 * `AI_PROVIDER=fallback` (or `none`) disables model inference entirely, which
 * is useful in CI and offline environments.
 */
export function createPrimaryProvider(): AIProvider | null {
  const configured = (process.env.AI_PROVIDER ?? 'huggingface').toLowerCase();

  if (configured === 'fallback' || configured === 'none' || configured === 'disabled') {
    return null;
  }

  if (configured === 'huggingface' || configured === 'hf' || configured === 'hugging-face') {
    return new HuggingFaceProvider();
  }

  if (configured === 'ollama') {
    return new OllamaProvider();
  }

  // Unknown provider names fail closed to the deterministic engine.
  return null;
}

/**
 * Runs the AI layer with guaranteed graceful degradation.
 *
 * Any provider failure — network, timeout, malformed JSON, schema violation —
 * results in a complete deterministic report. The returned report records which
 * engine produced it and why degradation occurred.
 */
export async function generateRevivalReport(context: AIContext): Promise<AIRevivalReport> {
  const startedAt = Date.now();
  const primary = createPrimaryProvider();

  if (primary) {
    try {
      const content = await primary.generateRevivalReport(context);
      return {
        ...content,
        provider: primary.name,
        model: primary.model,
        generatedAt: new Date().toISOString(),
        degraded: false,
        degradationReason: null,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const fallback = new FallbackDeterministicProvider();
      const content = await fallback.generateRevivalReport(context);
      return {
        ...content,
        provider: fallback.name,
        model: null,
        generatedAt: new Date().toISOString(),
        degraded: true,
        degradationReason: safeErrorMessage(error),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  const fallback = new FallbackDeterministicProvider();
  const content = await fallback.generateRevivalReport(context);
  return {
    ...content,
    provider: fallback.name,
    model: null,
    generatedAt: new Date().toISOString(),
    degraded: true,
    degradationReason:
      'Model inference is disabled by configuration; deterministic assessment used instead.',
    durationMs: Date.now() - startedAt,
  };
}

/** Health probe used by diagnostics and tests. */
export async function probeAI(): Promise<{ provider: string; healthy: boolean }> {
  const primary = createPrimaryProvider();
  if (!primary) return { provider: 'deterministic-fallback', healthy: true };
  const healthy = await primary.checkHealth();
  return { provider: primary.name, healthy };
}
