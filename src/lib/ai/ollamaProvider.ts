import type { RevivalReportContent } from '@/lib/types';
import { buildAIPrompt } from './promptBuilder';
import { AIProviderError, safeErrorMessage, type AIContext, type AIProvider } from './provider';
import { parseAIReportOrThrow } from './schema';

/**
 * Local Ollama provider.
 *
 * Endpoint: POST {OLLAMA_BASE_URL}/api/chat with `format: "json"`.
 * No API keys are required and no repository content leaves the machine.
 */

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'glm-4.7-flash:latest';
const DEFAULT_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 2_500;

interface OllamaChatResponse {
  message?: { content?: unknown };
  error?: unknown;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(options: { model?: string; baseUrl?: string; timeoutMs?: number } = {}) {
    this.model = options.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.timeoutMs = options.timeoutMs ?? parsePositiveInt(process.env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { models?: Array<{ name?: string }> };
      if (!Array.isArray(body.models)) return false;
      return body.models.some((model) => model.name === this.model);
    } catch {
      return false;
    }
  }

  async generateRevivalReport(context: AIContext): Promise<RevivalReportContent> {
    const prompt = buildAIPrompt(context);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          options: { temperature: 0.2, num_predict: 2048 },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      });
    } catch (error) {
      const isTimeout =
        error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AIProviderError(
        this.name,
        isTimeout
          ? `Local model ${this.model} did not respond within ${Math.round(this.timeoutMs / 1000)}s.`
          : `Could not reach Ollama at ${this.baseUrl}: ${safeErrorMessage(error)}`,
        true,
      );
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as OllamaChatResponse;
        if (typeof body.error === 'string') detail = safeErrorMessage(body.error);
      } catch {
        // Body was not JSON.
      }
      throw new AIProviderError(this.name, `Ollama rejected the request: ${detail}`, true);
    }

    let body: OllamaChatResponse;
    try {
      body = (await response.json()) as OllamaChatResponse;
    } catch {
      throw new AIProviderError(this.name, 'Ollama returned a non-JSON response.', true);
    }

    const content = body.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AIProviderError(this.name, 'Ollama returned an empty completion.', true);
    }

    try {
      return parseAIReportOrThrow(content);
    } catch (error) {
      throw new AIProviderError(
        this.name,
        `Ollama output failed validation: ${safeErrorMessage(error, 200)}`,
        true,
      );
    }
  }
}
