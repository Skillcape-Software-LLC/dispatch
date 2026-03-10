import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';
import type { ActiveRequest } from '../models/active-request.model';
import type { ProxyResult } from '../models/proxy-result.model';

@Injectable({ providedIn: 'root' })
export class ProxyService {
  private readonly http = inject(HttpClient);
  private readonly envService = inject(EnvironmentService);

  send(request: ActiveRequest, collectionId?: string): Observable<ProxyResult> {
    return this.http.post<ProxyResult>('/api/proxy', {
      ...request,
      environmentId: this.envService.activeEnvironmentId() ?? undefined,
      collectionId: collectionId ?? undefined,
    });
  }
}
