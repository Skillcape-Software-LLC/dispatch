# Phase 7 — Polish, UX & Settings

> **Goal:** Refine the experience, add quality-of-life features, and make it feel complete.
> **Design Direction:** Precision Instrument / Mission Control — all new UI follows the established dark-first, amber-accent aesthetic.

---

## Task Breakdown

### Task 1 — Theme Service & Toggle

**New file:** `client/src/app/core/services/theme.service.ts`

```
ThemeService (Injectable, root)
  - theme = signal<'dark' | 'light'>('dark')
  - init(): reads localStorage 'dispatch-theme', falls back to window.matchMedia prefers-color-scheme
  - setTheme(t): sets signal, writes to localStorage, sets document.documentElement.setAttribute('data-bs-theme', t)
  - toggle(): flips between dark/light
```

**Modify:** `top-bar.component.*`
- Add theme toggle button (Bootstrap Icon: `bi-sun` / `bi-moon-stars-fill`) to right side of top bar
- Add settings button (`bi-sliders2`) to right side as well
- Inject `ThemeService`, bind button to `themeService.toggle()`
- Use `@if (themeService.theme() === 'dark')` for icon switching

**CSS note:** The design system already defines both `[data-bs-theme="dark"]` and `[data-bs-theme="light"]` CSS variables — theme switching is zero-cost.

**Top bar layout redesign:**
```
[logo/wordmark]  [tabs area - flex:1]  [env selector]  [theme toggle]  [settings]
```
- Left: "DISPATCH" wordmark in `IBM Plex Mono`, amber accent — gives it identity
- The top bar currently only holds the env selector; expand it to a full application chrome

---

### Task 2 — Keyboard Shortcut Service

**New file:** `client/src/app/core/services/keyboard-shortcut.service.ts`

```typescript
interface ShortcutDef {
  key: string;           // e.g. 'Enter', 's', 'n', 'w', '/'
  ctrl: boolean;
  description: string;
  action: () => void;
  ignoreInInputs?: boolean;  // default true — suppress when focus is in <input>/<textarea>
}

KeyboardShortcutService (Injectable, root)
  - shortcuts = Map<string, ShortcutDef>
  - register(id: string, def: ShortcutDef): void
  - unregister(id: string): void
  - getAll(): ShortcutDef[]  // for shortcut panel display
  - private onKeyDown(e: KeyboardEvent): handles routing, checks active element
```

**Key canonicalization:** `${ctrl ? 'ctrl+' : ''}${key.toLowerCase()}`

**Input suppression logic:**
```typescript
const tag = (e.target as Element).tagName;
const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
             || (e.target as Element).getAttribute('contenteditable') === 'true';
// Also check Monaco editor iframe — skip if isInput and ignoreInInputs
```

**Special case for Monaco:** Ctrl+Enter and Ctrl+S should fire EVEN in Monaco. Use `ignoreInInputs: false` for those, but Monaco also swallows events — the request-builder component should handle these via `(keydown)` on its container element with `@HostListener`.

**Registration pattern:** Components inject `KeyboardShortcutService`, call `register()` in `ngOnInit` / `inject(DestroyRef).onDestroy(() => unregister())`.

---

### Task 3 — Application Settings

#### Server side

**New file:** `server/src/utils/settings.ts`
```typescript
export interface AppSettings {
  requestTimeoutMs: number;    // default: 30000
  historyLimit: number;        // default: 500
  sslVerification: boolean;    // default: true
  defaultContentType: string;  // default: 'application/json'
  proxyUrl: string;            // default: ''
}
export const DEFAULT_SETTINGS: AppSettings = { ... }
```

**New file:** `server/src/routes/settings.ts`
```
GET  /api/settings  → returns current settings doc (or defaults)
PUT  /api/settings  → merges partial update, validates, persists
```
- Use a LokiJS collection `settings`, single document pattern (upsert by a fixed key)
- Schema validate with Fastify's built-in JSON schema on PUT body

