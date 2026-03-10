export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KvEntry {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ActiveRequestBody {
  mode: 'none' | 'json' | 'form-data' | 'raw' | 'binary';
  content: string;
}

export interface ActiveRequestAuth {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  bearer: { token: string };
  basic: { username: string; password: string };
  apikey: { key: string; value: string; in: 'header' | 'query' };
}

export interface ActiveRequest {
  method: HttpMethod;
  url: string;
  headers: KvEntry[];
  params: KvEntry[];
  body: ActiveRequestBody;
  auth: ActiveRequestAuth;
}

export function defaultActiveRequest(): ActiveRequest {
  return {
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body: { mode: 'none', content: '' },
    auth: {
      type: 'none',
      bearer: { token: '' },
      basic: { username: '', password: '' },
      apikey: { key: '', value: '', in: 'header' },
    },
  };
}
