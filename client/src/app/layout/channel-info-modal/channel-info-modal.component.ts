import { Component, inject, signal, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ChannelInfoModalService } from '../../core/services/channel-info-modal.service';
import { CentralClientService, type ChannelInfo } from '../../core/services/central-client.service';
import { CollectionService } from '../../core/services/collection.service';
import { SyncService } from '../../core/services/sync.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-channel-info-modal',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './channel-info-modal.component.html',
  styleUrl: './channel-info-modal.component.scss',
})
export class ChannelInfoModalComponent {
  readonly modal = inject(ChannelInfoModalService);
  private readonly centralClient = inject(CentralClientService);
  private readonly collectionService = inject(CollectionService);
  private readonly syncService = inject(SyncService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly channelInfo = signal<ChannelInfo | null>(null);
  readonly error = signal('');
  readonly copied = signal(false);
  readonly unlinking = signal(false);
  readonly changingMode = signal(false);

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        this.loadInfo();
      }
    });
  }

  private loadInfo(): void {
    const collection = this.modal.collection();
    if (!collection?.channelId) return;

    this.loading.set(true);
    this.channelInfo.set(null);
    this.error.set('');

    this.centralClient.getChannelInfo(collection.channelId).subscribe({
      next: (info) => {
        this.channelInfo.set(info);
        this.loading.set(false);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.error.set('Channel not found on Central. It may have been deleted.');
        } else {
          this.error.set('Failed to load channel info.');
        }
      },
    });
  }

  copyChannelId(): void {
    const id = this.modal.collection()?.channelId ?? '';
    navigator.clipboard.writeText(id).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  toggleMode(): void {
    const collection = this.modal.collection();
    const info = this.channelInfo();
    if (!collection?.channelId || !info) return;

    const newMode = info.mode === 'readonly' ? 'readwrite' : 'readonly';
    this.changingMode.set(true);

    this.centralClient.patchChannelSettings(collection.channelId, { mode: newMode }).subscribe({
      next: (updated) => {
        this.channelInfo.set(updated);
        this.changingMode.set(false);
        this.collectionService.updateSyncFields(collection.id, { syncMode: newMode }).subscribe();
        this.toast.show(`Mode changed to ${newMode}`);
      },
      error: () => {
        this.changingMode.set(false);
        this.toast.show('Failed to change mode', 'error');
      },
    });
  }

  unlink(): void {
    const collection = this.modal.collection();
    if (!collection?.channelId) return;

    this.unlinking.set(true);
    const isOwner = collection.syncRole === 'owner';

    this.centralClient.unsubscribe(collection.channelId).subscribe({
      next: () => {
        this.collectionService.updateSyncFields(collection.id, {
          channelId: undefined,
          centralUrl: undefined,
          syncRole: undefined,
          syncMode: undefined,
          lastSyncVersion: undefined,
          lastSyncAt: undefined,
        }).subscribe({
          next: () => {
            localStorage.removeItem(`dispatch-sync-snapshot-${collection.id}`);
            this.unlinking.set(false);
            this.syncService.syncCompleted$.next(collection.id);
            this.toast.show(isOwner ? 'Channel unpublished' : 'Unsubscribed from channel');
            this.modal.close();
          },
        });
      },
      error: () => {
        this.unlinking.set(false);
        this.toast.show('Failed to unlink channel', 'error');
      },
    });
  }

  close(): void {
    this.modal.close();
  }
}
