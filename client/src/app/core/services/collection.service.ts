import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import type { Collection, SavedRequest } from '../models/collection.model';

type SaveRequestBody = Pick<SavedRequest, 'name' | 'method' | 'url' | 'headers' | 'params' | 'body' | 'auth'> & {
  id?: string;
  sortOrder?: number;
  updatedAt?: string;
};

type CollectionSyncFields = {
  channelId?: string;
  centralUrl?: string;
  syncRole?: 'owner' | 'subscriber';
  syncMode?: 'readonly' | 'readwrite';
  lastSyncVersion?: number;
  lastSyncAt?: string;
};

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly http = inject(HttpClient);

  private readonly _requestUpdated$ = new Subject<string>();
  readonly requestUpdated$ = this._requestUpdated$.asObservable();

  private readonly _syncCompleted$ = new Subject<string>();
  readonly syncCompleted$ = this._syncCompleted$.asObservable();

  notifyRequestUpdated(collectionId: string): void {
    this._requestUpdated$.next(collectionId);
  }

  notifySyncCompleted(collectionId: string): void {
    this._syncCompleted$.next(collectionId);
  }

  updateSyncFields(id: string, fields: CollectionSyncFields): Observable<Collection> {
    return this.http.patch<Collection>(`/api/collections/${id}`, fields);
  }

  getCollections(): Observable<Collection[]> {
    return this.http.get<Collection[]>('/api/collections');
  }

  createCollection(name: string): Observable<Collection> {
    return this.http.post<Collection>('/api/collections', { name });
  }

  renameCollection(id: string, name: string): Observable<Collection> {
    return this.http.patch<Collection>(`/api/collections/${id}`, { name });
  }

  deleteCollection(id: string): Observable<void> {
    return this.http.delete<void>(`/api/collections/${id}`);
  }

  getRequests(collectionId: string): Observable<SavedRequest[]> {
    return this.http.get<SavedRequest[]>(`/api/collections/${collectionId}/requests`);
  }

  saveRequest(collectionId: string, req: SaveRequestBody): Observable<SavedRequest> {
    return this.http.post<SavedRequest>(`/api/collections/${collectionId}/requests`, req);
  }

  updateRequest(collectionId: string, requestId: string, req: Partial<SaveRequestBody>): Observable<SavedRequest> {
    return this.http.patch<SavedRequest>(`/api/collections/${collectionId}/requests/${requestId}`, req);
  }

  deleteRequest(collectionId: string, requestId: string): Observable<void> {
    return this.http.delete<void>(`/api/collections/${collectionId}/requests/${requestId}`);
  }
}
