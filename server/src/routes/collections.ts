import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getCollections, getRequests } from '../db/database';
import type { CollectionDocument, RequestDocument } from '../db/types';

// Strip LokiJS internal fields before returning to client
function strip<T extends object>(doc: T): Omit<T, '$loki' | 'meta'> {
  const { $loki, meta, ...rest } = doc as T & { $loki?: unknown; meta?: unknown };
  void $loki; void meta;
  return rest as Omit<T, '$loki' | 'meta'>;
}

export async function collectionsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/collections
  fastify.get('/api/collections', async () => {
    const col = getCollections();
    const req = getRequests();
    return col.find().map((c) => ({
      ...strip(c),
      requestCount: req.find({ collectionId: c.id }).length,
    }));
  });

  // POST /api/collections
  fastify.post<{ Body: { name: string } }>('/api/collections', async (request, reply) => {
    const { name } = request.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

    const col = getCollections();
    const now = new Date().toISOString();
    const doc: CollectionDocument = {
      id: randomUUID(),
      name: name.trim(),
      description: '',
      folders: [],
      auth: { type: 'none' },
      variables: [],
      createdAt: now,
      updatedAt: now,
    };
    col.insert(doc);
    return reply.status(201).send({ ...strip(doc), requestCount: 0 });
  });

  // PATCH /api/collections/:id
  type CollectionPatchBody = {
    name?: string;
    channelId?: string;
    centralUrl?: string;
    syncRole?: 'owner' | 'subscriber';
    syncMode?: 'readonly' | 'readwrite';
    lastSyncVersion?: number;
    lastSyncAt?: string;
  };
  const COLLECTION_ALLOWED_KEYS: ReadonlyArray<keyof CollectionPatchBody> = [
    'name', 'channelId', 'centralUrl', 'syncRole', 'syncMode', 'lastSyncVersion', 'lastSyncAt',
  ];

  fastify.patch<{ Params: { id: string }; Body: CollectionPatchBody }>(
    '/api/collections/:id',
    async (request, reply) => {
      const col = getCollections();
      const doc = col.findOne({ id: request.params.id });
      if (!doc) return reply.status(404).send({ error: 'not found' });

      const body = request.body as Record<string, unknown>;
      const updates: Partial<CollectionDocument> = {};
      for (const key of COLLECTION_ALLOWED_KEYS) {
        if (key in body) {
          (updates as Record<string, unknown>)[key] = body[key];
        }
      }
      if (typeof updates.name === 'string') {
        updates.name = updates.name.trim() || doc.name;
      }
      Object.assign(doc, updates);
      doc.updatedAt = new Date().toISOString();
      col.update(doc);

      const req = getRequests();
      return { ...strip(doc), requestCount: req.find({ collectionId: doc.id }).length };
    }
  );

  // DELETE /api/collections/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/collections/:id',
    async (request, reply) => {
      const col = getCollections();
      const doc = col.findOne({ id: request.params.id });
      if (!doc) return reply.status(404).send({ error: 'not found' });

      // Cascade — remove all requests in this collection
      getRequests().findAndRemove({ collectionId: request.params.id });
      col.remove(doc);
      return reply.status(204).send();
    }
  );

  // GET /api/collections/:id/requests
  fastify.get<{ Params: { id: string } }>(
    '/api/collections/:id/requests',
    async (request, reply) => {
      if (!getCollections().findOne({ id: request.params.id })) {
        return reply.status(404).send({ error: 'not found' });
      }
      return getRequests().find({ collectionId: request.params.id }).map(strip);
    }
  );

  // POST /api/collections/:id/requests
  fastify.post<{
    Params: { id: string };
    Body: Pick<RequestDocument, 'name' | 'method' | 'url' | 'headers' | 'params' | 'body' | 'auth'> & {
      id?: string;
      sortOrder?: number;
      updatedAt?: string;
    };
  }>('/api/collections/:id/requests', async (request, reply) => {
    if (!getCollections().findOne({ id: request.params.id })) {
      return reply.status(404).send({ error: 'not found' });
    }

    const now = new Date().toISOString();
    const { id: bodyId, ...bodyRest } = request.body;
    const doc: RequestDocument = {
      id: bodyId ?? randomUUID(),
      collectionId: request.params.id,
      folderId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      ...bodyRest,
    };
    getRequests().insert(doc);
    return reply.status(201).send(strip(doc));
  });

  // PATCH /api/collections/:id/requests/:rid
  fastify.patch<{
    Params: { id: string; rid: string };
    Body: Partial<Pick<RequestDocument, 'name' | 'method' | 'url' | 'headers' | 'params' | 'body' | 'auth'>>;
  }>('/api/collections/:id/requests/:rid', async (request, reply) => {
    const req = getRequests();
    const doc = req.findOne({ id: request.params.rid, collectionId: request.params.id });
    if (!doc) return reply.status(404).send({ error: 'not found' });

    Object.assign(doc, request.body, { updatedAt: new Date().toISOString() });
    req.update(doc);
    return strip(doc);
  });

  // DELETE /api/collections/:id/requests/:rid
  fastify.delete<{ Params: { id: string; rid: string } }>(
    '/api/collections/:id/requests/:rid',
    async (request, reply) => {
      const req = getRequests();
      const doc = req.findOne({ id: request.params.rid, collectionId: request.params.id });
      if (!doc) return reply.status(404).send({ error: 'not found' });

      req.remove(doc);
      return reply.status(204).send();
    }
  );
}
