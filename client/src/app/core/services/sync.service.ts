import { Injectable, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { CollectionService } from './collection.service';
import { CentralClientService, type CentralRequest, type PushPayload } from './central-client.service';
import type { Collection, SavedRequest } from '../models/collection.model';

export type SyncState = 'idle' | 'syncing' | 'upToDate' | 'behind' | 'localChanges' | 'error';

interface SyncSnapshotEntry {
  id: string;
  updatedAt: string;
}

interface SyncSnapshot {
  syncVersion: number;
  channelId: string;
  centralUrl: string;
  takenAt: string;
  entries: SyncSnapshotEntry[];
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly collectionService = inject(CollectionService);
  private readonly centralClient = inject(CentralClientService);

  readonly syncStatus = signal<Map<string, SyncState>>(new Map());
  readonly syncCompleted$ = new Subject<string>();

  // ---- Snapshot helpers ----

  private snapshotKey(collectionId: string): string {
    return `dispatch-sync-snapshot-${collectionId}`;
  }

  private loadSnapshot(collectionId: string): SyncSnapshot | null {
    try {
      const raw = localStorage.getItem(this.snapshotKey(collectionId));
      return raw ? (JSON.parse(raw) as SyncSnapshot) : null;
    } catch {
      return null;
    }
  }

  saveSnapshot(collectionId: string, requests: SavedRequest[], version: number, channelId: string, centralUrl: string): void {
    const snapshot: SyncSnapshot = {
      syncVersion: version,
      channelId,
      centralUrl,
      takenAt: new Date().toISOString(),
      entries: requests.map((r) => ({ id: r.id, updatedAt: r.updatedAt })),
    };
    localStorage.setItem(this.snapshotKey(collectionId), JSON.stringify(snapshot));
  }

  // ---- State helpers ----

  private setSyncState(collectionId: string, state: SyncState): void {
    const map = new Map(this.syncStatus());
    map.set(collectionId, state);
    this.syncStatus.set(map);
  }

  getSyncState(collectionId: string): SyncState {
    return this.syncStatus().get(collectionId) ?? 'idle';
  }

  // ---- Payload mapping ----

  private toRequestPayload(req: SavedRequest): CentralRequest {
    return {
      id: req.id,
      name: req.name,
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      body: req.body,
      auth: req.auth,
      sortOrder: req.sortOrder,
      updatedAt: req.updatedAt,
    };
  }

  // ---- Push ----

  async push(collection: Collection): Promise<void> {
    if (!collection.channelId || !collection.centralUrl) return;
    this.setSyncState(collection.id, 'syncing');

    try {
      const requests = await firstValueFrom(this.collectionService.getRequests(collection.id));
      const snapshot = this.loadSnapshot(collection.id);

      const snapshotMap = new Map<string, string>(snapshot?.entries.map((e) => [e.id, e.updatedAt]) ?? []);
      const currentMap = new Map<string, SavedRequest>(requests.map((r) => [r.id, r]));

      const added = requests.filter((r) => !snapshotMap.has(r.id)).map((r) => this.toRequestPayload(r));
      const modified = requests
        .filter((r) => snapshotMap.has(r.id) && snapshotMap.get(r.id) !== r.updatedAt)
        .map((r) => this.toRequestPayload(r));
      const deleted = (snapshot?.entries ?? []).filter((e) => !currentMap.has(e.id)).map((e) => e.id);

      const payload: PushPayload = {
        baseVersion: snapshot?.syncVersion ?? 0,
        changes: {
          collection: {
            id: collection.id,
            name: collection.name,
            description: collection.description ?? '',
            folders: collection.folders ?? [],
            auth: collection.auth ?? null,
            variables: collection.variables ?? [],
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
          },
          requests: {
            added,
            modified,
            deleted,
          },
        },
      };

      const result = await firstValueFrom(this.centralClient.push(collection.channelId, payload));

      await firstValueFrom(
        this.collectionService.updateSyncFields(collection.id, {
          lastSyncVersion: result.version,
          lastSyncAt: new Date().toISOString(),
        })
      );

      this.saveSnapshot(collection.id, requests, result.version, collection.channelId, collection.centralUrl);
      this.setSyncState(collection.id, 'upToDate');
      this.syncCompleted$.next(collection.id);
    } catch {
      this.setSyncState(collection.id, 'error');
    }
  }

  // ---- Pull ----

  async pull(collection: Collection): Promise<void> {
    if (!collection.channelId || !collection.centralUrl) return;
    this.setSyncState(collection.id, 'syncing');

    try {
      const snapshot = this.loadSnapshot(collection.id);
      const since = snapshot?.syncVersion ?? 0;
      const result = await firstValueFrom(this.centralClient.getChanges(collection.channelId, since));

      const existingRequests = await firstValueFrom(this.collectionService.getRequests(collection.id));
      const existingIds = new Set(existingRequests.map((r) => r.id));

      // Upsert requests (combined added + modified from server)
      for (const req of result.changes.requests) {
        if (existingIds.has(req.id)) {
          await firstValueFrom(this.collectionService.updateRequest(collection.id, req.id, req as any));
        } else {
          await firstValueFrom(this.collectionService.saveRequest(collection.id, req as any));
        }
      }

      // Delete removed
      for (const id of result.changes.deleted) {
        if (existingIds.has(id)) {
          await firstValueFrom(this.collectionService.deleteRequest(collection.id, id));
        }
      }

      await firstValueFrom(
        this.collectionService.updateSyncFields(collection.id, {
          lastSyncVersion: result.currentVersion,
          lastSyncAt: new Date().toISOString(),
        })
      );

      const allRequests = await firstValueFrom(this.collectionService.getRequests(collection.id));
      this.saveSnapshot(collection.id, allRequests, result.currentVersion, collection.channelId!, collection.centralUrl!);
      this.setSyncState(collection.id, 'upToDate');
      this.syncCompleted$.next(collection.id);
    } catch {
      this.setSyncState(collection.id, 'error');
    }
  }

  // ---- Pull Preview (no writes) ----

  async pullPreview(
    collection: Collection
  ): Promise<{ upserted: number; deleted: number; serverVersion: number }> {
    if (!collection.channelId) throw new Error('Collection is not synced');
    const snapshot = this.loadSnapshot(collection.id);
    const since = snapshot?.syncVersion ?? 0;
    const result = await firstValueFrom(this.centralClient.getChanges(collection.channelId, since));
    return {
      upserted: result.changes.requests.length,
      deleted: result.changes.deleted.length,
      serverVersion: result.currentVersion,
    };
  }

  // ---- Check Version (updates syncStatus signal) ----

  async checkVersion(collection: Collection): Promise<void> {
    if (!collection.channelId) return;
    try {
      const result = await firstValueFrom(this.centralClient.getChannelVersion(collection.channelId));
      const lastSync = collection.lastSyncVersion ?? 0;
      this.setSyncState(collection.id, result.version > lastSync ? 'behind' : 'upToDate');
    } catch {
      this.setSyncState(collection.id, 'error');
    }
  }
}
