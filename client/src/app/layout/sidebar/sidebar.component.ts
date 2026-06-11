import { Component, OnInit, OnDestroy, inject, signal, computed, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CollectionService } from '../../core/services/collection.service';
import { TabService } from '../../core/services/tab.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { SaveAsModalService } from '../../core/services/save-as-modal.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { ImportModalService } from '../../core/services/import-modal.service';
import { EnvEditorModalService } from '../../core/services/env-editor-modal.service';
import { SyncService } from '../../core/services/sync.service';
import { PublishModalService } from '../../core/services/publish-modal.service';
import { SubscribeModalService } from '../../core/services/subscribe-modal.service';
import { PullPreviewModalService } from '../../core/services/pull-preview-modal.service';
import { ChannelInfoModalService } from '../../core/services/channel-info-modal.service';
import { CollectionSettingsModalService } from '../../core/services/collection-settings-modal.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import type { Collection, SavedRequest } from '../../core/models/collection.model';
import type { HistoryEntry } from '../../core/models/history.model';
import { defaultActiveRequest, type KvEntry, type ActiveRequestBody } from '../../core/models/active-request.model';
import type { ActiveRequestAuth } from '../../core/models/active-request.model';
import { SidebarStateService } from '../../core/services/sidebar-state.service';

type DateGroup = 'Today' | 'Yesterday' | 'Last 7 Days' | 'Older';

