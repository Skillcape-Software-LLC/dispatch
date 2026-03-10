import type { FastifyInstance } from 'fastify';
import { getSettings } from '../db/database';
import { DEFAULT_SETTINGS, type AppSettings } from '../utils/settings';

function strip<T extends object>(doc: T): Omit<T, '$loki' | 'meta'> {
  const { $loki, meta, ...rest } = doc as T & { $loki?: unknown; meta?: unknown };
  void $loki; void meta;
  return rest as Omit<T, '$loki' | 'meta'>;
}

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/settings', async () => {
    const col = getSettings();
    const doc = col.findOne({ _key: 'app' });
    if (!doc) return DEFAULT_SETTINGS;
    const { _key, ...rest } = strip(doc) as AppSettings & { _key: string };
    void _key;
    return rest;
  });

  fastify.put<{ Body: Partial<AppSettings> }>('/api/settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          requestTimeoutMs: { type: 'number', minimum: 1000, maximum: 300000 },
          historyLimit: { type: 'number', minimum: 1, maximum: 5000 },
          sslVerification: { type: 'boolean' },
          defaultContentType: { type: 'string' },
          proxyUrl: { type: 'string' },
          proxyLogLevel: { type: 'string', enum: ['none', 'basic', 'verbose'] },
          centralConfig: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              instanceToken: { type: 'string' },
              instanceName: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const col = getSettings();
    const existing = col.findOne({ _key: 'app' });
    if (existing) {
      Object.assign(existing, request.body);
      col.update(existing);
      const { _key, ...rest } = strip(existing) as AppSettings & { _key: string };
      void _key;
      return rest;
    } else {
      const doc = { _key: 'app', ...DEFAULT_SETTINGS, ...request.body };
      col.insert(doc);
      const { _key, ...rest } = strip(doc) as AppSettings & { _key: string };
      void _key;
      return rest;
    }
  });
}
