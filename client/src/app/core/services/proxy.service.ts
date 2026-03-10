import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { ActiveRequest } from '../models/active-request.model';
import type { ProxyResult } from '../models/proxy-result.model';

@Injectable({ providedIn: 'root' })
export class ProxyService {
  private readonly http = inject(HttpClient);

  send(request: ActiveRequest): Observable<ProxyResult> {
    return this.http.post<ProxyResult>('/api/proxy', request);
  }
}
