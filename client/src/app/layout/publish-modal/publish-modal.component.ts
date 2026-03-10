import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PublishModalService } from '../../core/services/publish-modal.service';
import { CollectionService } from '../../core/services/collection.service';
import { CentralClientService, type CentralRequest } from '../../core/services/central-client.service';
import { SyncService } from '../../core/services/sync.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import type { SavedRequest } from '../../core/models/collection.model';

@Component({
  selector: 'app-publish-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './publish-modal.component.html',
  styleUrl: './publish-modal.component.scss',
})
export class PublishModalComponent {
  readonly modal = inject(PublishModalService);
  private readonly collectionService = inject(CollectionService);
  private readonly centralClient = inject(CentralClientService);
  private readonly syncService = inject(SyncService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);

  readonly publishing = signal(false);
  readonly publishedChannelId = signal('');
  readonly syncMode = signal<'readonly' | 'readwrite'>('readwrite');
  readonly copied = signal(false);

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

  publish(): void {
    const collectionId = this.modal.collectionId();
    const collectionName = this.modal.collectionName();
    this.publishing.set(true);

    // Fetch both collection metadata and requests
    this.collectionService.getCollections().subscribe({
      next: (collections) => {
        const collection = collections.find((c) => c.id === collectionId);
        if (!collection) {
          this.publishing.set(false);
          this.toast.show('Collection not found', 'error');
          return;
        }

        this.collectionService.getRequests(collectionId).subscribe({
          next: (requests) => {
            this.centralClient
              .publishChannel({
                name: collectionName,
                mode: this.syncMode(),
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
                requests: requests.map((r) => this.toRequestPayload(r)),
              })
              .subscribe({
                next: (res) => {
                  const centralUrl = this.settingsService.settings().centralConfig?.url ?? '';
                  this.collectionService.updateSyncFields(collectionId, {
                    channelId: res.channelId,
                    centralUrl,
                    syncRole: 'owner',
                    syncMode: this.syncMode(),
                    lastSyncVersion: 1,
                    lastSyncAt: new Date().toISOString(),
                  }).subscribe({
                    next: () => {
                      this.syncService.saveSnapshot(
                        collectionId,
                        requests,
                        1,
                        res.channelId,
                        centralUrl,
                      );
                      this.publishedChannelId.set(res.channelId);
                      this.publishing.set(false);
                      this.syncService.syncCompleted$.next(collectionId);
                      this.toast.show('Collection published to Central');
                    },
                    error: () => {
                      this.publishing.set(false);
                      this.toast.show('Published but failed to save sync fields', 'error');
                      this.publishedChannelId.set(res.channelId);
                    },
                  });
                },
                error: () => {
                  this.publishing.set(false);
                  this.toast.show('Failed to publish collection', 'error');
                },
              });
          },
          error: () => {
            this.publishing.set(false);
            this.toast.show('Failed to load requests', 'error');
          },
        });
      },
      error: () => {
        this.publishing.set(false);
        this.toast.show('Failed to load collection', 'error');
      },
    });
  }

  copyChannelId(): void {
    navigator.clipboard.writeText(this.publishedChannelId()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  close(): void {
    this.publishedChannelId.set('');
    this.publishing.set(false);
    this.syncMode.set('readwrite');
    this.copied.set(false);
    this.modal.close();
  }
}
