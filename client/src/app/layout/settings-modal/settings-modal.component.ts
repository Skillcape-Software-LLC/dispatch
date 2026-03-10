import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsModalService, type SettingsTab } from '../../core/services/settings-modal.service';
import { SettingsService, type AppSettings } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';
import { CentralClientService } from '../../core/services/central-client.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.scss',
})
export class SettingsModalComponent implements OnInit {
  readonly modal = inject(SettingsModalService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly historyService = inject(HistoryService);
  private readonly centralClient = inject(CentralClientService);

  readonly activeTab = signal<SettingsTab>('general');
  readonly saving = signal(false);
  readonly clearConfirm = signal(false);

  // Central tab state
  readonly connectStatus = signal<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  readonly connectError = signal('');
  centralDraft = { url: '', passphrase: '', instanceName: '' };

  // Local editable copy
  draft: AppSettings = { ...this.settingsService.settings() };

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        const current = this.settingsService.settings();
        this.draft = { ...current };
        this.activeTab.set(this.modal.requestedTab());
        this.clearConfirm.set(false);

        // Re-initialize Central tab from saved config on every open
        const cfg = current.centralConfig;
        this.centralDraft = {
          url: cfg?.url ?? '',
          passphrase: '',
          instanceName: cfg?.instanceName ?? '',
        };
        this.connectStatus.set(cfg?.instanceToken ? 'connected' : 'idle');
        this.connectError.set('');
      }
    });
  }

  ngOnInit(): void {
    // Initial draft set by effect; nothing extra needed
  }

  connect(): void {
    const { url, passphrase, instanceName } = this.centralDraft;
    if (!url || !passphrase || !instanceName) {
      this.connectError.set('URL, instance name, and passphrase are required.');
      this.connectStatus.set('error');
      return;
    }
    this.connectStatus.set('connecting');
    this.connectError.set('');

    this.centralClient.register(url, passphrase, instanceName).subscribe({
      next: (res) => {
        this.settingsService.save({ centralConfig: { url, instanceToken: res.token, instanceName } }).subscribe({
          next: () => {
            this.connectStatus.set('connected');
            this.toast.show('Connected to Dispatch Central');
          },
          error: () => {
            this.connectStatus.set('error');
            this.connectError.set('Failed to save connection settings.');
          },
        });
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.connectStatus.set('error');
        if (err.status === 401 || err.status === 403) {
          this.connectError.set('Invalid passphrase or unauthorized.');
        } else if (!err.status) {
          this.connectError.set('Cannot reach Central server. Check the URL and try again.');
        } else {
          this.connectError.set(err.error?.message ?? 'Registration failed.');
        }
      },
    });
  }

  disconnect(): void {
    this.settingsService.save({ centralConfig: undefined }).subscribe({
      next: () => {
        this.connectStatus.set('idle');
        this.centralDraft = { url: '', passphrase: '', instanceName: '' };
        this.toast.show('Disconnected from Dispatch Central');
      },
    });
  }

  save(): void {
    this.saving.set(true);
    this.settingsService.save(this.draft).subscribe({
      next: () => {
        this.saving.set(false);
        this.modal.close();
        this.toast.show('Settings saved');
      },
      error: () => {
        this.saving.set(false);
        this.toast.show('Failed to save settings', 'error');
      },
    });
  }

  cancel(): void {
    this.modal.close();
  }

  clearHistory(): void {
    if (!this.clearConfirm()) {
      this.clearConfirm.set(true);
      return;
    }
    this.historyService.clearAll().subscribe({
      next: () => {
        this.clearConfirm.set(false);
        this.toast.show('History cleared');
      },
      error: () => this.toast.show('Failed to clear history', 'error'),
    });
  }
}
