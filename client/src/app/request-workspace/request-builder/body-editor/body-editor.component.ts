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

  // Primitive computed — only changes when mode changes, not when content changes.
  // This prevents editorOptions from producing a new object on every keystroke,
  // which would cause ngx-monaco-editor to dispose + recreate (losing focus).
  private readonly editorLanguage = computed(() =>
    this.body().mode === 'json' ? 'json' : 'plaintext'
  );

  readonly editorOptions = computed(() => ({
    theme: 'vs-dark',
    language: this.editorLanguage(),
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
    const content = mode === 'json' && !this.body().content.trim() ? '{\n  \n}' : this.body().content;
    this.bodyChange.emit({ mode, content });
  }

  setContent(content: string): void {
    this.bodyChange.emit({ ...this.body(), content });
  }
}
