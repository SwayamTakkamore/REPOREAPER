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
  const { searchParams } = new URL(request.url);
  const modelId = searchParams.get('modelId');

  if (!modelId) {
    return Response.json({ error: 'Missing required "modelId" query parameter.' }, { status: 400 });
  }

  try {
    const result = await deleteModel(modelId);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || 'Failed to delete model.' },
      { status: 400 },
    );
  }
}
