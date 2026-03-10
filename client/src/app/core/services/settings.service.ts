import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

export interface AppSettings {
  requestTimeoutMs: number;
  historyLimit: number;
  sslVerification: boolean;
  defaultContentType: string;
  proxyUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  requestTimeoutMs: 30000,
  historyLimit: 500,
  sslVerification: true,
  defaultContentType: 'application/json',
  proxyUrl: '',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  readonly settings = signal<AppSettings>(DEFAULT_SETTINGS);

  load() {
    return this.http.get<AppSettings>('/api/settings').pipe(
      tap(s => this.settings.set(s))
    );
  }

  save(partial: Partial<AppSettings>) {
    return this.http.put<AppSettings>('/api/settings', partial).pipe(
      tap(s => this.settings.set(s))
    );
  }
}
