import { Component } from '@angular/core';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { MainAreaComponent } from '../main-area/main-area.component';
import { ToastComponent } from '../toast/toast.component';
import { SaveAsModalComponent } from '../save-as-modal/save-as-modal.component';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { EnvEditorModalComponent } from '../env-editor-modal/env-editor-modal.component';
import { ImportModalComponent } from '../import-modal/import-modal.component';
import { CodegenModalComponent } from '../codegen-modal/codegen-modal.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [SidebarComponent, MainAreaComponent, ToastComponent, SaveAsModalComponent, TopBarComponent, EnvEditorModalComponent, ImportModalComponent, CodegenModalComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {}
