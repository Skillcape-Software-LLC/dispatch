import { Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RequestWorkspaceComponent } from '../../request-workspace/request-workspace.component';
import { RequestStateService } from '../../core/services/request-state.service';

@Component({
  selector: 'app-main-area',
  standalone: true,
  imports: [NgClass, RequestWorkspaceComponent],
  templateUrl: './main-area.component.html',
  styleUrl: './main-area.component.scss',
})
export class MainAreaComponent {
  readonly state = inject(RequestStateService);
}
