import { z } from 'zod';

import type { RevivalReportContent } from '@/lib/types';

/**
 * Strict schema for model output.
 *
 * The model is treated as an untrusted source: anything that does not match
 * this schema is rejected and the deterministic fallback provider takes over.
 */

export const EffortLevelSchema = z.enum(['low', 'medium', 'high']);

export const RoadmapActionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  rationale: z.string().trim().min(10).max(1200),
  expectedBenefit: z.string().trim().min(3).max(600),
  effort: EffortLevelSchema,
  relatedFindings: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
});

export const RoadmapSchema = z.object({
  immediate: z.array(RoadmapActionSchema).min(1).max(6),
  shortTerm: z.array(RoadmapActionSchema).min(1).max(6),
  longTerm: z.array(RoadmapActionSchema).min(1).max(6),
});

export const RevivalReportSchema = z.object({
  verdict: z.string().trim().min(3).max(400),
  technicalAssessment: z.string().trim().min(20).max(6000),
  rootCauses: z.array(z.string().trim().min(3).max(400)).min(1).max(8),
  roadmap: RoadmapSchema,
  confidenceNote: z.string().trim().min(3).max(500),
});

export type ValidatedRevivalReport = z.infer<typeof RevivalReportSchema>;

export class AIReportValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`AI report failed schema validation: ${issues.slice(0, 3).join('; ')}`);
    this.name = 'AIReportValidationError';
    this.issues = issues;
  }
}

/**
 * Extracts the first JSON object from a model response, tolerating markdown
 * code fences and leading/trailing prose.
 */
export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  return withoutFences.slice(start, end + 1);
}

export type ParseAIReportResult =
  | { ok: true; value: RevivalReportContent }
  | { ok: false; error: string };

/** Parses and validates a raw model response without throwing. */
export function parseAIReport(raw: string): ParseAIReportResult {
  const json = extractJsonObject(raw);
  if (json === null) {
    return { ok: false, error: 'Model response did not contain a JSON object.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Model response contained malformed JSON.' };
  }

  const result = RevivalReportSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    };
  }

  return {
    ok: true,
    value: {
      verdict: result.data.verdict,
      technicalAssessment: result.data.technicalAssessment,
      rootCauses: result.data.rootCauses,
      roadmap: result.data.roadmap,
      confidenceNote: result.data.confidenceNote,
    },
  };
}

/** Parses or throws a typed validation error (used by provider implementations). */
export function parseAIReportOrThrow(raw: string): RevivalReportContent {
  const result = parseAIReport(raw);
  if (!result.ok) {
    throw new AIReportValidationError([result.error]);
  }
  return result.value;
}
