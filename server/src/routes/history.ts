import type { FastifyInstance } from 'fastify';
import { getHistory } from '../db/database';

// Strip LokiJS internal fields before returning to client
function strip<T extends object>(doc: T): Omit<T, '$loki' | 'meta'> {
  const { $loki, meta, ...rest } = doc as T & { $loki?: unknown; meta?: unknown };
  void $loki; void meta;
  return rest as Omit<T, '$loki' | 'meta'>;
}

export async function historyRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/history?limit=200&offset=0
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/api/history',
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit ?? '200', 10), 500);
      const offset = parseInt(request.query.offset ?? '0', 10);
      const col = getHistory();
      const all = col.chain().simplesort('timestamp', true).offset(offset).limit(limit).data();
      return all.map(strip);
    }
  );

  // GET /api/history/:id
  fastify.get<{ Params: { id: string } }>('/api/history/:id', async (request, reply) => {
    const doc = getHistory().findOne({ id: request.params.id });
    if (!doc) return reply.status(404).send({ error: 'not found' });
    return strip(doc);
  });

  // DELETE /api/history/:id
  fastify.delete<{ Params: { id: string } }>('/api/history/:id', async (request, reply) => {
    const col = getHistory();
    const doc = col.findOne({ id: request.params.id });
    if (!doc) return reply.status(404).send({ error: 'not found' });
    col.remove(doc);
    return reply.status(204).send();
  });

  // DELETE /api/history — clear all
  fastify.delete('/api/history', async (_request, reply) => {
    const col = getHistory();
    col.clear();
    return reply.status(204).send();
  });
}
