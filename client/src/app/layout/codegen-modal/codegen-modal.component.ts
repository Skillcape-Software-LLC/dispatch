import { Component, inject, signal, computed } from '@angular/core';
import { CodegenModalService } from '../../core/services/codegen-modal.service';
import { RequestStateService } from '../../core/services/request-state.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { ToastService } from '../../core/services/toast.service';
import { generateCurl, generateFetch, generatePython, generateCSharp } from '../../core/utils/codegen';

type Language = 'curl' | 'fetch' | 'python' | 'csharp';

@Component({
  selector: 'app-codegen-modal',
  standalone: true,
  imports: [],
  templateUrl: './codegen-modal.component.html',
  styleUrl: './codegen-modal.component.scss',
})
export class CodegenModalComponent {
  readonly modal = inject(CodegenModalService);
  private readonly state = inject(RequestStateService);
  private readonly envService = inject(EnvironmentService);
  private readonly toast = inject(ToastService);

  readonly language = signal<Language>('curl');

  readonly generatedCode = computed(() => {
    const req = this.state.currentRequest();
    const vars: Record<string, string> = {};
    for (const v of this.envService.activeEnvironmentVars()) {
      if (v.enabled) vars[v.key] = v.value;
    }
    switch (this.language()) {
      case 'curl':   return generateCurl(req, vars);
      case 'fetch':  return generateFetch(req, vars);
      case 'python': return generatePython(req, vars);
      case 'csharp': return generateCSharp(req, vars);
    }
  });

  async copyCode(): Promise<void> {
    await navigator.clipboard.writeText(this.generatedCode());
    this.toast.show('Copied to clipboard');
  }

  close(): void {
    this.modal.close();
  }
}
