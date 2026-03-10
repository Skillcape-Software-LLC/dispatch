import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly toast = inject(ToastService);

  init(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        this.toast.show('New version available — reloading...', 'info');
        setTimeout(() => document.location.reload(), 3000);
      });

    this.swUpdate.unrecoverable.subscribe(() => {
      this.toast.show('App cache is corrupted — reloading...', 'error');
      setTimeout(() => document.location.reload(), 3000);
    });
  }
}
