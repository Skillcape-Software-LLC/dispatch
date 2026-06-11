import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'dispatch-sidebar-collapsed';

@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  readonly isCollapsed = signal(false);

  constructor() {
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      this.isCollapsed.set(true);
    }
  }

  toggle(): void {
    const next = !this.isCollapsed();
    this.isCollapsed.set(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  expand(): void {
    if (this.isCollapsed()) {
      this.isCollapsed.set(false);
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  }
}
