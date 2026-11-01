import { cancelActiveDownload, getActiveDownload, startModelDownload } from '@/lib/models/modelManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const current = getActiveDownload();
  return Response.json({ activeDownload: current });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const modelId = (body as Record<string, unknown>)?.modelId;
  if (typeof modelId !== 'string' || !modelId.trim()) {
    return Response.json({ error: 'A non-empty "modelId" string is required.' }, { status: 400 });
  }

  try {
    const download = await startModelDownload(modelId.trim());
    return Response.json(download);
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || 'Failed to start download.' },
      { status: 400 },
    );
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const cancelled = await cancelActiveDownload();
    return Response.json({ success: true, cancelled });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || 'Failed to cancel download.' },
      { status: 500 },
    );
  }
}
