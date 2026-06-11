import { Injectable, computed, effect, signal } from '@angular/core';
import { ActiveRequest } from '../models/active-request.model';
import { RequestTab, defaultTab } from '../models/tab.model';
import type { ProxyError, ProxyResult } from '../models/proxy-result.model';

const STORAGE_KEY = 'dispatch.tabs';
const STORAGE_VERSION = 1;

interface PersistedState {
  version: 1;
  activeTabId: string;
  tabs: Array<{
    id: string;
    label: string;
    savedRequestId: string | null;
    savedCollectionId: string | null;
    savedSnapshot: ActiveRequest | null;
    request: ActiveRequest;
    isDirty: boolean;
  }>;
}

@Injectable({ providedIn: 'root' })
export class TabService {
  readonly tabs = signal<RequestTab[]>([defaultTab()]);
  readonly activeTabId = signal<string>(this.tabs()[0].id);

  readonly activeTab = computed(() =>
    this.tabs().find((t) => t.id === this.activeTabId())!
  );

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromStorage();
    effect(() => {
      const snapshot = { tabs: this.tabs(), activeTabId: this.activeTabId() };
      this.scheduleSave(snapshot);
    });
  }

  openTab(partial?: Partial<RequestTab>): void {
    const tab: RequestTab = { ...defaultTab(), ...partial };
    this.tabs.update((tabs) => [...tabs, tab]);
    this.activeTabId.set(tab.id);
  }

  closeTab(id: string): void {
    const current = this.tabs();
    const tab = current.find((t) => t.id === id);
    if (tab && !this.confirmDiscard([tab])) return;

    if (current.length === 1) {
      const blank = defaultTab();
      this.tabs.set([blank]);
      this.activeTabId.set(blank.id);
      return;
    }

    const idx = current.findIndex((t) => t.id === id);
    const next = current.filter((t) => t.id !== id);
    this.tabs.set(next);

    if (this.activeTabId() === id) {
      this.activeTabId.set(next[Math.min(idx, next.length - 1)].id);
    }
  }

  activateTab(id: string): void {
    this.activeTabId.set(id);
  }

  activateNext(): void {
    const tabs = this.tabs();
    const idx = tabs.findIndex((t) => t.id === this.activeTabId());
    const next = tabs[(idx + 1) % tabs.length];
    this.activeTabId.set(next.id);
  }

  activatePrev(): void {
    const tabs = this.tabs();
    const idx = tabs.findIndex((t) => t.id === this.activeTabId());
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    this.activeTabId.set(prev.id);
  }

  /** Reorder a tab from one index to another (used by drag-and-drop). Persistence is automatic. */
  moveTab(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    this.tabs.update((tabs) => {
      const next = [...tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  /** Close every tab except `id`, then activate it. Prompts when discarding unsaved tabs. */
  closeOthers(id: string): void {
    const discarded = this.tabs().filter((t) => t.id !== id);
    if (!this.confirmDiscard(discarded)) return;
    const keep = this.tabs().find((t) => t.id === id);
    if (!keep) return;
    this.tabs.set([keep]);
    this.activeTabId.set(keep.id);
  }

  /** Replace all tabs with a single blank tab. Prompts when discarding unsaved tabs. */
  closeAll(): void {
    if (!this.confirmDiscard(this.tabs())) return;
    const blank = defaultTab();
    this.tabs.set([blank]);
    this.activeTabId.set(blank.id);
  }

  /** Close all tabs to the right of `id`. Prompts when discarding unsaved tabs. */
  closeToRight(id: string): void {
    const current = this.tabs();
    const idx = current.findIndex((t) => t.id === id);
    if (idx === -1 || idx === current.length - 1) return;
    const discarded = current.slice(idx + 1);
    if (!this.confirmDiscard(discarded)) return;
    const next = current.slice(0, idx + 1);
    this.tabs.set(next);
    if (!next.some((t) => t.id === this.activeTabId())) {
      this.activeTabId.set(id);
    }
  }

  /** Close all tabs without unsaved changes. Never discards dirty tabs, so no prompt. */
  closeUnaltered(): void {
    const current = this.tabs();
    const next = current.filter((t) => t.isDirty);
    if (next.length === current.length) return;
    if (next.length === 0) {
      const blank = defaultTab();
      this.tabs.set([blank]);
      this.activeTabId.set(blank.id);
      return;
    }
    this.tabs.set(next);
    if (!next.some((t) => t.id === this.activeTabId())) {
      this.activeTabId.set(next[0].id);
    }
  }

  /** Native confirm when ≥1 of the tabs about to be discarded has unsaved changes. */
  private confirmDiscard(discarded: RequestTab[]): boolean {
    const dirty = discarded.filter((t) => t.isDirty).length;
    if (dirty === 0) return true;
    return confirm(
      `Close ${discarded.length} tab${discarded.length === 1 ? '' : 's'}? ` +
        `${dirty} ha${dirty === 1 ? 's' : 've'} unsaved changes.`
    );
  }

  updateRequest(updater: (r: ActiveRequest) => ActiveRequest): void {
    this.tabs.update((tabs) =>
      tabs.map((t) => {
        if (t.id !== this.activeTabId()) return t;
        const request = updater(t.request);
        const isDirty = t.savedSnapshot !== null
          ? JSON.stringify(request) !== JSON.stringify(t.savedSnapshot)
          : false;
        // Only recompute label when not saved — saved name stays put
        const label = t.savedRequestId ? t.label : this.computeLabel(request);
        return { ...t, request, isDirty, label };
      })
    );
  }

  setResponse(response: ProxyResult): void {
    this.tabs.update((tabs) =>
      tabs.map((t) =>
        t.id === this.activeTabId() ? { ...t, response, error: null } : t
      )
    );
  }

  setError(error: ProxyError): void {
    this.tabs.update((tabs) =>
      tabs.map((t) =>
        t.id === this.activeTabId() ? { ...t, error, response: null } : t
      )
    );
  }

  setLoading(loading: boolean): void {
    this.tabs.update((tabs) =>
      tabs.map((t) =>
        t.id === this.activeTabId() ? { ...t, isLoading: loading } : t
      )
    );
  }

  clearResponse(): void {
    this.tabs.update((tabs) =>
      tabs.map((t) =>
        t.id === this.activeTabId() ? { ...t, response: null, error: null } : t
      )
    );
  }

  updateTabLabel(requestId: string, name: string): void {
    this.tabs.update((tabs) =>
      tabs.map((t) => t.savedRequestId === requestId ? { ...t, label: name } : t)
    );
  }

  markSaved(requestId: string, collectionId: string, snapshot: ActiveRequest, name: string): void {
    this.tabs.update((tabs) =>
      tabs.map((t) =>
        t.id === this.activeTabId()
          ? { ...t, isDirty: false, savedRequestId: requestId, savedCollectionId: collectionId, savedSnapshot: snapshot, label: name }
          : t
      )
    );
  }

  private computeLabel(request: ActiveRequest): string {
    if (request.url.trim()) {
      try {
        const url = new URL(request.url.includes('://') ? request.url : `http://${request.url}`);
        const segment = url.pathname.replace(/^\//, '') || url.hostname;
        return segment || 'New Request';
      } catch {
        const trimmed = request.url.trim();
        return trimmed.split('/').filter(Boolean).pop() ?? trimmed;
      }
    }
    return 'New Request';
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as PersistedState;
      if (data.version !== STORAGE_VERSION || !Array.isArray(data.tabs) || data.tabs.length === 0) return;

      const tabs: RequestTab[] = data.tabs.map((t) => ({
        id: t.id,
        label: t.label,
        request: t.request,
        savedRequestId: t.savedRequestId,
        savedCollectionId: t.savedCollectionId ?? null,
        savedSnapshot: t.savedSnapshot,
        response: null,
        error: null,
        isLoading: false,
        isDirty: t.isDirty ?? false,
      }));

      const activeId = data.tabs.find((t) => t.id === data.activeTabId)
        ? data.activeTabId
        : tabs[0].id;

      this.tabs.set(tabs);
      this.activeTabId.set(activeId);
    } catch {
      // Corrupt data — start fresh
    }
  }

  private scheduleSave(snapshot: unknown): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persistSnapshot(snapshot as { tabs: RequestTab[]; activeTabId: string });
    }, 500);
  }

  private persistSnapshot(snapshot: { tabs: RequestTab[]; activeTabId: string }): void {
    const data: PersistedState = {
      version: STORAGE_VERSION,
      activeTabId: snapshot.activeTabId,
      tabs: snapshot.tabs.map((t) => ({
        id: t.id,
        label: t.label,
        savedRequestId: t.savedRequestId,
        savedCollectionId: t.savedCollectionId,
        savedSnapshot: t.savedSnapshot,
        request: t.request,
        isDirty: t.isDirty,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
