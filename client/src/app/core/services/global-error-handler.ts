import { Injectable, ErrorHandler, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);
    const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
    this.toast.show(msg, 'error');
  }
}
