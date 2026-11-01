import { deleteModel, getModelLibraryState } from '@/lib/models/modelManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const state = getModelLibraryState();
    return Response.json(state, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || 'Failed to list models.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  let modelId: string | null = null;
  const { searchParams } = new URL(request.url);
  modelId = searchParams.get('modelId') ?? searchParams.get('model');

  if (!modelId) {
    try {
      const body = await request.json();
      if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.modelId === 'string') modelId = b.modelId;
        else if (typeof b.model === 'string') modelId = b.model;
      }
    } catch {
      // Not JSON or empty body
    }
  }

  if (!modelId || !modelId.trim()) {
    return Response.json(
      { error: 'Missing required "modelId" (or "model") parameter.' },
      { status: 400 },
    );
  }

  try {
    const result = await deleteModel(modelId.trim());
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || 'Failed to delete model.' },
      { status: 400 },
    );
  }
}
