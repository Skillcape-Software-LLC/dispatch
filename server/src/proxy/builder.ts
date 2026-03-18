import type { AuthConfig, HeaderEntry, ParamEntry } from '../db/types';

export function rewriteLocalhostForDocker(url: string): string {
  if (process.env.DISPATCH_IN_DOCKER !== 'true') return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'host.docker.internal';
      return parsed.toString();
    }
  } catch {
    // not a valid URL — let it pass through unchanged
  }
  return url;
}

export function buildUrl(baseUrl: string, params: ParamEntry[]): string {
  const url = new URL(baseUrl); // throws on invalid URL
  for (const p of params) {
    if (p.enabled && p.key.trim()) {
      url.searchParams.append(p.key, p.value);
    }
  }
  return url.toString();
}

export function buildHeaders(
  headers: HeaderEntry[],
  auth: AuthConfig
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const h of headers) {
    if (h.enabled && h.key.trim()) {
      result[h.key] = h.value;
    }
  }

  if (auth.type === 'bearer' && auth.bearer?.token) {
    result['Authorization'] = `Bearer ${auth.bearer.token}`;
  } else if (auth.type === 'basic' && auth.basic) {
    const encoded = Buffer.from(
      `${auth.basic.username}:${auth.basic.password}`
    ).toString('base64');
    result['Authorization'] = `Basic ${encoded}`;
  } else if (auth.type === 'apikey' && auth.apikey?.in === 'header' && auth.apikey.key) {
    result[auth.apikey.key] = auth.apikey.value;
  }

  return result;
}

export function buildBodyContent(body: { mode: string; content: string }): {
  bodyPayload: string | undefined;
  contentType: string | undefined;
} {
  if (body.mode === 'json') {
    return { bodyPayload: body.content, contentType: 'application/json' };
  }
  if (body.mode === 'raw') {
    return { bodyPayload: body.content, contentType: undefined };
  }
  return { bodyPayload: undefined, contentType: undefined };
}
