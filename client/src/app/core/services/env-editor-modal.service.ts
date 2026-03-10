import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EnvEditorModalService {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
