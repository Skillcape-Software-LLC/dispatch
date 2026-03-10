import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveAsModalService } from '../../core/services/save-as-modal.service';
import { CollectionService } from '../../core/services/collection.service';
import { TabService } from '../../core/services/tab.service';
import { RequestStateService } from '../../core/services/request-state.service';
import { ToastService } from '../../core/services/toast.service';
import type { Collection } from '../../core/models/collection.model';

@Component({
  selector: 'app-save-as-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './save-as-modal.component.html',
  styleUrl: './save-as-modal.component.scss',
})
export class SaveAsModalComponent {
  readonly modal = inject(SaveAsModalService);
  private readonly collectionService = inject(CollectionService);
  private readonly tabs = inject(TabService);
  private readonly state = inject(RequestStateService);
  private readonly toast = inject(ToastService);

  readonly collections = signal<Collection[]>([]);
  readonly requestName = signal('');
  readonly selectedCollectionId = signal<string>('');
  readonly creatingNewCollection = signal(false);
  readonly newCollectionName = signal('');
  readonly saving = signal(false);

  constructor() {
    // When modal opens: reset form and load collections
    effect(() => {
      if (this.modal.isOpen()) {
        this.requestName.set(this.modal.initialName());
        this.creatingNewCollection.set(false);
        this.newCollectionName.set('');
        this.saving.set(false);
        this.loadCollections();
      }
    });
  }

  private loadCollections(): void {
    this.collectionService.getCollections().subscribe((cols) => {
      this.collections.set(cols);
      if (cols.length > 0 && !this.selectedCollectionId()) {
        this.selectedCollectionId.set(cols[0].id);
      }
    });
  }

  onCollectionChange(value: string): void {
    if (value === '__new__') {
      this.creatingNewCollection.set(true);
      this.selectedCollectionId.set('__new__');
    } else {
      this.creatingNewCollection.set(false);
      this.selectedCollectionId.set(value);
    }
  }

  save(): void {
    if (this.saving()) return;
    const name = this.requestName().trim();
    if (!name) return;

    this.saving.set(true);
    const req = this.state.currentRequest();

    const doSave = (collectionId: string) => {
      this.collectionService.saveRequest(collectionId, {
        name,
        method: req.method,
        url: req.url,
        headers: req.headers,
        params: req.params,
        body: req.body,
        auth: req.auth,
      }).subscribe({
        next: (saved) => {
          this.tabs.markSaved(saved.id, collectionId, req, name);
          this.toast.show(`"${name}" saved`);
          this.modal.close();
        },
        error: () => {
          this.toast.show('Failed to save request', 'error');
          this.saving.set(false);
        },
      });
    };

    if (this.creatingNewCollection()) {
      const colName = this.newCollectionName().trim();
      if (!colName) { this.saving.set(false); return; }
      this.collectionService.createCollection(colName).subscribe({
        next: (col) => doSave(col.id),
        error: () => {
          this.toast.show('Failed to create collection', 'error');
          this.saving.set(false);
        },
      });
    } else {
      const colId = this.selectedCollectionId();
      if (!colId) { this.saving.set(false); return; }
      doSave(colId);
    }
  }

  close(): void {
    this.modal.close();
  }
}
