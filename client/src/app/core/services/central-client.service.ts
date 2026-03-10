import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SettingsService } from './settings.service';

// ---- Request / Response Interfaces ----

export interface RegisterResponse {
  token: string;
}

export interface VerifyResponse {
  id: string;
  name: string;
  createdAt: string;
}

export interface CentralRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  body: { mode: string; content: string };
  auth: unknown;
  sortOrder: number;
  updatedAt: string;
}

export interface ChannelState {
  version: number;
  collection: Record<string, unknown>;
  requests: CentralRequest[];
}

export interface ChannelInfo {
  id: string;
  name: string;
  mode: 'readonly' | 'readwrite';
  ownerInstanceId: string;
  subscriberCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelVersionResponse {
  version: number;
}

export interface ChannelChanges {
  currentVersion: number;
  collection: Record<string, unknown>;
  changes: {
    requests: CentralRequest[];
    deleted: string[];
  };
}

export interface PublishChannelCollection {
  id: string;
  name: string;
  description: string;
  folders: unknown[];
  auth: unknown;
  variables: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface PublishChannelPayload {
  name: string;
  mode: 'readonly' | 'readwrite';
  collection: PublishChannelCollection;
  requests: CentralRequest[];
}

export interface PublishChannelResponse {
  channelId: string;
}

export interface SubscribeResponse {
  channelId: string;
}

export interface PushPayload {
  baseVersion: number;
  changes: {
    collection?: {
      id: string;
      name: string;
      description: string;
      folders: unknown[];
      auth: unknown;
      variables: unknown[];
      createdAt: string;
      updatedAt: string;
    };
    requests: {
      added: CentralRequest[];
      modified: CentralRequest[];
      deleted: string[];
    };
  };
}

export interface PushResponse {
  version: number;
}

export interface PatchChannelSettingsPayload {
  mode: 'readonly' | 'readwrite';
}

// ---- Service ----

@Injectable({ providedIn: 'root' })
export class CentralClientService {
  private readonly http = inject(HttpClient);
  private readonly settingsService = inject(SettingsService);

  /** Emits when Central returns 401 — prompts the user to re-register. */
  readonly needsReregistration$ = new Subject<void>();

  private get centralUrl(): string {
    return this.settingsService.settings().centralConfig?.url ?? '';
  }

  private get instanceToken(): string {
    return this.settingsService.settings().centralConfig?.instanceToken ?? '';
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-Instance-Token': this.instanceToken,
      'Content-Type': 'application/json',
    });
  }

  private handleError = (error: { status?: number }): Observable<never> => {
    if (error.status === 401) {
      this.needsReregistration$.next();
    }
    return throwError(() => error);
  };

  /** Register this Dispatch instance with Central. Uses X-Passphrase; no token required. */
  register(url: string, passphrase: string, instanceName: string): Observable<RegisterResponse> {
    return this.http
      .post<RegisterResponse>(
        `${url}/api/instances/register`,
        { name: instanceName },
        { headers: new HttpHeaders({ 'X-Passphrase': passphrase, 'Content-Type': 'application/json' }) }
      )
      .pipe(catchError(this.handleError));
  }

  /** Publish a new channel, seeding it with the current collection's requests. */
  publishChannel(payload: PublishChannelPayload): Observable<PublishChannelResponse> {
    return this.http
      .post<PublishChannelResponse>(`${this.centralUrl}/api/channels`, payload, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Subscribe to an existing channel. */
  subscribe(channelId: string): Observable<SubscribeResponse> {
    return this.http
      .post<SubscribeResponse>(`${this.centralUrl}/api/channels/${channelId}/subscribe`, {}, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Get the full current state of a channel (all requests at latest version). */
  getChannelState(channelId: string): Observable<ChannelState> {
    return this.http
      .get<ChannelState>(`${this.centralUrl}/api/channels/${channelId}/state`, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Get just the current version number of a channel. */
  getChannelVersion(channelId: string): Observable<ChannelVersionResponse> {
    return this.http
      .get<ChannelVersionResponse>(`${this.centralUrl}/api/channels/${channelId}/version`, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Get the change set since a given version. */
  getChanges(channelId: string, since: number): Observable<ChannelChanges> {
    return this.http
      .get<ChannelChanges>(`${this.centralUrl}/api/channels/${channelId}/changes?since=${since}`, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Push local changes to the channel. */
  push(channelId: string, payload: PushPayload): Observable<PushResponse> {
    return this.http
      .post<PushResponse>(`${this.centralUrl}/api/channels/${channelId}/push`, payload, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Get channel metadata (info, subscriber count, etc.). */
  getChannelInfo(channelId: string): Observable<ChannelInfo> {
    return this.http
      .get<ChannelInfo>(`${this.centralUrl}/api/channels/${channelId}`, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Update channel settings (e.g. change sync mode). */
  patchChannelSettings(channelId: string, settings: PatchChannelSettingsPayload): Observable<ChannelInfo> {
    return this.http
      .patch<ChannelInfo>(`${this.centralUrl}/api/channels/${channelId}/settings`, settings, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Unsubscribe from a channel (or unpublish if owner). */
  unsubscribe(channelId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.centralUrl}/api/channels/${channelId}/subscribe`, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }

  /** Verify connection to Central by calling GET /api/instances/me. */
  verifyConnection(): Observable<VerifyResponse> {
    return this.http
      .get<VerifyResponse>(`${this.centralUrl}/api/instances/me`, { headers: this.authHeaders() })
      .pipe(catchError(this.handleError));
  }
}
