import { buildMarkdownReport, exportFileName } from '@/lib/report/markdown';
import type { RevivalAnalysisResponse } from '@/lib/types';

/**
 * Report export endpoint.
 *
 * Accepts a completed analysis report from the client and returns it as a
 * downloadable Markdown or JSON attachment. Exporting never re-runs analysis,
 * so the downloaded numbers always match what the user saw.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural validation — only the fields the exporters dereference. */
function isExportableReport(value: unknown): value is RevivalAnalysisResponse {
  if (!isRecord(value)) return false;
  const score = value.score;
  const repository = value.repository;
  const ai = value.ai;
  if (!isRecord(score) || typeof score.total !== 'number') return false;
  if (!isRecord(repository) || typeof repository.owner !== 'string' || typeof repository.repo !== 'string') {
    return false;
  }
  if (!isRecord(ai) || !isRecord(ai.roadmap)) return false;
  return Array.isArray(value.findings) && Array.isArray(score.dimensions);
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Report payload is too large to export.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const format = body.format === 'json' ? 'json' : 'md';
  const report = body.report;

  if (!isExportableReport(report)) {
    return Response.json(
      { error: 'A completed analysis report is required to export.' },
      { status: 400 },
    );
  }

  const filename = exportFileName(report, format);

  if (format === 'json') {
    return new Response(`${JSON.stringify(report, null, 2)}\n`, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(buildMarkdownReport(report), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
