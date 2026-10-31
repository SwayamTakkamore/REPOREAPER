import type {
  AnalysisPayload,
  Finding,
  HealthScore,
  RevivalReportContent,
} from '@/lib/types';

export interface AIContext {
  payload: AnalysisPayload;
  score: HealthScore;
  findings: Finding[];
}

/**
 * Pluggable revival-assessment provider.
 *
 * Implementations must be stateless, must never execute repository code, and
 * must return content that satisfies `RevivalReportSchema`.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string | null;
  generateRevivalReport(input: AIContext): Promise<RevivalReportContent>;
  checkHealth(): Promise<boolean>;
}

export class AIProviderError extends Error {
  readonly provider: string;
  readonly retryable: boolean;

  constructor(provider: string, message: string, retryable = false) {
    super(message);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.retryable = retryable;
  }
}

/** Caps a message destined for the client so provider internals never leak. */
export function safeErrorMessage(error: unknown, maxLength = 280): string {
  const raw = error instanceof Error ? error.message : String(error);
  const singleLine = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return singleLine.slice(0, maxLength);
}
