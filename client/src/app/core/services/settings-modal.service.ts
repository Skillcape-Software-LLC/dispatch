import { Injectable, signal } from '@angular/core';

export type SettingsTab = 'general' | 'network' | 'data' | 'central';

@Injectable({ providedIn: 'root' })
export class SettingsModalService {
  readonly isOpen = signal(false);
  readonly requestedTab = signal<SettingsTab>('general');

  open(tab: SettingsTab = 'general'): void {
    this.requestedTab.set(tab);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
