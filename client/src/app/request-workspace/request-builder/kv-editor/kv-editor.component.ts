import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KvEntry } from '../../../core/models/active-request.model';

function emptyRow(): KvEntry {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true };
}

@Component({
  selector: 'app-kv-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './kv-editor.component.html',
  styleUrl: './kv-editor.component.scss',
})
export class KvEditorComponent {
  rows = input.required<KvEntry[]>();
  placeholder = input('Key');
  valuePlaceholder = input('Value');

  rowsChange = output<KvEntry[]>();

  removeRow(id: string): void {
    let next = this.rows().filter((r) => r.id !== id);
    // Always keep at least one empty row
    if (next.length === 0) next = [emptyRow()];
    this.rowsChange.emit(next);
  }

  toggleRow(id: string): void {
    this.rowsChange.emit(
      this.rows().map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  }

  updateKey(id: string, key: string): void {
    const updated = this.rows().map((r) => (r.id === id ? { ...r, key } : r));
    const last = updated[updated.length - 1];
    // Auto-append a new empty row when the user starts typing in the last row's key
    if (last.id === id && key.trim()) {
      updated.push(emptyRow());
    }
    this.rowsChange.emit(updated);
  }

  updateValue(id: string, value: string): void {
    this.rowsChange.emit(
      this.rows().map((r) => (r.id === id ? { ...r, value } : r))
    );
  }

  trackById(_index: number, row: KvEntry): string {
    return row.id;
  }
}
