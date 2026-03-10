import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';
import { GlobalErrorHandler } from './core/services/global-error-handler';
import { apiErrorInterceptor } from './core/interceptors/api-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
    provideMonacoEditor({ baseUrl: 'assets' }),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
