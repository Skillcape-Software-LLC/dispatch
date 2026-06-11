import { Injectable } from '@angular/core';

export interface ShortcutDef {
  key: string;
  ctrl: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  group?: string;
  action: () => void;
  ignoreInInputs?: boolean;
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService {
  private readonly shortcuts = new Map<string, ShortcutDef>();

  constructor() {
    // Capture phase: intercept the event at the document before it reaches
    // widget-local handlers (e.g. Monaco's hidden <textarea>) that would
    // otherwise consume Ctrl+S. The input guard below still gates other shortcuts.
    document.addEventListener('keydown', (e) => this.onKeyDown(e), { capture: true });
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

  private canonicalFromEvent(e: KeyboardEvent): string {
    const ctrl = e.ctrlKey || e.metaKey;
    const alt = e.altKey;
    const shift = e.shiftKey;
    const key = e.key.toLowerCase();
    return [ctrl && 'ctrl', shift && 'shift', alt && 'alt', key].filter(Boolean).join('+');
  }

  private canonicalFromDef(def: ShortcutDef): string {
    const ctrl = def.ctrl || (def.meta ?? false);
    const alt = def.alt ?? false;
    const shift = def.shift ?? false;
    const key = def.key.toLowerCase();
    return [ctrl && 'ctrl', shift && 'shift', alt && 'alt', key].filter(Boolean).join('+');
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = this.canonicalFromEvent(e);
    for (const def of this.shortcuts.values()) {
      if (this.canonicalFromDef(def) !== key) continue;

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
