import { Component, input, output, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { ActiveRequestBody } from '../../../core/models/active-request.model';

type BodyMode = 'none' | 'json' | 'form-data' | 'raw' | 'binary';

@Component({
  selector: 'app-body-editor',
  standalone: true,
  imports: [FormsModule, MonacoEditorModule],
  templateUrl: './body-editor.component.html',
  styleUrl: './body-editor.component.scss',
})
export class BodyEditorComponent {
  body = input.required<ActiveRequestBody>();
  bodyChange = output<ActiveRequestBody>();

  readonly modes: BodyMode[] = ['none', 'json', 'raw', 'form-data', 'binary'];

  readonly editorOptions = computed(() => ({
    theme: 'vs-dark',
    language: this.body().mode === 'json' ? 'json' : 'plaintext',
    automaticLayout: true,
    readOnly: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    fontFamily: 'IBM Plex Mono, Fira Code, monospace',
    lineNumbers: 'off' as const,
    padding: { top: 8 },
  }));

  setMode(mode: BodyMode): void {
    this.bodyChange.emit({ ...this.body(), mode });
  }

  setContent(content: string): void {
    this.bodyChange.emit({ ...this.body(), content });
  }
}
