# Phase 3B — Collections & Save Flow

## Prerequisites

Phase 3A must be complete. `TabService`, `RequestStateService` delegate, and the tab strip UI must all be working.

## Scope

Wire up the server-side collections API, the sidebar collections panel, and the Save/Save-As flow.

---

## Goals

1. Server CRUD endpoints for collections and saved requests
2. Collections panel in sidebar — list, expand, CRUD
3. "Save" (Ctrl+S) and "Save As" flows: save current tab's request into a collection
4. "Open" flow: click a saved request → opens in new or clean tab
5. Dirty dot appears/disappears correctly as requests are edited vs saved

---

## Implementation Order

1. **Server:** Add LokiJS helpers to `server/src/db/database.ts`, create `server/src/routes/collections.ts`, register in `index.ts`
2. **`CollectionService`:** Angular HTTP wrapper for collections API
3. **Sidebar:** Wire up collections panel
4. **`SaveAsModal`:** New component for the save-as dialog
5. **Ctrl+S shortcut + Save button:** In `MainAreaComponent`

---

## Server Changes

### LokiJS types — `server/src/db/types.ts` (verify/add)

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

### New endpoints — `server/src/routes/collections.ts`

```
GET    /api/collections                    → list all collections (id, name, requestCount)
POST   /api/collections                    → create collection { name }
PATCH  /api/collections/:id               → rename { name }
DELETE /api/collections/:id               → delete collection + its requests

GET    /api/collections/:id/requests      → list requests in collection
POST   /api/collections/:id/requests      → save new request { name, method, url, headers, params, body, auth }
PATCH  /api/collections/:id/requests/:rid → update saved request (same body shape)
DELETE /api/collections/:id/requests/:rid → delete request
```

Standard Fastify route file. Strip `$loki` and `meta` fields from all LokiJS documents before returning — use a `strip(doc)` helper that omits those keys.

### `server/src/index.ts`

Register `collectionsRoutes` alongside `proxyRoutes`.

---

## New Client Files

### `client/src/app/core/services/collection.service.ts`

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

### `client/src/app/layout/save-as-modal/save-as-modal.component.*`

Simple Bootstrap modal:
- Request name input (pre-filled from tab label or URL path)
- Collection selector (dropdown of existing collections + "New collection…" option)
- If "New collection…" selected: show inline name input
- Save button → create/update → close modal → show success toast

---

## Modified Client Files

### `client/src/app/layout/sidebar/sidebar.component.*`

Wire up the existing Collections section:

- On init: `collectionService.getCollections()` → populate `collections` signal
- Expand/collapse per collection: local `expandedIds = signal<Set<string>>(new Set())`
  - Toggle: always `new Set(existing)` — never mutate in place
- When expanded: load `collectionService.getRequests(id)` once (lazy), cache in `requestsByCollection` map signal
- Click a saved request: `openSavedRequest(req: SavedRequest)`
  - If active tab is clean (not dirty, not loading, url is empty): load into active tab
  - Else: open new tab
  - After loading: call `tabs.markSaved(req.id, clonedRequest)` so dirty tracking starts correctly
  - When loading a saved request, generate fresh KvEntry UUIDs for headers/params rows, then immediately use that as `savedSnapshot` — otherwise UUID mismatch makes it always dirty
- "New collection" button: inline rename input → `collectionService.createCollection(name)`
- Rename: click pencil icon → inline input on that item
- Delete: click trash icon → `collectionService.deleteCollection(id)` (no confirm dialog — MVP)

### `client/src/app/layout/main-area/main-area.component.ts`

Add save/save-as logic:

- `@HostListener('document:keydown', ['$event'])`: `if (e.ctrlKey && e.key === 's') → saveActiveRequest()`
- `saveActiveRequest()`:
  - If `activeTab.savedRequestId` exists: PATCH the existing saved request via `collectionService.updateRequest()`
  - Else: open "Save As" modal (collection picker + name input)
- After save: `tabs.markSaved(requestId, cloneDeep(currentRequest))`

---

## Critical Files

| File | Change |
|------|--------|
| `server/src/routes/collections.ts` | **New** — CRUD for collections + requests |
| `server/src/db/database.ts` | Add `getCollections()`, `getRequests()` helpers if missing |
| `server/src/index.ts` | Register `collectionsRoutes` |
| `client/src/app/core/services/collection.service.ts` | **New** — HTTP wrapper for collections API |
| `client/src/app/layout/sidebar/sidebar.component.*` | Wire up collections panel |
| `client/src/app/layout/save-as-modal/save-as-modal.component.*` | **New** — Save As modal |
| `client/src/app/layout/main-area/main-area.component.ts` | Ctrl+S handler + save logic |

---

## Verification

1. Create a collection in sidebar → appears in list
2. Save current request (Ctrl+S) → Save As modal → select collection → request saved → tab label updates → dirty dot disappears
3. Edit saved request → dirty dot appears
4. Ctrl+S again → PATCH (no modal) → dirty dot disappears
5. Click saved request in sidebar → opens in new tab (or reuses clean active tab)
6. Dirty tracking starts correctly — no false dirty on load
7. Rename collection → updates in sidebar
8. Delete collection → removed from sidebar
9. Delete saved request → removed from collection list