interface HistoryGroup {
  label: DateGroup;
  entries: HistoryEntry[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [NgClass, FormsModule, EmptyStateComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy {
  private readonly collectionService = inject(CollectionService);
  readonly tabs = inject(TabService);
  private readonly sidebarState = inject(SidebarStateService);
  private readonly toast = inject(ToastService);
  private readonly historyService = inject(HistoryService);
  private readonly saveAsModal = inject(SaveAsModalService);
  private readonly importExportService = inject(ImportExportService);
  private readonly importModal = inject(ImportModalService);
  private readonly envEditorModal = inject(EnvEditorModalService);
  readonly syncService = inject(SyncService);
  private readonly publishModal = inject(PublishModalService);
  private readonly subscribeModal = inject(SubscribeModalService);
  private readonly pullPreviewModal = inject(PullPreviewModalService);
  private readonly channelInfoModal = inject(ChannelInfoModalService);
  private readonly collectionSettingsModal = inject(CollectionSettingsModalService);

  @Input() collapsed = false;
  @Output() collapseToggled = new EventEmitter<void>();

  activeTab: 'collections' | 'history' = 'collections';

  // Collections
  readonly collections = signal<Collection[]>([]);
  readonly expandedIds = signal<Set<string>>(new Set());
  readonly requestsByCollection = signal<Map<string, SavedRequest[]>>(new Map());
  readonly creatingCollection = signal(false);
  readonly renamingId = signal<string | null>(null);
  newCollectionName = '';
  renameValue = '';

  // Request rename
  readonly renamingRequestId = signal<string | null>(null);
  renameRequestValue = '';

  // Delete confirmations
  readonly confirmingDeleteCollectionId = signal<string | null>(null);
  readonly confirmingDeleteRequestId = signal<string | null>(null);

  // Dropdown menu
  readonly openMenuId = signal<string | null>(null);
  private documentClickListener = (e: Event) => {
    if (this.openMenuId() && !(e.target as HTMLElement).closest('.menu-trigger, .dropdown-menu-custom')) {
      this.openMenuId.set(null);
    }
  };

  // Collections search
  readonly collectionSearchQuery = signal('');
  readonly filteredCollections = computed(() => {
    const q = this.collectionSearchQuery().toLowerCase().trim();
    if (!q) return this.collections();
    return this.collections().filter((c) => c.name.toLowerCase().includes(q));
  });

  // History
  readonly historyEntries = signal<HistoryEntry[]>([]);
  readonly historyLoading = signal(false);
  readonly historySearchQuery = signal('');
  readonly confirmingClearHistory = signal(false);

  readonly filteredHistory = computed(() => {
    const q = this.historySearchQuery().toLowerCase().trim();
    if (!q) return this.historyEntries();
    return this.historyEntries().filter((e) =>
      e.request.url.toLowerCase().includes(q) ||
      e.request.method.toLowerCase().includes(q) ||
      String(e.response.status).includes(q)
    );
  });

  readonly groupedHistory = computed((): HistoryGroup[] => {
    const now = new Date();
    const groups: Map<DateGroup, HistoryEntry[]> = new Map([
      ['Today', []],
      ['Yesterday', []],
      ['Last 7 Days', []],
      ['Older', []],
    ]);

    for (const entry of this.filteredHistory()) {
      const date = new Date(entry.timestamp);
      const diffMs = now.getTime() - date.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      let label: DateGroup;
      if (diffDays < 1 && now.getDate() === date.getDate()) {
        label = 'Today';
      } else if (diffDays < 2 && (now.getDate() - date.getDate() === 1 || (now.getDate() === 1 && diffDays < 2))) {
        label = 'Yesterday';
      } else if (diffDays <= 7) {
        label = 'Last 7 Days';
      } else {
        label = 'Older';
      }

      groups.get(label)!.push(entry);
    }

    return [...groups.entries()]
      .filter(([, entries]) => entries.length > 0)
      .map(([label, entries]) => ({ label, entries }));
  });

  private historyRefreshSub?: Subscription;
  private collectionsChangedSub?: Subscription;
  private requestUpdatedSub?: Subscription;
  private syncCompletedSub?: Subscription;

  ngOnInit(): void {
    document.addEventListener('click', this.documentClickListener);
    this.loadCollections();
    this.historyRefreshSub = this.historyService.newEntry$.subscribe(() => {
      if (this.activeTab === 'history') {
        this.loadHistory();
      }
    });
    this.collectionsChangedSub = this.importExportService.collectionsChanged$.subscribe(() => {
      this.loadCollections();
    });
    this.requestUpdatedSub = this.collectionService.requestUpdated$.subscribe((collectionId) => {
      if (this.isExpanded(collectionId)) {
        this.loadRequests(collectionId);
      }
    });
    this.syncCompletedSub = this.syncService.syncCompleted$.subscribe(() => {
      this.loadCollections();
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.documentClickListener);
    this.historyRefreshSub?.unsubscribe();
    this.collectionsChangedSub?.unsubscribe();
    this.requestUpdatedSub?.unsubscribe();
    this.syncCompletedSub?.unsubscribe();
  }

  toggleMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  setTab(tab: 'collections' | 'history'): void {
    this.activeTab = tab;
    this.sidebarState.expand();
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  openEnvEditor(): void {
    this.envEditorModal.open();
  }

  // --- Collections ---

  loadCollections(): void {
    this.collectionService.getCollections().subscribe({
      next: (cols) => this.collections.set(cols),
      error: () => this.toast.show('Failed to load collections', 'error'),
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpand(id: string): void {
    const set = new Set(this.expandedIds());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
      if (!this.requestsByCollection().has(id)) {
        this.loadRequests(id);
      }
    }
    this.expandedIds.set(set);
  }

  private loadRequests(collectionId: string): void {
    this.collectionService.getRequests(collectionId).subscribe({
      next: (reqs) => {
        const map = new Map(this.requestsByCollection());
        map.set(collectionId, reqs);
        this.requestsByCollection.set(map);
      },
      error: () => this.toast.show('Failed to load requests', 'error'),
    });
  }

  openSavedRequest(req: SavedRequest): void {
    // If already open, just focus that tab
    const existing = this.tabs.tabs().find((t) => t.savedRequestId === req.id);
    if (existing) {
      this.tabs.activateTab(existing.id);
      return;
    }

    const freshRequest = {
      ...defaultActiveRequest(),
      method: req.method as any,
      url: req.url,
      headers: req.headers.map((h) => ({ ...h, id: crypto.randomUUID() } as KvEntry)),
      params: req.params.map((p) => ({ ...p, id: crypto.randomUUID() } as KvEntry)),
      body: { ...req.body } as any,
      auth: { ...req.auth },
    };

    const active = this.tabs.activeTab();
    const isClean = !active.isDirty && !active.isLoading && !active.request.url.trim();

    if (isClean) {
      this.tabs.updateRequest(() => freshRequest);
      this.tabs.markSaved(req.id, req.collectionId, freshRequest, req.name);
    } else {
      this.tabs.openTab({
        request: freshRequest,
        savedRequestId: req.id,
        savedCollectionId: req.collectionId,
        savedSnapshot: freshRequest,
        isDirty: false,
        label: req.name,
      });
    }
  }

  addRequestToCollection(collectionId: string): void {
    this.closeMenu();
    const fresh = defaultActiveRequest();
    this.collectionService.saveRequest(collectionId, {
      name: 'New Request',
      method: 'GET',
      url: '',
      headers: [],
      params: [],
      body: fresh.body,
      auth: fresh.auth,
    }).subscribe({
      next: (saved) => {
        this.loadRequests(collectionId);
        this.tabs.openTab({
          request: { ...fresh, method: 'GET' as any, url: '' },
          savedRequestId: saved.id,
          savedCollectionId: collectionId,
          savedSnapshot: fresh,
          isDirty: false,
          label: saved.name,
        });
        this.collectionService.notifyRequestUpdated(collectionId);
      },
      error: () => this.toast.show('Failed to add request', 'error'),
    });
  }

  duplicateRequest(req: SavedRequest): void {
    this.closeMenu();
    this.collectionService.saveRequest(req.collectionId, {
      name: req.name + ' Copy',
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      body: req.body,
      auth: req.auth,
    }).subscribe({
      next: () => {
        this.loadRequests(req.collectionId);
        this.collectionService.notifyRequestUpdated(req.collectionId);
        this.toast.show(`"${req.name}" duplicated`);
      },
      error: () => this.toast.show('Failed to duplicate request', 'error'),
    });
  }

  startCreate(): void {
    this.newCollectionName = '';
    this.creatingCollection.set(true);
  }

  confirmCreate(): void {
    const name = this.newCollectionName.trim();
    if (!name) { this.creatingCollection.set(false); return; }
    this.collectionService.createCollection(name).subscribe({
      next: (col) => {
        this.collections.update((c) => [...c, col]);
        this.creatingCollection.set(false);
        this.newCollectionName = '';
      },
      error: () => this.toast.show('Failed to create collection', 'error'),
    });
  }

  cancelCreate(): void {
    this.creatingCollection.set(false);
    this.newCollectionName = '';
  }

  startRename(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.renameValue = col.name;
    this.renamingId.set(col.id);
  }

  confirmRename(id: string): void {
    const name = this.renameValue.trim();
    if (!name) { this.renamingId.set(null); return; }
    this.collectionService.renameCollection(id, name).subscribe({
      next: (updated) => {
        this.collections.update((cols) =>
          cols.map((c) => (c.id === id ? { ...c, name: updated.name } : c))
        );
        this.renamingId.set(null);
      },
      error: () => this.toast.show('Failed to rename collection', 'error'),
    });
  }

  cancelRename(): void {
    this.renamingId.set(null);
  }

  promptDeleteCollection(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.confirmingDeleteCollectionId.set(id);
  }

  cancelDeleteCollection(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingDeleteCollectionId.set(null);
  }

  deleteCollection(id: string, event: MouseEvent): void {
    event.stopPropagation();
    const deleted = this.collections().find((c) => c.id === id);
    this.collectionService.deleteCollection(id).subscribe({
      next: () => {
        this.collections.update((cols) => cols.filter((c) => c.id !== id));
        const map = new Map(this.requestsByCollection());
        map.delete(id);
        this.requestsByCollection.set(map);
        const set = new Set(this.expandedIds());
        set.delete(id);
        this.expandedIds.set(set);
        this.confirmingDeleteCollectionId.set(null);
        if (deleted) {
          this.toast.show(`"${deleted.name}" deleted`, 'success', {
            label: 'Undo',
            fn: () => this.collectionService.createCollection(deleted.name).subscribe({
              next: (col) => this.collections.update((cols) => [...cols, col]),
              error: () => this.toast.show('Could not restore collection', 'error'),
            }),
          });
        }
      },
      error: () => this.toast.show('Failed to delete collection', 'error'),
    });
  }

  startRenameRequest(req: SavedRequest, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.renameRequestValue = req.name;
    this.renamingRequestId.set(req.id);
  }

  confirmRenameRequest(collectionId: string, requestId: string): void {
    const name = this.renameRequestValue.trim();
    if (!name) { this.renamingRequestId.set(null); return; }
    this.collectionService.updateRequest(collectionId, requestId, { name }).subscribe({
      next: (updated) => {
        const map = new Map(this.requestsByCollection());
        const reqs = (map.get(collectionId) ?? []).map((r) => r.id === requestId ? { ...r, name: updated.name } : r);
        map.set(collectionId, reqs);
        this.requestsByCollection.set(map);
        // Update label on any open tab for this request
        this.tabs.updateTabLabel(requestId, updated.name);
        this.renamingRequestId.set(null);
      },
      error: () => this.toast.show('Failed to rename request', 'error'),
    });
  }

  cancelRenameRequest(): void {
    this.renamingRequestId.set(null);
  }

  promptDeleteRequest(requestId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.confirmingDeleteRequestId.set(requestId);
  }

  cancelDeleteRequest(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingDeleteRequestId.set(null);
  }

  deleteRequest(collectionId: string, requestId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.collectionService.deleteRequest(collectionId, requestId).subscribe({
      next: () => {
        const map = new Map(this.requestsByCollection());
        const updated = (map.get(collectionId) ?? []).filter((r) => r.id !== requestId);
        map.set(collectionId, updated);
        this.requestsByCollection.set(map);
        this.collections.update((cols) =>
          cols.map((c) =>
            c.id === collectionId ? { ...c, requestCount: Math.max(0, c.requestCount - 1) } : c
          )
        );
        this.confirmingDeleteRequestId.set(null);
      },
      error: () => this.toast.show('Failed to delete request', 'error'),
    });
  }

  // --- Sync helpers ---

  isSynced(col: Collection): boolean {
    return !!col.channelId;
  }

  canPush(col: Collection): boolean {
    return this.isSynced(col) && (col.syncRole === 'owner' || col.syncMode === 'readwrite');
  }

  canPull(col: Collection): boolean {
    return this.isSynced(col);
  }

  syncBadgeIcon(col: Collection): string {
    const state = this.syncService.getSyncState(col.id);
    switch (state) {
      case 'syncing':     return 'bi bi-arrow-repeat sync-spinning';
      case 'upToDate':    return 'bi bi-check-circle-fill sync-ok';
      case 'behind':      return 'bi bi-arrow-down-circle-fill sync-behind';
      case 'localChanges': return 'bi bi-circle-fill sync-local';
      case 'error':       return 'bi bi-exclamation-circle-fill sync-error';
      default:            return 'bi bi-broadcast sync-idle';
    }
  }

  openPublishModal(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.publishModal.open(col.id, col.name);
  }

  openSubscribeModal(event: MouseEvent): void {
    event.stopPropagation();
    this.subscribeModal.open();
  }

  openPullPreview(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.pullPreviewModal.open(col);
  }

  openChannelInfo(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.channelInfoModal.open(col);
  }

  openCollectionSettings(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.collectionSettingsModal.open(col.id);
  }

  pushCollection(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.syncService.push(col).catch(() => this.toast.show('Push failed', 'error'));
  }

  openImportModal(): void {
    this.importModal.open();
  }

  exportCollection(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.importExportService.exportCollection(col.id).subscribe({
      next: (data) => this.importExportService.downloadJson(data, col.name + '.dispatch.json'),
      error: () => this.toast.show('Failed to export', 'error'),
    });
  }

  methodBadgeClass(method: string): string {
    return `badge-${method.toLowerCase()}`;
  }

  // --- History ---

  loadHistory(): void {
    this.historyLoading.set(true);
    this.historyService.getHistory().subscribe({
      next: (entries) => {
        this.historyEntries.set(entries);
        this.historyLoading.set(false);
      },
      error: () => {
        this.toast.show('Failed to load history', 'error');
        this.historyLoading.set(false);
      },
    });
  }

  openHistoryEntry(entry: HistoryEntry): void {
    const SKIP_HEADERS = new Set(['authorization', 'content-type', 'host', 'content-length']);
    const hadAuth = Object.keys(entry.request.headers).some((k) => k.toLowerCase() === 'authorization');
    const headers: KvEntry[] = Object.entries(entry.request.headers)
      .filter(([k]) => !SKIP_HEADERS.has(k.toLowerCase()))
      .map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true }));
    if (hadAuth) {
      this.toast.show('Auth header was not restored from history', 'info');
    }

    const bodyContent = entry.request.body ?? '';
    let bodyMode: ActiveRequestBody['mode'] = 'none';
    if (bodyContent) {
      const trimmed = bodyContent.trim();
      bodyMode = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? 'json' : 'raw';
    }

    const method = (HTTP_METHODS.includes(entry.request.method) ? entry.request.method : 'GET') as any;

    const fresh = {
      ...defaultActiveRequest(),
      method,
      url: entry.request.url,
      headers: headers.length ? headers : defaultActiveRequest().headers,
      body: { mode: bodyMode, content: bodyContent },
    };

    const active = this.tabs.activeTab();
    const isClean = !active.isDirty && !active.isLoading && !active.request.url.trim();

    if (isClean) {
      this.tabs.updateRequest(() => fresh);
    } else {
      this.tabs.openTab({ request: fresh });
    }
  }

  saveHistoryEntry(entry: HistoryEntry, event: MouseEvent): void {
    event.stopPropagation();
    this.openHistoryEntry(entry);
    const urlPath = this.historyDisplayUrl(entry.request.url);
    const suggestedName = `${entry.request.method} ${urlPath}`.substring(0, 80);
    this.saveAsModal.open(suggestedName);
  }

  deleteHistoryEntry(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.historyService.deleteEntry(id).subscribe({
      next: () => this.historyEntries.update((list) => list.filter((e) => e.id !== id)),
      error: () => this.toast.show('Failed to delete history entry', 'error'),
    });
  }

  promptClearHistory(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingClearHistory.set(true);
  }

  confirmClearHistory(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingClearHistory.set(false);
    this.historyService.clearAll().subscribe({
      next: () => {
        this.historyEntries.set([]);
        this.toast.show('History cleared');
      },
      error: () => this.toast.show('Failed to clear history', 'error'),
    });
  }

  cancelClearHistory(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingClearHistory.set(false);
  }

  historyDisplayUrl(url: string): string {
    try {
      const u = new URL(url);
      return (u.pathname + u.search) || u.hostname;
    } catch {
      return url;
    }
  }

  historyDisplayHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  historyTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  statusClass(status: number): string {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500) return 'status-5xx';
    return 'status-other';
  }
}
