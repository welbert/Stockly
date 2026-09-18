# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Stockly** ("Bora Vender" in the UI — see naming rule below) is a single-machine desktop inventory/POS app with Admin and Usuário (regular user) profiles: stock control, sales (PDV) with PDF receipts, Crediário/Devedores (store credit), dashboard, reports.

## Docs

Consult before working in the relevant area. **Keep docs up to date:**
- If behavior you observe in the code differs from what a doc describes, correct the doc
- If you implement a new component, store, or pattern that is relevant to an existing doc, add it there
- If the change doesn't fit any existing doc, create a new file in `docs/` and add it to the table below

| File | Content |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Layers, data flow, `AppState`, session model, `guard.rs`, command module list |
| [docs/frontend.md](docs/frontend.md) | Routing, pages, key components, context/hooks |
| [docs/database.md](docs/database.md) | Full SQLite schema, table by table, with the design rationale behind each nullable/cascade/check |
| [docs/commands.md](docs/commands.md) | Every Tauri command, by domain, with signature |
| [docs/versioning.md](docs/versioning.md) | SemVer bump rules, the 3 files kept in sync |
| [docs/future.md](docs/future.md) | Ideas/gaps noticed along the way but out of scope for now — outlives `Plans/PLANO.md` |

**What's implemented so far** lives in `Plans/PLANO.md`'s "Próximos passos" checklist (kept up to date there, not duplicated here) — until that file is retired once everything in it is built.

## Naming rule

"Stockly" is the technical/internal name only — npm package, Rust crate, Tauri `identifier` (`com.welbert.stockly`), table/file prefixes (`stockly-backup.db`). The UI-facing name is always **"Bora Vender"** (window title/`productName`, sidebar brand — falls back to it when no store name is configured in Configurações, login screen, receipts). Never surface "Stockly" in anything the end user sees — **except the sidebar footer's version line** (`AppShell.tsx`), a deliberate exception: shows "Stockly - v{version}" instead of "Bora Vender - v{version}", since the version being tracked is the app build's own, and "Stockly" reads more like a product/build identifier there than a customer-facing brand moment.

## Language rule

Code (identifiers), code comments, and everything in `docs/*.md` are always written in English (en-US) — this applies in both `src/` and `src-tauri/src/`, with no exception for a file that historically had Portuguese comments (fix it to English if you're the one touching it; don't go out of your way to retranslate untouched files). This is separate from the product's own language: end-user-facing UI text (labels, buttons, error messages) and `Plans/PLANO.md` (the business-rules spec, written for/by the Portuguese-speaking product owner) stay in Portuguese (pt-BR) — never translate those to English.

## Planning source of truth

