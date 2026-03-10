import { ApplicationConfig, ErrorHandler, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';
import { GlobalErrorHandler } from './core/services/global-error-handler';
import { apiErrorInterceptor } from './core/interceptors/api-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideMonacoEditor({ baseUrl: 'assets' }),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
