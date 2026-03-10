import { getSettings } from '../db/database';

export interface AppSettings {
  requestTimeoutMs: number;
  historyLimit: number;
  sslVerification: boolean;
  defaultContentType: string;
  proxyUrl: string;
  proxyLogLevel: 'none' | 'basic' | 'verbose';
}

export const DEFAULT_SETTINGS: AppSettings = {
  requestTimeoutMs: 30000,
  historyLimit: 500,
  sslVerification: true,
  defaultContentType: 'application/json',
  proxyUrl: '',
  proxyLogLevel: 'basic',
};

export function getEffectiveSettings(): AppSettings {
  const col = getSettings();
  const doc = col.findOne({ _key: 'app' });
  if (!doc) return { ...DEFAULT_SETTINGS };
  const { _key, $loki, meta, ...rest } = doc as AppSettings & { _key: string; $loki?: unknown; meta?: unknown };
  void _key; void $loki; void meta;
  return { ...DEFAULT_SETTINGS, ...rest };
}
