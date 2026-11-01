import { subscribeToProgress } from '@/lib/models/modelManager';
import type { DownloadProgress } from '@/lib/models/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export async function GET(request: Request): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;

      const send = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          isClosed = true;
        }
      };

      const unsubscribe = subscribeToProgress((progress: DownloadProgress) => {
        send('progress', progress);
      });

      // Send initial heartbeat comment to establish connection
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Keepalive interval every 15s to keep proxy connections alive
      const keepaliveInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          isClosed = true;
          clearInterval(keepaliveInterval);
        }
      }, 15000);

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(keepaliveInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
