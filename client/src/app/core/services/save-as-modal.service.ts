import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SaveAsModalService {
  readonly isOpen = signal(false);
  readonly initialName = signal('');

  open(name: string): void {
    this.initialName.set(name);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
