import { Component, inject, signal, OnInit, DestroyRef, ElementRef } from '@angular/core';
import { RequestBuilderComponent } from './request-builder/request-builder.component';
import { ResponseViewerComponent } from './response-viewer/response-viewer.component';
import { RequestStateService } from '../core/services/request-state.service';
import { KeyboardShortcutService } from '../core/services/keyboard-shortcut.service';

const STORAGE_SPLIT = 'dispatch-split-pos';

@Component({
  selector: 'app-request-workspace',
  standalone: true,
  imports: [RequestBuilderComponent, ResponseViewerComponent],
  templateUrl: './request-workspace.component.html',
  styleUrl: './request-workspace.component.scss',
})
export class RequestWorkspaceComponent implements OnInit {
  private readonly state = inject(RequestStateService);
  private readonly el = inject(ElementRef);
  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly destroyRef = inject(DestroyRef);

  private isDragging = false;
  readonly splitPercent = signal(50);

  ngOnInit(): void {
    const saved = localStorage.getItem(STORAGE_SPLIT);
    if (saved) this.splitPercent.set(parseFloat(saved));

    this.shortcuts.register('send-request', {
      key: 'Enter',
      ctrl: true,
      description: 'Send request',
      group: 'REQUEST',
      ignoreInInputs: false,
      action: () => this.state.sendRequest(),
    });

    this.destroyRef.onDestroy(() => this.shortcuts.unregister('send-request'));
  }

  onResizeMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.isDragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (mv: MouseEvent): void => {
      if (!this.isDragging) return;
      const rect = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
      const offsetY = mv.clientY - rect.top;
      const percent = (offsetY / rect.height) * 100;
      this.splitPercent.set(Math.min(80, Math.max(20, percent)));
    };

    const onUp = (): void => {
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_SPLIT, String(this.splitPercent()));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
