# Dispatch UX Analysis

**Date:** 2026-06-10
**Scope:** Full client UI — layout, panel/button placement, keyboard shortcuts, interaction patterns — evaluated against the bar set by mature tools (Postman, Insomnia, Bruno).
**Method:** Code-level review of every layout component, the request workspace, the keyboard shortcut service and all registrations, and the modal layer. Findings cite `file:line`.

---

## The short answer: why it feels clunky

It is not the layout. The three-panel structure (sidebar / tab strip / split request-response) is the correct, industry-standard shape, and several details — tab persistence, URL↔params live sync, the assembled-URL preview — are genuinely well done.

The clunkiness comes from **repeated micro-betrayals of expectation**. Postman's polish is mostly that every affordance does exactly what it advertises, and the keyboard layer is 100% dependable. In Dispatch, a meaningful number of affordances are dead, lie, or work only sometimes:

1. **The collections search box does nothing** — it has no binding at all.
2. **The Cancel button doesn't cancel** — it's a literal no-op.
3. **Shortcuts work intermittently** depending on invisible focus state, and two of the six (Ctrl+N, Ctrl+W) are browser-reserved keys that the browser intercepts before the app ever sees them — Ctrl+W can close your entire Dispatch session.
4. **No visible Save button exists anywhere.** Saving is Ctrl+S-only.
5. **Modals only close via the X button** — Escape and backdrop-click do nothing, and the shortcut panel even advertises "(Esc)" on a close handler that doesn't exist.

Each one is small. Together they erode the user's prediction model — you stop trusting your hands, you start double-checking outcomes, and that *feeling* is what "clunky" is. The good news: most fixes are cheap, and they're enumerated below in priority order.

---

## What's working well

Credit where due — these are at or above Postman's bar and should not be touched casually:

- **Tab/workspace persistence** (`tab.service.ts:217-270`) — versioned localStorage snapshot with debounce; reopening the app restores your exact working state. Postman desktop gets this right; many web tools don't.
- **URL ↔ Params two-way sync** (`request-builder.component.ts:126-152`) — typing a query string populates the Params table and vice versa, with a re-entrancy guard and no mid-keystroke normalization. This is *better* than Postman, which has historically fumbled this.
- **Unresolved-variable warning with a "Fix →" link** that deep-links to the env editor (`request-builder.component.html:58-64`). Excellent error-recovery affordance.
- **Tab strip fundamentals**: drag-reorder via CDK, dirty dot, right-click context menu with Close Others / Close to the Right / Close Unaltered (`main-area.component.ts:160-172`). Close Unaltered is a power feature Postman doesn't have.
- **Inline delete confirmation** on sidebar rows (`sidebar.component.html:128-137`) — confirm-in-place beats a blocking dialog.
- **Header name autocomplete** with keyboard navigation in the kv-editor (`kv-editor.component.ts:93-117`).
- **Status bar shortcut hints** (`main-area.component.html:32-47`) — good discoverability instinct (though it currently advertises a broken shortcut; see F4).
- Sidebar width, collapse state, and split position all persist. Dark theme, method colors, and status-code colors are consistent and legible.

---

## Findings

Severity scale: 🔴 **Broken/lying affordance** (destroys trust) · 🟠 **High friction** (daily-use cost) · 🟡 **Polish/consistency**

### A. Broken and no-op affordances

**F1 🔴 Collections search is dead.**
`sidebar.component.html:61` renders `<input placeholder="Search collections...">` with no value binding, no input handler, no filter logic. The history search right next to it works. A user types into this box, nothing filters, and they conclude the app is half-built — this single control does disproportionate damage to perceived quality. Wire it (the `computed()` filter pattern already exists for history at `sidebar.component.ts:101-109`) or remove it until it works.

