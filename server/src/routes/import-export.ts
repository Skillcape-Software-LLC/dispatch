import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getCollections, getRequests } from '../db/database';
import type { CollectionDocument, RequestDocument } from '../db/types';
import { parseCurl } from '../utils/curl-parser';

// Strip LokiJS internal fields before returning to client
function strip<T extends object>(doc: T): Omit<T, '$loki' | 'meta'> {
  const { $loki, meta, ...rest } = doc as T & { $loki?: unknown; meta?: unknown };
  void $loki; void meta;
  return rest as Omit<T, '$loki' | 'meta'>;
}

export async function importExportRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/import/curl
  fastify.post<{ Body: { curl?: string } }>('/api/import/curl', async (request, reply) => {
    const { curl } = request.body ?? {};
    if (!curl?.trim()) {
      return reply.status(400).send({ error: 'curl is required' });
    }

    try {
      const parsed = parseCurl(curl);
      return parsed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse cURL command';
      return reply.status(400).send({ error: message });
    }
  });

  // GET /api/collections/:id/export
  fastify.get<{ Params: { id: string } }>('/api/collections/:id/export', async (request, reply) => {
    const col = getCollections();
    const collection = col.findOne({ id: request.params.id });
    if (!collection) {
      return reply.status(404).send({ error: 'not found' });
    }

    const requests = getRequests()
      .find({ collectionId: request.params.id })
      .map(strip);

    return {
      version: 1,
      type: 'dispatch-collection',
      exportedAt: new Date().toISOString(),
      collection: {
        ...strip(collection),
        requests,
      },
    };
  });

  // POST /api/collections/import
  fastify.post<{
    Body: {
      version?: number;
      type?: string;
      collection?: {
        name?: string;
        description?: string;
        variables?: unknown[];
        requests?: Array<Partial<RequestDocument>>;
      };
    };
  }>('/api/collections/import', async (request, reply) => {
    const { collection } = request.body ?? {};

    if (!collection?.name?.trim()) {
      return reply.status(400).send({ error: 'collection.name is required' });
    }

    const now = new Date().toISOString();
    const collectionId = randomUUID();

    const colDoc: CollectionDocument = {
      id: collectionId,
      name: collection.name.trim(),
      description: (collection.description as string | undefined) ?? '',
      folders: [],
      auth: { type: 'none' },
      variables: (collection.variables as CollectionDocument['variables'] | undefined) ?? [],
      createdAt: now,
      updatedAt: now,
    };

    getCollections().insert(colDoc);

    const requestsToInsert = collection.requests ?? [];
    let insertedCount = 0;

    for (const r of requestsToInsert) {
      if (!r.name || !r.method || !r.url) continue;
      const reqDoc: RequestDocument = {
        id: randomUUID(),
        collectionId,
        folderId: null,
        sortOrder: insertedCount,
        createdAt: now,
        updatedAt: now,
        name: r.name,
        method: r.method as RequestDocument['method'],
        url: r.url,
        headers: r.headers ?? [],
        params: r.params ?? [],
        body: r.body ?? { mode: 'none', content: '' },
        auth: r.auth ?? { type: 'none' },
      };
      getRequests().insert(reqDoc);
      insertedCount++;
    }

    return reply.status(201).send({
      ...strip(colDoc),
      requestCount: insertedCount,
    });
  });
}
