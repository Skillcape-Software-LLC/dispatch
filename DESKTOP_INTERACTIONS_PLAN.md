# Desktop-Style Interactions Plan

**Goal:** Bring desktop-grade interactions to Dispatch v2 — in the existing Angular app, with no Electron dependency. Everything here ships in the current Docker/browser distribution and carries forward unchanged into any future desktop shell.

**Scope (4 features):**
1. Drag-and-drop tab reordering
2. Right-click context menu on tabs (Close, Close Others, Close All, Close to the Right, Close Unaltered)
3. Ctrl+S to save the current tab — *verify & fix; already registered*
4. Live URL ↔ query-param sync (Postman-style: typing `?key=value` in the URL populates the Params table, and vice versa)

---

## Current State (verified in code)

| Area | File | Status |
|------|------|--------|
| Tab strip UI | `client/src/app/layout/main-area/main-area.component.html` (lines 3–20) | Static `@for` loop of buttons — no reordering, no context menu |
| Tab state | `client/src/app/core/services/tab.service.ts` | Signal-based `tabs` array with localStorage persistence. Has `openTab`/`closeTab`/`activateTab` — no `moveTab`, no bulk-close methods |
| Keyboard shortcuts | `client/src/app/core/services/keyboard-shortcut.service.ts` | Document-level `keydown` listener (bubble phase) |
| Ctrl+S | `main-area.component.ts:48` (`save-request` shortcut) | **Already implemented** — saves active tab or opens Save As modal |
| URL input | `request-builder.component.html:33`, `onUrlChange()` → `state.updateUrl()` | Plain one-way binding; query string typed into URL is *not* parsed into params |
| Params table | `kv-editor.component.*` + `request-state.service.ts:46` | Independent `KvEntry[]`; only merged into the URL at send time and in the read-only `assembledUrl()` preview (`request-builder.component.ts:92`) |
| Angular CDK | `client/package.json` | **Not installed** — needed for drag/drop |

---

## Feature 1 — Tab Drag-and-Drop Reordering

**Approach:** Angular CDK `DragDropModule` on the tab strip. CDK handles pointer tracking, placeholder rendering, and accessibility; we only persist the new order.

### Changes

1. **Install** `@angular/cdk@^19` (match Angular 19.1 major) in `client/`.
2. **`TabService`** — add:
   ```ts
   moveTab(fromIndex: number, toIndex: number): void {
     this.tabs.update((tabs) => {
       const next = [...tabs];
       const [moved] = next.splice(fromIndex, 1);
       next.splice(toIndex, 0, moved);
       return next;
     });
   }
   ```
   Persistence is free — the existing `effect()` + `scheduleSave()` already write any `tabs` mutation to localStorage.
3. **`main-area.component.html`** — wrap the tab strip in `cdkDropList` with `cdkDropListOrientation="horizontal"`, make each `.tab-item` a `cdkDrag`. Exclude the `+` new-tab button from the drop list. Handle `(cdkDropListDropped)` → `tabService.moveTab(event.previousIndex, event.currentIndex)`.
4. **`main-area.component.scss`** — style `.cdk-drag-preview`, `.cdk-drag-placeholder`, and `.cdk-drop-list-dragging` to match the dark theme (preview = semi-opaque clone of the tab, placeholder = dimmed slot).

### Details / gotchas
- Set a small `cdkDragStartDelay` (~0) but verify the nested close-`x` button still receives clicks — CDK distinguishes click vs drag by movement threshold, so no special handling expected.
- The tab strip currently has nested `<button>` inside `<button>` (close inside tab) — already invalid HTML that happens to work; converting the outer element to a `<div role="tab">` during this work is a cheap correctness win and avoids CDK focus quirks.

---

## Feature 2 — Tab Context Menu

**Approach:** A reusable, app-styled context menu (the VS Code/Postman pattern — HTML menu, not OS menu). Built generic so the sidebar collection tree can reuse it later.

