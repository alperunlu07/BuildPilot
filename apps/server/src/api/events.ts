import type { FastifyInstance } from 'fastify';
import { eventBus } from '../events/bus';

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'hello', at: Date.now() });

    const unsub = eventBus.subscribe((e) => send(e));
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });
}
