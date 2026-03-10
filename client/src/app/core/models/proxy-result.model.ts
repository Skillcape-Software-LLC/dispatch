export interface ProxyResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
}

export interface ProxyError {
  error: 'timeout' | 'connection_refused' | 'dns_failure' | 'ssl_error' | 'invalid_url' | 'unknown';
  message?: string;
  time: number;
}
