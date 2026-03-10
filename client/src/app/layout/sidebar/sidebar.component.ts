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
import { SettingsModalService } from '../../core/services/settings-modal.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { EnvEditorModalService } from '../../core/services/env-editor-modal.service';
import { SyncService } from '../../core/services/sync.service';
import { PublishModalService } from '../../core/services/publish-modal.service';
import { SubscribeModalService } from '../../core/services/subscribe-modal.service';
import { PullPreviewModalService } from '../../core/services/pull-preview-modal.service';
import { ChannelInfoModalService } from '../../core/services/channel-info-modal.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import type { Collection, SavedRequest } from '../../core/models/collection.model';
import type { HistoryEntry } from '../../core/models/history.model';
import type { Environment } from '../../core/models/environment.model';
import { defaultActiveRequest, type KvEntry, type ActiveRequestBody } from '../../core/models/active-request.model';
import type { ActiveRequestAuth } from '../../core/models/active-request.model';

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
  private readonly toast = inject(ToastService);
  private readonly historyService = inject(HistoryService);
  private readonly saveAsModal = inject(SaveAsModalService);
  private readonly importExportService = inject(ImportExportService);
  private readonly importModal = inject(ImportModalService);
  readonly settingsModal = inject(SettingsModalService);
  readonly envService = inject(EnvironmentService);
  private readonly envEditorModal = inject(EnvEditorModalService);
  readonly syncService = inject(SyncService);
  private readonly publishModal = inject(PublishModalService);
  private readonly subscribeModal = inject(SubscribeModalService);
  private readonly pullPreviewModal = inject(PullPreviewModalService);
  private readonly channelInfoModal = inject(ChannelInfoModalService);

  @Input() collapsed = false;
  @Output() collapseToggled = new EventEmitter<void>();

  activeTab: 'collections' | 'history' = 'collections';

  // Environment selector
  readonly environments = signal<Environment[]>([]);
  readonly selectedEnvId = signal<string>('');

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

  // History
  readonly historyEntries = signal<HistoryEntry[]>([]);
  readonly historyLoading = signal(false);
  readonly historySearchQuery = signal('');

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
    this.loadCollections();
    this.loadEnvironments();
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
    this.historyRefreshSub?.unsubscribe();
    this.collectionsChangedSub?.unsubscribe();
    this.requestUpdatedSub?.unsubscribe();
    this.syncCompletedSub?.unsubscribe();
  }

  setTab(tab: 'collections' | 'history'): void {
    this.activeTab = tab;
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  // --- Environments ---

  private loadEnvironments(): void {
    this.envService.getEnvironments().subscribe((envs) => {
      this.environments.set(envs);
      const savedId = this.envService.activeEnvironmentId();
      if (savedId && envs.some((e) => e.id === savedId)) {
        this.selectedEnvId.set(savedId);
        const env = envs.find((e) => e.id === savedId);
        if (env) {
          this.envService.setActiveEnvironment(savedId, env.variables);
        }
      }
    });
  }

  onEnvChange(id: string): void {
    this.selectedEnvId.set(id);
    if (!id) {
      this.envService.setActiveEnvironment(null, []);
    } else {
      const env = this.environments().find((e) => e.id === id);
      this.envService.setActiveEnvironment(id, env?.variables ?? []);
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
    this.confirmingDeleteCollectionId.set(id);
  }

  cancelDeleteCollection(event: MouseEvent): void {
    event.stopPropagation();
    this.confirmingDeleteCollectionId.set(null);
  }

  deleteCollection(id: string, event: MouseEvent): void {
    event.stopPropagation();
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
      },
      error: () => this.toast.show('Failed to delete collection', 'error'),
    });
  }

  startRenameRequest(req: SavedRequest, event: MouseEvent): void {
    event.stopPropagation();
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
    this.publishModal.open(col.id, col.name);
  }

  openSubscribeModal(event: MouseEvent): void {
    event.stopPropagation();
    this.subscribeModal.open();
  }

  openPullPreview(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.pullPreviewModal.open(col);
  }

  openChannelInfo(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.channelInfoModal.open(col);
  }

  pushCollection(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
    this.syncService.push(col).catch(() => this.toast.show('Push failed', 'error'));
  }

  openImportModal(): void {
    this.importModal.open();
  }

  exportCollection(col: Collection, event: MouseEvent): void {
    event.stopPropagation();
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
    const headers: KvEntry[] = Object.entries(entry.request.headers)
      .filter(([k]) => !SKIP_HEADERS.has(k.toLowerCase()))
      .map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true }));

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

  clearHistory(): void {
    this.historyService.clearAll().subscribe({
      next: () => {
        this.historyEntries.set([]);
        this.toast.show('History cleared');
      },
      error: () => this.toast.show('Failed to clear history', 'error'),
    });
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
