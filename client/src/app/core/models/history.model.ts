export interface HistoryRequest {
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

export interface HistoryEntry {
  id: string;
  request: HistoryRequest;
  response: HistoryResponse;
  timestamp: string;
}
