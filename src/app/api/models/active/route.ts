import { setActiveModel } from '@/lib/models/modelManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const result = await setActiveModel(modelId.trim());
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: (error as Error).message || 'Failed to switch active model.' },
      { status: 400 },
    );
  }
}
