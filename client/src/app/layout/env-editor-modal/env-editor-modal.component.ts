import { Component, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EnvEditorModalService } from '../../core/services/env-editor-modal.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { ToastService } from '../../core/services/toast.service';
import { ImportExportService } from '../../core/services/import-export.service';
import type { Environment, EnvironmentVariable } from '../../core/models/environment.model';

@Component({
  selector: 'app-env-editor-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './env-editor-modal.component.html',
  styleUrl: './env-editor-modal.component.scss',
})
export class EnvEditorModalComponent {
  readonly modal = inject(EnvEditorModalService);
  private readonly envService = inject(EnvironmentService);
  private readonly toast = inject(ToastService);
  private readonly importExportSvc = inject(ImportExportService);

  readonly environments = signal<Environment[]>([]);
  readonly selectedEnvId = signal<string | null>(null);
  readonly editingEnv = signal<Environment | null>(null);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly creatingNew = signal(false);
  newEnvName = '';

  constructor() {
    effect(() => {
      if (this.modal.isOpen()) {
        this.saving.set(false);
        this.deleting.set(false);
        this.creatingNew.set(false);
        this.newEnvName = '';
        this.loadEnvironments();
      }
    });
  }

  private loadEnvironments(): void {
    this.envService.getEnvironments().subscribe((envs) => {
      this.environments.set(envs);
      const activeId = this.envService.activeEnvironmentId();
      if (activeId && envs.some((e) => e.id === activeId)) {
        this.selectEnv(activeId, envs);
      } else if (envs.length > 0) {
        this.selectEnv(envs[0].id, envs);
      } else {
        this.selectedEnvId.set(null);
        this.editingEnv.set(null);
      }
    });
  }

  private selectEnv(id: string, envs?: Environment[]): void {
    const list = envs ?? this.environments();
    const env = list.find((e) => e.id === id);
    if (env) {
      this.selectedEnvId.set(id);
      this.editingEnv.set(JSON.parse(JSON.stringify(env)));
      this.ensureEmptyRow();
    }
  }

  onSelectEnv(id: string): void {
    this.selectEnv(id);
  }

  private ensureEmptyRow(): void {
    const env = this.editingEnv();
    if (!env) return;
    const vars = env.variables;
    if (vars.length === 0 || (vars[vars.length - 1].key !== '' || vars[vars.length - 1].value !== '')) {
      this.editingEnv.set({ ...env, variables: [...vars, { key: '', value: '', enabled: true }] });
    }
  }

  onNameChange(name: string): void {
    const env = this.editingEnv();
    if (!env) return;
    this.editingEnv.set({ ...env, name });
  }

  onVarChange(index: number, field: 'key' | 'value' | 'enabled', value: string | boolean): void {
    const env = this.editingEnv();
    if (!env) return;
    const vars = env.variables.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    );
    this.editingEnv.set({ ...env, variables: vars });
    // If typing in the last row, add a new empty row
    if (index === vars.length - 1 && (field === 'key' || field === 'value') && value !== '') {
      const last = vars[vars.length - 1];
      if (last.key !== '' || last.value !== '') {
        this.editingEnv.set({ ...env, variables: [...vars, { key: '', value: '', enabled: true }] });
      }
    }
  }

  removeVar(index: number): void {
    const env = this.editingEnv();
    if (!env) return;
    const vars = env.variables.filter((_, i) => i !== index);
    this.editingEnv.set({ ...env, variables: vars });
    this.ensureEmptyRow();
  }

  save(): void {
    if (this.saving()) return;
    const env = this.editingEnv();
    if (!env) return;
    this.saving.set(true);

    // Strip the trailing empty row before saving
    const variables = env.variables.filter((v) => v.key.trim() !== '' || v.value.trim() !== '');

    this.envService.updateEnvironment(env.id, { name: env.name, variables }).subscribe({
      next: (updated) => {
        this.environments.update((list) => list.map((e) => e.id === updated.id ? updated : e));
        // Re-clone so UI reflects saved state (with empty row re-added)
        this.editingEnv.set(JSON.parse(JSON.stringify(updated)));
        this.ensureEmptyRow();
        this.saving.set(false);
        // Update active env vars if this is the active env
        if (this.envService.activeEnvironmentId() === updated.id) {
          this.envService.setActiveEnvironment(updated.id, updated.variables);
        }
        this.toast.show(`"${updated.name}" saved`);
      },
      error: () => {
        this.toast.show('Failed to save environment', 'error');
        this.saving.set(false);
      },
    });
  }

  deleteEnv(): void {
    if (this.deleting()) return;
    const id = this.selectedEnvId();
    if (!id) return;
    this.deleting.set(true);

    this.envService.deleteEnvironment(id).subscribe({
      next: () => {
        const remaining = this.environments().filter((e) => e.id !== id);
        this.environments.set(remaining);
        this.deleting.set(false);
        if (this.envService.activeEnvironmentId() === id) {
          this.envService.setActiveEnvironment(null, []);
        }
        if (remaining.length > 0) {
          this.selectEnv(remaining[0].id);
        } else {
          this.selectedEnvId.set(null);
          this.editingEnv.set(null);
        }
      },
      error: () => {
        this.toast.show('Failed to delete environment', 'error');
        this.deleting.set(false);
      },
    });
  }

  startCreate(): void {
    this.creatingNew.set(true);
    this.newEnvName = '';
  }

  confirmCreate(): void {
    const name = this.newEnvName.trim();
    if (!name) { this.creatingNew.set(false); return; }
    this.envService.createEnvironment(name).subscribe({
      next: (created) => {
        this.environments.update((list) => [...list, created]);
        this.creatingNew.set(false);
        this.newEnvName = '';
        this.selectEnv(created.id);
      },
      error: () => this.toast.show('Failed to create environment', 'error'),
    });
  }

  cancelCreate(): void {
    this.creatingNew.set(false);
    this.newEnvName = '';
  }

  exportEnv(): void {
    const env = this.editingEnv();
    if (!env) return;
    const data = {
      version: 1,
      type: 'dispatch-environment',
      name: env.name,
      variables: env.variables.filter((v) => v.key.trim()),
    };
    this.importExportSvc.downloadJson(data, env.name + '.dispatch-env.json');
  }

  onImportEnvFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data: any;
      try {
        data = JSON.parse(reader.result as string);
      } catch {
        this.toast.show('Invalid JSON file', 'error');
        return;
      }

      if (data.type !== 'dispatch-environment' || !data.name) {
        this.toast.show('Invalid environment file', 'error');
        return;
      }

      this.envService.createEnvironment(data.name).subscribe({
        next: (created) => {
          this.envService.updateEnvironment(created.id, { variables: data.variables ?? [] }).subscribe({
            next: (updated) => {
              this.environments.update((list) => [...list, updated]);
              this.selectEnv(updated.id);
              this.toast.show(`Environment "${updated.name}" imported`);
            },
            error: () => this.toast.show('Failed to update imported environment', 'error'),
          });
        },
        error: () => this.toast.show('Failed to import environment', 'error'),
      });
    };
    reader.readAsText(file);
  }

  close(): void {
    this.modal.close();
  }
}
