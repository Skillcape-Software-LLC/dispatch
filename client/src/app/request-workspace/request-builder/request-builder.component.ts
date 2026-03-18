import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RequestStateService } from '../../core/services/request-state.service';
import { CollectionService } from '../../core/services/collection.service';
import { ToastService } from '../../core/services/toast.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { EnvEditorModalService } from '../../core/services/env-editor-modal.service';
import { CodegenModalService } from '../../core/services/codegen-modal.service';
import { HttpMethod, KvEntry, ActiveRequestBody, ActiveRequestAuth, defaultActiveRequest } from '../../core/models/active-request.model';
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
  private readonly collectionService = inject(CollectionService);
  private readonly toast = inject(ToastService);
  private readonly envService = inject(EnvironmentService);
  readonly envEditorModal = inject(EnvEditorModalService);
  private readonly codegenModal = inject(CodegenModalService);
  readonly methods = HTTP_METHODS;

  activeTab = signal<ConfigTab>('params');
  showMethodMenu = signal(false);

  async copyAssembledUrl(): Promise<void> {
    const url = this.assembledUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    this.toast.show('URL copied to clipboard');
  }

  private buildVarMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const v of this.envService.activeEnvironmentVars()) {
      if (v.enabled) map[v.key] = v.value;
    }
    return map;
  }

  private resolveText(text: string, map: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? `{{${k}}}`);
  }

  /** Variables referenced in the request that have no match in the active environment. */
  readonly unresolvedVars = computed<string[]>(() => {
    const req = this.state.currentRequest();
    const knownVars = new Set(
      this.envService.activeEnvironmentVars().filter(v => v.enabled).map(v => v.key)
    );

    const tokens = new Set<string>();
    const scan = (text: string) => {
      for (const m of text.match(/\{\{(\w+)\}\}/g) ?? []) tokens.add(m.slice(2, -2));
    };

    scan(req.url);
    for (const h of req.headers) { if (h.enabled) { scan(h.key); scan(h.value); } }
    for (const p of req.params) { if (p.enabled) { scan(p.key); scan(p.value); } }
    if (req.body.content) scan(req.body.content);

    return [...tokens].filter(t => !knownVars.has(t));
  });

  readonly unresolvedVarsLabel = computed(() =>
    this.unresolvedVars().map(v => `{{${v}}}`).join(', ')
  );

  /** Resolved URL with environment variable tokens substituted. Null when URL has no tokens or no vars are set. */
  readonly resolvedUrl = computed<string | null>(() => {
    const url = this.state.currentRequest().url;
    if (!url.includes('{{')) return null;
    const map = this.buildVarMap();
    if (!Object.keys(map).length) return null;
    const resolved = this.resolveText(url, map);
    return resolved !== url ? resolved : null;
  });

  /** Full URL with active query params appended. Null when no active params exist. */
  readonly assembledUrl = computed<string | null>(() => {
    const req = this.state.currentRequest();
    const activeParams = req.params.filter((p) => p.enabled && p.key.trim());
    if (!activeParams.length) return null;

    const map = this.buildVarMap();
    const base = this.resolveText(req.url.trim(), map);
    // Build query string without a URL constructor so we handle partial/invalid URLs too
    const existing = base.includes('?') ? '&' : '?';
    const qs = activeParams
      .map((p) => `${encodeURIComponent(this.resolveText(p.key, map))}=${encodeURIComponent(this.resolveText(p.value, map))}`)
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

  inheritFromCollection(): void {
    const collectionId = this.state.savedCollectionId();
    if (!collectionId) return;

    this.collectionService.getCollections().subscribe((cols) => {
      const col = cols.find((c) => c.id === collectionId);
      if (!col) return;

      // Replace auth wholesale
      this.state.updateAuth({ ...defaultActiveRequest().auth, ...col.auth });

      // Prepend preset headers whose keys aren't already present (case-insensitive)
      const existing = this.state.currentRequest().headers;
      const existingKeys = new Set(
        existing.filter((h) => h.key.trim()).map((h) => h.key.toLowerCase())
      );
      const toAdd: KvEntry[] = (col.presetHeaders ?? [])
        .filter((h) => h.enabled && h.key.trim() && !existingKeys.has(h.key.toLowerCase()))
        .map((h) => ({ id: crypto.randomUUID(), key: h.key, value: h.value, enabled: h.enabled }));

      if (toAdd.length) {
        this.state.updateHeaders([...toAdd, ...existing]);
      }

      this.toast.show('Inherited auth and headers from collection');
    });
  }

  openCodegen(): void {
    this.codegenModal.open();
  }
}
