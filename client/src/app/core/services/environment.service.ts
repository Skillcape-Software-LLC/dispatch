import { Injectable, inject, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Environment, EnvironmentVariable } from '../models/environment.model';

const STORAGE_KEY = 'dispatch.activeEnvId';

@Injectable({ providedIn: 'root' })
export class EnvironmentService {
  private readonly http = inject(HttpClient);

  readonly activeEnvironmentId = signal<string | null>(localStorage.getItem(STORAGE_KEY));
  readonly activeEnvironmentVars = signal<EnvironmentVariable[]>([]);

  constructor() {
    effect(() => {
      const id = this.activeEnvironmentId();
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }

  setActiveEnvironment(id: string | null, vars: EnvironmentVariable[]): void {
    this.activeEnvironmentId.set(id);
    this.activeEnvironmentVars.set(vars);
  }

  getEnvironments(): Observable<Environment[]> {
    return this.http.get<Environment[]>('/api/environments');
  }

  getEnvironment(id: string): Observable<Environment> {
    return this.http.get<Environment>(`/api/environments/${id}`);
  }

  createEnvironment(name: string): Observable<Environment> {
    return this.http.post<Environment>('/api/environments', { name });
  }

  updateEnvironment(id: string, patch: { name?: string; variables?: EnvironmentVariable[] }): Observable<Environment> {
    return this.http.put<Environment>(`/api/environments/${id}`, patch);
  }

  deleteEnvironment(id: string): Observable<void> {
    return this.http.delete<void>(`/api/environments/${id}`);
  }
}
