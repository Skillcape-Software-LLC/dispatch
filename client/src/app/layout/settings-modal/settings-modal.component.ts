import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsModalService } from '../../core/services/settings-modal.service';
import { SettingsService, type AppSettings } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { HistoryService } from '../../core/services/history.service';

type SettingsTab = 'general' | 'network' | 'data';

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

  readonly activeTab = signal<SettingsTab>('general');
  readonly saving = signal(false);
  readonly clearConfirm = signal(false);

  // Local editable copy
  draft: AppSettings = { ...this.settingsService.settings() };

  ngOnInit(): void {
    this.draft = { ...this.settingsService.settings() };
  }

  open(): void {
    this.draft = { ...this.settingsService.settings() };
    this.activeTab.set('general');
    this.clearConfirm.set(false);
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
