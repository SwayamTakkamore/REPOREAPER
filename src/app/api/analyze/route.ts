import { AnalysisError, runAnalysis } from '@/lib/analyzer/orchestrator';
import { STAGE_ORDER } from '@/lib/types';

/**
 * Server-Sent Events endpoint for the eight-stage analysis pipeline.
 *
 * A single POST starts the pipeline and streams `stage`, `complete`, and
 * `error` events. The clone is removed before the stream closes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const encoder = new TextEncoder();

function sseFrame(event: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function GET(): Response {
  return Response.json({
    status: 'ok',
    description: 'POST { "repoUrl": "https://github.com/owner/repo" } to stream an analysis.',
    stages: STAGE_ORDER,
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Request body must be a JSON object.', 400);
  }

  const rawUrl = (body as Record<string, unknown>).repoUrl ?? (body as Record<string, unknown>).url;
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return jsonError('A non-empty "repoUrl" field is required.', 400);
  }
  const repoUrl = rawUrl;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const send = (event: string, payload: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(sseFrame(event, payload));
        } catch {
          closed = true;
        }
      };

      const close = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      try {
        const report = await runAnalysis(repoUrl, {
          signal: request.signal,
          onStage: (stage) => send('stage', stage),
        });
        send('complete', report);
      } catch (error) {
        const analysisError =
          error instanceof AnalysisError
            ? error
            : new AnalysisError(
                'ANALYSIS_FAILED',
                error instanceof Error ? error.message : 'Analysis failed unexpectedly.',
                null,
              );
        send('error', { message: analysisError.message, code: analysisError.code });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
