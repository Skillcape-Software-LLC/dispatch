import { ActiveRequest, defaultActiveRequest } from './active-request.model';
import type { ProxyError, ProxyResult } from './proxy-result.model';

export interface RequestTab {
  id: string;
  label: string;
  request: ActiveRequest;
  response: ProxyResult | null;
  error: ProxyError | null;
  isLoading: boolean;
  isDirty: boolean;
  savedRequestId: string | null;
  savedCollectionId: string | null;
  savedSnapshot: ActiveRequest | null;
}

export function defaultTab(): RequestTab {
  return {
    id: crypto.randomUUID(),
    label: 'New Request',
    request: defaultActiveRequest(),
    response: null,
    error: null,
    isLoading: false,
    isDirty: false,
    savedRequestId: null,
    savedCollectionId: null,
    savedSnapshot: null,
  };
}