- `Plans/PLANO.md` — full product/business-rules spec. Read the relevant section before implementing any feature; it's the authority for behavior and access rules, not this file.
- `Plans/mockups-ui.html` — full UI mockup (Admin's view of every screen). Canonical visual reference: colors, layout, components, design tokens.
- `Plans/mockups-ui-usuario.html` — same visual system, but only mocks the screens relevant to explain what Usuário comum sees (login, venda, estoque, autorizacao modal, recibo, config reduzida). **A screen missing here is not necessarily restricted** — some (e.g. Devedores) just weren't duplicated because they render identically for both roles. Check `PLANO.md` for the actual access rule per role, never infer a restriction from mockup absence alone.
- Conflict resolution: business rules always come from `PLANO.md`. For visual details, if the two mockup files disagree on a screen both roles use identically, `mockups-ui.html` wins.

## Theme rule (tokens + catalog)

Never hardcode a Tailwind background/text/border color — always use the `bg-theme-*` / `text-theme-*` / `border-theme-border` / `bg-sidebar-*` tokens defined in `src/index.css`, switched via `data-theme="<id>"`. `--color-primary` (indigo, `#4f46e5`) is the one brand accent, taken from the mockups' `--primary` — components should use `primary`/`primary-hover`/`primary-soft` classes, never a hardcoded hex. The sidebar is intentionally dark regardless of theme (matches the mockups) but still goes through tokens (`--theme-sidebar-*`), not raw hex, in case a future theme ever needs to override it.

`Button`'s `ghost` variant hovers with `bg-theme-hover-strong`, not the plain `bg-theme-hover` other surfaces use — it's the variant used for row actions (Editar/Excluir inside a `<tr>`, or a list item), and a table row already turns `bg-theme-hover` on its own hover, so a ghost button using that same shade becomes invisible on hover. Keep this distinction if you add another "hover inside an already-hovered container" case.

**Adding a theme is 2-3 places, never more**: an entry in the `THEMES` array (`src/theme.ts` — the single source of truth for which themes exist and what `ThemeSwitcher` renders), a matching `[data-theme="<id>"]` block in `src/index.css`, and — only if it should be persisted per profile — that id added to the `CHECK` on `users.theme` (see `docs/database.md`) via a `migrate_db` entry. No component, button, or modal needs to change: they all read tokens, never a theme id.

Theme is **per-user**, backed by `users.theme`, wired end-to-end: `ThemeContext` (`src/context/ThemeContext.tsx`) applies `localStorage` before any login (first-run/login/lock screens need a theme too), then switches to the logged-in user's `theme` on login and mirrors every change back through `update_theme` — never both sources fighting over which wins.

## Auth rule (`AppState.active_user_id`)

The **backend is the real access boundary**, not the UI hiding a button. Every admin-only command locks `state.db`, then calls `require_admin(&state, &conn)` (`src-tauri/src/guard.rs` — shared across `commands/*`, not duplicated per module) before doing anything — it reads `AppState.active_user_id` (never a `user_id` argument from the frontend) and checks that row's `is_admin`. A self-service command (a profile changing its own theme or auto-lock) does the same active-session lookup but skips the admin check and only ever writes to that same id — never to a `user_id` passed in by the caller. Lock order is always `db` then `active_user_id` when both are needed, kept consistent everywhere to avoid a deadlock.

**Never allow zero active Admins to exist** — `update_user`/`delete_user` both call `is_last_active_admin` first and refuse to demote/deactivate/delete the only one left. Found the hard way: the very first manual test had the lone admin remove their own Admin flag, which locked the Users screen with no way back in short of hand-editing `stockly.db`.

**Nobody edits their own `is_admin`/`active`, or deletes themselves** — separate from the rule above (this one applies even with other admins around): `update_user`/`delete_user` check `is_active_session` and reject touching those fields, or deleting, your own logged-in row. Granting/revoking a role or removing an account always takes a *different* admin acting on it. The frontend (`UserFormModal`, `UsersPage`) disables those controls for your own row too, so the backend rejection is a backstop, not the first line of defense.

**Admin-authorization inside an in-progress action** (currently: discount in Venda) follows a shared pattern, `resolve_admin_authorization` (`guard.rs`): if the active session is already Admin, it self-authorizes with no extra password; otherwise it takes a *different* admin's id + password and re-verifies both against the DB (never trusting that the frontend already checked). The frontend (`DiscountModal`) only decides whether to *show* the password/admin-picker fields based on `user.isAdmin` — that's UX, not the boundary. Reuse this same helper for any future admin-gated in-sale action (e.g. cancel/estorno) instead of writing a parallel check. Full list of `guard.rs` helpers and the rationale behind each: `docs/architecture.md`.

## Money field rule

**Every R$ value input uses `MoneyInput`** (`src/components/MoneyInput.tsx`) — never a raw `<input type="number">`. Ported from the sibling project's component of the same name: each digit typed enters from the right, like a POS/ATM ("1" → R$ 0,01, one more "0" → R$ 0,10), rather than typing left-to-right and hoping the decimal point lands right. Its `value`/`onChange` are already a plain `number` in reais — no string parsing at the call site (see `ItemFormModal`'s `costPrice`/`salePrice`).

## Form-modal rule

