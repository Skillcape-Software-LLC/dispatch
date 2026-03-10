import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { buildUrl, buildHeaders, buildBodyContent } from '../proxy/builder';
import { buildVarMap, interpolateRequest } from '../proxy/interpolation';
import { getHistory, getCollections, getEnvironments } from '../db/database';
import type { AuthConfig, HeaderEntry, ParamEntry, HistoryDocument } from '../db/types';

interface ProxyRequestBody {
  method: string;
  url: string;
  headers?: HeaderEntry[];
  params?: ParamEntry[];
  body?: { mode: string; content: string };
  auth?: AuthConfig;
  environmentId?: string;
  collectionId?: string;
}

async function resolveVars(
  collectionId: string | undefined,
  environmentId: string | undefined
): Promise<Record<string, string>> {
  const collectionVars =
    collectionId
      ? (getCollections().findOne({ id: collectionId })?.variables ?? [])
      : [];
  const envVars =
    environmentId
      ? (getEnvironments().findOne({ id: environmentId })?.variables ?? [])
      : [];
  return buildVarMap(collectionVars, envVars);
}

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: ProxyRequestBody }>(
    '/api/proxy',
    {
      schema: {
        body: {
          type: 'object',
          required: ['method', 'url'],
          properties: {
            method: { type: 'string' },
            url: { type: 'string' },
            headers: { type: 'array' },
            params: { type: 'array' },
            body: { type: 'object' },
            auth: { type: 'object' },
            environmentId: { type: 'string' },
            collectionId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        method,
        environmentId,
        collectionId,
      } = request.body;

      // Interpolate variables before building the request
      const vars = await resolveVars(collectionId, environmentId);
      const interpolated = interpolateRequest(request.body, vars);

      const url = interpolated.url;
      const headers = interpolated.headers ?? [];
      const params = interpolated.params ?? [];
      const body = interpolated.body ?? { mode: 'none', content: '' };
      const auth = interpolated.auth ?? { type: 'none' };

      const startTime = Date.now();

      // Resolve apikey-in-query: append to params before buildUrl
      const allParams = [...params];
      if (auth.type === 'apikey' && auth.apikey?.in === 'query' && auth.apikey.key) {
        allParams.push({ key: auth.apikey.key, value: auth.apikey.value, enabled: true });
      }

      // Build URL
      let finalUrl: string;
      try {
        finalUrl = buildUrl(url, allParams);
      } catch {
        return reply.code(400).send({ error: 'invalid_url', time: Date.now() - startTime });
      }

      // Build headers
      const builtHeaders = buildHeaders(headers, auth);

      // Build body
      const { bodyPayload, contentType }: { bodyPayload: string | undefined; contentType: string | undefined } = buildBodyContent(body);
      if (contentType && !builtHeaders['Content-Type'] && !builtHeaders['content-type']) {
        builtHeaders['Content-Type'] = contentType;
      }

      // Execute request with 30s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      let fetchResponse: Response;
      try {
        fetchResponse = await fetch(finalUrl, {
          method,
          headers: builtHeaders,
          body: bodyPayload,
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        const errName = err instanceof Error ? err.name : '';
        const errMsg = err instanceof Error ? err.message : String(err);
        // Node's native fetch wraps underlying errors in a cause chain
        const cause = err instanceof Error ? (err as NodeJS.ErrnoException & { cause?: unknown }).cause : undefined;
        const causeCode = cause instanceof Error ? (cause as NodeJS.ErrnoException).code ?? '' : '';
        const causeMsg = cause instanceof Error ? cause.message : '';
        const fullMsg = `${errMsg} ${causeCode} ${causeMsg}`;

        if (errName === 'AbortError') {
          return reply.code(408).send({ error: 'timeout', time: elapsed });
        }
        if (causeCode === 'ECONNREFUSED' || fullMsg.includes('ECONNREFUSED')) {
          return reply.code(502).send({ error: 'connection_refused', time: elapsed });
        }
        if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN' || fullMsg.includes('ENOTFOUND') || fullMsg.includes('EAI_AGAIN')) {
          return reply.code(502).send({ error: 'dns_failure', time: elapsed });
        }
        if (fullMsg.includes('certificate') || fullMsg.includes('SSL') || fullMsg.includes('CERT') || causeCode === 'CERT_HAS_EXPIRED') {
          return reply.code(502).send({ error: 'ssl_error', time: elapsed });
        }
        return reply.code(500).send({ error: 'unknown', message: errMsg, time: elapsed });
      }

      clearTimeout(timeout);
      const elapsed = Date.now() - startTime;

      // Read response
      const responseBody = await fetchResponse.text();
      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const size = Buffer.byteLength(responseBody, 'utf8');

      const result = {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseBody,
        size,
        time: elapsed,
      };

      // Insert history (best-effort) + auto-prune oldest entries over 500
      try {
        const histCol = getHistory();
        const historyEntry: HistoryDocument = {
          id: uuidv4(),
          request: {
            method,
            url: finalUrl,
            headers: builtHeaders,
            body: bodyPayload != null ? String(bodyPayload) : null,
          },
          response: result,
          timestamp: new Date().toISOString(),
        };
        histCol.insert(historyEntry);

        const count = histCol.count();
        if (count > 500) {
          const oldest = histCol.chain().simplesort('timestamp').limit(count - 500).data();
          histCol.remove(oldest);
        }
      } catch (histErr) {
        fastify.log.warn({ err: histErr }, 'Failed to write history entry');
      }

      return reply.code(200).send(result);
    }
  );
}
