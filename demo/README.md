# Demo database

`stockly-demonstration.db` is a fully-populated SQLite database (real schema,
made-up data) used to demo the app — right now the Dashboard, later
Relatórios too — without needing a real store's data.

## Login

Two users, both password `123456`:

| Profile | Role |
|---|---|
| Admin Demo | Administrador |
| Usuário Demo | Usuário comum |

## Using it

Copy the file over the app's own database (back up your real one first if
you have one):

```
%APPDATA%\com.welbert.stockly\stockly.db
```

Then restart the app.

## What's in it

~45 days of activity ending "today" (relative to whenever it was generated):
18 items across 4 categories (several deliberately at/under their low-stock
threshold, one at zero, one that never alerts), 7 clients — 5 with a
Crediário balance (an overdue reminder, one due tomorrow, one at the edge of
the warning window, one far out, one fully quitado with payment history, one
still partially open) plus 2 that never owe anything, each only ever
identified on a Dinheiro/Cartão sale (optional there, same as any real sale)
to demo the Clientes screen listing everyone, not just debtors. A few clients
also carry a birth date and/or CPF/CNPJ (one of the CNPJs uses the new
alphanumeric format), others intentionally don't, same as a real store where
not everyone hands one over. Sales across all 4 payment methods, at least one
sale in every one of the last 7 days, a cancelled/estornada sale, and a
couple of discounted sales (one item-level, one general — both
admin-authorized, since the buyer was the Usuário comum profile).

## Regenerating it

The data is date-relative (built from "today" at generation time), so it
goes stale for the "hoje"/"mês atual" Dashboard cards the longer it sits
uncommitted-to. Regenerate it whenever needed:

```bash
cd src-tauri
cargo run --bin seed_demo
```

This calls the real `db::init_db`/`migrate_db` (`src-tauri/src/bin/seed_demo.rs`,
see its own doc comment) — the schema itself can never drift from what the
app actually creates, only the seeded data is hand-written.