**Closing a form modal with unsaved input asks first.** Every form modal (`ItemFormModal`, `UserFormModal`) computes a `dirty` flag (current field values vs. the `initial` prop) and routes backdrop-click/✕/Cancelar through a `requestClose()` function — closes right away when `!dirty`, otherwise opens a `ConfirmModal` ("Descartar alterações?") first. Apply the same to any new form modal rather than wiring `Modal`'s `onClose` straight to the parent's close handler; it's an easy thing to forget since a modal closes without it too, just silently loses whatever was typed. Implementation details (exactly how `dirty` is computed) are in `docs/frontend.md`, not repeated here.

## Logging rule (`src/logger.ts`)

**Every `logger.error`/`.warn` call is enriched with whatever id(s) identify the record involved** — item, user, sale, client, payment — passed as extra args before the caught error (e.g. `logger.error("falha ao excluir item", toDelete.id, err)`), never just `(message, err)` when a relevant id is available in scope. `logger`'s functions are variadic and every arg gets serialized into the line (see `serialize` in `logger.ts`), so this is free — no template-string concatenation needed. Skip the id only when there genuinely isn't one in scope (a plain listing/read with nothing specific to point at, e.g. `list_items`/`list_clients` failing). The point: a log line a user forwards should be traceable back to the exact record that failed, not just "something failed."

## Versioning rule

**When bumping the version, update all 3 files in sync** — they always need to match: `package.json` (`"version"`), `src-tauri/Cargo.toml` (`version`), `src-tauri/tauri.conf.json` (`"version"`). Bump-type rules (PATCH/MINOR/MAJOR) and exact line numbers: `docs/versioning.md`.

## Schema rule (`src-tauri/src/db.rs`)

Every new table/column goes in **two places**: the `CREATE TABLE` inside `init_db` (fresh install) and an idempotent `ALTER TABLE` inside `migrate_db` (existing databases). A `CREATE INDEX` on a new column can only live in `migrate_db`, never appended to `init_db`'s `CREATE TABLE IF NOT EXISTS` — if the table already existed, that statement is a no-op and the column won't be there yet. First real `migrate_db` entry: `users.last_login_at`, added after real installs already existed — a plain example to copy the shape of, not an edit to `init_db`'s `CREATE TABLE`. Full schema, column-by-column, in [docs/database.md](docs/database.md).

## Stack

| Layer      | Technology                            |
|------------|----------------------------------------|
| UI         | React 19 + TypeScript + Tailwind v4    |
| Routing    | react-router-dom v6                    |
| Desktop    | Tauri v2                               |
| Backend    | Rust (Tauri commands)                  |
| Database   | SQLite via `rusqlite` (bundled)        |
| Charts     | Chart.js + react-chartjs-2             |
| PDF        | `genpdf` (backend-generated receipts/reports — never rasterized frontend PDF) |
| Build      | Vite v7                                |

**Package manager: pnpm** (do not use npm/yarn).

## Commands

```bash
pnpm tauri dev        # dev with hot-reload (Rust + frontend)
pnpm tauri build      # production build (NSIS installer only — Windows-only target, decided)
pnpm build            # frontend only (tsc + vite build)
cargo check           # inside src-tauri/ — quick type-check of the backend without generating a binary
pnpm tauri icon icon-source.png   # regenerate src-tauri/icons/ from the 1024x1024 master image
```

If `pnpm install`/`pnpm build` complains about an ignored build script (esbuild): already pre-approved via `pnpm-workspace.yaml` (`allowBuilds: esbuild: true`); if it recurs, `pnpm approve-builds --all`.

