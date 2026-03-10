# Phase 3A — Multi-Tab Infrastructure

## Scope

Deliver working multi-tab support with localStorage persistence. After this phase:
- Users can open multiple independent request tabs
- Tabs persist across page refreshes
- Dirty indicator shows when a tab has unsaved changes
- All existing request/response functionality continues to work

**Out of scope for Phase 3A:** Collections panel, Save/Save-As flow, server CRUD endpoints.

---

## Goals

1. Multiple tabs, each with independent request state and response
2. Tabs persist across page refreshes (localStorage)
3. Dirty indicator on tab when request has unsaved changes
4. All existing components (`RequestBuilderComponent`, `ResponseViewerComponent`) work unchanged

---

## Implementation Order

1. **Client models:** `tab.model.ts`, `collection.model.ts`
2. **`TabService`:** Source of truth for all tab state, with localStorage persistence
3. **`RequestStateService`:** Rewrite as thin delegate to `TabService` (no API changes to existing components)
4. **`MainAreaComponent`:** Wire up real tab strip UI

---

## New Files

### `client/src/app/core/models/tab.model.ts`

```typescript
export interface RequestTab {
  id: string;                        // crypto.randomUUID()
  label: string;                     // display name in tab strip
  request: ActiveRequest;
  response: ProxyResult | null;
  error: ProxyError | null;
  isLoading: boolean;
  isDirty: boolean;                  // true when request differs from savedSnapshot
  savedRequestId: string | null;     // null for unsaved tabs
  savedSnapshot: ActiveRequest | null; // the last-saved version for dirty comparison
}

export function defaultTab(): RequestTab {
  return {
    id: crypto.randomUUID(),
    label: 'New Request',
    request: defaultActiveRequest(),
    response: null,
    error: null,
    isLoading: false,
    isDirty: false,
    savedRequestId: null,
    savedSnapshot: null,
  };
}
```

### `client/src/app/core/models/collection.model.ts`

```typescript
export interface Collection { id: string; name: string; requestCount: number; }
export interface SavedRequest {
  id: string;
  collectionId: string;
  name: string;
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params:  Array<{ key: string; value: string; enabled: boolean }>;
  body: { mode: string; content: string };
  auth: ActiveRequestAuth;
  createdAt: string;
  updatedAt: string;
}
```

### `client/src/app/core/services/tab.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class TabService {
  readonly tabs = signal<RequestTab[]>([defaultTab()]);
  readonly activeTabId = signal<string>(this.tabs()[0].id);

  readonly activeTab = computed(() =>
    this.tabs().find(t => t.id === this.activeTabId())!
  );

  constructor() {
    this.loadFromStorage();
    effect(() => {
      const snapshot = { tabs: this.tabs(), activeTabId: this.activeTabId() };
      this.scheduleSave(snapshot);
    });
  }

  // Tab lifecycle
  openTab(tab?: Partial<RequestTab>): void;       // creates new tab, activates it
  closeTab(id: string): void;                      // never leaves tabs empty — replace last with blank
  activateTab(id: string): void;

  // Mutation on active tab
  updateRequest(updater: (r: ActiveRequest) => ActiveRequest): void;
  setResponse(response: ProxyResult): void;
  setError(error: ProxyError): void;
  setLoading(loading: boolean): void;
  clearResponse(): void;

  // Dirty tracking
  markSaved(requestId: string, snapshot: ActiveRequest): void;
  // After markSaved: isDirty = false, savedRequestId = requestId, savedSnapshot = snapshot
  // On each updateRequest: recompute isDirty = JSON.stringify(request) !== JSON.stringify(savedSnapshot)

  private loadFromStorage(): void;
  private scheduleSave(snapshot: unknown): void; // 500ms debounce
}
```

Key invariants:
- `tabs()` is never empty
- `activeTabId()` always matches an existing tab id
- Dirty comparison: `JSON.stringify` of request vs savedSnapshot (exclude response/error/isLoading)

---

## Modified Files

### `client/src/app/core/services/request-state.service.ts` (rewrite as delegate)

```typescript
@Injectable({ providedIn: 'root' })
export class RequestStateService {
  private readonly tabs = inject(TabService);
  private readonly proxy = inject(ProxyService);

  readonly currentRequest  = computed(() => this.tabs.activeTab().request);
  readonly isLoading       = computed(() => this.tabs.activeTab().isLoading);
  readonly lastResponse    = computed(() => this.tabs.activeTab().response);
  readonly requestError    = computed(() => this.tabs.activeTab().error);
  readonly enabledHeaderCount = computed(() => /* count enabled non-empty headers from currentRequest() */);
  readonly enabledParamCount  = computed(() => /* count enabled non-empty params from currentRequest() */);

  updateMethod(method: HttpMethod): void  { this.tabs.updateRequest(r => ({ ...r, method })); }
  updateUrl(url: string): void            { this.tabs.updateRequest(r => ({ ...r, url })); }
  updateHeaders(headers: KvEntry[]): void { this.tabs.updateRequest(r => ({ ...r, headers })); }
  updateParams(params: KvEntry[]): void   { this.tabs.updateRequest(r => ({ ...r, params })); }
  updateBody(body: ActiveRequestBody): void { this.tabs.updateRequest(r => ({ ...r, body })); }
  updateAuth(auth: ActiveRequestAuth): void { this.tabs.updateRequest(r => ({ ...r, auth })); }

