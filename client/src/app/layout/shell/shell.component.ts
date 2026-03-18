import { Component, OnInit, HostBinding, signal, inject } from '@angular/core';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { MainAreaComponent } from '../main-area/main-area.component';
import { ToastComponent } from '../toast/toast.component';
import { SaveAsModalComponent } from '../save-as-modal/save-as-modal.component';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { EnvEditorModalComponent } from '../env-editor-modal/env-editor-modal.component';
import { ImportModalComponent } from '../import-modal/import-modal.component';
import { CodegenModalComponent } from '../codegen-modal/codegen-modal.component';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { ShortcutPanelComponent } from '../shortcut-panel/shortcut-panel.component';
import { PublishModalComponent } from '../publish-modal/publish-modal.component';
import { SubscribeModalComponent } from '../subscribe-modal/subscribe-modal.component';
import { PullPreviewModalComponent } from '../pull-preview-modal/pull-preview-modal.component';
import { ChannelInfoModalComponent } from '../channel-info-modal/channel-info-modal.component';
import { CollectionSettingsModalComponent } from '../collection-settings-modal/collection-settings-modal.component';
import { SettingsService } from '../../core/services/settings.service';
import { SwUpdateService } from '../../core/services/sw-update.service';

const STORAGE_WIDTH = 'dispatch-sidebar-width';
const STORAGE_COLLAPSED = 'dispatch-sidebar-collapsed';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    SidebarComponent, MainAreaComponent, ToastComponent,
    SaveAsModalComponent, TopBarComponent, EnvEditorModalComponent,
    ImportModalComponent, CodegenModalComponent,
    SettingsModalComponent, ShortcutPanelComponent,
    PublishModalComponent, SubscribeModalComponent,
    PullPreviewModalComponent, ChannelInfoModalComponent,
    CollectionSettingsModalComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly swUpdateService = inject(SwUpdateService);

  readonly sidebarWidth = signal(260);
  readonly sidebarCollapsed = signal(false);

  private isDragging = false;
  private dragStartX = 0;
  private dragStartWidth = 260;

  @HostBinding('style.--sidebar-width')
  get sidebarWidthCss(): string {
    return this.sidebarCollapsed() ? '48px' : this.sidebarWidth() + 'px';
  }

  ngOnInit(): void {
    const savedWidth = localStorage.getItem(STORAGE_WIDTH);
    if (savedWidth) this.sidebarWidth.set(parseInt(savedWidth, 10));

    const savedCollapsed = localStorage.getItem(STORAGE_COLLAPSED);
    if (savedCollapsed === 'true') this.sidebarCollapsed.set(true);

    // Load settings on boot
    this.settingsService.load().subscribe();

    // Listen for service worker updates
    this.swUpdateService.init();
  }

  startResize(e: MouseEvent): void {
    e.preventDefault();
    if (this.sidebarCollapsed()) return;
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartWidth = this.sidebarWidth();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (mv: MouseEvent): void => {
      if (!this.isDragging) return;
      const delta = mv.clientX - this.dragStartX;
      const newWidth = Math.min(480, Math.max(160, this.dragStartWidth + delta));
      this.sidebarWidth.set(newWidth);
    };

    const onUp = (): void => {
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_WIDTH, String(this.sidebarWidth()));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    localStorage.setItem(STORAGE_COLLAPSED, String(next));
  }
}
