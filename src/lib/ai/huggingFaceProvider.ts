import type { RevivalReportContent } from '@/lib/types';
import { buildAIPrompt } from './promptBuilder';
import { AIProviderError, safeErrorMessage, type AIContext, type AIProvider } from './provider';
import { parseAIReportOrThrow } from './schema';

/**
 * Local Hugging Face Inference provider.
 *
 * Supports:
 *  1. OpenAI-compatible chat completions endpoint (standard across Hugging Face
 *     Text Generation Inference / TGI, vLLM, and local Transformers servers):
 *     `POST {HF_BASE_URL}/v1/chat/completions`
 *  2. Native Hugging Face TGI / router generation endpoint:
 *     `POST {HF_BASE_URL}/generate` or `POST {HF_BASE_URL}/models/{model}`
 *
 * Runs completely locally on the host machine.
 */

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_MODEL = 'google/gemma-3-1b-it';
const DEFAULT_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 3_000;

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: unknown;
}

interface HfGenerateResponse {
  generated_text?: unknown;
  error?: unknown;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface';
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;

  constructor(
    options: {
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      timeoutMs?: number;
    } = {},
  ) {
    this.model =
      options.model ??
      process.env.AI_MODEL ??
      process.env.HF_MODEL ??
      process.env.HUGGINGFACE_MODEL ??
      DEFAULT_MODEL;

    this.baseUrl = (
      options.baseUrl ??
      process.env.HF_BASE_URL ??
      process.env.HUGGINGFACE_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, '');

    this.apiKey =
      options.apiKey ??
      process.env.HF_TOKEN ??
      process.env.HUGGINGFACE_API_KEY;

    this.timeoutMs =
      options.timeoutMs ??
      parsePositiveInt(process.env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async checkHealth(): Promise<boolean> {
    const probeEndpoints = [
      `${this.baseUrl}/health`,
      `${this.baseUrl}/v1/models`,
      `${this.baseUrl}/`,
    ];

    for (const endpoint of probeEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
          cache: 'no-store',
        });
        if (response.ok) return true;
      } catch {
        // Try next probe endpoint.
      }
    }

    return false;
  }

  async generateRevivalReport(context: AIContext): Promise<RevivalReportContent> {
    const prompt = buildAIPrompt(context);
    const headers = this.authHeaders();

    // 1. Try standard OpenAI/TGI chat completions endpoint
    const chatEndpoint = `${this.baseUrl}/v1/chat/completions`;
    let response: Response;

    try {
      response = await fetch(chatEndpoint, {
        method: 'POST',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          temperature: 0.2,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      });
    } catch (error) {
      const isTimeout =
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AIProviderError(
        this.name,
        isTimeout
          ? `Hugging Face local model ${this.model} did not respond within ${Math.round(this.timeoutMs / 1000)}s.`
          : `Could not reach Hugging Face local inference at ${this.baseUrl}: ${safeErrorMessage(error)}`,
        true,
      );
    }

    // 2. If chat endpoint returned 404, fallback to native TGI generate endpoint
    if (response.status === 404) {
      const generateEndpoint = `${this.baseUrl}/generate`;
      try {
        response = await fetch(generateEndpoint, {
          method: 'POST',
          headers,
          cache: 'no-store',
          signal: AbortSignal.timeout(this.timeoutMs),
          body: JSON.stringify({
            inputs: `${prompt.system}\n\n${prompt.user}`,
            parameters: {
              max_new_tokens: 2048,
              temperature: 0.2,
              return_full_text: false,
            },
          }),
        });
      } catch (error) {
        throw new AIProviderError(
          this.name,
          `Hugging Face generate endpoint unreachable at ${generateEndpoint}: ${safeErrorMessage(error)}`,
          true,
        );
      }
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: unknown; message?: unknown };
        if (typeof body.error === 'string') {
          detail = safeErrorMessage(body.error);
        } else if (typeof body.message === 'string') {
          detail = safeErrorMessage(body.message);
        }
      } catch {
        // Body was not JSON.
      }
      throw new AIProviderError(
        this.name,
        `Hugging Face local inference rejected the request: ${detail}`,
        true,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await response.json();
    } catch {
      throw new AIProviderError(
        this.name,
        'Hugging Face local inference returned a non-JSON response.',
        true,
      );
    }

    // Extract text completion from either OpenAI format or TGI format
    let content: string | null = null;

    if (rawBody && typeof rawBody === 'object') {
      const openAiStyle = rawBody as OpenAIChatResponse;
      if (Array.isArray(openAiStyle.choices) && openAiStyle.choices[0]?.message?.content) {
        const text = openAiStyle.choices[0].message.content;
        if (typeof text === 'string') {
          content = text;
        }
      }

      if (!content) {
        const tgiStyle = rawBody as HfGenerateResponse;
        if (typeof tgiStyle.generated_text === 'string') {
          content = tgiStyle.generated_text;
        }
      }

      if (!content && Array.isArray(rawBody) && rawBody[0]?.generated_text) {
        content = String(rawBody[0].generated_text);
      }
    }

    if (!content || content.trim().length === 0) {
      throw new AIProviderError(
        this.name,
        'Hugging Face local inference returned an empty completion.',
        true,
      );
    }

    try {
      return parseAIReportOrThrow(content);
    } catch (error) {
      throw new AIProviderError(
        this.name,
        `Hugging Face model output failed validation: ${safeErrorMessage(error, 200)}`,
        true,
      );
    }
  }
}
