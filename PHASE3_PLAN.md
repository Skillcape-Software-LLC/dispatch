# Phase 3 — Stateful Tabs + Collections

## Context

Phase 2 delivered the core interaction loop: compose a request, send it through the proxy, view the response. Everything lives in a single unnamed tab. Phase 3 adds **multi-tab support** and **collections** — users can open multiple requests in parallel, save them to named collections, and reload them later.

**Out of scope for Phase 3:** drag-to-reorder tabs, right-click context menus.

---

## Goals

1. Multiple tabs, each with independent request state and response
2. Tabs persist across page refreshes (localStorage)
3. Dirty indicator on tab when request has unsaved changes
4. Collections panel in sidebar — CRUD for collections and saved requests
5. "Save" and "Save As" flows: save current tab's request into a collection
6. "Open" flow: click a saved request → opens in new tab (or re-uses active tab if it is clean)
7. Server CRUD endpoints for collections + requests

---

## Architecture

### The problem with the current design

`RequestStateService` is a singleton holding one request + one response. Multi-tab requires one state instance per tab. The cleanest solution:

- Introduce `TabService` as the **source of truth** for all tab state
- Re-implement `RequestStateService` as a **thin delegate** that reads/writes the active tab in `TabService`
- All existing components (`RequestBuilderComponent`, `ResponseViewerComponent`, `RequestWorkspaceComponent`) continue to inject `RequestStateService` — zero changes required to those files

### Tab model

```typescript
// client/src/app/core/models/tab.model.ts

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

---

## Server Changes

### New endpoints

All under `/api/collections`:

```
GET    /api/collections                  → list all collections (id, name, requestCount)
POST   /api/collections                  → create collection { name }
PATCH  /api/collections/:id              → rename { name }
DELETE /api/collections/:id              → delete collection + its requests

GET    /api/collections/:id/requests     → list requests in collection
POST   /api/collections/:id/requests     → save new request { name, method, url, headers, params, body, auth }
PATCH  /api/collections/:id/requests/:rid → update saved request (same body shape)
DELETE /api/collections/:id/requests/:rid → delete request
```

### LokiJS types (already in db/types.ts — verify they exist)

```typescript
export interface CollectionDocument {
  id: string;
  name: string;
  createdAt: string;
}

export interface RequestDocument {
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

### New file: `server/src/routes/collections.ts`

Standard Fastify route file. Strip `$loki` and `meta` fields from all LokiJS documents before returning (use a `strip(doc)` helper that omits those keys).

Register in `server/src/index.ts` alongside `proxyRoutes`.

---

## Client Changes

### New files

#### `client/src/app/core/models/tab.model.ts`
As shown above.

#### `client/src/app/core/models/collection.model.ts`
```typescript
export interface Collection { id: string; name: string; requestCount: number; }
export interface SavedRequest { id: string; collectionId: string; name: string; method: string; url: string; /* ...full request fields */ }
```

#### `client/src/app/core/services/tab.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class TabService {
  readonly tabs = signal<RequestTab[]>([defaultTab()]);
  readonly activeTabId = signal<string>(this.tabs()[0].id);

  readonly activeTab = computed(() =>
    this.tabs().find(t => t.id === this.activeTabId())!
  );

