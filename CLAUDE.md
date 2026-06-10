# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Dispatch?

Lightweight, containerized HTTP testing tool (Postman alternative). Single Docker container, browser UI at localhost:3000. Local-first, single-user, no cloud sync.

Stack: angular-node-fastify (monorepo: Angular 19 SPA client + Node/Fastify TypeScript server, LokiJS storage)

## Architecture

Monorepo with two apps:
- **`client/`** — Angular 19+ SPA (Bootstrap 5.3 dark theme, Bootstrap Icons, Monaco Editor)
- **`server/`** — Node.js + Fastify REST API (TypeScript)
- **Storage:** LokiJS embedded NoSQL, persists to JSON files at `/data/dispatch.db.json`
- **Distribution:** Single Docker container via multi-stage build (Node Alpine)

The server acts as an HTTP proxy (`POST /api/proxy`) so the browser avoids CORS. In production, Fastify serves the Angular build as static files. In dev, Angular runs its own dev server with a proxy config routing `/api` to Fastify.

## Build & Dev Commands

```bash
# Development — starts Angular dev server + Fastify in watch mode concurrently
npm run dev

# Docker
docker compose up                    # serves at localhost:3000
docker run -p 3000:3000 dispatch     # standalone

# Individual apps (from their directories)
cd client && ng serve                # Angular dev server
cd server && npm run dev             # Fastify with watch mode
```

## Key Design Decisions

- **Server-side HTTP proxy** — all user requests go through Fastify to avoid CORS, handle auth, and capture accurate timing
- **LokiJS** — file-based NoSQL, no external DB dependency. JSON files can be backed up by copying
- **Monaco Editor** — used for JSON body input and response viewing
- **Variable interpolation** — `{{variableName}}` resolved server-side. Resolution order: collection variables → active environment variables
- **Angular proxy config** — local dev proxies `/api` to Fastify backend (default port 4000)

## Data Model

Four LokiJS collections: `requests`, `collections`, `environments`, `history`. All entities are UUID-identified JSON documents. See `IMPLEMENTATION_PLAN.md` for full schemas.

## Implementation Phases

8-phase plan in `IMPLEMENTATION_PLAN.md`. Phases 4 (Environments) and 5 (History) can run in parallel. Design mockups are in `design/` as standalone HTML files.

## Style & Theming

- Bootstrap 5.3 with dark mode as default
- Design mockups in `design/STYLE_GUIDE.html`, `design/MOCKUP_MAIN.html`, `design/MOCKUP_TABS.html`, `design/MOCKUP_IMPORT.html`
- Bootstrap Icons for iconography
- Status code color convention: 2xx green, 3xx blue, 4xx yellow, 5xx red

## Configuration

Environment variable overrides: `PORT`, `DATA_DIR`, `LOG_LEVEL`. Config precedence: env vars → settings file → defaults.

## Project Conventions

This section covers both apps. Conventions were extracted from existing code; follow them exactly when adding features. Where a pattern appears in only one place it is noted as such rather than stated as a rule.

### Feature Placement

**Client (`client/src/app/`)** — organized by **layer/role**, not by domain:
- `core/services/` — all singletons (`@Injectable({ providedIn: 'root' })`). Two flavors: data services that wrap `HttpClient` (`collection.service.ts`, `history.service.ts`, `environment.service.ts`) and UI-state/modal services holding signals (`toast.service.ts`, `tab.service.ts`, `request-state.service.ts`, every `*-modal.service.ts`).
- `core/models/` — interfaces and `default*()` factory functions, one file per concept (`active-request.model.ts`, `tab.model.ts`, `collection.model.ts`).
- `core/interceptors/` — functional HTTP interceptors (`api-error.interceptor.ts`).
- `core/utils/` — pure functions + their `.spec.ts` (`url-query.util.ts`, `codegen.ts`).
- `layout/` — shell-level components: `shell/`, `sidebar/`, `top-bar/`, `main-area/`, `toast/`, and **every modal** (`*-modal/`). Each modal pairs a `core/services/*-modal.service.ts` (open/close signal state) with a `layout/*-modal/*.component.ts` (the rendered dialog).
- `request-workspace/` — the request/response feature area; nested child components live in subfolders (`request-builder/`, then `request-builder/kv-editor/`, `body-editor/`, `auth-editor/`).
- `shared/` — reusable presentational components used across areas (`empty-state/`, `context-menu/`).

File naming follows Angular CLI conventions: `kebab-case.component.ts`, `.service.ts`, `.model.ts`, `.util.ts`, `.interceptor.ts`. Each component is a folder containing `.component.ts/.html/.scss`.

