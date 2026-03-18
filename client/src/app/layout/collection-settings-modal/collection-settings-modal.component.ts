import { Component, inject, signal, effect } from '@angular/core';
import { CollectionSettingsModalService } from '../../core/services/collection-settings-modal.service';
import { CollectionService } from '../../core/services/collection.service';
import { ToastService } from '../../core/services/toast.service';
import { ActiveRequestAuth, KvEntry, defaultActiveRequest } from '../../core/models/active-request.model';
import { AuthEditorComponent } from '../../request-workspace/request-builder/auth-editor/auth-editor.component';
import { KvEditorComponent } from '../../request-workspace/request-builder/kv-editor/kv-editor.component';

type SettingsTab = 'auth' | 'headers';

@Component({
  selector: 'app-collection-settings-modal',
  standalone: true,
  imports: [AuthEditorComponent, KvEditorComponent],
  templateUrl: './collection-settings-modal.component.html',
  styleUrl: './collection-settings-modal.component.scss',
})
export class CollectionSettingsModalComponent {
  readonly modal = inject(CollectionSettingsModalService);
  private readonly collectionService = inject(CollectionService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<SettingsTab>('auth');
  readonly collectionName = signal('');
  readonly editingAuth = signal<ActiveRequestAuth>(defaultActiveRequest().auth);
  readonly editingHeaders = signal<KvEntry[]>([]);
  readonly saving = signal(false);

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        this.activeTab.set('auth');
        this.saving.set(false);
        this.load();
      }
    });
  }

  private load(): void {
    this.collectionService.getCollections().subscribe((cols) => {
      const col = cols.find((c) => c.id === this.modal.collectionId());
      if (!col) return;
      this.collectionName.set(col.name);
      this.editingAuth.set({ ...defaultActiveRequest().auth, ...col.auth });
      this.editingHeaders.set(
        (col.presetHeaders ?? []).map((h) => ({ ...h, id: crypto.randomUUID() }))
      );
    });
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);

    const presetHeaders = this.editingHeaders()
      .filter((h) => h.key.trim() !== '' || h.value.trim() !== '')
      .map(({ id: _id, ...h }) => h);

    this.collectionService.updateSettings(this.modal.collectionId(), {
      auth: this.editingAuth(),
      presetHeaders,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show('Collection settings saved');
        this.modal.close();
      },
      error: () => {
        this.toast.show('Failed to save collection settings', 'error');
        this.saving.set(false);
      },
    });
  }

  close(): void {
    this.modal.close();
  }
}