**Modify:** `server/src/index.ts` — register settings route, pass `db` reference

#### Client side

**New file:** `client/src/app/core/services/settings.service.ts`
```typescript
SettingsService (Injectable, root)
  - settings = signal<AppSettings>(DEFAULT_SETTINGS)
  - load(): Observable — GET /api/settings, sets signal
  - save(partial: Partial<AppSettings>): Observable — PUT /api/settings
  - get<K>(key: K): computed from signal (for individual setting access)
```

**New file:** `client/src/app/core/services/settings-modal.service.ts`
- Simple `open()` / `close()` / `isOpen = signal<boolean>(false)` pattern (matches existing modal services)

#### Settings Modal UI

**New files:** `client/src/app/layout/settings-modal/settings-modal.component.*`

**Design:** Full-width overlay modal. Tabbed layout inside:
- **General** — Default Content-Type (select), Request Timeout (number input + "ms" label)
- **Network** — SSL Verification (toggle), HTTP Proxy URL (text input)
- **Data** — History Limit (number input), Clear History button (danger, requires confirm)

**Visual language:**
- Modal header: "SETTINGS" in mono font with a subtle amber underline rule
- Setting rows: label left, control right, description below label in muted text
- Toggle switches: custom CSS using `form-check` styled to amber accent
- Tabs: pill-style nav matching existing modal tab style
- Save button: `btn-dispatch` (amber fill), Cancel: `btn-outline-secondary`

**Wire into shell:** Add `<app-settings-modal />` to `shell.component.html`, inject `SettingsService` to load on app init.

---

### Task 4 — Keyboard Shortcut Reference Panel

**New files:** `client/src/app/layout/shortcut-panel/shortcut-panel.component.*`

