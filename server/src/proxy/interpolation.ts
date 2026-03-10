import type { AuthConfig, HeaderEntry, ParamEntry, RequestBody } from '../db/types';

export function buildVarMap(
  collectionVars: { key: string; value: string }[],
  envVars: { key: string; value: string; enabled: boolean }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of collectionVars) map[v.key] = v.value;
  for (const v of envVars) {
    if (v.enabled) map[v.key] = v.value;
  }
  return map;
}

const TOKEN = /\{\{(\w+)\}\}/g;

export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(TOKEN, (_, k) => vars[k] ?? `{{${k}}}`);
}

export interface InterpolatableRequest {
  url: string;
  headers?: HeaderEntry[];
  params?: ParamEntry[];
  body?: RequestBody | { mode: string; content: string };
  auth?: AuthConfig;
}

export function interpolateRequest<T extends InterpolatableRequest>(
  req: T,
  vars: Record<string, string>
): T {
  const url = interpolate(req.url, vars);

  const headers = (req.headers ?? []).map((h) => ({
    ...h,
    key: interpolate(h.key, vars),
    value: interpolate(h.value, vars),
  }));

  const params = (req.params ?? []).map((p) => ({
    ...p,
    key: interpolate(p.key, vars),
    value: interpolate(p.value, vars),
  }));

  const body = req.body
    ? { ...req.body, content: interpolate(req.body.content, vars) }
    : req.body;

  let auth = req.auth;
  if (auth) {
    switch (auth.type) {
      case 'bearer':
        auth = {
          ...auth,
          bearer: auth.bearer
            ? { token: interpolate(auth.bearer.token, vars) }
            : auth.bearer,
        };
        break;
      case 'basic':
        auth = {
          ...auth,
          basic: auth.basic
            ? {
                username: interpolate(auth.basic.username, vars),
                password: interpolate(auth.basic.password, vars),
              }
            : auth.basic,
        };
        break;
      case 'apikey':
        auth = {
          ...auth,
          apikey: auth.apikey
            ? {
                ...auth.apikey,
                key: interpolate(auth.apikey.key, vars),
                value: interpolate(auth.apikey.value, vars),
              }
            : auth.apikey,
        };
        break;
    }
  }

  return { ...req, url, headers, params, body, auth };
}
