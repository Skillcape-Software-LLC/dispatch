import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PublishModalService {
  readonly isOpen = signal(false);
  readonly collectionId = signal('');
  readonly collectionName = signal('');

  open(collectionId: string, collectionName: string): void {
    this.collectionId.set(collectionId);
    this.collectionName.set(collectionName);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