**Server (`server/src/`)** — organized by responsibility: `routes/` (one file per resource, e.g. `collections.ts`, `proxy.ts`, `history.ts`), `db/` (`database.ts` lifecycle + getters, `types.ts` for `*Document` interfaces), `proxy/` (`builder.ts`, `interpolation.ts`), `utils/` (`settings.ts`, `curl-parser.ts`), `config.ts`, `index.ts` (bootstrap).

### Routing

No Angular Router in use for navigation — the app is a single shell view. `@angular/router` is a dependency but routing is not how features are reached; UI is driven by signal state (tabs, modals open/closed) and components rendered in `layout/shell` + `request-workspace`. Do not add `app.routes.ts`-style routing without confirming; follow the existing tab/modal model instead.

### State Management (client — the central pattern)

State is held in **signals** inside root services, never in component fields when it is shared. Three tiers:
1. **`TabService`** (`tab.service.ts`) owns the canonical workspace state: a `signal<RequestTab[]>` plus `activeTabId`. Derived state uses `computed()` (`activeTab`). All mutations go through `update()` with immutable spreads (`tabs.map(t => t.id === id ? {...t, ...} : t)`). It auto-persists to `localStorage` via a debounced `effect()` (500ms, versioned `PersistedState` with a `version` guard and try/catch on load).
2. **`RequestStateService`** (`request-state.service.ts`) is a thin façade: every getter is `computed(() => this.tabs.activeTab().X)` and every setter delegates to `tabs.updateRequest(r => ({...r, ...}))`. Components inject this for the active request, not `TabService` directly, for request fields.
3. **Modal services** expose `isOpen`/`initialName` signals with `open()`/`close()` (see `save-as-modal.service.ts`); the modal component reads them.

Cross-service eventing uses RxJS `Subject` exposed as `*$` observables with a `notifyX()` method (e.g. `CollectionService.requestUpdated$` / `notifyRequestUpdated()`, `HistoryService.newEntry$`). Components subscribe in `ngOnInit` and unsubscribe in `ngOnDestroy` (store the `Subscription` in a `private xSub?` field).

### Forms / Inputs

No reactive `FormGroup`/`FormBuilder` anywhere. Inputs use **template-driven `FormsModule` + `[(ngModel)]`** bound to plain component fields, with logic in handlers. Inline editing (rename, create) toggles a `signal<string | null>` for the editing id and a plain string field for the draft value, with `confirmX()`/`cancelX()` handlers (see `sidebar.component.ts` `startRename`/`confirmRename`). Repeating key/value tables (headers, params, env vars) use the `kv-editor` component pattern with a trailing blank row auto-maintained.

### CRUD Workflow (exemplar: Collections + Saved Requests)

Read it end-to-end in `sidebar.component.ts` (client) ↔ `server/src/routes/collections.ts` (server).

- **Create** — `confirmCreate()` calls `collectionService.createCollection(name)` (`POST /api/collections`); on `next` it appends the returned entity with `collections.update(c => [...c, col])` and clears the draft. Server inserts a `CollectionDocument` with `randomUUID()`, `createdAt`/`updatedAt` ISO timestamps, returns `201` with internal LokiJS fields stripped.
- **Read** — `loadCollections()` / `loadRequests(id)` subscribe with `{ next, error }`, set a `signal`, and lazily fetch a collection's requests only when expanded (`requestsByCollection` `Map` signal).
- **Update** — `confirmRename()` calls `renameCollection(id, name)` (`PATCH`), then patches the local signal array in place. Server `PATCH` whitelists keys via a `COLLECTION_ALLOWED_KEYS` array before `Object.assign` + `col.update(doc)`, refreshing `updatedAt`.
- **Delete** — `deleteCollection(id)` (`DELETE`) → on success removes from the signal and cleans related maps/sets. Server returns `204`, cascades by removing child requests (`getRequests().findAndRemove({ collectionId })`).

After mutating saved requests, fire `collectionService.notifyRequestUpdated(collectionId)` so the sidebar reloads, and `tabs.updateTabLabel(...)` so open tabs reflect renames.

### Data Tables & Lists

The sidebar (`sidebar.component.ts`) is the reference list. Collections render as an expandable tree (`expandedIds: signal<Set<string>>`); history is grouped by date buckets via a `computed()` (`groupedHistory`). Filtering is client-side through a `computed()` over a `searchQuery` signal (`filteredHistory`). Empty states use the shared `EmptyStateComponent`. Loading uses a boolean signal (`historyLoading`). Status codes get CSS classes via `statusClass()` (`status-2xx`…`status-5xx`) matching the 2xx-green/3xx-blue/4xx-yellow/5xx-red convention.

