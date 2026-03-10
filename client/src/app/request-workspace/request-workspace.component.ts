import { Component, inject, signal, HostListener, ElementRef } from '@angular/core';
import { RequestBuilderComponent } from './request-builder/request-builder.component';
import { ResponseViewerComponent } from './response-viewer/response-viewer.component';
import { RequestStateService } from '../core/services/request-state.service';

@Component({
  selector: 'app-request-workspace',
  standalone: true,
  imports: [RequestBuilderComponent, ResponseViewerComponent],
  templateUrl: './request-workspace.component.html',
  styleUrl: './request-workspace.component.scss',
})
export class RequestWorkspaceComponent {
  private readonly state = inject(RequestStateService);
  private readonly el = inject(ElementRef);

  private isDragging = false;
  readonly splitPercent = signal(50);

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      this.state.sendRequest();
    }
  }

  onResizeMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.isDragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const rect = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const percent = (offsetY / rect.height) * 100;
    this.splitPercent.set(Math.min(80, Math.max(20, percent)));
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
}
