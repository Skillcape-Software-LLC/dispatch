import { Component, inject } from '@angular/core';
import { SettingsModalService } from '../../core/services/settings-modal.service';
import { EnvEditorModalService } from '../../core/services/env-editor-modal.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  readonly settingsModal = inject(SettingsModalService);
  private readonly envEditorModal = inject(EnvEditorModalService);

  openEnvEditor(): void {
    this.envEditorModal.open();
  }
}
