import { Component, inject, signal, effect } from '@angular/core';
import { PullPreviewModalService } from '../../core/services/pull-preview-modal.service';
import { SyncService } from '../../core/services/sync.service';
import { ToastService } from '../../core/services/toast.service';

interface PreviewData {
  upserted: number;
  deleted: number;
  serverVersion: number;
}

@Component({
  selector: 'app-pull-preview-modal',
  standalone: true,
  imports: [],
  templateUrl: './pull-preview-modal.component.html',
  styleUrl: './pull-preview-modal.component.scss',
})
export class PullPreviewModalComponent {
  readonly modal = inject(PullPreviewModalService);
  private readonly syncService = inject(SyncService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly pulling = signal(false);
  readonly preview = signal<PreviewData | null>(null);
  readonly error = signal('');

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        this.loadPreview();
      }
    });
  }

  private loadPreview(): void {
    const collection = this.modal.collection();
    if (!collection) return;

    this.loading.set(true);
    this.preview.set(null);
    this.error.set('');

    this.syncService.pullPreview(collection).then(
      (data) => {
        this.preview.set(data);
        this.loading.set(false);
      },
      (err: unknown) => {
        this.loading.set(false);
        this.error.set('Failed to load preview.');
        console.error(err);
      }
    );
  }

  pull(): void {
    const collection = this.modal.collection();
    if (!collection) return;

    this.pulling.set(true);
    this.syncService.pull(collection).then(
      () => {
        this.pulling.set(false);
        this.toast.show('Pull complete');
        this.modal.close();
      },
      () => {
        this.pulling.set(false);
        this.toast.show('Pull failed', 'error');
      }
    );
  }

  close(): void {
    this.modal.close();
  }
}
