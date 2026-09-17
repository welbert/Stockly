# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Stockly** ("Bora Vender" in the UI — see naming rule below) is a single-machine desktop inventory/POS app with Admin and Usuário (regular user) profiles: stock control, sales (PDV) with PDF receipts, Crediário/Devedores (store credit), dashboard, reports.

## Naming rule

"Stockly" is the technical/internal name only — npm package, Rust crate, Tauri `identifier` (`com.welbert.stockly`), table/file prefixes (`stockly-backup.db`). The UI-facing name is always **"Bora Vender"** (window title/`productName`, sidebar, login screen, receipts). Never surface "Stockly" in anything the end user sees.

## Planning source of truth

- `Plans/PLANO.md` — full product/business-rules spec. Read the relevant section before implementing any feature; it's the authority for behavior and access rules, not this file.
- `Plans/mockups-ui.html` — full UI mockup (Admin's view of every screen). Canonical visual reference: colors, layout, components, design tokens.
- `Plans/mockups-ui-usuario.html` — same visual system, but only mocks the screens relevant to explain what Usuário comum sees (login, venda, estoque, autorizacao modal, recibo, config reduzida). **A screen missing here is not necessarily restricted** — some (e.g. Devedores) just weren't duplicated because they render identically for both roles. Check `PLANO.md` for the actual access rule per role, never infer a restriction from mockup absence alone.
- Conflict resolution: business rules always come from `PLANO.md`. For visual details, if the two mockup files disagree on a screen both roles use identically, `mockups-ui.html` wins.

## Theme rule (tokens + catalog)

Never hardcode a Tailwind background/text/border color — always use the `bg-theme-*` / `text-theme-*` / `border-theme-border` / `bg-sidebar-*` tokens defined in `src/index.css`, switched via `data-theme="<id>"`. `--color-primary` (indigo, `#4f46e5`) is the one brand accent, taken from the mockups' `--primary` — components should use `primary`/`primary-hover`/`primary-soft` classes, never a hardcoded hex. The sidebar is intentionally dark regardless of theme (matches the mockups) but still goes through tokens (`--theme-sidebar-*`), not raw hex, in case a future theme ever needs to override it.

**Adding a theme is 2-3 places, never more**: an entry in the `THEMES` array (`src/theme.ts` — the single source of truth for which themes exist and what `ThemeSwitcher` renders), a matching `[data-theme="<id>"]` block in `src/index.css`, and — only if it should be persisted per profile — that id added to the `CHECK` on `users.theme` (see `docs/database.md`) via a `migrate_db` entry. No component, button, or modal needs to change: they all read tokens, never a theme id.

Theme is **per-user**, backed by `users.theme`, wired end-to-end: `ThemeContext` (`src/context/ThemeContext.tsx`) applies `localStorage` before any login (first-run/login/lock screens need a theme too), then switches to the logged-in user's `theme` on login and mirrors every change back through `update_theme` — never both sources fighting over which wins.

## Auth rule (`AppState.active_user_id`)

The **backend is the real access boundary**, not the UI hiding a button. Every admin-only command locks `state.db`, then calls `require_admin(&state, &conn)` (`commands/users.rs`) before doing anything — it reads `AppState.active_user_id` (never a `user_id` argument from the frontend) and checks that row's `is_admin`. A self-service command (a profile changing its own theme or auto-lock) does the same active-session lookup but skips the admin check and only ever writes to that same id — never to a `user_id` passed in by the caller. Lock order is always `db` then `active_user_id` when both are needed, kept consistent everywhere to avoid a deadlock.

**Never allow zero active Admins to exist** — `update_user`/`delete_user` both call `is_last_active_admin` first and refuse to demote/deactivate/delete the only one left. Found the hard way: the very first manual test had the lone admin remove their own Admin flag, which locked the Users screen with no way back in short of hand-editing `stockly.db`.

**Nobody edits their own `is_admin`/`active`, or deletes themselves** — separate from the rule above (this one applies even with other admins around): `update_user`/`delete_user` check `is_active_session` and reject touching those fields, or deleting, your own logged-in row. Granting/revoking a role or removing an account always takes a *different* admin acting on it. The frontend (`UserFormModal`, `UsersPage`) disables those controls for your own row too, so the backend rejection is a backstop, not the first line of defense.

## Versioning rule

**When bumping the version, update all 3 files in sync** — they always need to match: `package.json` (`"version"`), `src-tauri/Cargo.toml` (`version`), `src-tauri/tauri.conf.json` (`"version"`).

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

`cargo test` (inside `src-tauri/`): schema smoke test (`db::tests::schema_applies_cleanly`) plus `commands::users` tests for the bcrypt hash roundtrip, the `username` uniqueness constraint, `slugify`, `unique_username`'s collision suffix, `is_last_active_admin`, and `is_active_session` — all directly against an in-memory DB (`db::test_connection()`, `#[cfg(test)] pub(crate)`); `is_active_session` even constructs a plain `AppState` directly (every field is `pub`, no Tauri runtime needed for that one). These test the SQL/bcrypt/slug/guard logic, not the `#[tauri::command]`/`State<AppState>` plumbing itself (would need a running app to construct that). No frontend tests yet.

## Structure

```
Stockly/
├── Plans/
│   ├── PLANO.md                 # full spec — see "Planning source of truth" above
│   ├── mockups-ui.html          # full/Admin mockup
│   └── mockups-ui-usuario.html  # Usuário comum mockup (subset of screens)
├── src/
│   ├── App.tsx                  # routes: AuthGate → AppShell → SettingsPage / UsersPage
│   ├── main.tsx                 # applies theme + disables right-click before render
│   ├── theme.ts                 # THEMES catalog + localStorage helpers — see "Theme rule"
│   ├── logger.ts                # logging helper (forwards to write_log)
│   ├── pages/                   # LoginPage, SettingsPage, UsersPage
│   ├── components/
│   │   ├── layout/               # AuthGate, AppShell
│   │   ├── Button.tsx / Modal.tsx / ConfirmModal.tsx   # generic primitives, token-only styling
│   │   ├── ThemeSwitcher.tsx     # renders the THEMES catalog — never hardcodes which themes exist
│   │   ├── LockScreen.tsx        # idle-lock overlay (re-enters own password, keeps screen state)
│   │   └── UserFormModal.tsx     # create/edit user, incl. the "elevate to Admin" confirm step
│   ├── context/
│   │   ├── AuthContext.tsx       # session (user, login, logout) — get_active_user on mount
│   │   └── ThemeContext.tsx      # current theme; syncs with AuthContext's user on login
│   ├── hooks/
│   │   └── useIdleTimer.ts       # resets on mousemove/keydown/click; fires onIdle after N minutes; secondsRemaining ticks down only in the last 30s (warning banner)
│   └── lib/
│       ├── api.ts               # only place that calls invoke() — typed call<T>() wrapper + all command wrappers/types
│       └── format.ts            # fmt() currency, fmtDate()
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # AppState (db, active_user_id), plugin setup, command registration
│   │   ├── db.rs                # schema (init_db + migrate_db) — see "Schema rule" above
│   │   ├── models.rs            # UserSummary/UserProfile (camelCase to the frontend) + shared row-mapping
│   │   └── commands/            # auth.rs, users.rs, logging.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json          # identifier com.welbert.stockly, productName "Bora Vender"
│   └── capabilities/default.json
├── docs/
│   ├── database.md              # full schema, table by table
│   └── commands.md              # every Tauri command, by domain, with signature
└── icon-source.png / icon.ico    # master icon assets (see Environment notes)
```

## Technical documentation

| File | Content |
|---|---|
| [docs/database.md](docs/database.md) | Full SQLite schema, table by table, with the design rationale behind each nullable/cascade/check |
| [docs/commands.md](docs/commands.md) | Every Tauri command, by domain, with signature |

More docs (architecture, frontend) will be added here as those layers grow enough to need one.

## Current state

Auth slice done (`PLANO.md`'s step 4.1: usuários, login, bloqueio por inatividade), on top of the scaffold + schema from before. Estoque/Vendas/Crediário/Dashboard/Relatórios are still unimplemented — `pages/` has exactly the three files below, nothing else.

- **Backend**: `commands::auth` (`login`, `logout`, `get_active_user`, `verify_password`) and `commands::users` (`has_any_users`, `list_login_profiles`, `list_users`, `create_user`, `update_user`, `delete_user`, `update_theme`, `update_my_auto_lock`) — see `docs/commands.md`. Passwords hashed with `bcrypt`. `AppState.active_user_id: Mutex<Option<i64>>` holds the in-memory session (never persisted — a process restart always shows the login screen again, unlike CashVault's "remembered profile"). `users.username` is never a form field or an argument the frontend supplies — it's auto-derived from `name` (`slugify`/`unique_username` in `commands/users.rs`) and excluded from `UserProfile` entirely (see `docs/database.md`).
- **Frontend**: `LoginPage` (first-run admin creation form **or** profile-picker + password, keyboard-navigable), `AppShell` (sidebar + topbar, nav items filtered by `user.isAdmin`), `SettingsPage` (theme + auto-lock dropdown), `UsersPage` (Admin-only CRUD table + `UserFormModal`), `LockScreen` (auto-lock overlay, triggered by `useIdleTimer`). `AuthContext`/`ThemeContext` wrap everything in `App.tsx`. `AuthGate` owns the single `useIdleTimer` call and passes `secondsUntilLock` down to `AppShell`'s topbar warning via `<Outlet context={...}>`/`useOutletContext` (`AuthGateOutletContext`) — deliberately not a React Context module, since it's one value flowing to one child route tree.
- **Not implemented yet, worth knowing about**: no "reset another user's password" action (an admin editing a user can't set a new password for them — not decided in `PLANO.md`, flagged but not built); `verify_password` exists and is reused-ready for the discount/cancel authorization modals, but those modals themselves don't exist until the Vendas slice.
- Planned implementation order from here (per `PLANO.md`'s "Próximos passos"): estoque (itens/categorias) → venda (PDV) + recibo PDF → crediário/devedores → dashboard/relatórios → backup/autoupdate/CSV.

## Adding features

### New Rust command
1. Write `#[tauri::command] pub fn name(...)` in `src-tauri/src/commands/<domain>.rs` (create a new file for a new domain, register it in `commands/mod.rs`).
2. Register in `.invoke_handler(tauri::generate_handler![..., commands::<domain>::name])` in `lib.rs`.
3. Add the corresponding typed wrapper in `src/lib/api.ts`.

### New table/column
See "Schema rule" above.

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
- Stock movement ledger (append-only) is recorded from day one for every quantity change (sale, entrada, ajuste, import, estorno), even with no consumer screen yet — needed later for stock-rupture forecasting.

## Environment notes

- Tauri identifier: `com.welbert.stockly` — separate app data folder from other apps.
- App icon: regenerated from `icon-source.png` with `pnpm tauri icon <file.png>` (regenerates all of `src-tauri/icons/`).
