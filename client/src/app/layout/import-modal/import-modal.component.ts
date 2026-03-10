import { Component, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImportModalService } from '../../core/services/import-modal.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { TabService } from '../../core/services/tab.service';
import { ToastService } from '../../core/services/toast.service';
import { defaultActiveRequest } from '../../core/models/active-request.model';
import type { KvEntry } from '../../core/models/active-request.model';

@Component({
  selector: 'app-import-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './import-modal.component.html',
  styleUrl: './import-modal.component.scss',
})
export class ImportModalComponent {
  readonly modal = inject(ImportModalService);
  private readonly importExportService = inject(ImportExportService);
  private readonly tabs = inject(TabService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<'curl' | 'collection'>('curl');

  // cURL tab
  curlInput = '';
  readonly curlLoading = signal(false);
  readonly curlError = signal('');

  // Collection tab
  collectionInput = '';
  readonly collectionLoading = signal(false);
  readonly collectionError = signal('');

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        this.activeTab.set('curl');
        this.curlInput = '';
        this.curlError.set('');
        this.collectionInput = '';
        this.collectionError.set('');
      }
    });
  }

  importCurl(): void {
    if (this.curlLoading()) return;
    const input = this.curlInput.trim();
    if (!input) {
      this.curlError.set('Please paste a cURL command.');
      return;
    }

    this.curlLoading.set(true);
    this.curlError.set('');

    this.importExportService.parseCurl(input).subscribe({
      next: (parsed) => {
        this.curlLoading.set(false);

        const addId = (arr: Array<{ key: string; value: string; enabled: boolean }>): KvEntry[] =>
          arr.map((item) => ({ ...item, id: crypto.randomUUID() }));

        const base = defaultActiveRequest();
        const freshRequest = {
          ...base,
          method: parsed.method as any,
          url: parsed.url,
          headers: parsed.headers.length ? addId(parsed.headers) : base.headers,
          params: parsed.params.length ? addId(parsed.params) : base.params,
          body: parsed.body as any,
          auth: {
            ...base.auth,
            type: parsed.auth.type,
            ...(parsed.auth.bearer ? { bearer: parsed.auth.bearer } : {}),
            ...(parsed.auth.basic ? { basic: parsed.auth.basic } : {}),
            ...(parsed.auth.apikey ? { apikey: parsed.auth.apikey } : {}),
          },
        };

        const active = this.tabs.activeTab();
        const isClean = !active.isDirty && !active.isLoading && !active.request.url.trim();

        if (isClean) {
          this.tabs.updateRequest(() => freshRequest);
        } else {
          this.tabs.openTab({ request: freshRequest });
        }

        this.toast.show('cURL imported');
        this.modal.close();
      },
      error: (err) => {
        this.curlLoading.set(false);
        this.curlError.set(err?.error?.error ?? 'Failed to parse cURL command.');
      },
    });
  }

  importCollection(): void {
    if (this.collectionLoading()) return;
    const input = this.collectionInput.trim();
    if (!input) {
      this.collectionError.set('Please paste or upload a collection JSON file.');
      return;
    }

    let data: any;
    try {
      data = JSON.parse(input);
    } catch {
      this.collectionError.set('Invalid JSON. Please check your input.');
      return;
    }

    this.collectionLoading.set(true);
    this.collectionError.set('');

    this.importExportService.importCollection(data).subscribe({
      next: (result) => {
        this.collectionLoading.set(false);
        this.importExportService.notifyCollectionsChanged();
        this.toast.show(`Collection "${result.name}" imported (${result.requestCount} requests)`);
        this.modal.close();
      },
      error: (err) => {
        this.collectionLoading.set(false);
        this.collectionError.set(err?.error?.error ?? 'Failed to import collection.');
      },
    });
  }

  onFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.collectionInput = reader.result as string;
    };
    reader.readAsText(file);
  }

  close(): void {
    this.modal.close();
  }
}
