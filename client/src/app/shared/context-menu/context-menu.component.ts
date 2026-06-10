import { Component, inject } from '@angular/core';
import { ContextMenuItem, ContextMenuService } from './context-menu.service';

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.scss',
})
export class ContextMenuComponent {
  readonly menu = inject(ContextMenuService);

  run(item: ContextMenuItem): void {
    this.menu.run(item);
  }
}