`cargo test` (inside `src-tauri/`): schema smoke test (`db::tests::schema_applies_cleanly`), `commands::users` tests (bcrypt hash roundtrip, `username` uniqueness, `slugify`, `unique_username`'s collision suffix, `is_last_active_admin`, `is_active_session` — the last one constructs a plain `AppState` directly, every field is `pub`, no Tauri runtime needed), and `commands::items` tests (`code_taken`'s duplicate check, `round2`'s float rounding) — all directly against an in-memory DB (`db::test_connection()`, `#[cfg(test)] pub(crate)`). These test the SQL/bcrypt/slug/guard logic, not the `#[tauri::command]`/`State<AppState>` plumbing itself (would need a running app to construct that). No frontend tests yet.

## Structure

The tree below is a map, not the source of truth for what each piece does — before changing a page/component/command, check whether `docs/frontend.md`, `docs/architecture.md`, or `docs/commands.md` (see "Docs" at the top) already describes its current behavior, and update that doc as part of the same change if it doesn't match anymore.

```
Stockly/
├── Plans/
│   ├── PLANO.md                 # full spec — see "Planning source of truth" above
│   ├── mockups-ui.html          # full/Admin mockup
│   └── mockups-ui-usuario.html  # Usuário comum mockup (subset of screens)
├── src/
│   ├── App.tsx                  # routes: AuthGate → AppShell → InventoryPage (index) / DashboardPage / SalesPage / SettingsPage / UsersPage
│   ├── main.tsx                 # applies theme + disables right-click before render
│   ├── theme.ts                 # THEMES catalog + localStorage helpers + themeColor() for Chart.js canvas colors — see "Theme rule"
│   ├── logger.ts                # logging helper (forwards to write_log)
│   ├── pages/                   # LoginPage, InventoryPage (Estoque), DashboardPage, SalesPage (Venda/PDV), SettingsPage, UsersPage
│   ├── components/
│   │   ├── layout/               # AuthGate, AppShell
│   │   ├── dashboard-cards/      # Admin-only Dashboard's grid + card catalog — see docs/frontend.md's Dashboard section
│   │   ├── Button.tsx / Modal.tsx / ConfirmModal.tsx / Card.tsx   # generic primitives, token-only styling
│   │   ├── MoneyInput.tsx        # R$ input, digit-enters-from-the-right — see "Money field rule"
│   │   ├── ThemeSwitcher.tsx     # renders the THEMES catalog — never hardcodes which themes exist
│   │   ├── Checkbox.tsx / InfoTooltip.tsx   # styled checkbox (not the raw browser box); "?" hover/focus hint next to a label
│   │   ├── StockBadge.tsx        # critical/warning/ok chip — Dashboard's low-stock cards reuse the same threshold rule, not this exact component (see docs/frontend.md)
│   │   ├── LockScreen.tsx        # idle-lock overlay (re-enters own password, keeps screen state)
│   │   ├── UserFormModal.tsx     # create/edit user, incl. the "elevate to Admin" confirm step
│   │   ├── ItemFormModal.tsx     # Admin-only full item CRUD, incl. quantity (= ajuste de inventário)
│   │   ├── StockAdjustModal.tsx  # any profile: add stock entry + deactivate — no price/name/category fields
│   │   ├── CategoryManagerModal.tsx  # Admin-only categories CRUD, opened from ItemFormModal
│   │   ├── DiscountModal.tsx     # item/order discount (%, R$) in Venda — admin-authorization sub-flow when needed
│   │   ├── PaymentModal.tsx      # payment method picker (Venda) when finalizing a sale
│   │   └── ReceiptResultModal.tsx  # post-sale result (Venda): receipt preview, imprimir/abrir pasta/nova venda
│   ├── context/
│   │   ├── AuthContext.tsx       # session (user, login, logout) — get_active_user on mount
│   │   └── ThemeContext.tsx      # current theme; syncs with AuthContext's user on login
│   ├── hooks/
│   │   ├── useIdleTimer.ts       # resets on mousemove/keydown/click; fires onIdle after N minutes; secondsRemaining ticks down only in the last 30s (warning banner)
│   │   └── useDashboardLayout.ts # Dashboard's edit mode: layout state, debounced/immediate autosave, undo-via-snapshot
│   └── lib/
│       ├── api.ts               # only place that calls invoke() — typed call<T>() wrapper + all command wrappers/types
│       └── format.ts            # fmt() currency, fmtDate(), fmtDateTime(), normalize() (accent/case-insensitive search, shared by Estoque and Venda)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # AppState (db, active_user_id), plugin setup, command registration
│   │   ├── db.rs                # schema (init_db + migrate_db) — see "Schema rule" above
│   │   ├── guard.rs              # require_admin/user_is_admin/active_user_id/resolve_admin_authorization — shared across commands/*
│   │   ├── models.rs            # UserSummary/UserProfile/CategorySummary/ItemSummary/SaleItemInput/SaleItemDetail/SaleDetail (camelCase to the frontend) + shared row-mapping
│   │   ├── money.rs              # round2() — the 2-decimal rounding rule, shared by items.rs and sales.rs
│   │   ├── commands/            # auth.rs, users.rs, categories.rs, items.rs, config.rs, sales.rs, receipts.rs, dashboard_layout.rs, dashboard.rs, logging.rs
│   │   └── bin/seed_demo.rs     # generates demo/stockly-demonstration.db — see demo/README.md
│   ├── assets/fonts/            # Courier Prime TTFs (SIL OFL) embedded via include_bytes! in receipts.rs — never loaded from disk at runtime
│   ├── Cargo.toml
│   ├── tauri.conf.json          # identifier com.welbert.stockly, productName "Bora Vender"
│   └── capabilities/default.json
├── docs/
│   ├── architecture.md           # layers, AppState, session model, guard.rs
│   ├── frontend.md               # routing, pages, key components, context/hooks
│   ├── database.md               # full schema, table by table
│   ├── commands.md               # every Tauri command, by domain, with signature
│   ├── versioning.md             # SemVer bump rules, the 3 files kept in sync
│   └── future.md                 # out-of-scope ideas/gaps — outlives Plans/PLANO.md
├── demo/
│   ├── stockly-demonstration.db # seeded demo data (2 users, password 123456) — see demo/README.md
│   └── README.md                # what's in it, login, how to regenerate
└── icon-source.png / icon.ico    # master icon assets (see Environment notes)
```

## Adding features

### New Rust command
0. Check `docs/commands.md` for an existing pattern in the same domain (e.g. `resolve_admin_authorization` for anything admin-gated) before writing one from scratch.
1. Write `#[tauri::command] pub fn name(...)` in `src-tauri/src/commands/<domain>.rs` (create a new file for a new domain, register it in `commands/mod.rs`).
2. Register in `.invoke_handler(tauri::generate_handler![..., commands::<domain>::name])` in `lib.rs`.
3. Add the corresponding typed wrapper in `src/lib/api.ts`.
4. Add the command to its domain's table in `docs/commands.md`.

### New table/column
See "Schema rule" above — also add the column to `docs/database.md`'s table-by-table breakdown in the same change.

### New dependency
```bash
cd src-tauri && cargo add <crate>   # Rust
pnpm add <package>                  # frontend (or pnpm add -D for dev)
```

## Key decisions worth remembering (full detail in `Plans/PLANO.md`)

- Windows-only build target for now (NSIS installer, GitHub Actions on tag push, once autoupdate is implemented) — no macOS/Linux.
- Autoupdate needs the GitHub repo to be **public** — the update endpoint (`.../releases/latest/download/latest.json`) must be reachable without auth.
- Sale receipt numbering: `{yyyyMMdd}{6-digit sequential}`, global and gap-free, assigned in the same DB transaction as the sale — never tied to PDF generation, which can fail independently after commit (receipt regeneration is a separate on-demand action).
- Monetary math: floats, rounded to 2 decimals after each operation (small, accepted rounding drift on sequential item+order discounts).
- Backup uses SQLite's `VACUUM INTO` (not a raw file copy) — a raw copy can be inconsistent with an active WAL-mode connection.
- Stock movement ledger (append-only) is recorded for every quantity change (sale, entrada, ajuste, import, estorno) — no consultation screen yet, needed later for stock-rupture forecasting.

## Environment notes

- Tauri identifier: `com.welbert.stockly` — separate app data folder from other apps.
- App icon: regenerated from `icon-source.png` with `pnpm tauri icon <file.png>` (regenerates all of `src-tauri/icons/`).
