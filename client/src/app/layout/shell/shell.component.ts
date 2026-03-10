import { Component } from '@angular/core';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { MainAreaComponent } from '../main-area/main-area.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [SidebarComponent, MainAreaComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {}