**F2 🔴 The Cancel button is a no-op.**
While a request is in flight the Send button becomes Cancel (`request-builder.component.html:38-41`), but it calls `state.sendRequest()` — which immediately early-returns when `isLoading()` is true (`request-state.service.ts:64`). Nothing is aborted. The user clicks Cancel on a hung request, nothing happens, and they sit out the full timeout. Fix: hold the `Subscription` from `proxyService.send()` and unsubscribe on cancel (Angular's HttpClient aborts the underlying request on unsubscribe), then reset `isLoading`.

**F3 🔴 No modal closes on Escape or backdrop click.**
All eleven modals (save-as, env editor, import, codegen, settings, publish, subscribe, pull-preview, channel-info, collection-settings, shortcut panel) close only via the X button. The shortcut panel's close button literally has `title="Close (Esc)"` (`shortcut-panel.component.html:6`) with no Escape handler anywhere. Escape-to-dismiss is one of the deepest-trained reflexes in desktop software; every modal interaction in Dispatch currently ends with a precise mouse trip to a small X. The context-menu service already handles Escape/outside-click correctly (`shared/context-menu/context-menu.service.ts`) — that dismissal behavior should be standard for every overlay. A tiny shared `ModalBaseService` or a host listener in each modal fixes this across the board.

**F4 🔴 Ctrl+N and Ctrl+W are browser-reserved and cannot work in a browser tab.**
`main-area.component.ts:61-75` registers Ctrl+N (new tab) and Ctrl+W (close tab). Chromium does not deliver these to the page — `preventDefault` is irrelevant; Ctrl+N opens a browser window and **Ctrl+W closes the Dispatch tab, killing the session** (tab state survives thanks to persistence, but the response panes and the user's flow don't). They only behave in an installed PWA window, and even there Ctrl+W is risky. The status bar (`main-area.component.html:44`) and the "+" tab tooltip advertise Ctrl+N, so the app is actively teaching users a shortcut that detonates. Remap to web-safe combos (e.g. `Ctrl+Alt+N` / `Ctrl+Alt+W`, or Insomnia-style `Ctrl+T` is *also* reserved — Alt-based is safest), or detect standalone-PWA mode and only advertise them there.

**F5 🟠 Body mode pills lead to dead ends.**
`form-data` and `binary` render as equal-weight pills (`body-editor.component.ts:19`) but selecting them shows "not yet supported" (`body-editor.component.html:28-31`). Unimplemented options shouldn't be presented as available choices — disable them with a "soon" affordance or hide them. Every dead end a user walks into is another trust withdrawal.

**F6 🟠 Single tab close discards unsaved changes silently — but bulk close prompts.**
`closeTab()` (`tab.service.ts:48-64`) has no dirty check, while `closeOthers`/`closeAll`/`closeToRight` all call `confirmDiscard()`. So closing one dirty tab via X or Ctrl+W: silent data loss; closing three via context menu: confirmation. The inconsistency makes the protection feel random. Add the same guard to `closeTab`.

**F7 🟠 "Clear all history" has no confirmation.**
`sidebar.component.html:264` — a single click on the trash icon irreversibly wipes all history (`sidebar.component.ts:575-583`). Meanwhile deleting *one* collection or request gets a careful inline confirm. The most destructive action in the sidebar is the least protected. Reuse the inline-confirm pattern.

### B. The keyboard layer (the biggest Postman gap)

**F8 🟠 Shortcuts fire intermittently because of the input-focus guard.**
`keyboard-shortcut.service.ts:44-49`: every shortcut except Send and Save defaults to `ignoreInInputs: true`. But in this app **focus is almost always in an input** — the URL bar, a kv-editor row, Monaco. So Ctrl+I, Ctrl+/, Ctrl+N, Ctrl+W appear to work "sometimes" with no visible reason. Intermittent shortcuts are worse than missing ones; this is a textbook generator of unattributable clunkiness. None of these Ctrl-combos conflict with text editing — they can all safely run with `ignoreInInputs: false` (the guard is only needed for unmodified keys like `/` or `Delete`).

**F9 🟠 The shortcut vocabulary is too small for muscle-memory users.**
Six shortcuts exist: Ctrl+Enter, Ctrl+S, Ctrl+N, Ctrl+W, Ctrl+I, Ctrl+/. Missing, in rough order of daily-use value:
- **Focus the URL bar** (Postman: Ctrl+L). In an HTTP tool this is the single highest-leverage key. Currently every new request starts with a mouse click into the URL field.
- **Tab switching** — Ctrl+Tab / Ctrl+Shift+Tab or Alt+1…9. Tabs are the app's core navigation and are mouse-only today.
- **Universal search / command palette** (Postman: Ctrl+K). With collections search broken (F1) there is currently *no* way to find a saved request by name other than expanding folders one by one.
- **Switch environment** (Postman: Ctrl+E), **duplicate tab/request** (Ctrl+D), **toggle sidebar** (Ctrl+B — already a near-universal convention from VS Code).
- A registry exists and the shortcut panel auto-generates from it, so each addition is cheap.

**F10 🟡 The shortcut matcher ignores Shift/Alt/Meta.**
`keyboard-shortcut.service.ts:35-37` canonicalizes only `ctrlKey + key`, so Ctrl+Shift+S triggers plain Save, and there's no Cmd support for macOS users (browser on Mac: Ctrl works but feels alien; Cmd+S will trigger the browser's save-page dialog). Extend the canonical form to include shift/alt/meta and treat Meta as Ctrl-equivalent on Mac.

