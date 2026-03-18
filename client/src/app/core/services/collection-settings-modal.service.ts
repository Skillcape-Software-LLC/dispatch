import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CollectionSettingsModalService {
  readonly isOpen = signal(false);
  readonly collectionId = signal<string>('');

  open(collectionId: string): void {
    this.collectionId.set(collectionId);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
