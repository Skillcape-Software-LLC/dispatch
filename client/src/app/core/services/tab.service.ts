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
        isDirty: false,
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
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
