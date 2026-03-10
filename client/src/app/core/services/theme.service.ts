import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<'dark' | 'light'>('dark');

  constructor() {
    this.init();
    effect(() => {
      const t = this.theme();
      localStorage.setItem('dispatch-theme', t);
      document.documentElement.setAttribute('data-bs-theme', t);
    });
  }

  private init(): void {
    const saved = localStorage.getItem('dispatch-theme') as 'dark' | 'light' | null;
    if (saved === 'dark' || saved === 'light') {
      this.theme.set(saved);
    }
  }

  toggle(): void {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }
}
