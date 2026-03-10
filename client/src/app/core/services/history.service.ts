import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, Observable } from 'rxjs';
import type { HistoryEntry } from '../models/history.model';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);

  private readonly _newEntry$ = new Subject<void>();
  /** Emits whenever a new history entry is recorded (request completed). */
  readonly newEntry$ = this._newEntry$.asObservable();

  notifyNewEntry(): void {
    this._newEntry$.next();
  }

  getHistory(limit = 200): Observable<HistoryEntry[]> {
    return this.http.get<HistoryEntry[]>(`/api/history?limit=${limit}`);
  }

  deleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`/api/history/${id}`);
  }

  clearAll(): Observable<void> {
    return this.http.delete<void>('/api/history');
  }
}
