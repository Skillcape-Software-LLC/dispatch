import type { ActiveRequestAuth } from './active-request.model';

export interface Collection {
  id: string;
  name: string;
  description: string;
  folders: unknown[];
  auth: unknown;
  variables: unknown[];
  requestCount: number;
  createdAt: string;
  updatedAt: string;
  // Dispatch Central sync fields (optional — unsynced collections omit these)
  channelId?: string;
  centralUrl?: string;
  syncRole?: 'owner' | 'subscriber';
  syncMode?: 'readonly' | 'readwrite';
  lastSyncVersion?: number;
  lastSyncAt?: string;
}

export interface SavedRequest {
  id: string;
  collectionId: string;
  name: string;
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  body: { mode: string; content: string };
  auth: ActiveRequestAuth;
  folderId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
