# Dispatch — Implementation Plan

> A lightweight, containerized HTTP testing tool. The anti-Postman.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  Docker Container                 │
│                                                   │
│  ┌─────────────┐         ┌─────────────────────┐ │
│  │   Angular    │  HTTP   │   Node.js + Fastify │ │
│  │     SPA      │◄───────►│      REST API       │ │
│  │  (Frontend)  │         │     (Backend)       │ │
│  └─────────────┘         └────────┬────────────┘ │
│                                   │               │
│                          ┌────────▼────────────┐ │
│                          │      LokiJS         │ │
│                          │  (Embedded NoSQL)    │ │
│                          │                      │ │
│                          │  Persisted to JSON   │ │
│                          │  on mounted volume   │ │
│                          └─────────────────────┘ │
│                                                   │
└──────────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
   Browser at                Volume Mount
   localhost:3000           /data/*.json
```

### Tech Stack

| Layer        | Technology            | Purpose                                    |
| ------------ | --------------------- | ------------------------------------------ |
| Frontend     | Angular 19+           | SPA — request builder, response viewer, UI |
| Backend      | Node.js + Fastify     | REST API, HTTP proxy, cURL parsing         |
| Storage      | LokiJS               | Embedded document DB, persisted to JSON    |
| Distribution | Docker (single image) | `docker run -p 3000:3000 dispatch`         |
| Styling      | Bootstrap 5.3 + Bootstrap Icons | Dark theme, component library, responsive grid |

### Why Fastify over Express?

- 2-3x faster request throughput
- Built-in schema validation (useful for our own API)
- First-class TypeScript support
- Plugin architecture keeps the codebase modular

---

## Data Model

All entities are JSON documents stored in LokiJS collections.

### Request Document

```json
{
  "id": "uuid",
  "name": "Get Users",
  "method": "GET",
  "url": "{{baseUrl}}/api/users",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "params": [
    { "key": "page", "value": "1", "enabled": true }
  ],
  "body": {
    "mode": "json",
    "content": "{ \"name\": \"test\" }"
  },
  "auth": {
    "type": "bearer",
    "bearer": { "token": "{{token}}" }
  },
  "collectionId": "uuid",
  "folderId": "uuid | null",
  "sortOrder": 0,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Collection Document

```json
{
  "id": "uuid",
  "name": "User Service",
  "description": "Endpoints for user management",
  "folders": [
    { "id": "uuid", "name": "Auth", "parentId": null, "sortOrder": 0 },
    { "id": "uuid", "name": "Profiles", "parentId": null, "sortOrder": 1 }
  ],
  "auth": {
    "type": "bearer",
    "bearer": { "token": "{{token}}" }
  },
  "variables": [
    { "key": "baseUrl", "value": "https://api.example.com" }
  ],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Environment Document

```json
{
  "id": "uuid",
  "name": "Development",
  "variables": [
    { "key": "baseUrl", "value": "http://localhost:5000", "enabled": true },
    { "key": "token", "value": "dev-token-xyz", "enabled": true }
  ],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### History Entry Document

```json
{
  "id": "uuid",
  "request": { /* full resolved request snapshot */ },
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": { },
    "body": "...",
    "size": 1234,
    "time": 142
  },
  "timestamp": "ISO-8601"
}
```

---

## Phase Breakdown

### Phase 1 — Project Foundation

> **Goal:** Bootable containerized app with Angular frontend served by Fastify backend.

#### Tasks

1. **Initialize monorepo structure**
   ```
   dispatch/
   ├── client/              # Angular app
   ├── server/              # Node.js + Fastify API
   ├── docker/
   │   └── Dockerfile
   ├── docker-compose.yml
   ├── package.json         # Root workspace config
   └── README.md
   ```

2. **Scaffold Angular app** (`client/`)
   - Angular 19+ with standalone components
   - Bootstrap 5.3 CSS integration
   - Base layout shell: sidebar + main content area
   - Proxy config for local dev (`/api → localhost:4000`)

3. **Scaffold Fastify server** (`server/`)
   - TypeScript configuration
   - Health check route (`GET /api/health`)
   - CORS config for local dev
   - Static file serving for Angular build output (production mode)

4. **LokiJS integration**
   - Initialize database with auto-save to `/data/dispatch.db.json`
   - Create empty collections: `requests`, `collections`, `environments`, `history`
   - Database service layer with basic CRUD helpers

5. **Docker setup**
   - Multi-stage Dockerfile: build Angular → build server → production image (Node Alpine)
   - `docker-compose.yml` with volume mount for `/data`
   - Single `docker run` command works end-to-end

6. **Dev environment**
   - `npm run dev` starts both Angular dev server and Fastify in watch mode concurrently
   - Hot reload on both client and server

#### Deliverable
Running `docker compose up` serves the app at `localhost:3000` with a blank shell UI and a working health endpoint.

---

### Phase 2 — Request Builder & Response Viewer

> **Goal:** Send a single HTTP request and view the full response. The core interaction loop.

#### Tasks

1. **Request builder UI** (Angular)
   - Method selector dropdown (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
   - URL input bar with large, prominent Send button
   - Tabbed input area:
     - **Params** — key/value editor with enable/disable toggles
     - **Headers** — key/value editor with enable/disable toggles and auto-complete for common headers
     - **Body** — mode selector (none, JSON, form-data, raw, binary) with appropriate editor per mode
     - **Auth** — type selector (None, Bearer Token, Basic Auth, API Key) with config fields per type
   - URL bar auto-syncs with Params tab (editing query string updates params and vice versa)

2. **JSON/code editor integration**
   - Integrate Monaco Editor (same engine as VS Code) for body input and response viewing
   - JSON syntax highlighting, auto-formatting, bracket matching
   - Line numbers, word wrap toggle

3. **HTTP proxy endpoint** (Fastify)
   - `POST /api/proxy` — accepts the full request document, executes it server-side, returns response
   - Why server-side: avoids CORS issues entirely, can handle all auth types, captures accurate timing
   - Supports streaming for large responses
   - Returns: status, statusText, headers, body, response time (ms), response size (bytes)

4. **Response viewer UI** (Angular)
   - Tabbed output area:
     - **Body** — rendered in Monaco Editor with auto-detected language (JSON, XML, HTML, plain text)
     - **Headers** — table of response headers
     - **Info** — status badge (color-coded: 2xx green, 3xx blue, 4xx yellow, 5xx red), time, size
   - JSON responses: collapsible tree view or raw toggle
   - Copy response body button
   - "Pretty / Raw" toggle for body

5. **Loading & error states**
   - Loading spinner/indicator while request is in flight
   - Cancel in-flight request button
   - Connection error, timeout, and DNS failure handling with clear messages
   - Request timing display

#### Deliverable
User can compose any HTTP request, send it, and inspect the full response — the core workflow of the app.

---

### Phase 3 — Collections & Organization

> **Goal:** Save, organize, and manage requests in collections and folders.

#### Tasks

1. **Collections CRUD API** (Fastify)
   - `GET /api/collections` — list all collections
   - `POST /api/collections` — create collection
   - `PUT /api/collections/:id` — update collection (name, description, folders)
   - `DELETE /api/collections/:id` — delete collection and all child requests
   - `GET /api/collections/:id/requests` — list requests in collection

2. **Requests CRUD API** (Fastify)
   - `POST /api/requests` — save request to collection
   - `PUT /api/requests/:id` — update saved request
   - `DELETE /api/requests/:id` — delete request
   - `POST /api/requests/:id/duplicate` — duplicate a request
   - `PATCH /api/requests/reorder` — update sort order within folder

3. **Sidebar — Collection tree UI** (Angular)
   - Collapsible tree view of collections → folders → requests
   - Right-click context menu: rename, duplicate, delete, move to folder
   - Drag-and-drop reordering within collections
   - "New Collection", "New Folder", "New Request" actions
   - Active request highlighted in tree
   - Collection-level icons for visual distinction

4. **Tabs UI** (Angular)
   - Open multiple requests as tabs (like browser tabs)
   - Unsaved changes indicator (dot on tab)
   - Close / close others / close all
   - Tab state persisted across sessions
   - New tab opens a blank request builder

5. **Save workflow**
   - "Save" (Ctrl+S) updates existing request
   - "Save As" prompts for collection/folder destination
   - Unsaved changes warning before closing tab or navigating away
   - Auto-save drafts for crash recovery

#### Deliverable
Full collection management — users can build and organize a library of API requests with tabbed editing.

---

### Phase 4 — Environments & Variable Interpolation

> **Goal:** Define variable sets and resolve `{{variables}}` throughout requests.

#### Tasks

1. **Environments CRUD API** (Fastify)
   - `GET /api/environments` — list all environments
   - `POST /api/environments` — create environment
   - `PUT /api/environments/:id` — update environment
   - `DELETE /api/environments/:id` — delete environment
   - `POST /api/environments/:id/duplicate` — duplicate environment

2. **Environment manager UI** (Angular)
   - Dropdown in top bar to select active environment (or "No Environment")
   - Environment editor panel: key/value table with enable/disable toggles per variable
   - Quick-edit eye icon to peek/edit active environment variables without opening full editor
   - Visual indicator showing which environment is active

3. **Variable interpolation engine** (server-side)
   - Resolve `{{variableName}}` in: URL, headers (keys and values), params, body content, auth fields
   - Variable resolution order (matches Postman's model):
     1. Collection variables
     2. Environment variables (active environment overrides collection)
   - Unresolved variables highlighted in the UI (red/warning styling on `{{unknown}}`)
   - Preview resolved URL in a subtle "resolved" display below the URL bar

4. **Variable quick-look**
   - Hover over `{{variable}}` in any input field to see current resolved value
   - Auto-complete dropdown when typing `{{` to suggest available variables

#### Deliverable
Users can define environments (dev/staging/prod), switch between them, and have all variables auto-resolved in requests.

---

### Phase 5 — Request History

> **Goal:** Automatically log every sent request with its response for review and re-use.

#### Tasks

1. **History logging** (Fastify)
   - After every proxied request, persist a history entry (full request snapshot + response summary)
   - `GET /api/history` — paginated list, newest first
   - `GET /api/history/:id` — full history entry with response body
   - `DELETE /api/history/:id` — delete single entry
   - `DELETE /api/history` — clear all history
   - Auto-prune: configurable max entries (default 500), oldest entries purged on insert

2. **History sidebar tab** (Angular)
   - Toggle between "Collections" and "History" in the sidebar
   - History entries grouped by date (Today, Yesterday, Last 7 Days, Older)
   - Each entry shows: method badge, URL (truncated), status code, timestamp
   - Click to open in a new tab (read-only initially, "Save to Collection" to persist)
   - Search/filter history by URL, method, or status code

3. **History → Collection workflow**
   - "Save to Collection" button on any history entry
   - Opens save dialog with collection/folder picker
   - Saved request becomes a normal editable collection request

#### Deliverable
Every request is logged and browsable. Users can search past requests and promote them into collections.

---

### Phase 6 — Import, Export & Code Generation

> **Goal:** Get data in and out of Dispatch. Critical for onboarding and interoperability.

#### Tasks

1. **cURL import** (server-side parser)
   - Parse cURL command strings into Dispatch request documents
   - Support common cURL flags: `-X`, `-H`, `-d`, `--data-raw`, `-u`, `-b`, `--url`, `-k`, `-F`
   - "Import cURL" button in top bar or empty state
   - Paste multi-line cURL (with `\` continuations) support
   - Imported request opens in a new tab, ready to send or save

2. **Collection export** (JSON)
   - Export single request as JSON
   - Export entire collection (with folders, requests, and collection variables) as a single JSON file
   - Dispatch export format — clean, documented JSON schema
   - Postman collection v2.1 import support (stretch goal — parse Postman's format into Dispatch format)

3. **Collection import** (JSON)
   - Import a Dispatch-format JSON file as a new collection
   - Validation and error reporting for malformed files
   - Conflict handling (duplicate names)

4. **Code generation**
   - From any request, generate equivalent code in:
     - **cURL** (most important — universal)
     - **JavaScript fetch**
     - **Python requests**
     - **C# HttpClient**
   - "Generate Code" button opens a modal with language selector and copyable output
   - Generated code resolves current environment variables (shows actual values, not `{{placeholders}}`)

5. **Environment import/export**
   - Export environment as JSON
   - Import environment from JSON

#### Deliverable
Users can import their existing cURL commands, export/share collections as files, and generate code snippets from any request.

---

### Phase 7 — Polish, UX & Settings

> **Goal:** Refine the experience, add quality-of-life features, and make it feel complete.

#### Tasks

1. **Keyboard shortcuts**
   - `Ctrl+Enter` — Send request
   - `Ctrl+S` — Save request
   - `Ctrl+N` — New request tab
   - `Ctrl+W` — Close current tab
   - `Ctrl+E` — Toggle environment selector
   - `Ctrl+L` — Focus URL bar
   - Keyboard shortcut reference panel (`Ctrl+/`)

2. **Theme support**
   - Dark mode (default) and light mode
   - System preference auto-detection
   - Theme toggle in top bar

3. **Application settings**
   - Default request timeout (ms)
   - History retention limit
   - SSL verification toggle (for self-signed certs)
   - Default content-type
   - Proxy configuration (HTTP/HTTPS proxy URL)
   - Settings stored in LokiJS, exposed via `GET/PUT /api/settings`

4. **Responsive layout polish**
   - Resizable sidebar (drag handle)
   - Resizable request/response split (horizontal or vertical layout option)
   - Collapse sidebar for more workspace
   - Minimum viable responsive behavior for smaller screens

5. **Empty states and onboarding**
   - Helpful empty states for: no collections, no history, no environments
   - "Import cURL" and "Create Collection" prompts on first use
   - Subtle tips for keyboard shortcuts

6. **Error handling & resilience**
   - Global error boundary in Angular
   - Backend error standardization (consistent error response format)
   - Graceful handling of LokiJS persistence failures
   - Auto-recovery of corrupted DB file (backup + re-init)

#### Deliverable
A polished, keyboard-friendly, dark-mode-default application that feels intentional and complete.

---

### Phase 8 — Production Hardening & Distribution

> **Goal:** Production-ready Docker image, documented and distributable.

#### Tasks

1. **Docker optimization**
   - Multi-stage build: Angular build → Fastify build → Node Alpine runtime
   - Target image size < 100MB
   - Non-root user in container
   - Health check endpoint in Dockerfile (`HEALTHCHECK`)
   - `.dockerignore` to minimize build context

2. **Data persistence & backup**
   - Volume mount documentation (`-v dispatch-data:/data`)
   - Backup strategy: LokiJS JSON files are just files — copy them
   - Data migration support for schema changes between versions
   - Graceful shutdown: flush LokiJS to disk on SIGTERM

3. **Configuration**
   - Environment variable overrides: `PORT`, `DATA_DIR`, `LOG_LEVEL`
   - Config precedence: env vars → settings file → defaults

4. **Logging**
   - Structured JSON logging (Fastify's built-in pino logger)
   - Request/response logging for proxy calls (configurable verbosity)
   - Log rotation or max file size

5. **Security**
   - Rate limiting on proxy endpoint (prevent abuse if exposed)
   - Request size limits on body
   - Helmet.js / security headers on the app itself
   - No secrets stored in plaintext — at minimum, flag sensitive values in environments

6. **Testing**
   - Backend: unit tests for variable interpolation engine, cURL parser, proxy logic
   - Backend: integration tests for all API endpoints
   - Frontend: unit tests for key components (request builder, variable resolution, collection tree)
   - E2E: Cypress or Playwright smoke tests for critical workflows (send request, save to collection, switch environment)

7. **CI/CD pipeline**
   - GitHub Actions workflow: lint → test → build → push Docker image
   - Semantic versioning
   - Publish to GitHub Container Registry (or DockerHub)

8. **Documentation**
   - README with quickstart (`docker run` one-liner)
   - `docker-compose.yml` example with volume mount
   - Feature overview with screenshots
   - Keyboard shortcut reference

#### Deliverable
A tagged Docker image published to a registry that anyone can `docker run` and start using immediately.

---

## Phase Summary

| Phase | Name                            | Dependencies | Estimated Complexity |
| ----- | ------------------------------- | ------------ | -------------------- |
| 1     | Project Foundation              | None         | Low                  |
| 2     | Request Builder & Response      | Phase 1      | High                 |
| 3     | Collections & Organization      | Phase 2      | High                 |
| 4     | Environments & Variables        | Phase 3      | Medium               |
| 5     | Request History                 | Phase 2      | Medium               |
| 6     | Import, Export & Code Gen       | Phase 3, 4   | Medium               |
| 7     | Polish, UX & Settings           | Phase 1-6    | Medium               |
| 8     | Production Hardening            | Phase 1-7    | Medium               |

> **Phases 4 and 5 can be built in parallel** — they share a dependency on Phase 2 but are independent of each other.

```
Phase 1 ──► Phase 2 ──┬──► Phase 3 ──► Phase 4 ──┬──► Phase 6 ──► Phase 7 ──► Phase 8
                       │                           │
                       └──► Phase 5 ───────────────┘
```

---

## Open Questions

1. **Postman import** — Do we want to parse Postman Collection v2.1 format at MVP, or defer to post-launch? A: no, but we should support cURL imports and dispatch JSON imports/exports. 
2. **WebSocket support** — Listed as a "should-have" earlier. Include in a Phase 9, or defer entirely? A: defer entirely
3. **Auth: OAuth 2.0** — The MVP covers Bearer/Basic/API Key. Full OAuth 2.0 flows (authorization code, PKCE) add significant complexity. Include or defer? A: defer. 
4. **Multi-user** — The architecture supports a single user. If multiple team members need separate history/settings while sharing collections, that's a different data model. Confirm single-user is fine for MVP. A: single user is fine, sharing is not the scope of this application. 
5. **Branding** — Logo, color palette, app icon for the container/browser tab. When do we want to nail this down? A: the /design directory contains style guide information. 
