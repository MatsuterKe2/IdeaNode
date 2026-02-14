import { Hono } from 'hono';
import { streamChat } from '../services/gemini';
import type { AIChatRequest } from 'shared/src/types';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json<AIChatRequest>();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of streamChat(body)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err: any) {
        console.error('AI chat error:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Unknown error' })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

export default app;
