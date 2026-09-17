# Frontend

## Routing (`src/App.tsx`)

```
AuthGate                                    (src/components/layout/AuthGate.tsx)
├── no session  → renders <LoginPage/> directly (not a nested route)
└── session ok  → <Outlet context={{ secondsUntilLock }}/> → AppShell
                      ├── index ("/")        → InventoryPage (Estoque)
                      ├── "venda"            → SalesPage (Venda/PDV)
                      ├── "configuracoes"    → SettingsPage
                      └── "usuarios"         → UsersPage (Admin-only; self-redirects to "/" otherwise)
```

`AuthGate` owns the single `useIdleTimer` call for the whole app and passes `secondsUntilLock` down to `AppShell`'s topbar warning via React Router's `<Outlet context={...}>` / `useOutletContext<AuthGateOutletContext>()` — a plain exported interface, not a React Context module, since it's one value flowing to one child route subtree (`AppShell`) rather than something read from many unrelated places.

## Pages (`src/pages/`)

- **LoginPage** — branches on `hasAnyUsers()`: first-run shows an admin-creation form (`FirstRunForm`); otherwise a keyboard-navigable profile picker (`ProfilePicker`, arrow keys + Enter) followed by a password step.
- **InventoryPage** (Estoque, index route) — search (accent-insensitive, `\p{Mn}` NFD strip via `normalize()` in `lib/format.ts`) + category filter, computed client-side over `list_items()`'s full result (no server-side filtering). Row actions differ by role: Admin gets "Editar"/"Excluir" (`ItemFormModal`), Usuário comum gets "Ajustar estoque" (`StockAdjustModal`) and only for active items.
- **SalesPage** (Venda/PDV) — see its own section below.
- **SettingsPage** — `Card` per concern: Aparência (`ThemeSwitcher`), Bloqueio automático (auto-lock dropdown, self-service for both roles), and three Admin-only cards (Alerta de estoque baixo %, Precificação — default profit margin %, and Recibo — store name + free-text info lines for the receipt header, plus the footer's thank-you message; all saved on blur rather than per keystroke).
- **UsersPage** — Admin-only table + `UserFormModal`; guards itself with `if (!user?.isAdmin) return <Navigate to="/" replace/>` since it's still reachable by URL even though the sidebar hides the link.

## Venda / PDV (`src/pages/SalesPage.tsx`)

Keyboard-first by design — the item search input keeps `autoFocus` and gets refocused after every add/close so a cashier never needs the mouse for the common path:

- **Item search**: typing filters `list_items()`'s already-loaded result client-side (same `normalize()` as Estoque). Suggestions rank "name/code starts with" above "name/code contains anywhere", capped at 8, each showing available stock (a red "Sem estoque" chip blocks adding a zero-stock item, same rule/wording as `StockBadge`'s critical state). Pressing Enter first checks for an exact code match (adds it directly even if not the top suggestion), otherwise adds whichever suggestion is highlighted.
- **Shortcuts** (single `window` `keydown` listener, all disabled while any modal is open): `Enter` add item, `↑`/`↓` navigate the suggestion list (while one is open) or the cart rows (once search is empty), `+`/`-` adjust the selected row's quantity, `Delete` remove the selected row, `Esc` deselect the current row, `F6` open the discount modal (item-level if a row is selected, otherwise the order-level discount), `F2` open the finalize/payment modal, `F4` open the cancel-sale confirmation. Focus returns to the search input automatically whenever the last open modal closes (a single `useEffect` keyed on a `modalOpen` boolean, rather than an explicit `.focus()` call in every individual close handler).
- **Client-side totals are a preview only** — `lineSubtotal`/`subtotal`/`total` in `SalesPage` mirror the backend's `round2` sequential math (item discount, then order discount) exactly, but the number that's actually charged and printed always comes back from `create_sale`'s response (`SaleDetail`), never something computed client-side.
- **Store name/info/thank-you message** (`getStoreName`/`getStoreInfo`/`getReceiptThankYouMessage`) are fetched once on mount and shown in place of the previously-hardcoded "BORA VENDER"/"Obrigado pela preferência!" — the live cart preview shows the header (name/info) since payment method isn't known yet pre-finalize; `ReceiptResultModal` shows both header and footer once the sale is done. Mirrors exactly what `receipts.rs` puts on the actual PDF, so the on-screen preview never disagrees with what gets printed.
- **Discount authorization**: once a non-Admin cashier successfully authorizes *any* discount in the current sale (`DiscountModal`, admin picker + password, pre-checked live via `verify_password` for fast feedback), that admin id + password is cached in `SalesPage`'s `saleAuth` state and reused for every later discount in the same sale — matches the backend only storing one `discount_authorized_by_user_id` per sale, not one per discount line. An Admin cashier skips this entirely (`DiscountModal`'s `requiresAuth` prop is `false`), same as the backend's self-authorization path.
- **Finalize**: `PaymentModal` offers Dinheiro/Cartão/PIX only — Crediário is intentionally left out (depends on the not-yet-built Devedores/clientes feature). On success, `ReceiptResultModal` (non-dismissible until "Nova venda") shows a receipt preview built from the real `SaleDetail` and offers Imprimir/Abrir pasta de recibos, generating the PDF on demand via `regenerate_receipt_pdf` first if `receiptPdfPath` came back `null` (PDF generation failed right after the sale committed).