  // Persistence
  constructor() {
    this.loadFromStorage();
    effect(() => {
      // debounce 500ms before writing to localStorage
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

  // Load from localStorage
  private loadFromStorage(): void;
  private scheduleSave(snapshot: unknown): void; // 500ms debounce
}
```

Key invariants:
- `tabs()` is never empty
- `activeTabId()` always matches an existing tab id
- Dirty comparison: `JSON.stringify` of request vs savedSnapshot (exclude response/error/isLoading)
- When loading a saved request into a tab, generate fresh KvEntry UUIDs for headers/params rows, then immediately clone that as `savedSnapshot` — otherwise the UUID mismatch makes it always dirty

#### `client/src/app/core/services/request-state.service.ts` (rewrite as delegate)

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

#### `client/src/app/core/services/collection.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly http = inject(HttpClient);

  getCollections(): Observable<Collection[]>
  createCollection(name: string): Observable<Collection>
  renameCollection(id: string, name: string): Observable<Collection>
  deleteCollection(id: string): Observable<void>

  getRequests(collectionId: string): Observable<SavedRequest[]>
  saveRequest(collectionId: string, req: Omit<SavedRequest, 'id' | 'collectionId'>): Observable<SavedRequest>
  updateRequest(collectionId: string, requestId: string, req: Partial<SavedRequest>): Observable<SavedRequest>
  deleteRequest(collectionId: string, requestId: string): Observable<void>
}
```

---

### Modified files

#### `client/src/app/layout/main-area/main-area.component.html`

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

#### `client/src/app/layout/sidebar/`

The sidebar already has a Collections section. Wire it up:

- On init: `collectionService.getCollections()` → populate `collections` signal
- Expand/collapse per collection: local `expandedIds = signal<Set<string>>(new Set())`
  - Toggle: always `new Set(existing)` — never mutate in place
- When expanded: load `collectionService.getRequests(id)` once (lazy), cache in `requestsByCollection` map signal
- Click a saved request: `openSavedRequest(req: SavedRequest)`
  - If active tab is clean (not dirty, not loading, url is empty): load into active tab
  - Else: open new tab
  - After loading: call `tabs.markSaved(req.id, clonedRequest)` so dirty tracking starts correctly
- "New collection" button: inline rename input → `collectionService.createCollection(name)`
- Rename: click pencil icon → inline input on that item
- Delete: click trash icon → `collectionService.deleteCollection(id)` (no confirm dialog — this is MVP)

#### `client/src/app/layout/main-area/main-area.component.ts`

Add save/save-as logic triggered by a Save button in the response header or a keyboard shortcut (Ctrl+S):

- `@HostListener('document:keydown', ['$event'])`: `if (e.ctrlKey && e.key === 's') → saveActiveRequest()`
- `saveActiveRequest()`:
  - If `activeTab.savedRequestId` exists: PATCH the existing saved request
  - Else: open "Save As" modal (collection picker + name input)
- After save: `tabs.markSaved(requestId, cloneDeep(currentRequest))`

#### Save As modal

New component: `client/src/app/layout/save-as-modal/save-as-modal.component.*`

Simple Bootstrap modal:
- Request name input (pre-filled from tab label or URL path)
- Collection selector (dropdown of existing collections + "New collection…" option)
- If "New collection…" selected: show inline name input
- Save button → create/update → close modal → show success toast

---

## Tab Strip CSS (main-area.component.scss additions)

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

The tab label is derived (not stored separately — computed from the request):

| Condition | Label |
|-----------|-------|
| Has a saved name | Use saved name |
| URL is non-empty | Last path segment of URL (e.g. `/users/me` → `users/me`) |
| URL is empty | `New Request` |

Compute this in `TabService` or derive it in the template. Update on every `updateRequest` call. If user has saved the request (savedRequestId set), always show the saved name.

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

## Implementation Order

1. **Server:** Add LokiJS collection/request helpers to `server/src/db/database.ts` (if not already present), then create `server/src/routes/collections.ts`, register in `index.ts`
2. **Client models:** `tab.model.ts`, `collection.model.ts`
3. **`TabService`:** Implement with localStorage persistence
4. **`RequestStateService`:** Rewrite as thin delegate (no API changes — existing components continue to work)
5. **`CollectionService`:** HTTP wrapper
6. **`MainAreaComponent`:** Wire up real tab strip
7. **Sidebar:** Wire up collections panel
8. **`SaveAsModal`:** Save/Save-As flow
9. **Ctrl+S shortcut:** In `MainAreaComponent`

---

## Critical Files

| File | Change |
|------|--------|
| `server/src/routes/collections.ts` | **New** — CRUD for collections + requests |
| `server/src/db/database.ts` | Add `getCollections()`, `getRequests()` helpers if missing |
| `server/src/index.ts` | Register `collectionsRoutes` |
| `client/src/app/core/models/tab.model.ts` | **New** |
| `client/src/app/core/models/collection.model.ts` | **New** |
| `client/src/app/core/services/tab.service.ts` | **New** — source of truth for all tab state |
| `client/src/app/core/services/request-state.service.ts` | Rewrite as thin delegate to `TabService` |
| `client/src/app/core/services/collection.service.ts` | **New** — HTTP wrapper for collections API |
| `client/src/app/layout/main-area/main-area.component.*` | Real tab strip, Ctrl+S handler |
| `client/src/app/layout/sidebar/sidebar.component.*` | Wire up collections panel |
| `client/src/app/layout/save-as-modal/save-as-modal.component.*` | **New** — Save As modal |

---

## Verification

1. Open app → single "New Request" tab visible
2. Type a URL → tab label updates to path segment
3. Click "+" → new blank tab opens, becomes active
4. Switch between tabs → each tab maintains independent request/response state
5. Refresh page → tabs restore (no response data, but request state preserved)
6. Close a tab → adjacent tab activates; closing last tab replaces with blank
7. Send request in tab A → tab B is unaffected
8. Create a collection in sidebar → appears in list
9. Save current request (Ctrl+S) → Save As modal → select collection → request saved → tab label updates → dirty dot disappears
10. Edit saved request → dirty dot appears
11. Click saved request in sidebar → opens in new tab (or reuses clean active tab)
12. Rename collection → updates in sidebar
13. Delete collection → removed from sidebar
14. Delete saved request → removed from collection list
