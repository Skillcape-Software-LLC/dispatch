import { Injectable, inject, signal, computed } from '@angular/core';
import { EMPTY, catchError, tap } from 'rxjs';
import { ProxyService } from './proxy.service';
import {
  ActiveRequest,
  ActiveRequestAuth,
  ActiveRequestBody,
  HttpMethod,
  KvEntry,
  defaultActiveRequest,
} from '../models/active-request.model';
import type { ProxyError, ProxyResult } from '../models/proxy-result.model';

@Injectable({ providedIn: 'root' })
export class RequestStateService {
  private readonly proxyService = inject(ProxyService);

  readonly currentRequest = signal<ActiveRequest>(defaultActiveRequest());
  readonly isLoading = signal(false);
  readonly lastResponse = signal<ProxyResult | null>(null);
  readonly requestError = signal<ProxyError | null>(null);

  readonly enabledHeaderCount = computed(() =>
    this.currentRequest().headers.filter((h) => h.enabled && h.key.trim()).length
  );

  readonly enabledParamCount = computed(() =>
    this.currentRequest().params.filter((p) => p.enabled && p.key.trim()).length
  );

  updateMethod(method: HttpMethod): void {
    this.currentRequest.update((r) => ({ ...r, method }));
  }

  updateUrl(url: string): void {
    this.currentRequest.update((r) => ({ ...r, url }));
  }

  updateHeaders(headers: KvEntry[]): void {
    this.currentRequest.update((r) => ({ ...r, headers }));
  }

  updateParams(params: KvEntry[]): void {
    this.currentRequest.update((r) => ({ ...r, params }));
  }

  updateBody(body: ActiveRequestBody): void {
    this.currentRequest.update((r) => ({ ...r, body }));
  }

  updateAuth(auth: ActiveRequestAuth): void {
    this.currentRequest.update((r) => ({ ...r, auth }));
  }

  sendRequest(): void {
    if (this.isLoading()) return;
    const req = this.currentRequest();
    if (!req.url.trim()) return;

    this.isLoading.set(true);
    this.lastResponse.set(null);
    this.requestError.set(null);

    this.proxyService
      .send(req)
      .pipe(
        tap((result) => {
          this.lastResponse.set(result);
          this.isLoading.set(false);
        }),
        catchError((err) => {
          this.requestError.set(err.error as ProxyError);
          this.isLoading.set(false);
          return EMPTY;
        })
      )
      .subscribe();
  }
}