## Layout (`src/components/layout/`)

- **AppShell** — sidebar + topbar around the authenticated routes' `<Outlet/>`. Sidebar nav items are filtered by `user.isAdmin` and grouped under a label ("Operação"/"Administração") that itself depends on the role for a shared item (Configurações sits under "Administração" for Admin, alongside Usuários, but under "Operação" for Usuário comum — matches the two mockup files exactly, see `CLAUDE.md`'s "Planning source of truth"); footer shows the logged-in user's avatar/name/role, the app version (`@tauri-apps/api/app`'s `getVersion()`) and "Sair". Topbar shows the current route's title/subtitle (`PAGE_META`, one entry per route) plus the idle-lock countdown (last 30s only) and a role badge.
- **AuthGate** — see "Routing" above.

## Key components (`src/components/`)

- **Button / Modal / ConfirmModal / Card** — generic primitives, styled from theme tokens only (see `CLAUDE.md`'s Theme rule). `Modal` closes on `Escape` whenever it's `dismissible` and has an `onClose` (same condition as the ✕ button/backdrop-click) — a modal that shouldn't be Esc-able (or click-outside-able) passes `dismissible={false}` and no `onClose` instead of fighting this default. `size="lg"` (default `sm`) is the one opt-in for content that needs more width than the standard dialog (currently only `KeyboardShortcutsModal`).
- **ThemeSwitcher** — renders one segment per entry in the `THEMES` catalog (`src/theme.ts`) — never hardcodes "light"/"dark", so adding a theme there is enough (see `CLAUDE.md`'s Theme rule).
- **LockScreen** — the idle-lock overlay `AuthGate` renders on top of whatever screen is open (re-enters the same logged-in user's password via `verify_password`; the screen underneath keeps its state, it's just covered).
- **Form-modal `dirty` computation** (see `CLAUDE.md`'s Form-modal rule) — a plain boolean expression comparing each field's current state to the `initial` prop's value (or the empty/default value when creating), recomputed every render; no snapshot/diff library, no per-field "touched" tracking beyond that. `ItemFormModal.salePriceTouched` is a separate, narrower flag (only gates the auto-suggested sale price, see below) — don't conflate the two.
- **MoneyInput** — see `CLAUDE.md`'s Money field rule.
- **Checkbox** — styled checkbox (box + check icon), replaces the raw browser control everywhere a checkbox appears.
- **Tooltip / InfoTooltip** — `Tooltip` renders its popup through a **portal to `document.body`**, positioned from the trigger's `getBoundingClientRect()` (flips above/below depending on available space) — not a plain absolutely-positioned child, because the badge/hint often sits inside an `overflow-hidden` container (e.g. a rounded table wrapper) that would otherwise clip it. `InfoTooltip` is just a `Tooltip` wrapping a small "?" button.
- **StockBadge** — critical/warning/ok chip (`stockStatus()` in `lib/api.ts`: critical when quantity <= minimum, warning up to `lowStockWarningThreshold`, no alert with no minimum set). Wraps itself in a `Tooltip` explaining the numbers behind the status (current quantity vs. `min_quantity` and, for the yellow state, the computed warning threshold) — skipped entirely for the "ok" state, nothing to explain there.
- **ItemFormModal** — Admin-only full item CRUD. On **creation only**, `sale_price` is pre-filled from `cost_price * (1 + default_profit_margin_percent / 100)` (`suggestedSalePrice`, fetched via `getDefaultProfitMargin()`) and keeps recalculating as `cost_price` changes, until the admin edits `sale_price` by hand (tracked by a local `salePriceTouched` flag) — never touches an existing item's price. Also shows a non-blocking warning (text + both price inputs' border) when `sale_price < cost_price`.
- **StockAdjustModal** — the Usuário comum equivalent: add-stock entry (positive delta only) and deactivate, no price/name/category fields.
- **CategoryManagerModal** — Admin-only category CRUD, opened from within `ItemFormModal`'s category `<select>`.
- **UserFormModal** — create/edit user; disables the Administrador/Ativo checkboxes when editing your own row (backend also rejects it, see `CLAUDE.md`'s Auth rule) and shows the "elevate to Admin" confirmation before saving when toggling a non-admin user's checkbox on.
- **DiscountModal** — item or order-level discount (% or R$), used from `SalesPage`. Only shows the admin-picker + password fields when `requiresAuth` is true (see the Venda/PDV section above); otherwise applies directly. The %/R$ switch is keyboard-reachable too: `←`/`→` toggle it, but only while the value field is still empty — the moment there's a digit in it, arrow keys go back to normal caret movement instead of hijacking the field. Submitting a `0` (or a blank field, which parses to `0`) is treated as removing the discount rather than applying a meaningless "-0%"/"-R$ 0,00" — same path as clicking "Remover desconto", no admin auth required either way.
- **PaymentModal** — payment method picker (Dinheiro/Cartão/PIX) shown when finalizing a sale. The three methods are a roving-tabindex radiogroup: `←`/`→` move both the selection and focus, and `Enter` submits directly from a focused method button (a focused `type="button"` only re-fires its own click, it doesn't submit the form on its own, so this is handled explicitly rather than relying on native form-submit-on-Enter). The first method auto-focuses on open — without it, keyboard focus would stay on `SalesPage`'s hidden search input behind the modal and nothing in here would respond to the keyboard at all, the same root cause fixed in `ReceiptResultModal` below.
- **ReceiptResultModal** — post-sale result screen (receipt preview, Imprimir/Abrir pasta/Nova venda), non-dismissible except via "Nova venda" so the cashier doesn't lose the just-completed sale by clicking outside. "Nova venda" auto-focuses on open (same reasoning as `PaymentModal` above). `Modal`'s built-in Escape-to-close is off here on purpose (`dismissible={false}`), but `Esc` still triggers "Nova venda" via a dedicated listener — the sale already committed by this point, so there's nothing to lose by treating Esc as "move on" instead of leaving it dead.
- **KeyboardShortcutsModal** — opened from a "?" button next to Venda's shortcut hints (`Modal`'s `size="lg"`, the one modal wide enough for this). Renders a full keyboard diagram (function row, main alphanumeric block, nav cluster, arrow cluster, numpad — built from `KeySpec` row arrays plus a CSS-grid numpad for its 2D-spanning `+`/`Enter`/`0` keys) with the keys Venda actually uses highlighted, so someone who doesn't know a key by name can visually match the highlighted spot to their physical keyboard. A legend below spells out what each highlighted key does.
- **Kbd** — the "keycap" chip used for every inline shortcut hint (Venda's shortcuts bar, the Esc hint in `PaymentModal`/`DiscountModal`) — matches the mockup's `.kbd` class (bordered chip, thicker bottom border for a pressed-key look) via theme tokens.

## Context (`src/context/`)

- **AuthContext** — `{ user, loading, login, logout, setUser }`; calls `get_active_user` once on mount.
- **ThemeContext** — see `CLAUDE.md`'s Theme rule for how it reconciles `localStorage` (pre-login) with `users.theme` (post-login).

## Hooks (`src/hooks/`)

- **useIdleTimer** — resets on `mousemove`/`keydown`/`click`; calls `onIdle` after N minutes. `secondsRemaining` stays `null` until the last 30 seconds before the lock (`AuthGate` uses this to show a warning, not a permanently-ticking countdown — a countdown that resets on every mouse move would just be noise while someone is actively working).