**F11 🟠 The Params/Headers/Body/Auth tabs are unreachable by keyboard.**
All four config tabs are `tabindex="-1"` (`request-builder.component.html:84,96,107,116`), removing them from the tab order entirely. A keyboard user cannot get to Headers at all. Either restore them to the tab order or (better) add Postman-style pane cycling shortcuts; doing *both* `tabindex="-1"` and no shortcut is the worst quadrant.

### C. Placement & information architecture

**F12 🟠 No visible Save button.**
Saving exists only as Ctrl+S (`main-area.component.ts:52-59`) plus a status-bar hint. Postman puts Save next to Send — and that placement is right: Send and Save are the two verbs of the request builder. A user who hasn't read the status bar has no discoverable path to saving at all. Add a Save (split: Save / Save As…) button beside Send in the URL bar.

**F13 🟠 Environment controls are split across opposite corners, and vanish when the sidebar collapses.**
The active-environment selector is in the sidebar header (`sidebar.component.html:27-43`); the "Manage Environments" button is a top-bar icon on the far right (`top-bar.component.html:7-9`). Related controls should live together. Worse, collapsing the sidebar removes the selector entirely — you can't see *or change* which environment is active, while the variables it provides keep silently affecting every request. Postman's placement (selector pinned top-right of the workspace, with an eye-icon variable peek) is the proven pattern: move the selector to the top bar, put the manage (pencil) button beside it, and add a hover/click peek of resolved variables.

**F14 🟡 Top bar: five unlabeled icon buttons, three of which open the same modal.**
General / Network / Data settings icons (`top-bar.component.html:10-18`) all open one settings modal that *already has* its own internal tab nav (`settings-modal.component.html:18-23`). Three mystery-meat icons duplicating in-modal navigation is choice overhead with no payoff — one gear icon suffices. The top bar then has room for what actually belongs there (environment selector, global search).

**F15 🟠 No "Add request" on a collection.**
The collection row menu offers Settings / sync / Export / Rename / Delete (`sidebar.component.html:146-180`) — but not the most common action in a Postman workflow: *add a new request to this collection*. The only path is: new tab → build → Ctrl+S → pick collection in the Save As modal. The "+ New request" link only appears when a collection is empty (`sidebar.component.html:237-242`), and it opens a blank unattached tab anyway. Add "Add Request" to the collection menu that opens a tab pre-bound to that collection.

**F16 🟡 Right-click works on tabs but not on the sidebar tree.**
Tabs have a proper context menu via `ContextMenuService`; collections and requests still use the older three-dots dropdown (`sidebar.component.ts:89-94` note: a manual document-click listener predating the service). Users who learn right-click from the tab strip will try it on the tree and get the browser's menu. Migrate the tree to `ContextMenuService` (CLAUDE.md already flags the old dropdown as legacy) — keep the three-dots as the visible affordance, but both should open the same menu.

