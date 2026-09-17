# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Stockly** ("Bora Vender" in the UI — see naming rule below) is a single-machine desktop inventory/POS app with Admin and Usuário (regular user) profiles: stock control, sales (PDV) with PDF receipts, Crediário/Devedores (store credit), dashboard, reports. Modeled on the same architecture as the sibling project `F:\VS\Pessoal\CashVault` — reuse its patterns (`lib.rs`/`db.rs` structure, `logger.ts`, theme tokens, `dashboard_layout`, backup via `VACUUM INTO`) rather than inventing new ones.

## Naming rule

"Stockly" is the technical/internal name only — npm package, Rust crate, Tauri `identifier` (`com.welbert.stockly`), table/file prefixes (`stockly-backup.db`). The UI-facing name is always **"Bora Vender"** (window title/`productName`, sidebar, login screen, receipts). Never surface "Stockly" in anything the end user sees.

## Planning source of truth

- `Plans/PLANO.md` — full product/business-rules spec. Read the relevant section before implementing any feature; it's the authority for behavior and access rules, not this file.
- `Plans/mockups-ui.html` — full UI mockup (Admin's view of every screen). Canonical visual reference: colors, layout, components, design tokens.
- `Plans/mockups-ui-usuario.html` — same visual system, but only mocks the screens relevant to explain what Usuário comum sees (login, venda, estoque, autorizacao modal, recibo, config reduzida). **A screen missing here is not necessarily restricted** — some (e.g. Devedores) just weren't duplicated because they render identically for both roles. Check `PLANO.md` for the actual access rule per role, never infer a restriction from mockup absence alone.
- Conflict resolution: business rules always come from `PLANO.md`. For visual details, if the two mockup files disagree on a screen both roles use identically, `mockups-ui.html` wins.

## Theme rule (tokens)

Never hardcode a Tailwind background/text/border color — always use the `bg-theme-*` / `text-theme-*` / `border-theme-border` tokens defined in `src/index.css`, switched via `data-theme="light"|"dark"` (`src/theme.ts`, only two themes). `--color-primary` (indigo, `#4f46e5`) is the one brand accent, taken from the mockups' `--primary` — components should use `primary`/`primary-hover`/`primary-soft` classes, never a hardcoded hex.

## Versioning rule

**When bumping the version, update all 3 files in sync** — they always need to match: `package.json` (`"version"`), `src-tauri/Cargo.toml` (`version`), `src-tauri/tauri.conf.json` (`"version"`).

## Schema rule (once `db.rs` exists)

Not written yet, but when it is (mirroring CashVault's `init_db`/`migrate_db` split): every new table/column goes in **two places** — the `CREATE TABLE` inside `init_db` (fresh install) and an idempotent `ALTER TABLE` inside `migrate_db` (existing databases). A `CREATE INDEX` on a new column can only live in `migrate_db`, never appended to `init_db`'s `CREATE TABLE IF NOT EXISTS` — if the table already existed, that statement is a no-op and the column won't be there yet.

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

No test suite exists yet.

## Structure

```
Stockly/
├── Plans/
│   ├── PLANO.md                 # full spec — see "Planning source of truth" above
│   ├── mockups-ui.html          # full/Admin mockup
│   └── mockups-ui-usuario.html  # Usuário comum mockup (subset of screens)
├── src/
│   ├── App.tsx                  # placeholder shell — no routes/pages yet
│   ├── main.tsx                 # applies theme + disables right-click before render
│   ├── theme.ts / logger.ts     # theme (light/dark) and logging helpers, same pattern as CashVault
│   ├── pages/ components/ context/ hooks/   # empty — filled per the vertical-slice order below
│   └── lib/
│       ├── api.ts               # only place that calls invoke() — typed call<T>() wrapper
│       └── format.ts            # fmt() currency, fmtDate()
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # plugin setup + command registration (no AppState/db yet)
│   │   └── commands/            # one file per domain — so far only logging.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json          # identifier com.welbert.stockly, productName "Bora Vender"
│   └── capabilities/default.json
└── icon-source.png / icon.ico    # master icon assets (see Environment notes)
```

## Current state

Scaffold stage: the Tauri + React shell builds and runs (`pnpm tauri dev` confirmed working). No database schema, no domain commands, no real pages yet.

- Backend implemented: only `commands::logging` (`write_log`, `open_log_dir`), writing to Tauri's app log dir.
- Frontend implemented: bare `App.tsx` placeholder, `theme.ts`, `logger.ts`, `lib/api.ts`, `lib/format.ts`. `pages/`/`components/`/`context/`/`hooks/` are empty.
- Planned implementation order (per `PLANO.md`'s "Próximos passos"): auth/first-run/bloqueio por inatividade → estoque (itens/categorias) → venda (PDV) + recibo PDF → crediário/devedores → dashboard/relatórios → backup/autoupdate/CSV.

## Adding features

### New Rust command
1. Write `#[tauri::command] pub fn name(...)` in `src-tauri/src/commands/<domain>.rs` (create a new file for a new domain, register it in `commands/mod.rs`).
2. Register in `.invoke_handler(tauri::generate_handler![..., commands::<domain>::name])` in `lib.rs`.
3. Add the corresponding typed wrapper in `src/lib/api.ts`.

### New table/column
See "Schema rule" above (applies once `db.rs` is created).

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
