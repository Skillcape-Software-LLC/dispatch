import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RequestStateService } from '../../core/services/request-state.service';
import { ToastService } from '../../core/services/toast.service';
import { HttpMethod, KvEntry, ActiveRequestBody, ActiveRequestAuth } from '../../core/models/active-request.model';
import { KvEditorComponent } from './kv-editor/kv-editor.component';
import { BodyEditorComponent } from './body-editor/body-editor.component';
import { AuthEditorComponent } from './auth-editor/auth-editor.component';

type ConfigTab = 'params' | 'headers' | 'body' | 'auth';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

@Component({
  selector: 'app-request-builder',
  standalone: true,
  imports: [FormsModule, NgClass, KvEditorComponent, BodyEditorComponent, AuthEditorComponent],
  templateUrl: './request-builder.component.html',
  styleUrl: './request-builder.component.scss',
})
export class RequestBuilderComponent {
  readonly state = inject(RequestStateService);
  private readonly toast = inject(ToastService);
  readonly methods = HTTP_METHODS;

  activeTab = signal<ConfigTab>('params');
  showMethodMenu = signal(false);

  async copyAssembledUrl(): Promise<void> {
    const url = this.assembledUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    this.toast.show('URL copied to clipboard');
  }

  /** Full URL with active query params appended. Null when no active params exist. */
  readonly assembledUrl = computed<string | null>(() => {
    const req = this.state.currentRequest();
    const activeParams = req.params.filter((p) => p.enabled && p.key.trim());
    if (!activeParams.length) return null;

    const base = req.url.trim();
    // Build query string without a URL constructor so we handle partial/invalid URLs too
    const existing = base.includes('?') ? '&' : '?';
    const qs = activeParams
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    return base + existing + qs;
  });

  toggleMethodMenu(): void {
    this.showMethodMenu.update((v) => !v);
  }

  selectMethod(method: HttpMethod): void {
    this.state.updateMethod(method);
    this.showMethodMenu.set(false);
  }

  methodClass(method: string): string {
    return `method-${method.toLowerCase()}`;
  }

  onUrlChange(url: string): void {
    this.state.updateUrl(url);
  }

  onParamsChange(params: KvEntry[]): void {
    this.state.updateParams(params);
  }

  onHeadersChange(headers: KvEntry[]): void {
    this.state.updateHeaders(headers);
  }

  onBodyChange(body: ActiveRequestBody): void {
    this.state.updateBody(body);
  }

  onAuthChange(auth: ActiveRequestAuth): void {
    this.state.updateAuth(auth);
  }
}
