import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      let msg: string;
      if (err.status === 0) {
        msg = 'Network error — unable to reach the server';
      } else if (err.status >= 400 && err.status < 500) {
        msg = err.error?.error ?? `Request error (${err.status})`;
      } else if (err.status >= 500) {
        msg = err.error?.error ?? `Server error (${err.status})`;
      } else {
        msg = 'An unexpected error occurred';
      }
      toast.show(msg, 'error');
      return throwError(() => err);
    })
  );
};
