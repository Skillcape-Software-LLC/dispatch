import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  fn: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'success', action?: ToastAction): void {
    const id = crypto.randomUUID();
    this.toasts.update((t) => [...t, { id, message, type, action }]);
    setTimeout(() => this.dismiss(id), action ? 5000 : 2500);
  }

  dismiss(id: string): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
