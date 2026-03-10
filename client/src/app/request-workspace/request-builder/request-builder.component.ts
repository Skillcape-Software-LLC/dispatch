import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RequestStateService } from '../../core/services/request-state.service';
import { HttpMethod, KvEntry, ActiveRequestBody, ActiveRequestAuth } from '../../core/models/active-request.model';
import { KvEditorComponent } from './kv-editor/kv-editor.component';
import { BodyEditorComponent } from './body-editor/body-editor.component';
import { AuthEditorComponent } from './auth-editor/auth-editor.component';

type ConfigTab = 'params' | 'headers' | 'body' | 'auth';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

@Component({
  selector: 'app-request-builder',
  standalone: true,
  imports: [FormsModule, NgClass, KvEditorComponent, BodyEditorComponent, AuthEditorComponent],
  templateUrl: './request-builder.component.html',
  styleUrl: './request-builder.component.scss',
})
export class RequestBuilderComponent {
  readonly state = inject(RequestStateService);
  readonly methods = HTTP_METHODS;

  activeTab = signal<ConfigTab>('params');
  showMethodMenu = signal(false);

  toggleMethodMenu(): void {
    this.showMethodMenu.update((v) => !v);
  }

  selectMethod(method: HttpMethod): void {
    this.state.updateMethod(method);
    this.showMethodMenu.set(false);
  }

  methodClass(method: string): string {
    return `method-${method.toLowerCase()}`;
  }

  onUrlChange(url: string): void {
    this.state.updateUrl(url);
  }

  onParamsChange(params: KvEntry[]): void {
    this.state.updateParams(params);
  }

  onHeadersChange(headers: KvEntry[]): void {
    this.state.updateHeaders(headers);
  }

  onBodyChange(body: ActiveRequestBody): void {
    this.state.updateBody(body);
  }

  onAuthChange(auth: ActiveRequestAuth): void {
    this.state.updateAuth(auth);
  }
}
