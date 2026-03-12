import { Injectable, signal } from '@angular/core';

export type ImportTab = 'curl' | 'collection' | 'central';

@Injectable({ providedIn: 'root' })
export class ImportModalService {
  readonly isOpen = signal(false);
  readonly initialTab = signal<ImportTab>('curl');

  open(tab: ImportTab = 'curl'): void {
    this.initialTab.set(tab);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
