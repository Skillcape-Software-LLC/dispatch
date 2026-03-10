import type { ActiveRequestAuth } from './active-request.model';

export interface Collection {
  id: string;
  name: string;
  requestCount: number;
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