### New shared component: `shared/context-menu/`

- `ContextMenuService` — singleton holding `signal<{ x: number; y: number; items: ContextMenuItem[] } | null>`. `open(event: MouseEvent, items: ContextMenuItem[])` calls `event.preventDefault()`, clamps x/y to the viewport, and sets the signal. Closes on outside click, `Escape`, scroll, and window blur.
- `ContextMenuComponent` — rendered once in `shell.component` (same pattern as the existing toast/modal components), absolutely positioned, dark-theme styled (Bootstrap dropdown styling matches existing menus). Supports item icons (Bootstrap Icons), separators, and disabled state.

```ts
interface ContextMenuItem {
  label: string;
  icon?: string;          // bootstrap icon class
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}
```

### `TabService` — new bulk-close methods

All reuse the existing "last tab closed → replace with blank" invariant from `closeTab()`:

| Method | Behavior |
|--------|----------|
| `closeOthers(id)` | Keep only tab `id`; activate it |
| `closeAll()` | Replace with single blank tab |
| `closeToRight(id)` | Remove all tabs after index of `id` |
| `closeUnaltered()` | Remove all tabs where `isDirty === false`; if none remain, blank tab; keep active tab's position sensible |

**Dirty-tab safety:** `closeOthers`/`closeAll`/`closeToRight` will close dirty tabs. v1 behavior: close without prompting (matches current `closeTab`, and tab state is restored from localStorage on refresh anyway — but `isDirty` is *not* persisted, see `loadFromStorage()` which resets it). Decision: show a single confirm toast/dialog when ≥1 dirty tab would be closed ("Close 3 tabs? 2 have unsaved changes"). Cheap insurance, Postman does the same.

### Wiring

`main-area.component.html`: `(contextmenu)="openTabMenu($event, tab)"` on each tab. Menu items:

```
Close                       Ctrl+W
Close Others
Close to the Right          (disabled when rightmost)
Close Unaltered
────────────────
Close All
```

---

## Feature 3 — Ctrl+S (verify & fix)

Already registered with `ignoreInInputs: false` (`main-area.component.ts:48–55`), so it fires from regular inputs. Two known leak paths to fix:

