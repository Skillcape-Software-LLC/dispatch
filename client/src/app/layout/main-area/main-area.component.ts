import { Component, HostListener, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RequestWorkspaceComponent } from '../../request-workspace/request-workspace.component';
import { TabService } from '../../core/services/tab.service';
import { CollectionService } from '../../core/services/collection.service';
import { SaveAsModalService } from '../../core/services/save-as-modal.service';
import { RequestStateService } from '../../core/services/request-state.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-main-area',
  standalone: true,
  imports: [NgClass, RequestWorkspaceComponent],
  templateUrl: './main-area.component.html',
  styleUrl: './main-area.component.scss',
})
export class MainAreaComponent {
  readonly tabService = inject(TabService);
  private readonly collectionService = inject(CollectionService);
  private readonly saveAsModal = inject(SaveAsModalService);
  private readonly state = inject(RequestStateService);
  private readonly toast = inject(ToastService);

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      this.saveActiveRequest();
    }
  }

  saveActiveRequest(): void {
    const tab = this.tabService.activeTab();
    if (tab.isLoading) return;

    if (tab.savedRequestId && tab.savedCollectionId) {
      // Quick-save: PATCH the existing saved request
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
          this.toast.show(`"${tab.label}" saved`);
        },
        error: () => this.toast.show('Failed to save request', 'error'),
      });
    } else {
      // Open Save As modal
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
