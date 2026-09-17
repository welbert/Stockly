# Future ideas / known gaps

Things noticed along the way that aren't part of the current implementation scope, kept here so they survive once `Plans/PLANO.md` is eventually retired (deleted once everything in it is built). Items get migrated here incrementally as the related area of the codebase is touched; `PLANO.md`'s own "Ideias extras" section still holds the rest of the original product ideas (e.g. an audit log of admin actions) not yet migrated.

## Auth / Users

- **Reset another user's password** — an Admin editing a user (`UserFormModal`) has no way to set a new password for them if they forget it. Today's only path back in is self-service (change your own password) or, if truly locked out, editing `stockly.db` by hand. Would need a new backend command (Admin-only, doesn't require the old password) plus a small UI affordance in the edit form.

## Estoque / Relatórios

- **Stock-rupture forecast** — instead of just comparing current quantity to a fixed minimum, compute each item's average daily sales over a recent window (e.g. last 90 days of `sale`-type `stock_movements` rows) and project days remaining: `dias_restantes = quantidade_atual ÷ (soma das saídas no período ÷ dias do período)`. Could show as an extra status badge in Estoque ("Tendência: acaba em ~N dias") in addition to a dedicated "Sugestões" screen. The ledger needed for this (`stock_movements`) is already recorded from day one specifically so this doesn't need retroactive data once built.

## Crediário

- **Lock Crediário off while any client has an open balance** — in Configurações, Crediário should only be disabled as a payment method when no debtor currently has an open balance, so the feature can't be turned off with pending debt left unmanaged.
