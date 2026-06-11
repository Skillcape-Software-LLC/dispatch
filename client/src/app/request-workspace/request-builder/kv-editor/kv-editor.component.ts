import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KvEntry } from '../../../core/models/active-request.model';
import { filterHeaderSuggestions } from '../../../core/utils/standard-headers';

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
  /** Optional autocomplete suggestions for the key field. When empty, no dropdown shows. */
  keySuggestions = input<string[]>([]);

  rowsChange = output<KvEntry[]>();

  /** Id of the row whose key field is focused and showing suggestions, or null. */
  private readonly activeSuggestRow = signal<string | null>(null);
  /** Current key-field text used to filter suggestions. */
  private readonly suggestQuery = signal('');
  /** Index of the keyboard-highlighted suggestion. */
  readonly highlightIndex = signal(0);

  /** Filtered header suggestions based on the current key-field query. */
  readonly filteredSuggestions = computed(() =>
    filterHeaderSuggestions(this.keySuggestions(), this.suggestQuery())
  );

  /** Whether the suggestion dropdown should render for the given row. */
  showSuggestions(rowId: string): boolean {
    return this.activeSuggestRow() === rowId && this.filteredSuggestions().length > 0;
  }

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

  /** Key field input handler: applies the edit and refreshes suggestion state. */
  onKeyInput(id: string, value: string): void {
    this.updateKey(id, value);
    this.activeSuggestRow.set(id);
    this.suggestQuery.set(value);
    this.highlightIndex.set(0);
  }

  /** Key field focus handler: opens suggestions for the focused row. */
  onKeyFocus(id: string, value: string): void {
    this.activeSuggestRow.set(id);
    this.suggestQuery.set(value);
    this.highlightIndex.set(0);
  }

  /** Key field blur handler: closes the dropdown (selection uses mousedown to win the race). */
  onKeyBlur(): void {
    this.activeSuggestRow.set(null);
  }

  /** Keyboard navigation for the suggestion dropdown. */
  onKeyDown(id: string, event: KeyboardEvent): void {
    if (!this.showSuggestions(id)) return;
    const items = this.filteredSuggestions();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightIndex.update((i) => Math.min(i + 1, items.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        const choice = items[this.highlightIndex()];
        if (choice) {
          event.preventDefault();
          this.selectSuggestion(id, choice);
        }
        break;
      }
      case 'Escape':
        this.activeSuggestRow.set(null);
        break;
    }
  }

  /** Applies a chosen suggestion to the row's key and closes the dropdown. */
  selectSuggestion(id: string, value: string): void {
    this.updateKey(id, value);
    this.activeSuggestRow.set(null);
  }

  trackById(_index: number, row: KvEntry): string {
    return row.id;
  }
}
