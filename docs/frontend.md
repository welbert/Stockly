# Frontend

## Routing (`src/App.tsx`)

```
AuthGate                                    (src/components/layout/AuthGate.tsx)
├── no session  → renders <LoginPage/> directly (not a nested route)
└── session ok  → <Outlet context={{ secondsUntilLock }}/> → AppShell
                      ├── index ("/")        → InventoryPage (Estoque)
                      ├── "configuracoes"    → SettingsPage
                      └── "usuarios"         → UsersPage (Admin-only; self-redirects to "/" otherwise)
```

`AuthGate` owns the single `useIdleTimer` call for the whole app and passes `secondsUntilLock` down to `AppShell`'s topbar warning via React Router's `<Outlet context={...}>` / `useOutletContext<AuthGateOutletContext>()` — a plain exported interface, not a React Context module, since it's one value flowing to one child route subtree (`AppShell`) rather than something read from many unrelated places.

## Pages (`src/pages/`)

- **LoginPage** — branches on `hasAnyUsers()`: first-run shows an admin-creation form (`FirstRunForm`); otherwise a keyboard-navigable profile picker (`ProfilePicker`, arrow keys + Enter) followed by a password step.
- **InventoryPage** (Estoque, index route) — search (accent-insensitive, `\p{Mn}` NFD strip) + category filter, computed client-side over `list_items()`'s full result (no server-side filtering). Row actions differ by role: Admin gets "Editar"/"Excluir" (`ItemFormModal`), Usuário comum gets "Ajustar estoque" (`StockAdjustModal`) and only for active items.
- **SettingsPage** — `Card` per concern: Aparência (`ThemeSwitcher`), Bloqueio automático (auto-lock dropdown, self-service for both roles), and two Admin-only cards (Alerta de estoque baixo %, Precificação — default profit margin %).
- **UsersPage** — Admin-only table + `UserFormModal`; guards itself with `if (!user?.isAdmin) return <Navigate to="/" replace/>` since it's still reachable by URL even though the sidebar hides the link.

## Layout (`src/components/layout/`)

- **AppShell** — sidebar + topbar around the authenticated routes' `<Outlet/>`. Sidebar nav items are filtered by `user.isAdmin` and grouped under a label ("Operação"/"Administração") that itself depends on the role for a shared item (Configurações sits under "Administração" for Admin, alongside Usuários, but under "Operação" for Usuário comum — matches the two mockup files exactly, see `CLAUDE.md`'s "Planning source of truth"); footer shows the logged-in user's avatar/name/role, the app version (`@tauri-apps/api/app`'s `getVersion()`) and "Sair". Topbar shows the current route's title/subtitle (`PAGE_META`, one entry per route) plus the idle-lock countdown (last 30s only) and a role badge.
- **AuthGate** — see "Routing" above.

## Key components (`src/components/`)

- **Button / Modal / ConfirmModal / Card** — generic primitives, styled from theme tokens only (see `CLAUDE.md`'s Theme rule).
- **ThemeSwitcher** — renders one segment per entry in the `THEMES` catalog (`src/theme.ts`) — never hardcodes "light"/"dark", so adding a theme there is enough (see `CLAUDE.md`'s Theme rule).
- **LockScreen** — the idle-lock overlay `AuthGate` renders on top of whatever screen is open (re-enters the same logged-in user's password via `verify_password`; the screen underneath keeps its state, it's just covered).
- **Form-modal `dirty` computation** (see `CLAUDE.md`'s Form-modal rule) — a plain boolean expression comparing each field's current state to the `initial` prop's value (or the empty/default value when creating), recomputed every render; no snapshot/diff library, no per-field "touched" tracking beyond that. `ItemFormModal.salePriceTouched` is a separate, narrower flag (only gates the auto-suggested sale price, see below) — don't conflate the two.
- **MoneyInput** — see `CLAUDE.md`'s Money field rule.
- **Checkbox** — styled checkbox (box + check icon), replaces the raw browser control everywhere a checkbox appears.
- **Tooltip / InfoTooltip** — `Tooltip` renders its popup through a **portal to `document.body`**, positioned from the trigger's `getBoundingClientRect()` (flips above/below depending on available space) — not a plain absolutely-positioned child, because the badge/hint often sits inside an `overflow-hidden` container (e.g. a rounded table wrapper) that would otherwise clip it. `InfoTooltip` is just a `Tooltip` wrapping a small "?" button.
- **StockBadge** — critical/warning/ok chip (`stockStatus()` in `lib/api.ts`, same formula as `Plans/PLANO.md`'s "Alerta de estoque baixo"). Wraps itself in a `Tooltip` explaining the numbers behind the status (current quantity vs. `min_quantity` and, for the yellow state, the computed warning threshold) — skipped entirely for the "ok" state, nothing to explain there.
- **ItemFormModal** — Admin-only full item CRUD. On **creation only**, `sale_price` is pre-filled from `cost_price * (1 + default_profit_margin_percent / 100)` (`suggestedSalePrice`, fetched via `getDefaultProfitMargin()`) and keeps recalculating as `cost_price` changes, until the admin edits `sale_price` by hand (tracked by a local `salePriceTouched` flag) — never touches an existing item's price. Also shows a non-blocking warning (text + both price inputs' border) when `sale_price < cost_price`.
- **StockAdjustModal** — the Usuário comum equivalent: add-stock entry (positive delta only) and deactivate, no price/name/category fields.
- **CategoryManagerModal** — Admin-only category CRUD, opened from within `ItemFormModal`'s category `<select>`.
- **UserFormModal** — create/edit user; disables the Administrador/Ativo checkboxes when editing your own row (backend also rejects it, see `CLAUDE.md`'s Auth rule) and shows the "elevate to Admin" confirmation before saving when toggling a non-admin user's checkbox on.

## Context (`src/context/`)

- **AuthContext** — `{ user, loading, login, logout, setUser }`; calls `get_active_user` once on mount.
- **ThemeContext** — see `CLAUDE.md`'s Theme rule for how it reconciles `localStorage` (pre-login) with `users.theme` (post-login).

## Hooks (`src/hooks/`)

- **useIdleTimer** — resets on `mousemove`/`keydown`/`click`; calls `onIdle` after N minutes. `secondsRemaining` stays `null` until the last 30 seconds before the lock (`AuthGate` uses this to show a warning, not a permanently-ticking countdown — a countdown that resets on every mouse move would just be noise while someone is actively working).
