import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ImportExportService {
  private readonly http = inject(HttpClient);

  private readonly _collectionsChanged$ = new Subject<void>();
  readonly collectionsChanged$ = this._collectionsChanged$.asObservable();

  parseCurl(curlStr: string): Observable<any> {
    return this.http.post<any>('/api/import/curl', { curl: curlStr });
  }

  exportCollection(id: string): Observable<any> {
    return this.http.get<any>(`/api/collections/${id}/export`);
  }

  importCollection(data: any): Observable<any> {
    return this.http.post<any>('/api/collections/import', data);
  }

  notifyCollectionsChanged(): void {
    this._collectionsChanged$.next();
  }

  downloadJson(data: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
