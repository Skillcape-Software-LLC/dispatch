import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getEnvironments } from '../db/database';
import type { EnvironmentDocument, EnvironmentVariable } from '../db/types';

// Strip LokiJS internal fields before returning to client
function strip<T extends object>(doc: T): Omit<T, '$loki' | 'meta'> {
  const { $loki, meta, ...rest } = doc as T & { $loki?: unknown; meta?: unknown };
  void $loki; void meta;
  return rest as Omit<T, '$loki' | 'meta'>;
}

export async function environmentsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/environments
  fastify.get('/api/environments', async () => {
    return getEnvironments().find().map(strip);
  });

  // POST /api/environments
  fastify.post<{ Body: { name: string } }>('/api/environments', async (request, reply) => {
    const { name } = request.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

    const envs = getEnvironments();
    const now = new Date().toISOString();
    const doc: EnvironmentDocument = {
      id: randomUUID(),
      name: name.trim(),
      variables: [],
      createdAt: now,
      updatedAt: now,
    };
    envs.insert(doc);
    return reply.status(201).send(strip(doc));
  });

  // GET /api/environments/:id
  fastify.get<{ Params: { id: string } }>('/api/environments/:id', async (request, reply) => {
    const doc = getEnvironments().findOne({ id: request.params.id });
    if (!doc) return reply.status(404).send({ error: 'not found' });
    return strip(doc);
  });

  // PUT /api/environments/:id
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; variables?: EnvironmentVariable[] };
  }>('/api/environments/:id', async (request, reply) => {
    const envs = getEnvironments();
    const doc = envs.findOne({ id: request.params.id });
    if (!doc) return reply.status(404).send({ error: 'not found' });

    if (request.body.name !== undefined) {
      doc.name = request.body.name.trim() || doc.name;
    }
    if (request.body.variables !== undefined) {
      doc.variables = request.body.variables;
    }
    doc.updatedAt = new Date().toISOString();
    envs.update(doc);

    return strip(doc);
  });

  // DELETE /api/environments/:id
  fastify.delete<{ Params: { id: string } }>('/api/environments/:id', async (request, reply) => {
    const envs = getEnvironments();
    const doc = envs.findOne({ id: request.params.id });
    if (!doc) return reply.status(404).send({ error: 'not found' });

    envs.remove(doc);
    return reply.status(204).send();
  });
}
