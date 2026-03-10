import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  activeTab: 'collections' | 'history' = 'collections';

  setTab(tab: 'collections' | 'history'): void {
    this.activeTab = tab;
  }
}
