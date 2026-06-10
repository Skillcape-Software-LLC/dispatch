import { Injectable, signal } from '@angular/core';

/**
 * A menu item displayed by the context menu service.
 * When `separator` is true, only `label` is used; all other fields are ignored.
 */
export interface ContextMenuItem {
  label: string;
  /** Bootstrap icon class, e.g. 'bi-x'. */
  icon?: string;
  /** Display-only shortcut hint, e.g. 'Ctrl+W'. */
  shortcut?: string;
  disabled?: boolean;
  /** Render a divider instead of an action row. Other fields are ignored. */
  separator?: boolean;
  action?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Rough sizing used to clamp the menu inside the viewport before it renders. */
const EST_WIDTH = 220;
const EST_ROW_HEIGHT = 30;

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  /** Menu position and items; `null` when closed. Template-driven visibility/rendering. */
  readonly state = signal<ContextMenuState | null>(null);

  private readonly onDocClick = () => this.close();
  private readonly onScroll = () => this.close();
  private readonly onBlur = () => this.close();
  private readonly onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  /** Open the menu at the event location with the given items. */
  open(event: MouseEvent, items: ContextMenuItem[]): void {
    event.preventDefault();

    const estHeight = items.length * EST_ROW_HEIGHT;
    const x = Math.min(event.clientX, window.innerWidth - EST_WIDTH);
    const y = Math.min(event.clientY, window.innerHeight - estHeight);

    this.state.set({ x: Math.max(0, x), y: Math.max(0, y), items });

    // Defer listener attachment so the originating click/contextmenu doesn't close it immediately.
    setTimeout(() => {
      document.addEventListener('click', this.onDocClick);
      document.addEventListener('contextmenu', this.onDocClick);
      document.addEventListener('scroll', this.onScroll, true);
      document.addEventListener('keydown', this.onKeydown);
      window.addEventListener('blur', this.onBlur);
    });
  }

  close(): void {
    if (!this.state()) return;
    this.state.set(null);
    document.removeEventListener('click', this.onDocClick);
    document.removeEventListener('contextmenu', this.onDocClick);
    document.removeEventListener('scroll', this.onScroll, true);
    document.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Run an item's action and close the menu. */
  run(item: ContextMenuItem): void {
    if (item.disabled || item.separator) return;
    this.close();
    item.action?.();
  }
}
