import { Injectable, signal } from '@angular/core';
import type { Collection } from '../models/collection.model';

@Injectable({ providedIn: 'root' })
export class ChannelInfoModalService {
  readonly isOpen = signal(false);
  readonly collection = signal<Collection | null>(null);

  open(collection: Collection): void {
    this.collection.set(collection);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
