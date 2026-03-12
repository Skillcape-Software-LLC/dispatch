import { Component, OnInit, OnDestroy, inject, DestroyRef, signal, effect } from '@angular/core';
import { NgClass } from '@angular/common';
import { RequestWorkspaceComponent } from '../../request-workspace/request-workspace.component';
import { TabService } from '../../core/services/tab.service';
import { CollectionService } from '../../core/services/collection.service';
import { SaveAsModalService } from '../../core/services/save-as-modal.service';
import { RequestStateService } from '../../core/services/request-state.service';
import { ToastService } from '../../core/services/toast.service';
import { KeyboardShortcutService } from '../../core/services/keyboard-shortcut.service';
import { ImportModalService } from '../../core/services/import-modal.service';
import { SettingsService } from '../../core/services/settings.service';
import { CentralClientService } from '../../core/services/central-client.service';

export type CentralStatus = 'none' | 'connected' | 'unreachable' | 'checking';

@Component({
  selector: 'app-main-area',
  standalone: true,
  imports: [NgClass, RequestWorkspaceComponent],
  templateUrl: './main-area.component.html',
  styleUrl: './main-area.component.scss',
})
export class MainAreaComponent implements OnInit, OnDestroy {
  readonly tabService = inject(TabService);
  private readonly collectionService = inject(CollectionService);
  private readonly saveAsModal = inject(SaveAsModalService);
  private readonly state = inject(RequestStateService);
  private readonly toast = inject(ToastService);
  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly importModal = inject(ImportModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsService = inject(SettingsService);
  private readonly centralClient = inject(CentralClientService);

  readonly centralStatus = signal<CentralStatus>('none');
  readonly centralLabel = signal('No Central configured');
  private statusInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const config = this.settingsService.settings().centralConfig;
      // Re-check whenever settings change
      this.checkCentralStatus(config);
    });
  }

  ngOnInit(): void {
    this.shortcuts.register('save-request', {
      key: 's',
      ctrl: true,
      description: 'Save request',
      group: 'REQUEST',
      ignoreInInputs: false,
      action: () => this.saveActiveRequest(),
    });

    this.shortcuts.register('new-tab', {
      key: 'n',
      ctrl: true,
      description: 'New tab',
      group: 'TABS',
      action: () => this.tabService.openTab(),
    });

    this.shortcuts.register('close-tab', {
      key: 'w',
      ctrl: true,
      description: 'Close tab',
      group: 'TABS',
      action: () => this.tabService.closeTab(this.tabService.activeTabId()),
    });

    this.shortcuts.register('import', {
      key: 'i',
      ctrl: true,
      description: 'Import',
      group: 'GENERAL',
      action: () => this.importModal.open(),
    });

    this.destroyRef.onDestroy(() => {
      this.shortcuts.unregister('save-request');
      this.shortcuts.unregister('new-tab');
      this.shortcuts.unregister('close-tab');
      this.shortcuts.unregister('import');
    });

    // Poll Central status every 5 minutes
    this.statusInterval = setInterval(() => {
      const config = this.settingsService.settings().centralConfig;
      this.checkCentralStatus(config);
    }, 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  }

  private checkCentralStatus(config?: { url?: string; instanceToken?: string }): void {
    if (!config?.url || !config?.instanceToken) {
      this.centralStatus.set('none');
      this.centralLabel.set('No Central configured');
      return;
    }
    this.centralStatus.set('checking');
    this.centralLabel.set('Checking Central…');
    this.centralClient.verifyConnection().subscribe({
      next: () => {
        this.centralStatus.set('connected');
        this.centralLabel.set('Connected to Central');
      },
      error: () => {
        this.centralStatus.set('unreachable');
        this.centralLabel.set('Central unreachable');
      },
    });
  }

  saveActiveRequest(): void {
    const tab = this.tabService.activeTab();
    if (tab.isLoading) return;

    if (tab.savedRequestId && tab.savedCollectionId) {
      const req = this.state.currentRequest();
      this.collectionService.updateRequest(tab.savedCollectionId, tab.savedRequestId, {
        method: req.method,
        url: req.url,
        headers: req.headers,
        params: req.params,
        body: req.body,
        auth: req.auth,
      }).subscribe({
        next: (saved) => {
          this.tabService.markSaved(saved.id, tab.savedCollectionId!, req, tab.label);
          this.collectionService.notifyRequestUpdated(tab.savedCollectionId!);
          this.toast.show(`"${tab.label}" saved`);
        },
        error: () => this.toast.show('Failed to save request', 'error'),
      });
    } else {
      this.saveAsModal.open(tab.label);
    }
  }

  closeTab(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.tabService.closeTab(id);
  }

  methodClass(method: string): string {
    return `method-${method.toLowerCase()}`;
  }
}
