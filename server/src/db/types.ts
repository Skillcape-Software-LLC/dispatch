export interface HeaderEntry {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ParamEntry {
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  mode: 'none' | 'json' | 'form-data' | 'raw' | 'binary';
  content: string;
}

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; in: 'header' | 'query' };
}

export interface RequestDocument {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: HeaderEntry[];
  params: ParamEntry[];
  body: RequestBody;
  auth: AuthConfig;
  collectionId: string;
  folderId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderEntry {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface VariableEntry {
  key: string;
  value: string;
}

export interface CollectionDocument {
  id: string;
  name: string;
  description: string;
  folders: FolderEntry[];
  auth: AuthConfig;
  variables: VariableEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface EnvironmentDocument {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface HistoryResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
}

export interface HistoryDocument {
  id: string;
  request: ResolvedRequest;
  response: HistoryResponse;
  timestamp: string;
}
