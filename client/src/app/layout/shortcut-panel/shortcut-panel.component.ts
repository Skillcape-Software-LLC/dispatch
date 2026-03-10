import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { KeyboardShortcutService, type ShortcutDef } from '../../core/services/keyboard-shortcut.service';

@Component({
  selector: 'app-shortcut-panel',
  standalone: true,
  imports: [],
  templateUrl: './shortcut-panel.component.html',
  styleUrl: './shortcut-panel.component.scss',
})
export class ShortcutPanelComponent implements OnInit {
  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isOpen = signal(false);

  ngOnInit(): void {
    this.shortcuts.register('shortcut-panel-toggle', {
      key: '/',
      ctrl: true,
      description: 'Keyboard shortcuts',
      group: 'NAVIGATION',
      action: () => this.toggle(),
    });

    this.destroyRef.onDestroy(() => this.shortcuts.unregister('shortcut-panel-toggle'));
  }

  toggle(): void {
    this.isOpen.update(v => !v);
  }

  close(): void {
    this.isOpen.set(false);
  }

  getGroups(): { label: string; shortcuts: ShortcutDef[] }[] {
    const all = this.shortcuts.getAll();
    const groupMap = new Map<string, ShortcutDef[]>();

    for (const s of all) {
      const g = s.group ?? 'OTHER';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(s);
    }

    const order = ['REQUEST', 'TABS', 'NAVIGATION', 'OTHER'];
    const result: { label: string; shortcuts: ShortcutDef[] }[] = [];

    for (const label of order) {
      const shorts = groupMap.get(label);
      if (shorts?.length) {
        result.push({ label, shortcuts: shorts });
        groupMap.delete(label);
      }
    }
    // Any remaining groups
    for (const [label, shorts] of groupMap.entries()) {
      result.push({ label, shortcuts: shorts });
    }

    return result;
  }

  formatKey(def: ShortcutDef): string[] {
    const parts: string[] = [];
    if (def.ctrl) parts.push('Ctrl');
    parts.push(def.key === '/' ? '/' : def.key.toUpperCase());
    return parts;
  }
}