  sendRequest(): void {
    if (this.isLoading()) return;
    const req = this.currentRequest();
    if (!req.url.trim()) return;
    this.tabs.setLoading(true);
    this.tabs.clearResponse();
    this.proxy.send(req).pipe(
      tap(result => { this.tabs.setResponse(result); this.tabs.setLoading(false); }),
      catchError(err => { this.tabs.setError(err.error); this.tabs.setLoading(false); return EMPTY; })
    ).subscribe();
  }
}
```

### `client/src/app/layout/main-area/main-area.component.html`

Replace the static tabs bar with a real tab strip:

```html
<!-- Tab strip -->
<div class="tabs-bar">
  @for (tab of tabService.tabs(); track tab.id) {
    <button class="tab-item" [class.active]="tab.id === tabService.activeTabId()"
            (click)="tabService.activateTab(tab.id)">
      <span class="tab-method" [ngClass]="methodClass(tab.request.method)">
        {{ tab.request.method }}
      </span>
      <span class="tab-label">{{ tab.label }}</span>
      @if (tab.isDirty) { <span class="tab-dirty-dot"></span> }
      <button class="tab-close" (click)="closeTab($event, tab.id)">
        <i class="bi bi-x"></i>
      </button>
    </button>
  }
  <button class="tab-new" (click)="tabService.openTab()">
    <i class="bi bi-plus"></i>
  </button>
</div>
```

`closeTab($event, id)`: call `$event.stopPropagation()` then `tabService.closeTab(id)`.

### `client/src/app/layout/main-area/main-area.component.scss`

Add tab strip styles:

```scss
.tabs-bar {
  display: flex;
  align-items: stretch;
  background: var(--d-surface-100);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  overflow-x: auto;
  flex-shrink: 0;
  &::-webkit-scrollbar { height: 3px; }
  &::-webkit-scrollbar-thumb { background: var(--d-surface-500); }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.75rem;
  height: 36px;
  background: none;
  border: none;
  border-right: 1px solid rgba(255,255,255,0.06);
  border-bottom: 2px solid transparent;
  color: var(--d-text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 120ms;

  &:hover { color: var(--d-text-primary); background: var(--d-surface-200); }
  &.active { color: var(--d-text-primary); background: var(--d-surface-200); border-bottom-color: var(--d-amber-400); }
}

.tab-method {
  font-family: var(--d-font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
}

.tab-label {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-dirty-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--d-amber-400);
  flex-shrink: 0;
}

.tab-close {
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  background: none; border: none;
  color: var(--d-text-tertiary);
  border-radius: 3px;
  padding: 0; cursor: pointer;
  opacity: 0;
  transition: opacity 120ms;
  font-size: 0.75rem;

  .tab-item:hover & { opacity: 1; }
  &:hover { background: var(--d-surface-400); color: var(--d-text-primary); }
}

.tab-new {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  background: none; border: none;
  color: var(--d-text-tertiary); cursor: pointer;
  flex-shrink: 0;
  transition: all 120ms;
  &:hover { color: var(--d-text-primary); background: var(--d-surface-200); }
}
```

---

## Tab Label Logic

The tab label is derived from the request (computed on each `updateRequest`):

| Condition | Label |
|-----------|-------|
| Has a saved name (`savedRequestId` set) | Use saved name |
| URL is non-empty | Last path segment of URL (e.g. `/users/me` → `users/me`) |
| URL is empty | `New Request` |

---

## localStorage Schema

```typescript
interface PersistedState {
  version: 1;
  activeTabId: string;
  tabs: Array<{
    id: string;
    label: string;
    savedRequestId: string | null;
    savedSnapshot: ActiveRequest | null;
    request: ActiveRequest;
    // response/error/isLoading are NOT persisted — cleared on reload
  }>;
}
```

Key: `dispatch.tabs`

On load:
1. Read and JSON.parse
2. If missing/corrupt: start with one `defaultTab()`
3. Restore tabs with `isLoading: false`, `response: null`, `error: null`
4. Restore `activeTabId` — if it doesn't match any tab, fall back to `tabs[0].id`

---

## Critical Files

| File | Change |
|------|--------|
| `client/src/app/core/models/tab.model.ts` | **New** |
| `client/src/app/core/models/collection.model.ts` | **New** |
| `client/src/app/core/services/tab.service.ts` | **New** — source of truth for all tab state |
| `client/src/app/core/services/request-state.service.ts` | Rewrite as thin delegate to `TabService` |
| `client/src/app/layout/main-area/main-area.component.*` | Real tab strip UI |

---

## Verification

1. Open app → single "New Request" tab visible
2. Type a URL → tab label updates to path segment
3. Click "+" → new blank tab opens, becomes active
4. Switch between tabs → each tab maintains independent request/response state
5. Refresh page → tabs restore (no response data, but request state preserved)
6. Close a tab → adjacent tab activates; closing last tab replaces with blank
7. Send request in tab A → tab B is unaffected
