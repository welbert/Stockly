# Future ideas / known gaps

Things noticed along the way that aren't part of the current implementation scope, kept here so they survive once `Plans/PLANO.md` is eventually retired (deleted once everything in it is built). `PLANO.md`'s own "Ideias extras" section still holds the original product ideas (audit log, stock-rupture forecast) — migrate that list here too when the plan file goes away.

## Auth / Users

- **Reset another user's password** — an Admin editing a user (`UserFormModal`) has no way to set a new password for them if they forget it. Today's only path back in is self-service (change your own password) or, if truly locked out, editing `stockly.db` by hand. Would need a new backend command (Admin-only, doesn't require the old password) plus a small UI affordance in the edit form.
