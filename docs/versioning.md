# Versioning

The app follows [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Change type | Example | When to bump |
|-------------|---------|--------------|
| `PATCH` | `0.0.1 → 0.0.2` | Bug fixes, no new features |
| `MINOR` | `0.0.1 → 0.1.0` | New features, backwards compatible |
| `MAJOR` | `0.0.1 → 1.0.0` | Breaking changes or major milestones |

Still `0.x` — the app is in alpha, so `MINOR` bumps cover new features for now; `1.0.0` is reserved for the first real release.

## Release checklist

When the user asks to close/publish a version ("fecha a versão", "publica a 0.0.2", etc.), this is the full sequence, in order. Run it to completion — including the final push, which triggers the actual public release — without stopping to confirm partway, unless something looks wrong (e.g. `cargo check` fails, an unexpected diff shows up).

1. **Pin down the version number.** Use exactly what the user said if they gave one ("publica a 0.0.2" → `0.0.2`); otherwise pick the bump type from the table above and ask if it's ambiguous.
2. **Bump the 3 files** — `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (see "Files to update" below).
3. **Run `cargo check` inside `src-tauri/`** so `Cargo.lock` picks up the new version too.
4. **Rename `RELEASE.md`'s current `# Stockly — Não lançado` heading** to `# Stockly — vX.Y.Z`, and add a fresh `# Stockly — Não lançado` section above it for whatever gets built next (see "Release Notes rule" in `CLAUDE.md`). If that section has no entries yet, stop and ask instead of releasing with empty notes.
5. **Commit everything above in one commit** (e.g. "Release vX.Y.Z").
6. **Push the branch** if it has commits `origin` doesn't have yet (check with `git status`/`git log origin/<branch>..HEAD`) — the tag alone doesn't carry the rest of the history with it.
7. **Tag and push the tag**: `git tag vX.Y.Z && git push origin vX.Y.Z`. This triggers `.github/workflows/release.yml` (see "Releasing" below), which builds and publishes the real, public GitHub Release — there's no undo once it's live, so steps 1-6 are exactly where any last-minute check belongs.

## Files to update

The version must be kept in sync across **3 files**:

| File | Field | Line |
|------|-------|------|
| `package.json` | `"version"` | 5 |
| `src-tauri/Cargo.toml` | `version` | 3 |
| `src-tauri/tauri.conf.json` | `"version"` | 4 |

All three must always have the same value. The version shown in the sidebar
(`getVersion()` from `@tauri-apps/api/app`) is read from `tauri.conf.json` at
build time.

## Bumping the version

Edit each file manually at the indicated line:

| File | Line | Example |
|------|------|---------|
| `package.json` | 5 | `"version": "0.0.2"` |
| `src-tauri/Cargo.toml` | 3 | `version = "0.0.2"` |
| `src-tauri/tauri.conf.json` | 4 | `"version": "0.0.2"` |

> **Note:** avoid using PowerShell `Set-Content` to replace the version — it writes UTF-8 with BOM in PS 5.1, which breaks the Tauri JSON parser at build time.

## Releasing (`.github/workflows/release.yml`)

Pushing a tag `vX.Y.Z` (matching whatever the 3 files were just bumped to, and `RELEASE.md`'s renamed section — see "Release checklist" above) triggers the release workflow:
1. Extracts `RELEASE.md`'s `# Stockly — vX.Y.Z` section (everything up to the next `# Stockly — ` heading) — fails the whole build immediately if no section matches the tag, rather than publishing a release with empty notes.
2. `tauri-apps/tauri-action@v0` builds the Windows NSIS installer and publishes it straight to this repo's own GitHub Releases, using that extracted text as the release notes (`includeUpdaterJson: true` also generates and uploads `latest.json`, the manifest the autoupdate endpoint (`UpdaterContext`, `src/context/UpdaterContext.tsx`) polls).

Single job, `windows-latest` only — no macOS/Linux, no separate releases repo: this repo is public, so the endpoint is reachable without auth, unlike a private-source setup where the update manifest would need a separate public releases repo instead. Needs `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub Secrets (`GITHUB_TOKEN` is automatic); the matching public key is committed in `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey`.

```bash
git tag v0.1.0
git push origin v0.1.0
```
