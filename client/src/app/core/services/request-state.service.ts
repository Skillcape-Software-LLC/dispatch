import { Injectable, inject, computed } from '@angular/core';
import { EMPTY, catchError, tap } from 'rxjs';
import { ProxyService } from './proxy.service';
import { TabService } from './tab.service';
import { HistoryService } from './history.service';
import {
  ActiveRequestAuth,
  ActiveRequestBody,
  HttpMethod,
  KvEntry,
} from '../models/active-request.model';
import type { ProxyError } from '../models/proxy-result.model';

@Injectable({ providedIn: 'root' })
export class RequestStateService {
  private readonly tabs = inject(TabService);
  private readonly proxyService = inject(ProxyService);
  private readonly historyService = inject(HistoryService);

  readonly currentRequest = computed(() => this.tabs.activeTab().request);
  readonly isLoading = computed(() => this.tabs.activeTab().isLoading);
  readonly lastResponse = computed(() => this.tabs.activeTab().response);
  readonly requestError = computed(() => this.tabs.activeTab().error);

  readonly enabledHeaderCount = computed(() =>
    this.currentRequest().headers.filter((h) => h.enabled && h.key.trim()).length
  );

  readonly enabledParamCount = computed(() =>
    this.currentRequest().params.filter((p) => p.enabled && p.key.trim()).length
  );

  updateMethod(method: HttpMethod): void {
    this.tabs.updateRequest((r) => ({ ...r, method }));
  }

  updateUrl(url: string): void {
    this.tabs.updateRequest((r) => ({ ...r, url }));
  }

  updateHeaders(headers: KvEntry[]): void {
    this.tabs.updateRequest((r) => ({ ...r, headers }));
  }

  updateParams(params: KvEntry[]): void {
    this.tabs.updateRequest((r) => ({ ...r, params }));
  }

  updateBody(body: ActiveRequestBody): void {
    this.tabs.updateRequest((r) => ({ ...r, body }));
  }

  updateAuth(auth: ActiveRequestAuth): void {
    this.tabs.updateRequest((r) => ({ ...r, auth }));
  }

  sendRequest(): void {
    if (this.isLoading()) return;
    const req = this.currentRequest();
    if (!req.url.trim()) return;

    this.tabs.setLoading(true);
    this.tabs.clearResponse();

    this.proxyService
      .send(req, this.tabs.activeTab().savedCollectionId ?? undefined)
      .pipe(
        tap((result) => {
          this.tabs.setResponse(result);
          this.tabs.setLoading(false);
          this.historyService.notifyNewEntry();
        }),
        catchError((err) => {
          this.tabs.setError(err.error as ProxyError);
          this.tabs.setLoading(false);
          return EMPTY;
        })
      )
      .subscribe();
  }
}
