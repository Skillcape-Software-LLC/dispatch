import { Injectable } from '@angular/core';

export interface ShortcutDef {
  key: string;
  ctrl: boolean;
  description: string;
  group?: string;
  action: () => void;
  ignoreInInputs?: boolean;
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService {
  private readonly shortcuts = new Map<string, ShortcutDef>();

  constructor() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  register(id: string, def: ShortcutDef): void {
    this.shortcuts.set(id, { ignoreInInputs: true, ...def });
  }

  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  getAll(): ShortcutDef[] {
    return Array.from(this.shortcuts.values());
  }

  private canonical(ctrl: boolean, key: string): string {
    return `${ctrl ? 'ctrl+' : ''}${key.toLowerCase()}`;
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = this.canonical(e.ctrlKey, e.key);
    for (const def of this.shortcuts.values()) {
      if (this.canonical(def.ctrl, def.key) !== key) continue;

      if (def.ignoreInInputs !== false) {
        const tag = (e.target as Element).tagName;
        const isInput =
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
          (e.target as Element).getAttribute('contenteditable') === 'true';
        if (isInput) return;
      }

      e.preventDefault();
      def.action();
      return;
    }
  }
}
