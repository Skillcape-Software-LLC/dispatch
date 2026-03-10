import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KvEntry } from '../../../core/models/active-request.model';

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

  addRow(): void {
    this.rowsChange.emit([
      ...this.rows(),
      { id: crypto.randomUUID(), key: '', value: '', enabled: true },
    ]);
  }

  removeRow(id: string): void {
    this.rowsChange.emit(this.rows().filter((r) => r.id !== id));
  }

  toggleRow(id: string): void {
    this.rowsChange.emit(
      this.rows().map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  }

  updateKey(id: string, key: string): void {
    this.rowsChange.emit(
      this.rows().map((r) => (r.id === id ? { ...r, key } : r))
    );
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
