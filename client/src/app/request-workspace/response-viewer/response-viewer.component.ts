import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { RequestStateService } from '../../core/services/request-state.service';
import { ProxyError } from '../../core/models/proxy-result.model';

type ResponseTab = 'body' | 'headers';

const ERROR_MESSAGES: Record<string, string> = {
  timeout: 'Request timed out after 30 seconds.',
  connection_refused: 'Connection refused — the server is not accepting connections.',
  dns_failure: 'DNS lookup failed — hostname could not be resolved.',
  ssl_error: 'SSL/TLS certificate error.',
  invalid_url: 'Invalid URL — please check the address.',
  unknown: 'An unexpected error occurred.',
};

@Component({
  selector: 'app-response-viewer',
  standalone: true,
  imports: [FormsModule, NgClass, MonacoEditorModule],
  templateUrl: './response-viewer.component.html',
  styleUrl: './response-viewer.component.scss',
})
export class ResponseViewerComponent {
  readonly state = inject(RequestStateService);

  activeTab = signal<ResponseTab>('body');
  copied = signal(false);

  readonly statusClass = computed(() => {
    const s = this.state.lastResponse()?.status;
    if (!s) return '';
    if (s < 300) return 'status-2xx';
    if (s < 400) return 'status-3xx';
    if (s < 500) return 'status-4xx';
    return 'status-5xx';
  });

  readonly prettyBody = computed(() => {
    const body = this.state.lastResponse()?.body ?? '';
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  });

  readonly editorLanguage = computed(() => {
    const ct = this.state.lastResponse()?.headers['content-type'] ?? '';
    if (ct.includes('json')) return 'json';
    if (ct.includes('xml')) return 'xml';
    if (ct.includes('html')) return 'html';
    return 'plaintext';
  });

  readonly editorOptions = computed(() => ({
    theme: 'vs-dark',
    language: this.editorLanguage(),
    automaticLayout: true,
    readOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    fontFamily: 'IBM Plex Mono, Fira Code, monospace',
    lineNumbers: 'off' as const,
    padding: { top: 8 },
  }));

  readonly responseHeaders = computed(() =>
    Object.entries(this.state.lastResponse()?.headers ?? {})
  );

  errorMessage(err: ProxyError | null): string {
    if (!err) return '';
    return err.message ?? ERROR_MESSAGES[err.error] ?? 'An error occurred.';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} kB`;
  }

  formatTime(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  async copyBody(): Promise<void> {
    const body = this.prettyBody();
    await navigator.clipboard.writeText(body);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