**Design:** Slides in from the RIGHT as an overlay panel (not a modal — doesn't block the app).
- Position: `fixed`, right: 0, top: top-bar height, height: calc(100vh - top-bar), width: 320px
- Animation: `translateX(100%)` → `translateX(0)` with `cubic-bezier(0.16, 1, 0.3, 1)` ease
- Backdrop: subtle `rgba(0,0,0,0.4)` on the left — click to dismiss
- Close on `Escape` or `Ctrl+/` again (toggle)

**Content layout:**
```
┌─────────────────────────────┐
│ KEYBOARD SHORTCUTS    [×]   │
├─────────────────────────────┤
│ REQUEST                     │
│  Ctrl + Enter    Send       │
│  Ctrl + S        Save       │
│  Ctrl + L        Focus URL  │
├─────────────────────────────┤
│ TABS                        │
│  Ctrl + N        New tab    │
│  Ctrl + W        Close tab  │
├─────────────────────────────┤
│ NAVIGATION                  │
│  Ctrl + E        Env select │
│  Ctrl + /        This panel │
└─────────────────────────────┘
```

**Key pill style:** `<kbd>` element styled with:
```css
kbd {
  background: var(--d-surface-300);
  border: 1px solid var(--d-surface-500);
  border-bottom: 2px solid var(--d-surface-500);
  font-family: var(--d-font-mono);
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
}
```

**Wire into shell:** Add `<app-shortcut-panel />` to `shell.component.html`. Register `Ctrl+/` in `ShortcutPanelComponent.ngOnInit()`.

---

### Task 5 — Resizable Sidebar

**Approach:** CSS custom property `--sidebar-width` + mouse drag on a handle element.

**Modify:** `shell.component.scss`
```scss
.app-body {
  display: grid;
  grid-template-columns: var(--sidebar-width, 260px) 1fr;
  // ...
}
```

**Modify:** `shell.component.ts`
```typescript
// Expose sidebar width as host binding
@HostBinding('style.--sidebar-width')
get sidebarWidthCss() { return this.sidebarWidth() + 'px'; }

sidebarWidth = signal(260);
sidebarCollapsed = signal(false);

startResize(e: MouseEvent) { ... }   // attaches document mousemove/mouseup
onResizeMove(e: MouseEvent) { ... }  // clamps 160–480, sets signal
onResizeEnd() { ... }                // saves to localStorage
```

**Drag handle:** A `<div class="resize-handle">` positioned on the right edge of the sidebar (inside `app-sidebar` or as a sibling in `.app-body`). Cursor: `col-resize`. Width: 4px, full height. On hover: highlight with amber.

**Sidebar collapse toggle:**
- Button in sidebar header: `bi-layout-sidebar-reverse` / `bi-layout-sidebar`
- When collapsed: `sidebarWidth = 48`, sidebar shows only icons for Collections/History toggle + the footer
- Animate the transition with `transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- Persist collapsed state to localStorage

---

### Task 6 — Resizable Request/Response Split

**Location:** `main-area.component.*` (currently stacks vertically)

**Approach:**
```scss
.main-area {
  display: flex;
  flex-direction: column;

  .request-pane {
    height: var(--split-pos, 50%);
    min-height: 120px;
    overflow: auto;
  }

  .split-handle {
    height: 4px;
    cursor: row-resize;
    background: var(--d-surface-300);
    flex-shrink: 0;
    &:hover { background: var(--d-amber-border); }
  }

  .response-pane {
    flex: 1;
    min-height: 80px;
    overflow: auto;
  }
}
```

**Resize logic in `MainAreaComponent`:**
```typescript
splitPos = signal(50);  // percentage

startSplitResize(e: MouseEvent) { ... }
// Calculates percentage based on container clientHeight during drag
// Clamps to 20%–80%
// Saves to localStorage on mouseup
```

---

### Task 7 — Empty States

**New files:** `client/src/app/shared/empty-state/empty-state.component.*`

**Reusable component inputs:**
```typescript
@Input() icon: string = 'bi-inbox';      // Bootstrap icon class
@Input() title: string = '';
@Input() subtitle: string = '';
@Input() actionLabel: string = '';
@Output() action = new EventEmitter<void>();
```

**Design:** Centered in available space. Mission-control aesthetic:
- Icon: large (48px), `--d-text-tertiary`, subtle `opacity: 0.5`
- Title: `--d-text-secondary`, `Instrument Sans`, 14px
- Subtitle: `--d-text-tertiary`, 12px
- CTA button: `btn-outline-dispatch` (amber outline)
- Subtle dashed border box around the whole thing: `border: 1px dashed var(--d-surface-400)`

**Three usage sites:**

1. **Collections sidebar** (in `sidebar.component.html`):
   - When `collections().length === 0`:
   - Icon: `bi-folder-plus`, Title: "No collections yet", Subtitle: "Organize your requests into collections", Action: "New Collection"

2. **History sidebar** (in `sidebar.component.html`):
   - When `history().length === 0`:
   - Icon: `bi-clock-history`, Title: "No requests yet", Subtitle: "Your request history will appear here after you send one"

3. **Response area** (in `main-area.component.html` or response-viewer):
   - When no response has been received yet (idle state):
   - Icon: `bi-send`, Title: "Ready to dispatch", Subtitle: "Configure your request above and hit Send"
   - No action button

---

### Task 8 — Error Handling & Resilience

#### Global Angular Error Handler

**New file:** `client/src/app/core/services/global-error-handler.ts`
```typescript
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);
    const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
    this.toast.show({ message: msg, type: 'error' });
  }
}
```

**Register in `app.config.ts`:**
```typescript
{ provide: ErrorHandler, useClass: GlobalErrorHandler }
```

#### HTTP Error Interceptor

**New file:** `client/src/app/core/interceptors/api-error.interceptor.ts`
```typescript
// Functional interceptor
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: HttpErrorEvent) => {
      // Map HTTP errors to user-facing messages via ToastService
      // 0 = network error, 4xx = request error, 5xx = server error
      // Re-throw so callers can still handle
      return throwError(() => err);
    })
  );
};
```

**Register in `app.config.ts`:**
```typescript
provideHttpClient(withInterceptors([apiErrorInterceptor]))
```

#### Server Error Standardization

**Modify:** All Fastify route files — wrap handlers in try/catch, return:
```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```

Common codes: `NOT_FOUND`, `VALIDATION_ERROR`, `DB_ERROR`, `PROXY_ERROR`

Add a Fastify `setErrorHandler` in `server/src/index.ts` for uncaught errors:
```typescript
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});
```

---

## File Inventory

### New Server Files
| File | Purpose |
|------|---------|
| `server/src/utils/settings.ts` | AppSettings interface + defaults |
| `server/src/routes/settings.ts` | GET + PUT /api/settings |

### New Client Files
| File | Purpose |
|------|---------|
| `core/services/theme.service.ts` | Dark/light toggle + system pref |
| `core/services/keyboard-shortcut.service.ts` | Global hotkey registry |
| `core/services/settings.service.ts` | Settings API client + signal |
| `core/services/settings-modal.service.ts` | Modal open/close control |
| `core/services/global-error-handler.ts` | Angular ErrorHandler impl |
| `core/interceptors/api-error.interceptor.ts` | HTTP error → toast |
| `layout/settings-modal/` (3 files) | Settings modal UI |
| `layout/shortcut-panel/` (3 files) | Keyboard shortcut slide-out |
| `shared/empty-state/` (3 files) | Reusable empty state component |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/index.ts` | Register settings route, setErrorHandler |
| `server/src/routes/*.ts` | Standardize error responses |
| `shell.component.*` | Sidebar resize logic, add new modals |
| `top-bar.component.*` | Theme toggle, settings button, wordmark |
| `sidebar.component.*` | Collapse mode, empty states |
| `main-area.component.*` | Resizable split |
| `request-builder.component.*` | Keyboard shortcut integration |
| `app.config.ts` | Register error handler + interceptor |

