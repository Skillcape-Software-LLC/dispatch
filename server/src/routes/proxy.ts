import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { buildUrl, buildHeaders, buildBodyContent } from '../proxy/builder';
import { getHistory } from '../db/database';
import type { AuthConfig, HeaderEntry, ParamEntry, HistoryDocument } from '../db/types';

interface ProxyRequestBody {
  method: string;
  url: string;
  headers?: HeaderEntry[];
  params?: ParamEntry[];
  body?: { mode: string; content: string };
  auth?: AuthConfig;
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
          },
        },
      },
    },
    async (request, reply) => {
      const {
        method,
        url,
        headers = [],
        params = [],
        body = { mode: 'none', content: '' },
        auth = { type: 'none' },
      } = request.body;

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

      // Insert history (best-effort)
      try {
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
        getHistory().insert(historyEntry);
      } catch (histErr) {
        fastify.log.warn({ err: histErr }, 'Failed to write history entry');
      }

      return reply.code(200).send(result);
    }
  );
}
