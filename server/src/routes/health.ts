import type { FastifyInstance } from 'fastify';

const version = '1.0.0';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
    });
  });
}
