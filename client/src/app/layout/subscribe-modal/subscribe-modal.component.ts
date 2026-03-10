import { Component, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SubscribeModalService } from '../../core/services/subscribe-modal.service';
import { CollectionService } from '../../core/services/collection.service';
import { CentralClientService } from '../../core/services/central-client.service';
import { SyncService } from '../../core/services/sync.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-subscribe-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './subscribe-modal.component.html',
  styleUrl: './subscribe-modal.component.scss',
})
export class SubscribeModalComponent {
  readonly modal = inject(SubscribeModalService);
  private readonly collectionService = inject(CollectionService);
  private readonly centralClient = inject(CentralClientService);
  private readonly syncService = inject(SyncService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);

  readonly subscribing = signal(false);
  readonly error = signal('');

  centralUrl = '';
  channelId = '';

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        this.centralUrl = this.settingsService.settings().centralConfig?.url ?? '';
        this.channelId = '';
        this.error.set('');
        this.subscribing.set(false);
      }
    });
  }

  async subscribe(): Promise<void> {
    if (!this.channelId.trim()) {
      this.error.set('Channel ID is required.');
      return;
    }
    this.subscribing.set(true);
    this.error.set('');

    try {
      await firstValueFrom(this.centralClient.subscribe(this.channelId.trim()));
      const state = await firstValueFrom(this.centralClient.getChannelState(this.channelId.trim()));
      const info = await firstValueFrom(this.centralClient.getChannelInfo(this.channelId.trim()));

      const collection = await firstValueFrom(this.collectionService.createCollection(info.name));

      for (const req of state.requests) {
        await firstValueFrom(this.collectionService.saveRequest(collection.id, req as any));
      }

      const centralUrl = this.centralUrl || this.settingsService.settings().centralConfig?.url || '';
      await firstValueFrom(
        this.collectionService.updateSyncFields(collection.id, {
          channelId: this.channelId.trim(),
          centralUrl,
          syncRole: 'subscriber',
          syncMode: info.mode,
          lastSyncVersion: state.version,
          lastSyncAt: new Date().toISOString(),
        })
      );

      const allRequests = await firstValueFrom(this.collectionService.getRequests(collection.id));
      this.syncService.saveSnapshot(collection.id, allRequests, state.version, this.channelId.trim(), centralUrl);

      this.syncService.syncCompleted$.next(collection.id);
      this.toast.show(`Subscribed to "${info.name}"`);
      this.modal.close();
    } catch (err: any) {
      this.subscribing.set(false);
      if (err?.status === 404) {
        this.error.set('Channel not found. Check the channel ID.');
      } else if (!err?.status) {
        this.error.set('Cannot reach Central server.');
      } else {
        this.error.set(err?.error?.message ?? 'Subscription failed.');
      }
    }
  }

  close(): void {
    this.modal.close();
  }
}
