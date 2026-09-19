# Versioning

The app follows [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Change type | Example | When to bump |
|-------------|---------|--------------|
| `PATCH` | `0.0.1 → 0.0.2` | Bug fixes, no new features |
| `MINOR` | `0.0.1 → 0.1.0` | New features, backwards compatible |
| `MAJOR` | `0.0.1 → 1.0.0` | Breaking changes or major milestones |

Still `0.x` — the app is in alpha, so `MINOR` bumps cover new features for now; `1.0.0` is reserved for the first real release.

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

After editing, run `cargo check` inside `src-tauri/` once so `Cargo.lock` picks up the new version too (it won't update on its own just from editing `Cargo.toml`).

> **Note:** avoid using PowerShell `Set-Content` to replace the version — it writes UTF-8 with BOM in PS 5.1, which breaks the Tauri JSON parser at build time.

## Releasing (`.github/workflows/release.yml`)

Pushing a tag `vX.Y.Z` (matching whatever the 3 files above were just bumped to) triggers the release workflow: `tauri-apps/tauri-action@v0` builds the Windows NSIS installer and publishes it straight to this repo's own GitHub Releases (`includeUpdaterJson: true` also generates and uploads `latest.json`, the manifest the autoupdate endpoint (`UpdaterContext`, `src/context/UpdaterContext.tsx`) polls). Single job, `windows-latest` only — no macOS/Linux, no separate releases repo: this repo is public, so the endpoint is reachable without auth, unlike a private-source setup where the update manifest would need a separate public releases repo instead. Needs `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub Secrets (`GITHUB_TOKEN` is automatic); the matching public key is committed in `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey`.

```bash
git tag v0.1.0
git push origin v0.1.0
```