---

## Implementation Order

1. `ThemeService` + top bar theme toggle ← quick win, visible immediately
2. `SettingsService` + server routes + settings modal ← unblocks settings consumers
3. `KeyboardShortcutService` + wire into request-builder (Ctrl+Enter/S/L) ← high value
4. Shortcut panel component + Ctrl+/ ← depends on #3
5. Resizable sidebar (drag + collapse) ← layout foundation
6. Resizable request/response split ← layout polish
7. Empty state component + wire into sidebar + response area ← UX completeness
8. Global error handler + HTTP interceptor + server error standardization ← resilience last

---

## Design Notes for New UI

### Top Bar (expanded)
```
┌────────────────────────────────────────────────────────────┐
│ DISPATCH  [tab][tab][+]  ···  [env ▾][✎]  [☀]  [⚙]       │
└────────────────────────────────────────────────────────────┘
```
- "DISPATCH" in `IBM Plex Mono`, weight 600, amber color — left anchor identity
- Theme toggle: icon-only button, 32px, subtle hover state
- Settings: `bi-sliders2`, icon-only button

### Settings Modal Sections
- Section headers: uppercase, 10px, letter-spacing 0.1em, `--d-text-tertiary`
- Separator lines: `1px solid var(--d-surface-300)`
- Toggle switches: Custom CSS using `input[type=checkbox]` styled to amber accent (no Bootstrap `form-switch` default color)

### Collapse Sidebar Icon Mode
- Only show: collection/history tab icons, a "+" new request icon, footer with collapse toggle
- Tooltips on all icons (Bootstrap `title` attribute — browser native)
- Width 48px, centered icons

### Empty State Visual
```
        ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐

              [icon]
              Title
              Subtitle
              [  Action  ]

        └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```
- Dashed border uses `border: 1px dashed var(--d-surface-400)`
- Rounded corners: `border-radius: 12px`
- Padding: 40px
