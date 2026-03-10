import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EnvironmentService } from '../../core/services/environment.service';
import { EnvEditorModalService } from '../../core/services/env-editor-modal.service';
import { SettingsModalService } from '../../core/services/settings-modal.service';
import { KeyboardShortcutService } from '../../core/services/keyboard-shortcut.service';
import type { Environment } from '../../core/models/environment.model';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent implements OnInit {
  readonly envService = inject(EnvironmentService);
  private readonly modal = inject(EnvEditorModalService);
  readonly settingsModal = inject(SettingsModalService);
  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly destroyRef = inject(DestroyRef);

  readonly environments = signal<Environment[]>([]);
  readonly selectedId = signal<string>('');

  ngOnInit(): void {
    this.envService.getEnvironments().subscribe((envs) => {
      this.environments.set(envs);
      const savedId = this.envService.activeEnvironmentId();
      if (savedId && envs.some((e) => e.id === savedId)) {
        this.selectedId.set(savedId);
        const env = envs.find((e) => e.id === savedId);
        if (env) {
          this.envService.setActiveEnvironment(savedId, env.variables);
        }
      }
    });

    this.shortcuts.register('focus-env', {
      key: 'e',
      ctrl: true,
      description: 'Focus environment selector',
      group: 'NAVIGATION',
      action: () => {
        const el = document.querySelector<HTMLSelectElement>('.env-select');
        el?.focus();
      },
    });

    this.destroyRef.onDestroy(() => this.shortcuts.unregister('focus-env'));
  }

  onEnvChange(id: string): void {
    this.selectedId.set(id);
    if (!id) {
      this.envService.setActiveEnvironment(null, []);
    } else {
      const env = this.environments().find((e) => e.id === id);
      this.envService.setActiveEnvironment(id, env?.variables ?? []);
    }
  }

  openEditor(): void {
    this.modal.open();
  }
}
