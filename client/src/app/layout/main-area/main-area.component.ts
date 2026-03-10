import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { NgClass } from '@angular/common';
import { RequestWorkspaceComponent } from '../../request-workspace/request-workspace.component';
import { TabService } from '../../core/services/tab.service';
import { CollectionService } from '../../core/services/collection.service';
import { SaveAsModalService } from '../../core/services/save-as-modal.service';
import { RequestStateService } from '../../core/services/request-state.service';
import { ToastService } from '../../core/services/toast.service';
import { KeyboardShortcutService } from '../../core/services/keyboard-shortcut.service';

@Component({
  selector: 'app-main-area',
  standalone: true,
  imports: [NgClass, RequestWorkspaceComponent],
  templateUrl: './main-area.component.html',
  styleUrl: './main-area.component.scss',
})
export class MainAreaComponent implements OnInit {
  readonly tabService = inject(TabService);
  private readonly collectionService = inject(CollectionService);
  private readonly saveAsModal = inject(SaveAsModalService);
  private readonly state = inject(RequestStateService);
  private readonly toast = inject(ToastService);
  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly destroyRef = inject(DestroyRef);

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

    this.destroyRef.onDestroy(() => {
      this.shortcuts.unregister('save-request');
      this.shortcuts.unregister('new-tab');
      this.shortcuts.unregister('close-tab');
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