**F17 🟡 Up to three stacked status strips under the URL bar.**
Resolved-URL preview, unresolved-variable warning, and assembled-URL preview can render simultaneously (`request-builder.component.html:49-78`), and the assembled-URL strip renders *permanently* — even as an empty placeholder row — "to avoid layout shift." That's a symptom fix: the cost is a dead ~22px strip under every URL bar forever. Consolidate into a single one-line strip (warning takes priority, else resolved+assembled combined — they're nearly the same string), shown only when it has content, with the config-nav absorbing the layout shift via a fixed-height container.

**F18 🟡 Collapsed-sidebar icons appear to do nothing.**
In collapsed mode, the Collections/History icons call `setTab()` (`sidebar.component.html:6-13`) but the panel stays collapsed — the click produces no visible change. Clicking a rail icon should expand the sidebar to that tab (VS Code activity-bar behavior).

### D. Workspace & response pane

**F19 🟠 The method dropdown doesn't dismiss properly.**
`showMethodMenu` is toggled only by the button and by selecting an item (`request-builder.component.ts:113-120`). Clicking anywhere else leaves it hanging open; Escape does nothing; there's no arrow-key navigation. Every other menu in the app self-dismisses. Either use a native `<select>` (styled — it's 7 static options) or route it through `ContextMenuService`, which already does dismissal, clamping, and Escape.

**F20 🟡 Response pane is read-only in the narrow sense.**
Present: pretty body (Monaco), headers list, copy body, status/time/size. Missing vs. Postman: search within the body from outside Monaco (Ctrl+F works only once the editor has focus — undiscoverable), word-wrap toggle, raw vs. pretty toggle, download body to file, cookies, and any timing breakdown. The first three are cheap (Monaco options/actions already exist under the hood) and cover most daily need.

**F21 🟡 kv-editor tab order includes non-input controls.**
Tabbing from a value field to the next row's key passes through the row's delete button and the next row's checkbox — two extra stops per row (`kv-editor.component.html`). When entering five headers that's twenty wasted tab stops. Set `tabindex="-1"` on the checkbox and delete button (they remain mouse-accessible; Postman does exactly this). Also missing: row drag-reorder and a bulk-edit (text) mode — both are Postman staples, the latter being the fastest way to paste headers from a doc.

**F22 🟡 History restore silently strips auth.**
`openHistoryEntry` drops `Authorization`, `Content-Type`, `Host`, `Content-Length` headers (`sidebar.component.ts:527-530`). Reasonable for Host/Length; but silently removing Authorization and Content-Type means a request replayed from history behaves differently than it did, with no indication why. At minimum show a toast ("Auth header not restored"); better, restore Content-Type and offer auth restore explicitly.