1. **Monaco body editor** — Monaco attaches its own keydown handling inside the editor DOM and can stop propagation before the document-level bubble listener runs. Fix in `body-editor` (and response viewer for consistency): register the save command directly on the editor instance:
   ```ts
   editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveCallback());
   ```
   Expose the save action via a small injectable (or reuse `KeyboardShortcutService` by adding a `trigger(id)` method so Monaco's command delegates to the registered `save-request` shortcut — preferred, keeps one source of truth).
2. **Capture phase** — change `keyboard-shortcut.service.ts:17` to `document.addEventListener('keydown', handler, { capture: true })` so shortcuts win against any future propagation-stopping widget. Keep the input-tag guard logic as is.

Also register the browser-level fallback: without `preventDefault` Ctrl+S triggers the browser Save dialog — already handled by the service (`e.preventDefault()` at line 49), just confirm it covers the Monaco path after the fix.

**Acceptance:** Ctrl+S saves from (a) URL input focused, (b) Monaco body editor focused, (c) params/headers table focused, (d) nothing focused. Saved tab → silent update + toast; unsaved tab → Save As modal.

---

## Feature 4 — Live URL ↔ Query-Param Sync (Postman-style)

**Behavior spec (mirrors Postman):**
- Typing `?page=2&limit=10` in the URL input live-creates/updates rows in the Params table.
- Editing/adding/deleting *enabled* rows in the Params table rewrites the query string portion of the URL input.
- **Disabled** param rows are kept in the table but excluded from the URL (Postman semantics).
- Deleting the query string from the URL removes the corresponding *enabled* rows (disabled rows survive).
- `{{var}}` tokens pass through untouched in both directions — no encoding applied to them.

### Design

New pure utility `client/src/app/core/utils/url-query.util.ts`:

```ts
parseQuery(url: string): { base: string; pairs: Array<{ key: string; value: string }> }
buildUrl(base: string, params: KvEntry[]): string   // enabled rows only
```

- Hand-rolled split on first `?` — **not** `new URL()` / `URLSearchParams`, which choke on partial input (`api.`), `{{token}}` hosts, and would aggressively percent-encode while the user types. Encode only on send (server already does this).
- Duplicate keys allowed (both directions) — order-preserving list, not a map.

### Sync logic (in `RequestBuilderComponent`)

The hard part is the feedback loop (URL edit → params update → URL rebuild → cursor jump). Solution: **directional sync with an origin guard**:

- `onUrlChange(url)`: parse; diff `pairs` against current enabled params; reconcile rows in place (match by position among enabled rows to preserve row `id`s and the `enabled` flags); call `state.updateParams()` *and* `state.updateUrl(fullUrl)` — the URL input keeps exactly what the user typed (no normalization mid-keystroke).
- `onParamsChange(params)`: rebuild URL as `buildUrl(baseOf(currentUrl), params)`; update both. Because this only fires from the kv-editor, the URL input isn't focused — safe to rewrite its value.
- A `syncing` flag (plain boolean field) prevents re-entrancy.

### Model/state impact

- `ActiveRequest.url` now stores the **full** URL including query string (it effectively already does when users type one — today it's just sent twice; see below).
- **Server-side dedup check:** `server/src/proxy/builder.ts` appends `params[]` to the URL at send time. Once params and the URL query string are mirrors, sending both would double the query. Fix: client sends `url` as base-only (strip query before send in `proxy.service.ts`) **or** server prefers `params[]` and strips any query string from `url`. Pick the server-strip approach — it's one line, and keeps old clients/history records working.
- The read-only `assembledUrl()` preview (`request-builder.component.ts:92–105`) becomes redundant for query display but still valuable for *variable-resolved* preview — keep it, but base it on the deduped URL.
- History records and saved requests need no migration — they already store `url` + `params` separately, and the reconciler tolerates any combination on load.

### Edge cases to test
- Pasting a full URL with query string into an empty tab
- `{{baseUrl}}/users?active=true` — token in base, plain query
- `?filter={{f}}` — token in value
- Duplicate keys `?a=1&a=2`
- Trailing `?`, trailing `&`, empty values (`?flag`), `=` in values (`?eq=a=b`)
- Disabling a row → disappears from URL; re-enabling → reappears in original position
- Hash fragments (`...?a=1#section`) — fragment stays attached to base

---

## Delivery Order & Estimates

| Phase | Work | Est. |
|-------|------|------|
| 1 | Ctrl+S fix (capture phase + Monaco command) | 0.5 day |
| 2 | Context menu component + TabService bulk-close + wiring | 1–1.5 days |
| 3 | CDK install + tab drag/drop + theming | 0.5–1 day |
| 4 | URL ↔ params sync (utility, reconciler, server dedup, edge-case tests) | 2–3 days |

Phases are independent — any order works; 4 is the riskiest and benefits from landing last. Total: **~4–6 dev days**.

## Risks

- **Feature 4 regression surface:** it touches the send path (server-side query dedup). Mitigate with unit tests on `url-query.util.ts` and a manual pass of the proxy with history verification.
- **`isDirty` not persisted** (`tab.service.ts:163` resets it on load) — "Close Unaltered" after a refresh treats everything as unaltered. Acceptable, or persist `isDirty` as part of this work (one-line addition to `PersistedState`).
- **CDK bundle size** vs the 500 kB initial budget in `angular.json` — DragDropModule is small (~30 kB) but verify the prod build still passes budgets.

## Explicitly Out of Scope

- Electron / desktop shell (deferred — see conversation 2026-06-10; current PWA + Docker distribution stays)
- Native OS menus, file dialogs, tray
- Context menus for the sidebar collection tree (the new component is built reusable, but wiring it there is a follow-up)