### Data Flow (HTTP)

**Client services** inject `HttpClient` via `inject(HttpClient)`, use relative `/api/...` URLs (no base-URL constant), and return `Observable<T>` typed to model interfaces — they do **not** subscribe or handle errors themselves. Components subscribe with `{ next, error }` and show errors with `this.toast.show('...', 'error')`. The global `apiErrorInterceptor` already surfaces a toast for failed requests, so per-call error handlers are for local recovery/state, not (only) for user notification. The proxy send path (`request-state.service.ts` `sendRequest`) uses `.pipe(tap(...), catchError(() => EMPTY))` to keep state updates inside the stream.

**Server routes** are `export async function xRoutes(fastify: FastifyInstance)` registered in `index.ts`. Handlers are typed with Fastify generics (`fastify.post<{ Params; Body }>`), validate manually (return `reply.status(400/404).send({ error })`), access data through `db/database.ts` getter functions (`getCollections()`, `getRequests()`), and `strip()` LokiJS internals (`$loki`, `meta`) before returning. Mutations set ISO `updatedAt`. Success codes: `201` create, `204` delete, `200`/raw entity otherwise. Errors are `{ error: string, code?: string }`.

### Component Patterns

Components are `standalone: true` with explicit `imports`. Dependencies via `inject()` assigned to `private readonly` fields (or `readonly` when used in templates). Local state is `signal()`; derived state is `computed()`. Constants (`HTTP_METHODS`) and helper types (`ConfigTab`, `DateGroup`) are module-level above the class. Smart components (pages like `sidebar`, `request-builder`) inject services and own state; presentational children (`kv-editor`, `empty-state`) take `@Input()` and emit `@Output() EventEmitter`. Parent↔child sibling coordination goes through the shared signal services (`RequestStateService`/`TabService`), not deep input chains.

### Context Menus (in-progress, `electron` branch)

Right-click menus use the singleton `ContextMenuService` (`shared/context-menu/context-menu.service.ts`): call `open(event, items: ContextMenuItem[])` from a `(contextmenu)` handler; the service holds a `state` signal rendered by the single `ContextMenuComponent` mounted in the shell. Items are `{ label, icon?, shortcut?, disabled?, separator?, action? }`. The service self-manages dismissal (doc click, scroll, Escape, blur) and viewport clamping. Reuse this rather than building bespoke dropdowns; the older `sidebar` dropdown (`openMenuId` signal + manual document-click listener) predates it.

### Error Handling & Notifications

Notifications: `ToastService.show(message, type?)` where type is `'success' | 'error' | 'info'` (default `'success'`); toasts auto-dismiss after 2500ms and render via `layout/toast`. API errors are caught globally by `apiErrorInterceptor` (maps status 0 → network, 4xx/5xx → `err.error?.error` message) and shown as error toasts. Unhandled client exceptions go through `GlobalErrorHandler` (registered in `app.config.ts`). Server has a global `setErrorHandler` returning `500 { error, code: 'INTERNAL_ERROR' }` and per-route validation responses.

### Testing

Client uses Karma + Jasmine (`ng test`). Specs are colocated `*.spec.ts`; pure utilities are the established test target (`core/utils/url-query.util.spec.ts` — `describe`/`it`, small `kv()` factory helpers, `jasmine.objectContaining`). Prefer extracting logic into `core/utils/*.ts` pure functions and unit-testing those rather than testing components. No server test harness is configured yet.

### Exemplar Feature

> When adding a new feature, follow the **Collections / Saved Requests** vertical slice — it exercises every convention above.

- `client/src/app/core/models/collection.model.ts` — entity interfaces.
- `client/src/app/core/services/collection.service.ts` — `HttpClient` wrapper returning `Observable<T>`, plus `Subject`-based change notifications.
- `client/src/app/layout/sidebar/sidebar.component.ts` — smart component: signal state, lazy load, full CRUD with `{ next, error }`, inline edit, toast errors.
- `client/src/app/core/services/tab.service.ts` + `request-state.service.ts` — canonical signal state + façade pattern.
- `client/src/app/shared/empty-state/empty-state.component.ts` — presentational `@Input` child.
- `server/src/routes/collections.ts` — Fastify route module: typed handlers, manual validation, `strip()`, key-whitelist PATCH, cascade delete, status codes.
- `server/src/db/database.ts` + `db/types.ts` — LokiJS collection getters and `*Document` types.
- `client/src/app/core/utils/url-query.util.ts` + `.spec.ts` — pure-function-plus-test pattern.