**F23 🟡 Save As modal: Enter doesn't submit.**
The name field has no `keydown.enter` handler (`save-as-modal.component.html:20-26`), so the flow is type-name-then-mouse-to-Save. Every inline edit in the sidebar already commits on Enter — the modal should too. (Same applies to the env editor's name/variable fields and its explicit per-env Save with no dirty guard when switching environments in the list — edits appear to be silently discardable.)

**F24 🟡 No undo, anywhere.**
Deletes (request, collection, history entry) are immediate and final; toasts (`toast.service.ts`, 2500ms) carry no action button. An "Undo" action on destructive toasts is the modern alternative to confirmation dialogs and would let you *remove* some confirms rather than add more.

**F25 🟡 Tab strip small conventions.**
No middle-click-to-close (universal browser/editor convention; one `auxclick` handler), no double-click-empty-strip-to-open-new-tab, and no "Duplicate Tab" in the tab context menu — duplicating a request to tweak one parameter is a constant API-testing move with no path in Dispatch today (no duplicate on saved requests either, F16's menu would be its natural home).

---

## Why Postman feels smoother — the synthesis

| Dimension | Postman | Dispatch today |
|---|---|---|
| Affordance honesty | Everything clickable does something | Dead search, no-op Cancel, dead-end body modes, advertised-but-missing Esc |
| Keyboard dependability | Shortcuts always fire; full vocabulary | 6 shortcuts; 2 browser-reserved; most don't fire while typing |
| Primary verbs visible | Send + Save side by side | Send only; Save is invisible (Ctrl+S) |
| Environment visibility | Always-visible selector + variable peek | Hidden when sidebar collapsed; manage/selector split across corners |
| Find anything | Ctrl+K universal search | Working history search only |
| Escape hatch | Esc closes everything | Esc closes (almost) nothing |

The structural layout needs no rework. The deficit is in the **interaction contract layer** — honesty, dismissal, keyboard reach — which is also the cheapest layer to fix.

---

## Prioritized recommendations

### P0 — Restore trust (small, high-impact, mostly bug-fix-shaped)
1. Wire the collections search or remove it (F1).
2. Make Cancel actually abort the in-flight request (F2).
3. Escape + backdrop-click close for every modal and the shortcut panel (F3).
4. Remap Ctrl+N / Ctrl+W to web-safe combos; stop advertising reserved keys (F4).
5. Dirty-tab guard on single close (F6); confirm (or undo-toast) on Clear History (F7).
6. Disable unimplemented body modes (F5).

### P1 — Close the daily-friction gap
7. Save / Save As button next to Send (F12).
8. Move env selector to the top bar, merge with Manage, add variable peek; collapse the three settings icons into one (F13, F14).
9. Shortcut expansion: focus-URL, tab cycling, sidebar toggle, duplicate; make Ctrl-combos fire inside inputs; Mac Meta support; strict modifier matching (F8–F10).
10. "Add Request" + "Duplicate" on collection/request menus; right-click context menus on the tree via `ContextMenuService` (F15, F16, F25).
11. Fix method dropdown dismissal/keyboard handling (F19); restore keyboard access to config tabs (F11).

### P2 — Polish to parity
12. Consolidate URL preview strips into one conditional line (F17).
13. Response pane: search, wrap toggle, raw view, download (F20).
14. kv-editor: clean tab order, bulk-edit mode, row reorder (F21).
15. Enter-to-submit in modals; env-editor dirty guard (F23).
16. Undo-toasts for deletes (F24); middle-click tab close (F25); collapsed-rail click expands sidebar (F18); history auth-strip notice (F22).

A reasonable sequencing: P0 is one focused day of work and will remove most of the "clunky" feeling on its own, because it eliminates every place where the UI currently lies. P1 is where Dispatch starts feeling *fast* rather than merely honest.

---

# Part 2 — Motor-flow analysis: pointer travel and attention shifts

This section walks the app as a user, tracking where the pointer and the eyes have to go for each common task. The standard here is Fitts's law in spirit: cost = distance traveled × number of distinct attention shifts. Postman feels "smooth" partly because its journeys are short loops; Dispatch's journeys are repeatedly corner-to-corner.

## The overlay geography

Every overlay's actual screen anchor, from the SCSS, against where its trigger lives:

| Overlay | Renders at | Width | Triggered from | Trigger ↔ UI match? |
|---|---|---|---|---|
| Import | right-edge drawer | 520px | sidebar footer, **bottom-left** | ❌ opposite corner |
| Save As | right-edge drawer | 420px | Ctrl+S (center) / history rows (**left**) | ❌ |
| Env editor | right-edge drawer | — | sidebar selector (**top-left**), top-bar icon (right), "Fix →" link (center) | ❌ mixed |
| Collection settings | right-edge drawer | — | tree three-dots menu (**left**) | ❌ |
| Codegen | right-edge drawer | — | "Code" button, config-nav **right** end | ✅ matched edge |
| Settings | right-edge drawer | — | top-bar icons, **top-right** | ✅ matched edge |
| Shortcut panel | right-edge drawer | — | Ctrl+/ (keyboard) | ✅ neutral |
| Publish / Subscribe / Pull preview / Channel info | **centered** dialog | — | sidebar tree (**left**) | ◐ acceptable — centered bounds the travel |
| Toasts | bottom-right | — | actions mostly resolve on the **left** | ◐ diagonal from attention |

Two things jump out:

**M1 🟠 Two overlay paradigms, split by feature area, with no user-visible rule.** Sync features get centered dialogs; everything else gets a right drawer. The drawer pattern was presumably chosen for codegen/settings — where the triggers are already on the right, and it works beautifully there — and then inherited by Import, Save As, and Collection Settings, whose triggers are all on the left. The user never learns "where will the UI appear when I click?" because the answer depends on an internal architectural category.

**M2 🔴 The worst journeys are the most common ones.** Codegen and Settings (matched edges) are occasional tasks. Import and Save As (opposite-corner journeys) are constant tasks. The travel budget is being spent exactly backwards.

## Journey walkthroughs (1920×1080 reference canvas)

### J1 — Import a collection (the one you noticed)
1. Pointer to **Import** — sidebar footer, ≈(70, 1020). Bottom-left corner.
2. Drawer slides in at the **right edge**; the cURL textarea / file picker sits at ≈(1650, 300). Travel: ~1,700px, corner to corner.
3. Fill the form; pointer to **Import** submit at the drawer's bottom-right, ≈(1810, 600+).
4. Drawer closes. The imported collection appears **back in the left sidebar** — and nothing highlights it; the eye hunts the tree. Confirmation toast pops **bottom-right**, diagonally opposite the result.

Total: ~3,500–4,000px of pointer travel and four attention shifts (bottom-left → top-right → bottom-right → top-left) for one import. A centered modal cuts this to roughly a quarter and removes two of the four shifts.

### J2 — Save a new request
Hands are on the keyboard (you just typed a URL). Ctrl+S opens the Save As **drawer at the far right**; the name field autofocuses (good — travel so far: zero). But Enter doesn't submit (F23), so the journey ends with a pointer trip to the drawer's bottom-right Save button, then the saved request materializes in the **left** tree, unhighlighted, with the toast bottom-right. A flow that could be 100% keyboard, travel-free, currently ends with a forced cross-canvas mouse reach.

### J3 — Create a collection
Trigger: **"New" in the sidebar footer (bottom-left)**. The inline name input then appears at the **top of the collections list** (`sidebar.component.html:84-95`) — a full-height vertical eye jump within the narrowest column of the app. Note the collapsed rail already puts its "+" button at the **top** (`sidebar.component.html:14-16`); expanded and collapsed modes disagree about where "new" lives.

### J4 — Environment setup loop
Pick the selector (**top-left** sidebar header) → realize you need to add a variable → manage button is the layers icon in the **top-right** top bar → editor opens as a **right drawer** → save → return attention to the URL bar (**center-left**) to verify the resolved preview. An L→R→R→L loop for one of the most common setup tasks. (Part 1's F13 — co-locating selector + manage in the top bar — collapses this to one corner.)

### J5 — Save from history
Floppy icon on a history row (**left**) → Save As drawer (**far right**) → submit (bottom-right) → toast (bottom-right) → saved item in collections tab (**left**). Same shape as J1.

### J6 — The core send/inspect loop ✅
For contrast: URL bar and Send are adjacent (top of main area), response renders directly below, Ctrl+Enter works even in inputs. This loop — the one you run hundreds of times a day — is tight and correct. The travel problem is confined to the *secondary* workflows, which is exactly why it registers as vague background friction rather than an obvious flaw: the main loop is fine, and then every supporting task sends you across the canvas.

## The underlying principles being violated

1. **UI should appear adjacent to its trigger, or centered.** A right drawer from a left trigger is the maximum-travel choice. Centered dialogs bound the worst case at half a diagonal from anywhere — that's why they're the default for transactional forms in every mature tool.
2. **Drawers are for reference-while-working; dialogs are for transactions.** Codegen (read code while the request is visible) and Settings are legitimate drawers. Import, Save As, and Collection Settings are fill-and-commit forms — there is nothing to reference behind them; they should be centered dialogs.
3. **The pointer should land where the next action begins.** After import/save, the user's next action is in the sidebar. The current flows strand the pointer in the opposite corner.
4. **Results should announce their location.** New/imported/saved items appear in the tree with no scroll-to or highlight; the toast confirms *that* it happened, in a corner, but not *where*.

## Recommendations (motor-flow)

### Add to P1
17. **Convert Import, Save As, and Collection Settings to centered dialogs.** Keep Codegen, Settings, and the shortcut panel as right drawers — their triggers match. This single change fixes J1, J2, and J5's worst leg. (Pairs with F3: Escape/backdrop dismissal makes centered dialogs cheap to leave.)
18. **Move "New" and "Import" from the sidebar footer to the sidebar section-header row** (top, beside the "Collections" label) — adjacent to where the inline create input renders and where new items appear, and consistent with the collapsed rail's top-anchored "+".
19. **Scroll-to + highlight-flash the affected row** after create/import/save, so the eye is led to the result instead of hunting for it.
20. **Enter-to-submit in Save As** (restates F23 — here it's not polish, it's what makes J2 a zero-travel keyboard flow end-to-end).

### Add to P2
21. Consider anchoring transactional confirmations near their origin (or bottom-center toasts); at minimum, put the Undo action (F24) in the toast so the bottom-right trip has a purpose.
22. When the env editor is opened from the "Fix →" link, return focus to the URL input on close — close the J4 loop automatically.

## Revised synthesis

Part 1's diagnosis was *honesty*: affordances that lie. Part 2's is *economy*: the secondary workflows route trigger → form → result through three different corners of the canvas. Postman keeps its transactional UI centered and its panels edge-matched to their buttons; Dispatch applied one edge-anchored pattern to everything regardless of trigger location. Fixing the four highest-traffic journeys (import, save-as, new collection, env setup) is mostly CSS-level re-anchoring plus two behavior nudges (highlight-on-result, Enter-to-submit) — cheap relative to how much of the daily "traversing the entire canvas" feeling it removes.

---

# Part 3 — Right-click as the zero-travel layer

Right-click is the structural answer to Part 2: the menu opens *at the pointer*, so travel is zero by definition, and the action vocabulary scales without adding visible chrome. Dispatch is unusually well positioned here — `ContextMenuService` (`shared/context-menu/context-menu.service.ts`) already does viewport clamping, full dismissal (outside click, scroll, Escape, window blur), separators, icons, disabled states, and display-only shortcut hints. It is currently wired to exactly **one** surface: the tab strip. Everything below is mostly "call `open()` from more places."

## Ground rules (so right-click helps instead of surprises)

1. **Right-click targets *objects*, never text-editing surfaces.** The URL bar, kv-editor inputs, and Monaco keep their native menus — cut/copy/paste/spellcheck on inputs is sacred, and Monaco ships its own menu. Rows, tabs, panels, and headers are fair game.
2. **Context menus are invisible UI.** Every action must keep a visible path (three-dots button, footer button, etc.). Right-click is an accelerator, not the only route — otherwise discoverability pays for what travel saved.
3. **One menu definition per entity, two triggers.** The three-dots button and the `contextmenu` event should open the *same* `ContextMenuItem[]` (the three-dots just anchors it at the button instead of the cursor). This simultaneously retires the legacy sidebar dropdown and its manual document-click listener (`sidebar.component.ts:89-94`) — resolving F16 as a side effect rather than a separate task.
4. **Teach the keyboard through the menu.** The service already renders `shortcut` hints; every menu item with a shortcut should display it. The context menu becomes the discovery surface for the expanded shortcut vocabulary (F9).

## Surface-by-surface menu map

### C1 🟠 Collections panel — empty space (your example)
Right-click anywhere in the tree's whitespace (`.tree-scroll`, not on a row):

> **New Collection** (Ctrl+Shift+N) · **New Request** · **Import…** (Ctrl+I) ─── **Expand All** · **Collapse All**

This single menu makes J1 and J3 (Part 2) start at the pointer instead of the bottom-left footer. Implementation note: handler on the scroll container, guarded by `event.target.closest('.collection-row, .request-row')` so row menus win.

### C2 🟠 Collection row
> **Add Request** ─── **Rename** · **Duplicate** ─── **Export** · *(synced: **Push** · **Pull** · **Channel Info** / unsynced: **Publish to Central**)* ─── **Settings** · **Delete** ⚠

Same items as today's three-dots dropdown plus the two missing verbs from Part 1: **Add Request** (F15 — the most common Postman collection action, currently absent) and **Duplicate**. The conditional sync items already have their logic in `canPush`/`canPull` (`sidebar.component.ts:438-444`).

### C3 🟠 Request row
> **Open** · **Open in New Tab** ─── **Rename** · **Duplicate** ─── **Copy URL** · **Copy as cURL** ─── **Delete** ⚠

Today's dropdown has only Rename/Delete (`sidebar.component.html:224-231`). "Open in New Tab" matters because plain click *reuses* a clean tab (`sidebar.component.ts:283-285`) — an invisible heuristic the user can't override today. "Copy as cURL" is free: the codegen utility (`core/utils/codegen.ts`) already produces it; this is one menu item away instead of open-request → Code button → pick cURL → copy → close drawer (a four-step right-edge journey).

### C4 🟠 History row + history panel
Row:
> **Open** · **Open in New Tab** ─── **Save to Collection…** · **Copy URL** · **Copy as cURL** ─── **Delete** ⚠

Empty space:
> **Clear All History** ⚠ *(with the confirm from F7)*

History rows currently expose save/delete only as hover-revealed 24px icon targets (`sidebar.component.html:306-321`) — precise-aim work in the narrowest column of the app. Right-click replaces aim with intent.

### C5 🟡 Tab strip — extend the existing menu
The proven menu (`main-area.component.ts:160-172`) is missing:
> **Duplicate Tab** *(after Close-group)* · **Save** (Ctrl+S) · **Copy as cURL**

…and right-clicking the *empty strip* should offer **New Tab** / **Reopen Closed Tab** (the latter implies a small closed-tab stack in `TabService` — cheap, high-delight, standard since every browser has it).

### C6 🟡 Response headers rows
> **Copy Value** · **Copy "Key: Value"** ─── **Copy All Headers**

The headers table (`response-viewer.component.html:69-78`) is plain text today — copying a header value means careful drag-selection. This is the cheapest win in the set.

### C7 🟡 Environment list items (in the env editor)
> **Activate** ─── **Rename** · **Duplicate** ─── **Export** · **Delete** ⚠

Duplicate-an-environment (staging → prod with two values changed) is a top-five env workflow and currently impossible without manual re-entry.

## Service gaps to close first (small)

- **`danger?: boolean` on `ContextMenuItem`** — Delete items need the red treatment the legacy dropdown already has; currently the interface (`context-menu.service.ts:7-17`) has no styling hook.
- **Arrow-key navigation + Enter** once the menu is open — it's mouse-only today, which undercuts rule 4 (and basic a11y). Escape already works.
- **Anchored open** — an `openAt(element, items)` variant so the three-dots button can share menu definitions (rule 3) while anchoring to the button instead of the cursor.
- Submenus are *not* needed — every menu above fits flat with separators. Avoid building them until something genuinely demands one.

## Priority fold-in

**P1 additions:** C1 (panel whitespace menu), C2 + C3 (tree row menus — subsumes F16), C4 (history rows), plus the three service gaps above as the enabling step.
**P2 additions:** C5 (tab strip extensions + reopen-closed-tab), C6 (response headers), C7 (env list).

## How the three parts compose

| Layer | Problem | Fix shape |
|---|---|---|
| Part 1 — Honesty | Affordances that lie or dead-end | Bug-fix-shaped; restores trust |
| Part 2 — Economy | Trigger, form, and result in three corners | Re-anchor overlays; relocate two buttons |
| Part 3 — Reach | Actions live far from the objects they act on | Wire the existing context-menu service to 6 more surfaces |

These compound: a right-click "Add Request" (C2) that opens a **centered** save flow (Part 2) whose form **submits on Enter** (Part 1/F23) turns a four-corner journey into pointer-stays-put. That compounding — not any single fix — is what closes the gap with Postman's hand-feel.
